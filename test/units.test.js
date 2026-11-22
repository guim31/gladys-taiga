// -----------------------------------------------------------------------------
// Pure helpers: the address typed by the user, the parsers of Taiga's answers
// (real fixtures), the local day and the sprint, the client's error kinds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig, parseNameList, parseServerUrl } from '../src/config.js';
import { ERROR_KINDS, TaigaClient } from '../src/taiga/client.js';
import {
  KINDS,
  currentSprint,
  dayEnd,
  dayKey,
  daysBetween,
  findProject,
  parseItems,
  parseProjects,
  summarize,
} from '../src/taiga/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/taiga/${name}.json`, import.meta.url), 'utf8'));

test('the address: bare host, browser URL, prefix, API path, taiga.io', () => {
  assert.deepEqual(parseServerUrl('192.0.2.10:9000'), {
    web: 'http://192.0.2.10:9000',
    api: 'http://192.0.2.10:9000/api/v1',
  });
  assert.deepEqual(parseServerUrl('https://taiga.example.org/project/maison/backlog'), {
    web: 'https://taiga.example.org',
    api: 'https://taiga.example.org/api/v1',
  });
  assert.equal(
    parseServerUrl('https://example.org/taiga/api/v1/').api,
    'https://example.org/taiga/api/v1',
  );
  assert.deepEqual(parseServerUrl('https://tree.taiga.io/project/x'), {
    web: 'https://tree.taiga.io',
    api: 'https://api.taiga.io/api/v1',
  });
  for (const bad of ['', '   ', 'ftp://x', 'http://user:pw@host', 42, 'http://']) {
    assert.equal(parseServerUrl(bad), null, String(bad));
  }
});

test('the configuration is normalized', () => {
  const config = normalizeConfig({
    url: ' 192.0.2.10 ',
    username: ' demo ',
    password: ' p ',
    projects: 'Maison; site-web, Maison',
    poll_interval: '7',
    language: 'it',
  });
  assert.equal(config.server.api, 'http://192.0.2.10/api/v1');
  assert.equal(config.username, 'demo');
  assert.equal(config.password, ' p ', 'the password is kept as typed');
  assert.deepEqual(config.projects, ['Maison', 'site-web']);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, 'fr');
  assert.deepEqual(parseNameList(undefined), []);
});

test('the parsers keep open items, sorted by due day, from real answers', () => {
  const projects = parseProjects(fixture('real-projects'));
  assert.deepEqual(
    projects.map((p) => [p.id, p.name, p.slug, p.issues]),
    [
      [1, 'Maison', 'maison', true],
      [2, 'Site web', 'site-web', true],
    ],
  );
  const stories = parseItems(fixture('real-maison-userstories'), KINDS.USER_STORY, 1);
  assert.deepEqual(
    stories.map((s) => [s.ref, s.name, s.due]),
    [
      [1, 'Repeindre la cuisine', '2026-11-20'],
      [2, 'Changer le joint', '2026-12-10'],
      [5, 'Poser les plinthes', null],
    ],
  );
  assert.deepEqual(parseItems([{ id: 1, is_closed: true }, { id: 'x' }, null], KINDS.TASK, 1), []);
  const summary = summarize(stories, '2026-11-22');
  assert.equal(summary.overdue, 1);
  assert.equal(summary.userStories, 3);
});

test('the sprint in progress and its progress', () => {
  const sprint = currentSprint(fixture('real-maison-milestones'), '2026-11-22');
  assert.deepEqual(sprint, {
    id: 1,
    name: 'Sprint 1',
    start: '2026-11-16',
    finish: '2026-11-29',
    progress: 33,
  });
  assert.equal(currentSprint(fixture('real-maison-milestones'), '2026-11-15'), null, 'not started');
  const later = {
    id: 2,
    name: 'Sprint 2',
    estimated_start: '2026-11-20',
    estimated_finish: '2026-12-03',
    user_stories: [],
  };
  assert.equal(
    currentSprint([...fixture('real-maison-milestones'), later], '2026-11-22').name,
    'Sprint 2',
  );
  assert.equal(currentSprint([], '2026-11-22'), null);
});

test('the local day, its end, and day differences, across DST', () => {
  const tz = 'Europe/Paris';
  assert.equal(dayKey(Date.UTC(2026, 10, 22, 23, 30), tz), '2026-11-23');
  assert.equal(dayEnd('2026-11-22', tz), Date.UTC(2026, 10, 22, 23, 0));
  assert.equal(dayEnd('2026-03-28', tz), Date.UTC(2026, 2, 28, 23, 0));
  assert.equal(dayEnd('2026-03-29', tz), Date.UTC(2026, 2, 29, 22, 0));
  assert.equal(daysBetween('2026-11-22', '2026-11-29'), 7);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
});

test('a project by id, slug or name; two of the same name are ambiguous', () => {
  const projects = parseProjects(fixture('real-projects'));
  assert.equal(findProject(projects, '2').item.name, 'Site web');
  assert.equal(findProject(projects, 'site-web').item.id, 2);
  assert.equal(findProject(projects, ' SITE  WEB ').item.id, 2);
  assert.equal(findProject(projects, 'Atelier').reason, 'not_found');
  assert.equal(
    findProject([...projects, { ...projects[0], id: 3, slug: 'maison-2' }], 'maison').item.id,
    1,
  );
  assert.equal(
    findProject([...projects, { ...projects[0], id: 3, slug: 'maison-2' }], 'Maison ').reason,
    'ambiguous',
  );
});

test('the client sorts the answers into error kinds', async () => {
  const answer =
    (status, body, headers = {}) =>
    async () => ({
      status,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const client = (request) =>
    new TaigaClient({ api: 'http://192.0.2.1/api/v1', username: 'u', password: 'p', request });
  const kind = async (request) => {
    try {
      await client(request).projects();
      return 'ok';
    } catch (err) {
      return err.kind;
    }
  };
  assert.equal(await kind(answer(401, fixture('real-auth-refused'))), ERROR_KINDS.AUTH);
  assert.equal(await kind(answer(200, '<!doctype html>')), ERROR_KINDS.NOT_TAIGA);
  assert.equal(await kind(answer(404, { _error_message: '' })), ERROR_KINDS.NOT_TAIGA);
  assert.equal(await kind(answer(429, {})), ERROR_KINDS.RATE_LIMIT);
  assert.equal(await kind(answer(301, '')), ERROR_KINDS.REDIRECT);
  assert.equal(await kind(answer(502, 'Bad gateway')), ERROR_KINDS.HTTP);
  const tls = async () => {
    throw Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  };
  assert.equal(await kind(tls), ERROR_KINDS.TLS);
  const sent = [];
  const record = async (url, options) => {
    sent.push({ url, options });
    return { status: 200, headers: {}, body: JSON.stringify(fixture('real-auth')) };
  };
  await client(record).login();
  assert.equal(sent[0].url, 'http://192.0.2.1/api/v1/auth');
  assert.deepEqual(sent[0].options.json, { type: 'normal', username: 'u', password: 'p' });
  assert.equal(sent[0].options.headers['x-disable-pagination'], 'True');
});
