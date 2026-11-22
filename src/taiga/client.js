// -----------------------------------------------------------------------------
// Taiga REST API client (`/api/v1`): the calls the integration needs. Checked
// against a real taigaio/taiga-back (image `latest` of 22/11/2026) with
// PostgreSQL 16 and RabbitMQ 4 in Docker, November 2026. taiga.io (the cloud
// offer) serves the same API at https://api.taiga.io/api/v1.
//
// Authentication: the username (or e-mail) and password of a Taiga user.
// `POST /auth` `{ type: "normal" }` gives `{ id, auth_token, refresh }`; the
// access token (a JWT, 24 h on a default server) is sent as
// `Authorization: Bearer`. A 401 renews it once with `POST /auth/refresh`,
// and logs in again when the refresh token is refused too. Tokens, refresh
// token and password stay in memory, never in a log.
//
//   POST /auth                                   { type, username, password } → { id, auth_token, refresh }
//   POST /auth/refresh                           { refresh } → { auth_token, refresh }
//   GET  /projects?member=<id>                   [{ id, name, slug, is_issues_activated, ... }]
//   GET  /userstories?project=<id>&status__is_closed=false   [{ id, ref, subject, due_date, ... }]
//   GET  /tasks?project=<id>&status__is_closed=false         idem
//   GET  /issues?project=<id>&status__is_closed=false        idem
//   GET  /milestones?project=<id>&closed=false   [{ id, name, estimated_start, estimated_finish,
//                                                    total_points, closed_points, user_stories }]
//   POST /issues | /userstories                  { project, subject, description } → { id, ref, ... }
//
// Pitfalls found on the real server:
//   - Lists are paginated by 30 by default; `x-disable-pagination: True`
//     answers them whole (no `x-pagination-*` header then).
//   - A wrong password answers 401 `{ code: "invalid_credentials" }`; an
//     invalid or expired token, 401 `{ code: "token_not_valid" }`.
//   - An unknown project in a list filter answers `[]` with a 200; GET
//     /projects/<unknown id>, 404 `{ _error_message: "" }`.
//   - A missing subject answers 400 `{ subject: ["This field is required."] }`.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // wrong username or password
  FORBIDDEN: 'forbidden', // the user may not do this
  NOT_FOUND: 'not_found', // the project is gone
  NOT_TAIGA: 'not_taiga', // something answers, but not the Taiga API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: Taiga's throttling or a reverse proxy
  HTTP: 'http', // any other unexpected answer
});

export class TaigaError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'TaigaError';
    this.kind = kind;
    this.status = status;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new TaigaError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new TaigaError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** The server's own short message (never a secret: Taiga does not echo them). */
function serverMessage(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '';
  }
  const said = [parsed.code, parsed._error_message, parsed.detail].find(
    (value) => typeof value === 'string' && value !== '',
  );
  if (said) {
    return ` ${said.slice(0, 200)}`;
  }
  // A validation error: `{ field: ["message"] }`.
  const [field, messages] = Object.entries(parsed)[0] ?? [];
  return field && Array.isArray(messages) ? ` ${field}: ${String(messages[0]).slice(0, 150)}` : '';
}

export class TaigaClient {
  /**
   * @param {object} options
   * @param {string} options.api base URL of the API, `…/api/v1`, without trailing slash
   * @param {string} options.username username or e-mail
   * @param {string} options.password
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/taiga/http.js)
   */
  constructor({ api, username = '', password = '', insecure = false, request }) {
    this.api = api;
    this.username = username;
    this.password = password;
    this.insecure = insecure;
    this.request = request ?? httpRequest;
    /** `{ token, refresh, userId }` of the login, null until asked. */
    this.session = null;
    this.loggingIn = null;
  }

  async send(path, { method = 'GET', json, headers = {} } = {}) {
    let response;
    try {
      response = await this.request(`${this.api}${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: { 'x-disable-pagination': 'True', ...headers },
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    let parsed;
    let parsedOk = true;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsedOk = false;
    }
    const said = parsedOk ? serverMessage(parsed) : '';
    if (status === 429) {
      throw new TaigaError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status >= 300 && status < 400) {
      throw new TaigaError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    if (!parsedOk) {
      // The front (an HTML page) or another server answers at this address.
      throw new TaigaError(
        status < 500 ? ERROR_KINDS.NOT_TAIGA : ERROR_KINDS.HTTP,
        `HTTP ${status}, not JSON`,
        status,
      );
    }
    if (status === 401) {
      throw new TaigaError(ERROR_KINDS.AUTH, `HTTP 401${said}`, status);
    }
    if (status === 403) {
      throw new TaigaError(ERROR_KINDS.FORBIDDEN, `HTTP 403${said}`, status);
    }
    if (status === 404) {
      throw new TaigaError(ERROR_KINDS.NOT_FOUND, `HTTP 404${said}`, status);
    }
    if (status < 200 || status >= 300) {
      throw new TaigaError(ERROR_KINDS.HTTP, `HTTP ${status}${said}`, status);
    }
    return parsed;
  }

  /** The password login; one at a time. */
  login() {
    this.loggingIn ??= (async () => {
      try {
        const data = await this.send('/auth', {
          method: 'POST',
          json: { type: 'normal', username: this.username, password: this.password },
        });
        if (typeof data?.auth_token !== 'string' || data.auth_token === '' || !data.id) {
          throw new TaigaError(ERROR_KINDS.NOT_TAIGA, 'no token in /auth', 200);
        }
        this.session = {
          token: data.auth_token,
          refresh: typeof data.refresh === 'string' ? data.refresh : null,
          userId: data.id,
        };
        return this.session;
      } catch (err) {
        // A login refused for a missing route: never "not found".
        if (err instanceof TaigaError && err.kind === ERROR_KINDS.NOT_FOUND) {
          throw new TaigaError(ERROR_KINDS.NOT_TAIGA, 'no /api/v1/auth', 404);
        }
        throw err;
      } finally {
        this.loggingIn = null;
      }
    })();
    return this.loggingIn;
  }

  /** A new access token from the refresh token, else a new login. */
  renew(session) {
    this.loggingIn ??= (async () => {
      try {
        if (session.refresh) {
          try {
            const data = await this.send('/auth/refresh', {
              method: 'POST',
              json: { refresh: session.refresh },
            });
            if (typeof data?.auth_token === 'string' && data.auth_token !== '') {
              this.session = {
                ...session,
                token: data.auth_token,
                refresh: typeof data.refresh === 'string' ? data.refresh : session.refresh,
              };
              return this.session;
            }
          } catch (err) {
            if (!(err instanceof TaigaError) || err.kind !== ERROR_KINDS.AUTH) {
              throw err;
            }
          }
        }
        this.session = null;
        return null;
      } finally {
        this.loggingIn = null;
      }
    })();
    return this.loggingIn.then((fresh) => fresh ?? this.login());
  }

  /** An authenticated call; an expired token is renewed, once. */
  async call(path, options = {}) {
    const session = this.session ?? (await this.login());
    const bearer = (token) => ({ authorization: `Bearer ${token}` });
    try {
      return await this.send(path, { ...options, headers: bearer(session.token) });
    } catch (err) {
      if (!(err instanceof TaigaError) || err.kind !== ERROR_KINDS.AUTH) {
        throw err;
      }
      const fresh =
        this.session !== session && this.session ? this.session : await this.renew(session);
      return this.send(path, { ...options, headers: bearer(fresh.token) });
    }
  }

  /** An array answer, else "not Taiga" (another JSON API). */
  async list(path) {
    const data = await this.call(path);
    if (!Array.isArray(data)) {
      throw new TaigaError(ERROR_KINDS.NOT_TAIGA, `no array in ${path.split('?')[0]}`, 200);
    }
    return data;
  }

  /** The projects the user is a member of. */
  async projects() {
    const { userId } = this.session ?? (await this.login());
    return this.list(`/projects?member=${encodeURIComponent(userId)}`);
  }

  /** The open user stories, tasks and issues, and the open sprints of a project. */
  async project(projectId, { issues = true } = {}) {
    const q = `project=${encodeURIComponent(projectId)}`;
    const userStories = await this.list(`/userstories?${q}&status__is_closed=false`);
    const tasks = await this.list(`/tasks?${q}&status__is_closed=false`);
    const issueList = issues ? await this.list(`/issues?${q}&status__is_closed=false`) : [];
    const milestones = await this.list(`/milestones?${q}&closed=false`);
    return { userStories, tasks, issues: issueList, milestones };
  }

  /** Create an issue or a user story; returns `{ id, ref }`. */
  async create(kind, { project, subject, description = '' }) {
    const path = kind === 'issue' ? '/issues' : '/userstories';
    const data = await this.call(path, {
      method: 'POST',
      json: { project, subject, description },
    });
    return { id: data?.id ?? null, ref: data?.ref ?? null };
  }
}
