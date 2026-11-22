// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Taiga instance (its address, and the username and password of one of
// its users), read on a timer of the container.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

export const DEFAULT_CONFIG = {
  url: '',
  username: '',
  password: '',
  projects: '',
  allow_self_signed: false,
  poll_interval: '300',
  language: 'fr',
};

// The cloud offer: its web app and its API live on two hosts.
const CLOUD_HOSTS = new Set(['taiga.io', 'www.taiga.io', 'tree.taiga.io', 'api.taiga.io']);
export const CLOUD = { web: 'https://tree.taiga.io', api: 'https://api.taiga.io/api/v1' };

/**
 * Parse the address typed by the user: a bare host or IP (`192.0.2.10:9000`),
 * or the URL copied from the browser
 * (`https://taiga.example.org/project/maison/backlog`). HTTP by default. A
 * path prefix is kept (Taiga behind a reverse proxy under `/taiga`), the API
 * path and the screens of the web app are dropped.
 * @param {unknown} raw
 * @returns {{ web: string, api: string }|null} the web app and its API (`…/api/v1`)
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  if (CLOUD_HOSTS.has(url.hostname.toLowerCase())) {
    return { ...CLOUD };
  }
  const path = url.pathname
    .replace(/\/api(\/.*)?$/, '')
    .replace(
      /\/(project|discover|login|register|profile|user-settings|notifications|projects)(\/.*)?$/,
      '',
    )
    .replace(/\/+$/, '');
  const web = `${url.origin}${path}`;
  return { web, api: `${web}/api/v1` };
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => String(url ?? '').replace(/^https?:\/\//, '');

/**
 * A list of names or ids, as typed, separated by commas or semicolons (the
 * projects to follow).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseNameList(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  return [
    ...new Set(
      raw
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const bool = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const poll = String(source.poll_interval ?? '');
  return {
    server: parseServerUrl(typed),
    urlTyped: typed !== '',
    // The password is kept as typed, blanks included.
    username: typeof source.username === 'string' ? source.username.trim() : '',
    password: typeof source.password === 'string' ? source.password : '',
    projects: parseNameList(source.projects),
    allowSelfSigned: bool(source.allow_self_signed),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
