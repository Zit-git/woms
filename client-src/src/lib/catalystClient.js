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
function withDeadline(promise, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `The server did not respond while ${label}. Check your connection, then reload; if it keeps happening, sign out and back in.`
          )
        ),
      DATA_TIMEOUT_MS
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export function table(tableName) {
  return sdk().table.tableId(tableName);
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
  return table(tableName)
    .addRow([row])
    .then((res) => {
      invalidateTable(tableName);
      return res.content[0];
    });
}

export function updateRow(tableName, rowWithId) {
  return table(tableName)
    .updateRow([rowWithId])
    .then((res) => {
      invalidateTable(tableName);
      return res.content[0];
    });
}

export function deleteRow(tableName, rowId) {
  return table(tableName)
    .rowId(rowId)
    .delete()
    .then((res) => {
      invalidateTable(tableName);
      return res;
    });
}

export function getAllRows(tableName, maxRows = 200) {
  const load = () =>
    table(tableName)
      .getPagedRows({ max_rows: maxRows })
      .then((res) => res.content || []);
  if (!CACHED_TABLES.has(tableName)) return load();
  // Callers get their own array so sorting/filtering it can't corrupt the cache.
  return cachedFetch(`rows:${tableName}:${maxRows}`, [tableName], load).then((rows) => rows.slice());
}

export function zcql(query) {
  return withDeadline(
    sdk()
      .ZCatalystQL.executeQuery(query)
      .then((res) => {
        // The SDK resolves (rather than rejects) on a rejected query, handing
        // back an empty object; surface the real reason instead of {}.
        if (res.status && res.status !== 200) {
          throw new Error(res.message || `Query failed (${res.status})`);
        }
        return res.content || [];
      }),
    'loading data'
  );
}

// This project's function domain -- stable per Catalyst project/environment,
// confirmed against this project's actual deployed function invoke_urls.
const FUNCTIONS_BASE_URL = 'https://woms-775318997.development.catalystserverless.com';

// If the SDK cannot obtain its auth token it fails *outside* the promise
// chain we hold, so without a deadline a call could hang the screen forever.
const FUNCTION_TIMEOUT_MS = 12000;

export function callFunction(functionName, args = {}, method = 'POST') {
  // The SDK's own function.execute() never attaches a valid auth header for
  // an authenticated function (401 even same-origin on localhost, not just
  // cross-domain on Slate) -- Catalyst's documented fix is generateAuthToken()
  // plus a manual fetch carrying that token, bypassing execute() entirely.
  const call = sdk()
    .auth.generateAuthToken()
    .then(({ access_token }) =>
      fetch(`${FUNCTIONS_BASE_URL}/server/${functionName}/`, {
        method,
        headers: { Authorization: access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
    )
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message = body?.error || `The server returned an error (${res.status}).`;
        throw Object.assign(new Error(message), { error: message });
      }
      return body;
    });

  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const message = 'The server did not respond (the sign-in token could not be obtained). Try again, or sign out and back in.';
      reject(Object.assign(new Error(message), { error: message }));
    }, FUNCTION_TIMEOUT_MS);
  });
  return Promise.race([call, deadline]).finally(() => clearTimeout(timer));
}
