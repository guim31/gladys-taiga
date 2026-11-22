// -----------------------------------------------------------------------------
// An in-memory Taiga, answering the routes the integration calls the way the
// real server does (status codes and bodies, the login, the single-use
// refresh token, an expired access token, a missing subject, the front's
// HTML page outside the API). Its starting data are real answers of
// taigaio/taiga-back (image of 22/11/2026) in Docker
// (test/fixtures/taiga/real-*.json), captured on 22/11/2026 at 11:50 UTC,
// anonymized: two projects.
//   "Maison" (id 1): sprint "Sprint 1" (16 → 29/11) with three user stories,
//     one closed (33 %); open user stories "Repeindre la cuisine" (due 20/11,
//     overdue), "Changer le joint" (10/12), "Poser les plinthes" (undated);
//     tasks "Acheter la peinture" (18/11, overdue), "Appeler le plombier"
//     (22/11, today); issue "Fuite sous l'évier" (01/11, overdue).
//   "Site web" (id 2): no sprint; user story "Page des vacances" (25/11);
//     issues "Lien cassé sur l'accueil" (21/11, overdue), "Photos trop
//     lourdes" (undated).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/taiga/${name}.json`, import.meta.url), 'utf8'));

export const USERNAME = 'demo';
export const EMAIL = 'demo@example.org';
export const PASSWORD = 'Demo-Passw0rd';
export const MAISON = 1;
export const SITE = 2;

const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

const KIND_PATHS = { userstories: 'userstories', tasks: 'tasks', issues: 'issues' };

export class FakeTaiga {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.auth = fixture('real-auth');
    this.projectList = fixture('real-projects');
    this.data = {};
    for (const [id, slug] of [
      [MAISON, 'maison'],
      [SITE, 'site-web'],
    ]) {
      for (const kind of [...Object.keys(KIND_PATHS), 'milestones']) {
        for (const item of fixture(`real-${slug}-${kind}`)) {
          (this.data[kind] ??= []).push({ ...item, project: id });
        }
      }
    }
    this.created = fixture('real-issue-created');
    this.online = true;
    /** The user may read but not write (a role without the permission). */
    this.readOnly = false;
    /** Another server answers: the front's HTML page. */
    this.htmlOnly = false;
    this.tokens = new Set();
    this.refreshTokens = new Set();
    this.logins = 0;
    this.refreshes = 0;
    this.requests = [];
    this.nextId = 100;
    this.nextRef = 100;
  }

  /** Every access token given so far stops working (they expired). */
  expireTokens() {
    this.tokens.clear();
  }

  issue() {
    const token = `token-${(this.logins + this.refreshes).toString()}-${this.tokens.size}`;
    const refresh = `refresh-${this.logins}-${this.refreshes}`;
    this.tokens.add(token);
    this.refreshTokens.add(refresh);
    return { token, refresh };
  }

  item(kind, fields) {
    const id = (this.nextId += 1);
    const ref = (this.nextRef += 1);
    const item = {
      ...this.created,
      ...fields,
      id,
      ref,
      is_closed: false,
      due_date: fields.due_date ?? null,
      created_date: new Date(this.now()).toISOString(),
      status_extra_info: { name: 'New', color: '#70728F', is_closed: false },
    };
    this.data[kind].push(item);
    return item;
  }

  async handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const target = new URL(url);
    const path = target.pathname.replace(/^\/api\/v1/, '');
    this.requests.push({ method, path, query: target.search });
    if (this.htmlOnly || !target.pathname.startsWith('/api/v1/')) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
    }
    if (method === 'POST' && path === '/auth') {
      const known = [USERNAME, EMAIL].includes(body?.username);
      if (body?.type !== 'normal' || !known || body.password !== PASSWORD) {
        return json(401, fixture('real-auth-refused'));
      }
      this.logins += 1;
      const { token, refresh } = this.issue();
      return json(200, { ...this.auth, auth_token: token, refresh });
    }
    if (method === 'POST' && path === '/auth/refresh') {
      // Single use: the server blacklists a refresh token once used.
      if (!this.refreshTokens.delete(body?.refresh)) {
        return json(401, { detail: 'Token is invalid or expired', code: 'token_not_valid' });
      }
      this.refreshes += 1;
      const { token, refresh } = this.issue();
      return json(200, { auth_token: token, refresh });
    }
    const bearer = String(headers.authorization ?? '').replace(/^Bearer /, '');
    if (!this.tokens.has(bearer)) {
      return json(401, fixture('real-token-expired'));
    }
    const query = target.searchParams;
    const project = Number(query.get('project'));
    if (method === 'GET' && path === '/projects') {
      return json(200, Number(query.get('member')) === this.auth.id ? this.projectList : []);
    }
    const kind = path.slice(1);
    if (method === 'GET' && (KIND_PATHS[kind] || kind === 'milestones')) {
      const open =
        kind === 'milestones' ? (item) => item.closed !== true : (item) => item.is_closed !== true;
      return json(
        200,
        (this.data[kind] ?? []).filter((item) => item.project === project && open(item)),
      );
    }
    if (method === 'POST' && (kind === 'issues' || kind === 'userstories')) {
      if (this.readOnly) {
        return json(403, { _error_message: 'You do not have permission to perform this action.' });
      }
      if (!body?.subject) {
        return json(400, { subject: ['This field is required.'] });
      }
      if (!this.projectList.some((item) => item.id === body.project)) {
        return json(400, { project: ['Invalid pk "999" - object does not exist.'] });
      }
      return json(201, this.item(kind, body));
    }
    return json(404, { _error_message: '' });
  }
}

/** A fake network: each base URL answered by one server, the rest refused. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
