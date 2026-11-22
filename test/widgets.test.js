// -----------------------------------------------------------------------------
// The "Taiga projects" widget: content within the core budget (validated by
// the SDK's validateWidgetContent), the all-projects and one-project views,
// the setting that hides the list, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BASE_CONFIG, SITE, createWorld, projectId } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('project_overview', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  assert.ok(tree.components.length <= 8);
  assert.ok(tree.components.filter((c) => c.type === 'text').length <= 2);
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);

test('every project: tiles, the sprint, the late items with their project', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Overdue', 4],
      ['Due today', 1],
      ['Open issues', 3],
    ],
  );
  const [rows] = ofType(data, 'status');
  assert.deepEqual(rows.items[0], {
    label: 'Maison · Sprint 1',
    icon: 'flag',
    value: '33 % · 7 d left',
    color: 'neutral',
  });
  assert.deepEqual(
    rows.items.slice(1).map((row) => [row.label, row.value]),
    [
      ["Fuite sous l'évier", 'Issue #4 · late · Maison'],
      ['Acheter la peinture', 'Task #3 · late · Maison'],
      ['Repeindre la cuisine', 'Story #1 · late · Maison'],
      ["Lien cassé sur l'accueil", 'Issue #2 · late · Site web'],
      ['Appeler le plombier', 'Task #7 · today · Maison'],
    ],
  );
});

test('one project, in French, without the list', async (t) => {
  const w = await world(t);
  const data = await content(
    w,
    { device: projectId(w.gladys, SITE).device, show_items: false },
    'fr',
  );
  assert.deepEqual(
    ofType(data, 'value').map((tile) => tile.value),
    [1, 0, 2],
  );
  assert.equal(ofType(data, 'status').length, 0, 'no sprint, list hidden');
  const shown = await content(w, { device: projectId(w.gladys, SITE).device }, 'fr');
  assert.deepEqual(
    ofType(shown, 'status')[0].items.map((row) => row.value),
    ['Ticket #2 · en retard'],
  );
});

test('the name given in Gladys replaces the Taiga name', async (t) => {
  const w = await world(t);
  const device = { ...w.fake.discoveredDevices[1], name: 'Travaux' };
  await w.fake.deviceCreated(device);
  const data = await content(w);
  assert.equal(ofType(data, 'status')[0].items[0].label, 'Travaux · Sprint 1');
});

test('degraded states: not configured, never answered, stale, unknown device', async (t) => {
  const none = await world(t, { config: {} });
  assert.match((await content(none)).components[0].text, /Enter the address/);
  const down = await world(t, { config: { ...BASE_CONFIG, url: 'http://192.0.2.99' } });
  assert.match((await content(down)).components[0].text, /does not answer/);
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  const stale = await content(w);
  assert.equal(stale.components[0].variant, 'caption');
  assert.equal(ofType(stale, 'value')[0].value, 4, 'last known figures');
  const unknown = await content(w, { device: projectId(w.gladys, 99).device });
  assert.match(unknown.components[0].text, /no longer followed/);
});
