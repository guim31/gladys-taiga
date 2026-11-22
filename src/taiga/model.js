// -----------------------------------------------------------------------------
// Pure parsing and counting of what Taiga answers: projects, user stories,
// tasks, issues and sprints (milestones), the local day of Gladys (TZ), and
// the counters of a project. No network, no clock: everything is a parameter.
//
// Taiga gives a due date as a calendar day (`due_date: "2026-11-20"`, no
// time): an item is overdue once its due day has ended in the time zone of
// Gladys, open (its status not closed).
// -----------------------------------------------------------------------------

export const KINDS = Object.freeze({
  USER_STORY: 'user_story',
  TASK: 'task',
  ISSUE: 'issue',
});

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const idOf = (value) => (Number.isSafeInteger(value) && value > 0 ? value : null);
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayOf = (value) => {
  if (typeof value !== 'string' || !DAY_RE.test(value)) {
    return null;
  }
  const [, y, m, d] = value.match(DAY_RE).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
};

export const fold = (value) =>
  String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The projects of the user, in the order Taiga gives them.
 * @param {unknown} raw answer of GET /api/v1/projects?member=<id>
 * @returns {Array<{ id: number, name: string, slug: string, issues: boolean, backlog: boolean }>}
 */
export function parseProjects(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .filter((project) => idOf(project?.id) && !seen.has(project.id) && seen.add(project.id))
    .filter((project) => !project.blocked_code)
    .map((project) => ({
      id: project.id,
      name: text(project.name) || `#${project.id}`,
      slug: text(project.slug),
      issues: project.is_issues_activated !== false,
      backlog: project.is_backlog_activated !== false,
    }));
}

/**
 * Open items of one kind (the request asks for `status__is_closed=false`;
 * `is_closed` is checked again).
 * @param {unknown} raw answer of GET /api/v1/{userstories,tasks,issues}
 * @param {string} kind KINDS
 * @param {number} projectId
 */
export function parseItems(raw, kind, projectId) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => idOf(item?.id) && item.is_closed !== true)
    .filter((item) => item.project === undefined || item.project === projectId)
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({
      kind,
      id: item.id,
      ref: idOf(item.ref),
      name: text(item.subject) || `#${item.ref ?? item.id}`,
      projectId,
      due: dayOf(item.due_date),
      created: Number.isFinite(Date.parse(item.created_date))
        ? Date.parse(item.created_date)
        : null,
      status: text(item.status_extra_info?.name),
    }))
    .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9') || a.id - b.id);
}

/**
 * The sprint in progress: among the open ones, the last started (its start
 * day passed). Its progress in % (closed points of total points, else closed
 * user stories of its user stories) and its end day.
 * @param {unknown} raw answer of GET /api/v1/milestones?project=<id>&closed=false
 * @param {string} today local `YYYY-MM-DD`
 * @returns {{ id: number, name: string, start: string, finish: string, progress: number }|null}
 */
export function currentSprint(raw, today) {
  const sprints = (Array.isArray(raw) ? raw : [])
    .filter((sprint) => idOf(sprint?.id) && sprint.closed !== true)
    .map((sprint) => ({ raw: sprint, start: dayOf(sprint.estimated_start) }))
    .filter((sprint) => sprint.start && sprint.start <= today)
    .sort((a, b) => b.start.localeCompare(a.start) || b.raw.id - a.raw.id);
  const sprint = sprints[0]?.raw;
  if (!sprint) {
    return null;
  }
  const total = Number(sprint.total_points);
  const closed = Number(sprint.closed_points);
  let progress = 0;
  if (Number.isFinite(total) && total > 0) {
    progress = (Number.isFinite(closed) ? closed : 0) / total;
  } else {
    const stories = Array.isArray(sprint.user_stories) ? sprint.user_stories : [];
    if (stories.length > 0) {
      progress = stories.filter((story) => story?.is_closed === true).length / stories.length;
    }
  }
  return {
    id: sprint.id,
    name: text(sprint.name) || `#${sprint.id}`,
    start: sprints[0].start,
    finish: dayOf(sprint.estimated_finish) ?? sprints[0].start,
    progress: Math.max(0, Math.min(100, Math.round(progress * 100))),
  };
}

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
  return parts;
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of local midnight of a local calendar day (DST-safe). */
function localMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  let start = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  if (zonedParts(start, timeZone).day !== day) {
    start += 60 * 60_000;
  }
  return start;
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Start and end (exclusive) of the local day holding `now`. */
export function localDay(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const start = localMidnight(p.year, p.month, p.day, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

/** Local calendar day `YYYY-MM-DD` of an instant. */
export function dayKey(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The instant a local calendar day `YYYY-MM-DD` ends (next local midnight). */
export function dayEnd(day, timeZone) {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
}

/** Whole days from `today` to `day` (both `YYYY-MM-DD`), negative when past. */
export function daysBetween(today, day) {
  const utc = (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(day) - utc(today)) / 86_400_000);
}

// --- Counters ---------------------------------------------------------------------

/**
 * Counters of a set of open items (one project, or every followed one).
 * @param {ReturnType<typeof parseItems>} items
 * @param {string} today local `YYYY-MM-DD`
 */
export function summarize(items, today) {
  const count = (kind) => items.filter((item) => item.kind === kind).length;
  const overdue = items
    .filter((item) => item.due !== null && item.due < today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  return {
    userStories: count(KINDS.USER_STORY),
    tasks: count(KINDS.TASK),
    issues: count(KINDS.ISSUE),
    overdue: overdue.length,
    dueToday: items.filter((item) => item.due === today).length,
    // Overdue first, then due today.
    agenda: [...overdue, ...items.filter((item) => item.due === today)],
  };
}

/**
 * Find an item by its id, its slug or its exact name (case, accents and
 * repeated blanks ignored).
 * @template {{ id: number, name: string, slug?: string }} T
 * @param {T[]} items
 * @param {unknown} query
 * @returns {{ item: T|null, reason?: 'empty'|'not_found'|'ambiguous' }}
 */
export function findProject(items, query) {
  const wanted = String(query ?? '').trim();
  if (!wanted) {
    return { item: null, reason: 'empty' };
  }
  const exact = items.find((item) => String(item.id) === wanted || item.slug === wanted);
  if (exact) {
    return { item: exact };
  }
  const matches = items.filter((item) => fold(item.name) === fold(wanted));
  if (matches.length === 1) {
    return { item: matches[0] };
  }
  return { item: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}
