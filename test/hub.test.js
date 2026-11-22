// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and an in-memory
// Taiga built from real answers (test/helpers/fakeTaiga.js): devices, states,
// connection status, scene events, scene actions, the action, the session.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_CONFIG,
  EMAIL,
  FakeTaiga,
  MAISON,
  SITE,
  createAll,
  createClock,
  createWorld,
  instanceId,
  projectId,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const HOUR = 60 * 60_000;
// 23:00 in Paris on the day of the fixtures: "Appeler le plombier" (due
// today) becomes overdue at midnight.
const LATE_EVENING = Date.UTC(2026, 10, 22, 22, 0);

test('discovers the instance and one device per project, should_poll false', async (t) => {
  const w = await world(t);
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Taiga 192.0.2.20:9000', 'Taiga Maison', 'Taiga Site web'],
  );
  assert.ok(devices.every((device) => device.should_poll === false));
  assert.equal(devices[1].external_id, projectId(w.gladys, MAISON).device);
});

test('publishes the counters and the sprint of each project', async (t) => {
  const w = await world(t);
  await createAll(w);
  const maison = projectId(w.gladys, MAISON);
  const site = projectId(w.gladys, SITE);
  const state = (ids, key) => w.fake.lastState(ids.feature(key));
  assert.equal(w.fake.lastState(instanceId(w.gladys).feature('reachable')), 1);
  assert.equal(state(maison, 'open_user_stories'), 3);
  assert.equal(state(maison, 'open_tasks'), 2);
  assert.equal(state(maison, 'open_issues'), 1);
  assert.equal(state(maison, 'overdue'), 3);
  // One closed user story of three, no points: 33 %; ends on 29/11.
  assert.equal(state(maison, 'sprint_progress'), 33);
  assert.equal(state(maison, 'sprint_days_left'), 7);
  assert.equal(state(maison, 'sprint'), 'Sprint 1');
  assert.equal(state(site, 'open_issues'), 2);
  assert.equal(state(site, 'overdue'), 1);
  assert.equal(state(site, 'sprint_progress'), 0);
  assert.equal(state(site, 'sprint'), 'None');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('the sprint progress counts the points when the stories have some', async (t) => {
  const server = new FakeTaiga();
  Object.assign(server.data.milestones[0], { total_points: 13, closed_points: 5 });
  const w = await world(t, { server });
  await createAll(w);
  assert.equal(w.fake.lastState(projectId(w.gladys).feature('sprint_progress')), 38);
});

test('the feature names follow the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  await createAll(w);
  const names = w.fake.discoveredDevices[1].features.map((feature) => feature.name);
  assert.ok(names.includes('Tickets ouverts') && names.includes('Avancement du sprint'));
  assert.equal(w.fake.lastState(projectId(w.gladys, SITE).feature('sprint')), 'Aucun');
});

test('only the followed projects, by name, slug or id; an unknown one is reported', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'site-web, Atelier' } });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Taiga 192.0.2.20:9000', 'Taiga Site web'],
  );
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /1 projet\(s\) suivi\(s\)/);
  assert.match(ack.data.message.en, /Unknown project\(s\) ignored: Atelier/);
});

test('logs in by e-mail too', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, username: EMAIL } });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a states republished when a device is added in Gladys', async (t) => {
  const w = await world(t);
  const feature = projectId(w.gladys).feature('open_tasks');
  const before = w.fake.states.filter((s) => s.device_feature_external_id === feature).length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[1]);
  const after = w.fake.states.filter((s) => s.device_feature_external_id === feature).length;
  assert.equal(after, before + 1);
  assert.ok(w.fake.widgetRefreshes.length > 0);
});

test('an expired token is renewed with the refresh token, without a new login', async (t) => {
  const w = await world(t);
  assert.equal(w.server.logins, 1);
  w.server.expireTokens();
  await w.hub.poll();
  assert.equal(w.server.refreshes, 1);
  assert.equal(w.server.logins, 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  // The refresh token is single use: the next renewal uses the new one.
  w.server.expireTokens();
  await w.hub.poll();
  assert.equal(w.server.refreshes, 2);
  assert.equal(w.server.logins, 1);
});

test('a refused refresh token falls back on a new login', async (t) => {
  const w = await world(t);
  w.server.expireTokens();
  w.server.refreshTokens.clear();
  await w.hub.poll();
  assert.equal(w.server.logins, 2);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a wrong password is reported to Gladys in four languages', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, password: 'wrong' } });
  const status = w.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /mot de passe refusé/);
  assert.ok(status.message.de && status.message.es);
  // The instance device exists, unreachable; no project device.
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.equal(w.fake.lastState(instanceId(w.gladys).feature('reachable')), 0);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /^Taiga : identifiant ou mot de passe refusé/);
});

test('an outage: unreachable, last counters kept, back on its own', async (t) => {
  const w = await world(t);
  await createAll(w);
  const reachable = instanceId(w.gladys).feature('reachable');
  w.server.online = false;
  await w.hub.poll();
  assert.equal(w.fake.lastState(reachable), 0);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(w.fake.lastState(projectId(w.gladys).feature('open_tasks')), 2);
  assert.ok(w.fake.transports.some((entry) => entry.transport === 'unreachable'));
  w.server.online = true;
  await w.hub.poll();
  assert.equal(w.fake.lastState(reachable), 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('another server at the address: "no Taiga API"', async (t) => {
  const server = new FakeTaiga();
  server.htmlOnly = true;
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /no Taiga API/);
});

test('no address, a bad address, no password: a clear status', async (t) => {
  const none = await world(t, { config: {} });
  assert.match(none.fake.connectionStatus.message.en, /Enter the address/);
  assert.equal(none.fake.discoveredDevices.length, 0);
  const bad = await world(t, { config: { ...BASE_CONFIG, url: 'ftp://x' } });
  assert.match(bad.fake.connectionStatus.message.en, /Address not understood/);
  const noPassword = await world(t, { config: { ...BASE_CONFIG, password: '' } });
  assert.match(noPassword.fake.connectionStatus.message.en, /username and password/);
});

// --- Scene events ----------------------------------------------------------------

test('at midnight, an item due that day fires "item overdue", once', async (t) => {
  const clock = createClock(LATE_EVENING);
  const w = await world(t, { clock });
  assert.deepEqual(w.fake.sceneEvents, [], 'what is already late is not news');
  clock.advance(HOUR + 5 * 60_000); // 00:05 in Paris
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1);
  const [event] = w.fake.sceneEvents;
  assert.equal(event.key, 'item_overdue');
  assert.deepEqual(event.data, {
    project: projectId(w.gladys, MAISON).device,
    project_name: 'Maison',
    kind: 'task',
    item: 'Appeler le plombier',
    ref: 7,
    status: 'New',
    due_date: '2026-11-22',
    url: 'http://192.0.2.20:9000/project/maison/task/7',
  });
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1);
});

test('a restart neither repeats nor loses an overdue event', async (t) => {
  const clock = createClock(LATE_EVENING);
  const first = await createWorld({ clock });
  await first.app.stop();
  clock.advance(90 * 60_000); // down from 23:00 to 00:30
  const second = await world(t, { clock, dataDir: first.dataDir });
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => event.data.item),
    ['Appeler le plombier'],
  );
  await second.app.stop();
  const third = await world(t, { clock, dataDir: first.dataDir });
  assert.deepEqual(third.fake.sceneEvents, []);
});

test('an overdue event refused by Gladys is sent again at the next reading', async (t) => {
  const clock = createClock(LATE_EVENING);
  const w = await world(t, { clock });
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  t.mock.method(w.gladys, 'publishSceneEvent', async (...args) => {
    if (refuse) {
      throw new Error('Gladys is restarting');
    }
    return publish(...args);
  });
  clock.advance(HOUR + 5 * 60_000); // 00:05 in Paris
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 0);
  refuse = false;
  clock.advance(5 * 60_000);
  await w.hub.poll();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.key),
    ['item_overdue'],
  );
});

test('a new issue fires "new issue"; a newly followed project does not', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'maison' } });
  w.server.item('issues', { project: SITE, subject: 'Formulaire en panne' });
  w.server.item('issues', { project: MAISON, subject: 'Volet bloqué' });
  await w.fake.configUpdated({ ...BASE_CONFIG, projects: 'maison, site-web' });
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => [event.key, event.data.item, event.data.project_name]),
    [['issue_added', 'Volet bloqué', 'Maison']],
  );
  assert.equal(w.fake.sceneEvents[0].data.url, 'http://192.0.2.20:9000/project/maison/issue/102');
  w.server.item('issues', { project: SITE, subject: 'Formulaire en panne (2)' });
  await w.hub.poll();
  assert.deepEqual(w.fake.sceneEvents.at(-1).data.item, 'Formulaire en panne (2)');
  assert.equal(w.fake.sceneEvents.length, 2);
});

test('no burst of "new issue": module turned on, project followed again, issue reopened', async (t) => {
  const clock = createClock();
  const server = new FakeTaiga({ now: clock.now });
  server.projectList[1].is_issues_activated = false;
  const w = await world(t, { clock, server });
  // The Issues module of "Site web" is turned on: its old issues are not new.
  server.projectList[1].is_issues_activated = true;
  clock.advance(5 * 60_000);
  await w.hub.poll();
  assert.deepEqual(w.fake.sceneEvents, []);
  // "Site web" is left, gets issues for three days, then is followed again.
  await w.fake.configUpdated({ ...BASE_CONFIG, projects: 'maison' });
  for (let i = 0; i < 3; i += 1) {
    server.item('issues', { project: SITE, subject: `Ancien ${i}` });
  }
  clock.advance(3 * 24 * HOUR);
  await w.hub.poll();
  await w.fake.configUpdated(BASE_CONFIG);
  assert.deepEqual(w.fake.sceneEvents, []);
  // A closed issue, older than the last one seen, is reopened: not new.
  const old = server.item('issues', { project: MAISON, subject: 'Vieux ticket' });
  old.is_closed = true;
  old.created_date = new Date(clock.now() - 10 * 24 * HOUR).toISOString();
  clock.advance(5 * 60_000);
  await w.hub.poll();
  server.item('issues', { project: MAISON, subject: 'Vraiment nouveau' });
  old.is_closed = false;
  clock.advance(5 * 60_000);
  await w.hub.poll();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.data.item),
    ['Vraiment nouveau'],
  );
});

test('a refused password is not tried again every 30 seconds', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, password: 'wrong' } });
  assert.ok(w.hub.nextDelay() >= 15 * 60_000);
  w.server.online = false;
  await w.hub.poll();
  assert.equal(w.hub.nextDelay(), 30_000, 'an outage is retried soon');
});

// --- Scene actions ---------------------------------------------------------------

test('create_issue creates an issue and returns its number and link', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('create_issue', {
    title: '  Lave-linge en erreur ',
    project: 'Maison',
    description: 'Code E21',
  });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  assert.deepEqual(ack.data.outputs, {
    id: 101,
    ref: 101,
    title: 'Lave-linge en erreur',
    project_name: 'Maison',
    url: 'http://192.0.2.20:9000/project/maison/issue/101',
  });
  const created = w.server.data.issues.at(-1);
  assert.equal(created.description, 'Code E21');
  assert.equal(w.fake.lastState(projectId(w.gladys).feature('open_issues')), 2);
});

test('create_user_story goes to the first followed project by default', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'site-web' } });
  const ack = await w.fake.sceneAction('create_user_story', { title: 'Page Noël' });
  assert.equal(ack.success, true);
  assert.equal(ack.data.outputs.project_name, 'Site web');
  assert.match(ack.data.outputs.url, /\/project\/site-web\/us\/\d+$/);
});

test('every failure of an action is an error, in four languages', async (t) => {
  const w = await world(t);
  const cases = [
    [{ title: '' }, /Indiquez le titre/],
    [{ title: 'x', project: 'Atelier' }, /Aucun projet/],
  ];
  for (const [fields, message] of cases) {
    const ack = await w.fake.sceneAction('create_issue', fields);
    assert.equal(ack.success, false);
    assert.match(ack.error.fr, message);
    assert.ok(ack.error.en && ack.error.de && ack.error.es);
  }
  w.server.readOnly = true;
  const forbidden = await w.fake.sceneAction('create_user_story', { title: 'x' });
  assert.equal(forbidden.success, false);
  assert.match(forbidden.error.fr, /^Taiga : cet utilisateur n'a pas ce droit .*\(HTTP 403\)/);
  w.server.online = false;
  const down = await w.fake.sceneAction('create_issue', { title: 'x' });
  assert.equal(down.success, false);
  assert.match(down.error.en, /Taiga does not answer/);
});

test('an issue in a project whose Issues module is off is refused before Taiga', async (t) => {
  const server = new FakeTaiga();
  server.projectList[1].is_issues_activated = false;
  const w = await world(t, { server });
  const ack = await w.fake.sceneAction('create_issue', { title: 'x', project: 'site-web' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /module Tickets/);
  assert.equal(w.fake.lastState(projectId(w.gladys, SITE).feature('open_issues')), 0);
});

test('an empty project without any followed project is an error', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'Atelier' } });
  const ack = await w.fake.sceneAction('create_issue', { title: 'x' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Aucun projet suivi/);
});

test('an action without configuration is an error', async (t) => {
  const w = await world(t, { config: {} });
  const ack = await w.fake.sceneAction('create_issue', { title: 'x' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Taiga n'est pas configuré/);
});
