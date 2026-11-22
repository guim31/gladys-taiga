// -----------------------------------------------------------------------------
// The Taiga hub: reads the instance on a timer of the container, publishes
// the counters of every followed project when they change, fires the scene
// events (an item becomes overdue, a new issue), and creates issues and user
// stories for the scene actions.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 10 minutes, beyond the fixed list of the core scheduler, and the scene
// events must fire even when no device was added. The timer also wakes up at
// local midnight, when items become overdue and sprints lose a day.
// (Architecture adapted from guim31/gladys-wekan.)
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import {
  buildInstance,
  buildProject,
  instanceIds,
  instanceStates,
  projectIds,
  projectStates,
} from './devices.js';
import { ERROR_KINDS, TaigaClient, TaigaError } from './taiga/client.js';
import {
  KINDS,
  currentSprint,
  dayEnd,
  dayKey,
  daysBetween,
  findProject,
  localDay,
  parseItems,
  parseProjects,
  resolveTimeZone,
  summarize,
} from './taiga/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  UNKNOWN_PROJECTS,
  allLanguages,
} from './texts.js';

const logger = createLogger({ name: 'taiga-hub' });

export const WIDGET_KEY = 'project_overview';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  OVERDUE: 'item_overdue',
  ISSUE_ADDED: 'issue_added',
});

export const HUB_TIMINGS = {
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 30_000,
  // Read this long after midnight, so the server agrees.
  wakeSlackMs: 2_000,
  // Never read more often than this.
  minDelayMs: 10_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
  // An event this late (Taiga or the integration was down) is dropped.
  maxLateMs: 60 * 60_000,
};

// At most this many projects are read (4 requests each per reading).
export const MAX_PROJECTS = 20;
// The reading after a creation is awaited at most this long: the scene action
// answers within its 20 s.
const REFRESH_WAIT_MS = 3_000;
const MAX_SUBJECT = 500;
const MAX_DESCRIPTION = 10_000;

/**
 * A failed action: Gladys shows the message in red, in the user's language
 * (the multi-language object), and logs the English one.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

// Path segment of an item in the web app.
const WEB_SEGMENT = { [KINDS.USER_STORY]: 'us', [KINDS.TASK]: 'task', [KINDS.ISSUE]: 'issue' };

export class TaigaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/taiga/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = { scope: null, readAt: 0, lastIssue: {}, sent: [] };
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transports = new Map();
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    /** Every project the user is a member of. */
    this.projects = [];
    /** The followed ones, read: `{ id, name, slug, items, sprint }`. */
    this.followed = [];
    this.unknownProjects = [];
    /** Every open item of the followed projects. */
    this.items = [];
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.attempted = false;
    this.connectedLogged = false;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, level = 'warn') {
    if (this.warned.has(key)) {
      logger.debug(message);
      return;
    }
    this.warned.add(key);
    logger[level](message);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  get host() {
    return hostOf(this.config?.server?.web);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      scope: typeof saved.scope === 'string' ? saved.scope : null,
      readAt: Number.isFinite(saved.readAt) ? saved.readAt : 0,
      lastIssue: saved.lastIssue && typeof saved.lastIssue === 'object' ? saved.lastIssue : {},
      sent: Array.isArray(saved.sent) ? saved.sent : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transports.clear();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.server?.api === config.server?.api &&
      previous.username === config.username &&
      previous.password === config.password &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.client =
        config.server && config.username && config.password
          ? new TaigaClient({
              api: config.server.api,
              username: config.username,
              password: config.password,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language or project list: the devices are published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', `Reading failed: ${err.message}`, 'error'));
    }, delay);
  }

  /** The interval, shortened to the next local midnight. */
  nextDelay(readAt = this.now()) {
    if (this.error) {
      return Math.min(this.config.pollIntervalMs, this.timings.retryMs);
    }
    const now = this.now();
    // `readAt`: a midnight that passed during the reading is still ahead of it.
    const midnight = localDay(readAt, this.timeZone).end;
    const wake = midnight + this.timings.wakeSlackMs - now;
    const delay = wake > 0 ? Math.min(this.config.pollIntervalMs, wake) : 0;
    return Math.max(this.timings.minDelayMs, delay || this.config.pollIntervalMs);
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      const readAt = this.now();
      try {
        await this.read();
      } finally {
        this.schedule(this.nextDelay(readAt));
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    const today = dayKey(now, this.timeZone);
    const { client } = this;
    try {
      const projects = parseProjects(await client.projects());
      const wanted = this.follow(projects);
      const followed = [];
      // One project after the other: a small server is not hit by 80 requests at once.
      for (const project of wanted) {
        const raw = await client.project(project.id, { issues: project.issues });
        followed.push({
          ...project,
          items: [
            ...parseItems(raw.userStories, KINDS.USER_STORY, project.id),
            ...parseItems(raw.tasks, KINDS.TASK, project.id),
            ...parseItems(raw.issues, KINDS.ISSUE, project.id),
          ],
          sprint: project.backlog ? currentSprint(raw.milestones, today) : null,
        });
      }
      if (client !== this.client) {
        // The configuration changed during the reading: these are the old
        // instance's items; the new one is being read.
        return;
      }
      this.projects = projects;
      this.followed = followed;
      this.items = followed.flatMap((project) => project.items);
      this.readAt = now;
      this.recovered(now);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err, now);
    }
    this.attempted = true;
    await this.publishDevices();
    // The configuration may change while Gladys answers: never write the old
    // reading's events under the new one.
    if (client === this.client) {
      await this.publishStates();
      if (!this.error && this.readAt !== 0 && client === this.client) {
        await this.fireEvents(now);
      }
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  /** The projects to read: the configuration's list (names, slugs or ids), or all. */
  follow(projects) {
    const wanted = this.config.projects;
    let followed = projects;
    const unknown = [];
    if (wanted.length > 0) {
      const found = new Set();
      for (const query of wanted) {
        const { item, reason } = findProject(projects, query);
        if (item) {
          found.add(item.id);
        } else if (reason === 'ambiguous') {
          // Two projects of that name: both are followed.
          for (const project of projects) {
            if (findProject([project], query).item) {
              found.add(project.id);
            }
          }
        } else {
          unknown.push(query);
        }
      }
      followed = projects.filter((project) => found.has(project.id));
    }
    if (followed.length > MAX_PROJECTS) {
      this.problem(
        'too-many-projects',
        `${followed.length} projects: only the first ${MAX_PROJECTS} are read, list the ones to follow in the configuration`,
      );
      followed = followed.slice(0, MAX_PROJECTS);
    } else {
      this.resolved('too-many-projects');
    }
    if (unknown.join('|') !== this.unknownProjects.join('|')) {
      this.unknownProjects = unknown;
      if (unknown.length > 0) {
        logger.warn(UNKNOWN_PROJECTS.en(unknown.join(', ')));
      }
    }
    return followed;
  }

  recovered(now) {
    if (this.downSince !== null) {
      const minutes = Math.round((now - this.downSince) / 60_000);
      this.resolved('read', `Taiga at ${this.host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Taiga at ${this.host}: ${this.items.length} open item(s) in ${this.followed.length} followed project(s)`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof TaigaError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= now;
    this.problem('read', `Taiga at ${this.host}: ${err.message}`, 'error');
  }

  /** The followed project of a project device external id, null when none. */
  projectOf(externalId) {
    return (
      this.followed.find((project) => projectIds(this.gladys, project.id).device === externalId) ??
      null
    );
  }

  /** What a widget points at: every followed project, or one. */
  view(deviceExternalId) {
    if (!deviceExternalId || deviceExternalId === instanceIds(this.gladys).device) {
      return { project: null, unknown: false };
    }
    const project = this.projectOf(deviceExternalId);
    return { project, unknown: !project };
  }

  today() {
    return dayKey(this.now(), this.timeZone);
  }

  summary(project = null) {
    return summarize(project ? project.items : this.items, this.today());
  }

  /** Whole days until the end of a sprint (0 on its last day and after). */
  daysLeft(sprint) {
    return sprint ? Math.max(0, daysBetween(this.today(), sprint.finish)) : 0;
  }

  projectTitle(projectId) {
    return this.followed.find((project) => project.id === projectId)?.name ?? `#${projectId}`;
  }

  /** The name of the project in Gladys once its device is added, else in Taiga (the widget). */
  shownProjectName(projectId) {
    const externalId = projectIds(this.gladys, projectId).device;
    const device = (this.gladys.devices ?? []).find((item) => item.external_id === externalId);
    return device?.name || this.projectTitle(projectId);
  }

  /** Link to an item in the web app. */
  itemUrl(project, kind, ref) {
    if (!project?.slug || !ref) {
      return '';
    }
    return `${this.config.server.web}/project/${encodeURIComponent(project.slug)}/${WEB_SEGMENT[kind]}/${ref}`;
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    if (!this.client || !this.attempted) {
      return [];
    }
    // Two projects of the same name: the id tells them apart.
    const names = new Map();
    for (const project of this.followed) {
      names.set(project.name, (names.get(project.name) ?? 0) + 1);
    }
    return [
      buildInstance(this.gladys, this.host, this.language),
      ...this.followed.map((project) =>
        buildProject(
          this.gladys,
          {
            ...project,
            name:
              names.get(project.name) > 1
                ? `${project.name.slice(0, 40)} #${project.id}`
                : project.name,
          },
          this.language,
        ),
      ),
    ];
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (devices.length === 0 || signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (this.attempted) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  states() {
    if (!this.client || !this.attempted) {
      return [];
    }
    const states = instanceStates(this.gladys, !this.error);
    if (this.error || this.readAt === 0) {
      // The counters keep their last value: only "reachable" moves.
      return states;
    }
    for (const project of this.followed) {
      states.push(
        ...projectStates(this.gladys, project, this.summary(project), {
          language: this.language,
          daysLeft: this.daysLeft(project.sprint),
        }),
      );
    }
    return states;
  }

  async publishStates() {
    const states = this.states();
    if (states.length === 0) {
      return;
    }
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = this.devices()
      .map((device) => ({ external_id: device.external_id, transport }))
      .filter((entry) => this.transports.get(entry.external_id) !== entry.transport);
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.server) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.client) {
      return { connected: false, message: CONNECTION_TEXT.noCredentials };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([this.error?.kind ?? null, this.followed, this.today()]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  /**
   * The events since the previous successful reading (persisted under /data,
   * so a restart neither repeats nor loses one):
   *   - an open item whose due day ended since then (at most `maxLateMs`
   *     ago): it became overdue at local midnight. A due date set by hand to
   *     a day already past fires nothing;
   *   - an open issue whose id is above the highest one known for its
   *     project (Taiga ids only grow): a new issue. A project just followed
   *     brings no event.
   */
  async fireEvents(now) {
    const scope = this.config.server.api;
    const highest = (project) =>
      Math.max(0, ...project.items.filter((i) => i.kind === KINDS.ISSUE).map((i) => i.id));
    if (this.saved.scope !== scope || this.saved.readAt === 0) {
      // First reading of this instance: what already passed is not news.
      this.saved = {
        scope,
        readAt: now,
        lastIssue: Object.fromEntries(this.followed.map((p) => [p.id, highest(p)])),
        sent: [],
      };
      this.store.save(this.saved);
      return;
    }
    const lastIssue = { ...this.saved.lastIssue };
    for (const project of this.followed) {
      const known = lastIssue[project.id];
      if (!Number.isSafeInteger(known)) {
        lastIssue[project.id] = highest(project);
        continue;
      }
      const fresh = project.items
        .filter((item) => item.kind === KINDS.ISSUE && item.id > known)
        .sort((a, b) => a.id - b.id);
      for (const item of fresh) {
        // Gladys refused (restarting?): this one and the next are tried again
        // at the next reading.
        if (!(await this.fire(TRIGGERS.ISSUE_ADDED, this.eventData(item)))) {
          break;
        }
        lastIssue[project.id] = item.id;
      }
    }

    // Due events already sent at the moment where Gladys refused one.
    const sent = new Set(this.saved.sent);
    const eventId = (event) => `${event.item.kind}:${event.item.id}:${event.at}`;
    const from = Math.max(this.saved.readAt, now - this.timings.maxLateMs);
    const events = [];
    for (const item of this.items) {
      if (item.due === null) {
        continue;
      }
      const at = dayEnd(item.due, this.timeZone);
      if (at > from && at <= now) {
        events.push({ at, item });
      }
    }
    events.sort((a, b) => a.at - b.at || a.item.id - b.item.id);
    let readAt = now;
    let sentNow = [];
    for (const event of events) {
      if (sent.has(eventId(event))) {
        sentNow.push(eventId(event));
        continue;
      }
      if (!(await this.fire(TRIGGERS.OVERDUE, this.eventData(event.item)))) {
        // Tried again at the next reading, within the hour.
        readAt = event.at - 1;
        sentNow = sentNow.filter((id) => id.endsWith(`:${event.at}`));
        break;
      }
      sentNow.push(eventId(event));
    }
    if (readAt === now) {
      sentNow = [];
    }
    this.saved = {
      scope,
      readAt: Math.max(readAt, this.saved.readAt),
      lastIssue,
      sent: sentNow,
    };
    this.store.save(this.saved);
  }

  eventData(item) {
    const project = this.followed.find((p) => p.id === item.projectId);
    return {
      project: projectIds(this.gladys, item.projectId).device,
      project_name: this.projectTitle(item.projectId),
      kind: item.kind,
      item: item.name,
      ref: item.ref ?? 0,
      status: item.status,
      due_date: item.due ?? '',
      url: this.itemUrl(project, item.kind, item.ref),
    };
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
      return true;
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A Taiga error, in words for the user (the server's text stays in the logs). */
  explain(err) {
    if (err instanceof ActionFailure || !(err instanceof TaigaError)) {
      return err;
    }
    const status = err.status ? ` (HTTP ${err.status})` : '';
    return new ActionFailure(
      allLanguages((language) => {
        const colon = language === 'fr' ? ' : ' : ': ';
        return `Taiga${colon}${ERROR_TEXT[err.kind][language]}${status}`;
      }),
    );
  }

  fail(key) {
    return new ActionFailure(ACTION_TEXT[key]);
  }

  requireClient() {
    if (!this.client) {
      throw this.fail('notConfigured');
    }
    return this.client;
  }

  /** Read again now, and wait for it a little (the scene should not lag). */
  async refreshSoon() {
    const refresh = this.poll().catch(() => {});
    let timer;
    await Promise.race([
      refresh,
      new Promise((resolve) => {
        timer = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /** A project by id, slug or name among every project of the user; empty: the first followed. */
  async findProject(query) {
    let projects;
    try {
      projects = parseProjects(await this.requireClient().projects());
    } catch (err) {
      throw this.explain(err);
    }
    if (String(query ?? '').trim() === '') {
      const first =
        projects.find((project) => this.followed.some((item) => item.id === project.id)) ??
        projects[0];
      if (!first) {
        throw this.fail('noProject');
      }
      return first;
    }
    const { item, reason } = findProject(projects, query);
    if (!item) {
      throw this.fail(reason === 'ambiguous' ? 'projectAmbiguous' : 'projectNotFound');
    }
    return item;
  }

  /** Create an issue or a user story (scene actions). */
  async createItem(kind, { project: projectQuery, title, description }) {
    const client = this.requireClient();
    const subject = String(title ?? '')
      .trim()
      .slice(0, MAX_SUBJECT);
    if (!subject) {
      throw this.fail('emptyTitle');
    }
    const project = await this.findProject(projectQuery);
    if (kind === KINDS.ISSUE && !project.issues) {
      throw this.fail('issuesOff');
    }
    let created;
    try {
      created = await client.create(kind, {
        project: project.id,
        subject,
        description: String(description ?? '').slice(0, MAX_DESCRIPTION),
      });
    } catch (err) {
      throw this.explain(err);
    }
    logger.info(`${kind} #${created.ref} created in project ${project.id} from Gladys`);
    await this.refreshSoon();
    return {
      id: created.id ?? 0,
      ref: created.ref ?? 0,
      title: subject,
      project_name: project.name,
      url: this.itemUrl(project, kind, created.ref),
    };
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new ActionFailure(
        allLanguages((language) => REPORT_TEXT[language].failed(status.message[language])),
      );
    }
    const summary = this.summary();
    return allLanguages((language) => {
      const unknown =
        this.unknownProjects.length > 0
          ? ` ${UNKNOWN_PROJECTS[language](this.unknownProjects.join(', '))}`
          : '';
      return `${REPORT_TEXT[language].ok(this.items.length, summary.overdue, this.followed.length)}${unknown}`;
    });
  }
}
