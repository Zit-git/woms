// Thin wrapper around the Catalyst Web SDK (loaded globally via <script> tags
// in index.html -- there is no npm package for it, see index.html).

function sdk() {
  if (!window.catalyst) {
    throw new Error('Catalyst Web SDK has not loaded yet');
  }
  return window.catalyst;
}

// Why the sign-in loops is invisible if the reason is thrown away, and the page
// reloads before anyone can read a message -- so the reason is kept in
// sessionStorage, which survives the reloads, and shown on the login screen.
const AUTH_ISSUE_KEY = 'woms.authIssue';
export function recordAuthIssue(message) {
  try {
    sessionStorage.setItem(AUTH_ISSUE_KEY, `${new Date().toLocaleTimeString()}: ${message}`);
  } catch {
    // the message just won't survive a reload
  }
}
export function readAuthIssue() {
  try {
    return sessionStorage.getItem(AUTH_ISSUE_KEY) || '';
  } catch {
    return '';
  }
}
export function clearAuthIssue() {
  try {
    sessionStorage.removeItem(AUTH_ISSUE_KEY);
  } catch {
    // nothing to clear
  }
}

export function getCurrentUser() {
  try {
    return sdk()
      .userManagement.getCurrentProjectUser()
      .then((res) => {
        if (res?.content?.email_id) return res.content;
        recordAuthIssue(`Catalyst returned no signed-in user (response: ${JSON.stringify(res)?.slice(0, 200)})`);
        return null;
      })
      .catch((err) => {
        recordAuthIssue(`Checking the signed-in user failed: ${err?.message || err?.error || JSON.stringify(err)}`);
        return null;
      });
  } catch (err) {
    recordAuthIssue(err.message);
    return Promise.resolve(null);
  }
}

// Catalyst's own docs are explicit that Slate (root-served) auth redirects
// must be the bare origin with no filename -- "https://app.onslate.com/",
// not ".../index.html". The legacy Web Client build is served under /app/
// and the same docs want the explicit "/app/index.html" there. Getting this
// wrong (e.g. appending index.html on Slate) is enough to make Zoho's
// accounts service fall back to broken internal defaults instead of
// honoring the URL passed in.
const IS_LEGACY_WEBCLIENT = import.meta.env.BASE_URL === '/app/';
export function authRedirectUrl() {
  return window.location.origin + (IS_LEGACY_WEBCLIENT ? `${import.meta.env.BASE_URL}index.html` : '/');
}

// The Web SDK's embedded sign-in only forwards a *path* as service_url -- any
// full web address is silently dropped, and Catalyst then falls back to the
// legacy /app/index.html (a 404 on Slate). So the in-app form gets this path
// rather than authRedirectUrl().
export function authReturnPath() {
  return IS_LEGACY_WEBCLIENT ? `${import.meta.env.BASE_URL}index.html` : '/';
}

export function embedSignIn(elementId, serviceUrl) {
  sdk().auth.signIn(elementId, { service_url: serviceUrl });
}

// Wipes every cookie readable from JS, across every path segment of the
// current URL and both with/without a leading dot on the hostname (the two
// variations that account for the vast majority of how a cookie could have
// been set). This can't touch HttpOnly cookies -- nothing client-side can --
// but combined with clearing storage and forcing a fresh navigation, it's
// the most a browser script can do to guarantee no stale client state
// survives a sign-out click.
function wipeAllCookies() {
  const cookies = document.cookie.split(';');
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const paths = ['/'];
  let acc = '';
  for (const part of pathParts) {
    acc += `/${part}`;
    paths.push(acc);
  }
  const hosts = [window.location.hostname, `.${window.location.hostname}`];

  cookies.forEach((c) => {
    const name = c.split('=')[0].trim();
    if (!name) return;
    paths.forEach((path) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
      hosts.forEach((host) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${host}`;
      });
    });
  });
}

export function signOut(redirectUrl) {
  // The local wipe still runs first and synchronously -- cheap, harmless,
  // and immediately clears anything client-readable regardless of auth
  // type. What comes after differs from earlier versions of this function:
  // those were tuned for Embedded Authentication, where the wipe above was
  // *enough* on its own to make this app treat the browser as signed out,
  // so redirecting immediately (never waiting on auth.signOut() itself) was
  // correct there. Under Hosted Authentication the session lives entirely
  // server-side -- there is no equivalent local fallback -- so the actual
  // sdk().auth.signOut(redirectUrl) call completing is what matters, and it
  // is documented to handle its own navigation to redirectUrl once done.
  try {
    wipeAllCookies();
  } catch {
    // best-effort; still proceed to storage clear + redirect below
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }

  const separator = redirectUrl.includes('?') ? '&' : '?';
  const fallbackRedirect = () => {
    window.location.href = `${redirectUrl}${separator}loggedout=${Date.now()}`;
  };

  try {
    sdk().auth.signOut(redirectUrl);
  } catch {
    // The SDK call itself failed to even start (e.g. not loaded yet) --
    // nothing to wait for, redirect now.
    fallbackRedirect();
    return;
  }

  // Give the SDK's own redirect a few seconds to happen; if the page is
  // still here after that, something went wrong server-side and the user
  // must not be stranded on the current page -- force it manually.
  setTimeout(fallbackRedirect, 3000);
}

// The SDK can leave a request pending forever (stale session, token it can't
// refresh). A screen waiting on it would sit on "Saving..." / "Loading..."
// for good, so every data call gets a deadline and fails with a readable
// message instead.
const DATA_TIMEOUT_MS = 25000;
function withDeadline(promise, label, detail = '') {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => {
        console.warn(`[woms] no reply within ${DATA_TIMEOUT_MS / 1000}s while ${label}`, detail);
        reject(
          new Error(
            `The server did not respond while ${label}. Check your connection, then reload; if it keeps happening, sign out and back in.`
          )
        );
      },
      DATA_TIMEOUT_MS
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// -- Direct access to the data service -----------------------------------------------------------------
// The Web SDK is used only for signing in and out. Its data calls are not used: after the SDK has been asked for
// a function token (uploads, photos, signatures on the Slate address), it silently stops sending any request at
// all, so every later save "did not respond". The data service is an ordinary web address on the same site as the
// page (on both the /app/ address and Slate), so the app calls it directly with the session it already has.
const FALLBACK_CONFIG = { project: '11648000001127001', zaid: '10131718057', authDomain: 'https://accounts.zohoportal.com' };
let configPromise;
// Project, ZAID and sign-in domain differ per environment: read them from the SDK's own init script.
function projectConfig() {
  if (!configPromise) {
    configPromise = fetch('/__catalyst/sdk/init.js')
      .then((r) => r.text())
      .then((t) => ({
        project: /project_Id\s*:\s*"(\d+)"/.exec(t)?.[1] || FALLBACK_CONFIG.project,
        zaid: /zaid\s*:\s*"(\d+)"/.exec(t)?.[1] || FALLBACK_CONFIG.zaid,
        authDomain: /auth_domain\s*:\s*"([^"]+)"/.exec(t)?.[1] || FALLBACK_CONFIG.authDomain,
      }))
      .catch(() => FALLBACK_CONFIG);
  }
  return configPromise;
}

function csrfHeaders() {
  try {
    const m = /(?:^|;\s*)ZD_CSRF_TOKEN=([^;]+)/.exec(document.cookie);
    return m ? { 'X-ZCSRF-TOKEN': `zd_csrparam=${m[1]}` } : {};
  } catch {
    return {};
  }
}

// Row ids are 17 digits and the service sometimes sends one as a bare number (after an insert). A browser reads that
// as a float and silently changes the last digits, so ids are turned into text before the reply is parsed.
// Only keys named ROWID or *_id are touched, so text inside a value can never be changed.
export function parseReply(text) {
  const safe = String(text).replace(/("(?:ROWID|[A-Za-z0-9_]+_id)"\s*:\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
  try {
    return JSON.parse(safe);
  } catch {
    return null;
  }
}

async function baas(method, path, body) {
  const { project } = await projectConfig();
  const res = await fetch(`/baas/v1/project/${project}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = parseReply(await res.text());
  if (!res.ok || json?.status === 'failure') {
    const message = json?.data?.message || (res.status === 401 || res.status === 403 ? 'Your session has ended. Please sign in again.' : `The server returned an error (${res.status}).`);
    throw Object.assign(new Error(message), { status: res.status });
  }
  return json;
}

// -- Read cache ---------------------------------------------------------
// Every Catalyst round trip costs roughly 0.8 s from where this is used, so
// reference data that rarely changes (customers, warehouses, locations...) is
// kept in memory and reused across pages. Writes through addRow/updateRow/
// deleteRow drop the affected entries, so the user's own edits show up at once;
// the short TTL bounds how stale another user's edit can look.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { at, tables, promise }
const CACHED_TABLES = new Set(['Customers', 'Transporters', 'Suppliers', 'Warehouses', 'PackageTypes', 'RolePermissions']);

export function cachedFetch(key, tables, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = loader();
  const entry = { at: Date.now(), tables, promise };
  cache.set(key, entry);
  // A failed load must not be remembered.
  promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

export function invalidateTable(tableName) {
  for (const [key, entry] of cache) {
    if (entry.tables.includes(tableName)) cache.delete(key);
  }
}

export function addRow(tableName, row) {
  return withDeadline(
    baas('POST', `/table/${tableName}/row`, [row]).then((json) => {
      invalidateTable(tableName);
      return json.data[0];
    }),
    `saving to ${tableName}`
  );
}

export function updateRow(tableName, rowWithId) {
  return withDeadline(
    baas('PUT', `/table/${tableName}/row`, [rowWithId]).then((json) => {
      invalidateTable(tableName);
      return json.data[0];
    }),
    `updating ${tableName}`
  );
}

export function deleteRow(tableName, rowId) {
  const id = String(rowId).replace(/\D/g, '');
  return withDeadline(
    baas('DELETE', `/table/${tableName}/row?ids=${id}`).then((json) => {
      invalidateTable(tableName);
      return json;
    }),
    `deleting from ${tableName}`
  );
}

// The API rejects max_rows above 300 -- and the SDK still *resolves*, handing back an
// error object instead of rows -- so the size is capped here and a bad response is
// turned into a readable error instead of crashing whatever called this (it broke
// sign-in: the role list asks for 500).
export function getAllRows(tableName, maxRows = 200) {
  const load = () =>
    withDeadline(
      baas('GET', `/table/${tableName}/row?max_rows=${Math.min(maxRows, 300)}`).then((json) => (Array.isArray(json?.data) ? json.data : [])),
      `loading ${tableName}`
    );
  if (!CACHED_TABLES.has(tableName)) return shareWhileInFlight(`rows:${tableName}:${maxRows}`, load);
  // Callers get their own array so sorting/filtering it can't corrupt the cache.
  return cachedFetch(`rows:${tableName}:${maxRows}`, [tableName], load).then((rows) => rows.slice());
}

// Several components often ask for the very same thing at the same moment (the Receive popup asks
// for the inbound's documents four times). The Catalyst client leaves some of such simultaneous
// identical requests unanswered, so identical in-flight queries share one request instead.
const inFlight = new Map();
function shareWhileInFlight(key, start) {
  if (inFlight.has(key)) return inFlight.get(key).then((rows) => rows.slice());
  const promise = start();
  inFlight.set(key, promise);
  const done = () => inFlight.delete(key);
  promise.then(done, done);
  return promise.then((rows) => rows.slice());
}

export function zcql(query) {
  return shareWhileInFlight(`q:${query}`, () => zcqlOnce(query));
}

// One ZCQL statement can return at most 300 rows; anything beyond is silently left out (a list of 384
// inbounds showed "300 of 300"). So a query without its own LIMIT is fetched page by page until a page
// comes back short. The offset in "LIMIT offset, count" starts at 1.
const ZCQL_PAGE = 300;
const ZCQL_MAX_PAGES = 60; // 18,000 rows: beyond this a screen should filter, not load everything
function zcqlPage(query) {
  return withDeadline(
    baas('POST', '/query', { query }).then((json) => (Array.isArray(json.data) ? json.data : [])),
    'loading data',
    query.slice(0, 160)
  );
}

async function zcqlOnce(query) {
  if (/\blimit\b/i.test(query)) return zcqlPage(query);
  const first = await zcqlPage(`${query} LIMIT 1, ${ZCQL_PAGE}`);
  if (first.length < ZCQL_PAGE) return first;
  const all = [...first];
  for (let page = 1; page < ZCQL_MAX_PAGES; page++) {
    const rows = await zcqlPage(`${query} LIMIT ${page * ZCQL_PAGE + 1}, ${ZCQL_PAGE}`);
    all.push(...rows);
    if (rows.length < ZCQL_PAGE) return all;
  }
  console.warn(`[woms] query returned more than ${ZCQL_MAX_PAGES * ZCQL_PAGE} rows; the rest was left out: ${query.slice(0, 120)}`);
  return all;
}

// This project's function domain -- stable per Catalyst project/environment,
// confirmed against this project's actual deployed function invoke_urls.
const FUNCTIONS_BASE_URL = 'https://woms-775318997.development.catalystserverless.com';

// If the SDK cannot obtain its auth token it fails *outside* the promise
// chain we hold, so without a deadline a call could hang the screen forever.
const FUNCTION_TIMEOUT_MS = 12000;

// Functions are called with the session cookie on this site's own address when it serves /server/... (the
// legacy /app/ host does). Slate does not, so there the call crosses to the Catalyst domain with a token
// (see functionAuthHeader). The SDK's own token call is never used: it breaks every later SDK request.
// Tests can force the token route on the /app/ address (window.__WOMS_FORCE_TOKEN_ROUTE) to exercise what Slate does.
let functionsServedHere =
  typeof window !== 'undefined' && window.__WOMS_FORCE_TOKEN_ROUTE ? false : typeof window !== 'undefined' && window.location.origin === FUNCTIONS_BASE_URL ? true : null; // null = not known yet

// The token that lets this page call a function on another address (Slate). Asked for in the same two steps the
// SDK takes (a signed token from the project, exchanged with the sign-in service), but without the SDK, which
// stops answering afterwards. Kept until shortly before it expires, so repeated uploads do not ask again.
let tokenCache = null; // { header, until }
let tokenInFlight = null;
function functionAuthHeader() {
  if (tokenCache && Date.now() < tokenCache.until) return Promise.resolve(tokenCache.header);
  if (!tokenInFlight) {
    tokenInFlight = (async () => {
      const [{ zaid, authDomain }, signed] = await Promise.all([projectConfig(), baas('GET', '/authentication/custom-token?feature=functions')]);
      const { client_id, jwt_token, scopes } = signed.data || {};
      if (!jwt_token) throw new Error('The server did not give permission to upload. Sign out and back in.');
      const query = new URLSearchParams({ response_type: 'remote_token', scope: scopes, client_id, jwt_token });
      const res = await fetch(`${authDomain}/clientoauth/v2/${zaid}/remote/auth?${query}`, { method: 'POST' });
      const out = await res.json().catch(() => ({}));
      const token = out.access_token || out.access_toke;
      if (!token) throw new Error('The server did not give permission to upload. Sign out and back in.');
      const seconds = Number(out.expires_in_sec) || 600;
      tokenCache = { header: `Zoho-oauthtoken ${token}`, until: Date.now() + Math.max(30, seconds - 60) * 1000 };
      return tokenCache.header;
    })().finally(() => {
      tokenInFlight = null;
    });
  }
  return tokenInFlight;
}

async function readResult(res) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error || `The server returned an error (${res.status}).`;
    throw Object.assign(new Error(message), { error: message });
  }
  return body;
}

export function callFunction(functionName, args = {}, method = 'POST') {
  const call = (async () => {
    if (functionsServedHere !== false) {
      const res = await fetch(`/server/${functionName}/`, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const json = (res.headers.get('content-type') || '').includes('json');
      if (json && res.status !== 405) {
        functionsServedHere = true;
        return readResult(res);
      }
      functionsServedHere = false; // this site does not serve functions: use the token route below
    }
    const res = await fetch(`${FUNCTIONS_BASE_URL}/server/${functionName}/`, {
      method,
      credentials: 'omit', // from another address the session cookie is not sent: the token is what identifies the user
      headers: { Authorization: await functionAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return readResult(res);
  })();

  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const message = 'The server did not respond. Try again, or sign out and back in.';
      reject(Object.assign(new Error(message), { error: message }));
    }, FUNCTION_TIMEOUT_MS);
  });
  return Promise.race([call, deadline]).finally(() => clearTimeout(timer));
}
