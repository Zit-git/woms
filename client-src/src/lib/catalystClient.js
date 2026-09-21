// Thin wrapper around the Catalyst Web SDK (loaded globally via <script> tags
// in index.html -- there is no npm package for it, see index.html).

function sdk() {
  if (!window.catalyst) {
    throw new Error('Catalyst Web SDK has not loaded yet');
  }
  return window.catalyst;
}

export function getCurrentUser() {
  return sdk()
    .userManagement.getCurrentProjectUser()
    .then((res) => res.content)
    .catch(() => null);
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
  // Every previous approach here (forcing auth.signOut()'s own redirect,
  // then switching to auth.signOutUrl()'s computed accounts-domain logout
  // URL) still left the SSO session alive, for reasons that stayed
  // unresolved after real investigation into the SDK's source. Rather than
  // keep guessing at Zoho's session internals, this wipes everything
  // client-side can reach and forces a hard navigation -- deterministic
  // regardless of what's actually causing the SDK-level behavior.
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
  try {
    sdk().auth.signOut(redirectUrl);
  } catch {
    // ignore -- the wipe + redirect below is what actually guarantees sign-out
  }

  const separator = redirectUrl.includes('?') ? '&' : '?';
  window.location.href = `${redirectUrl}${separator}loggedout=${Date.now()}`;
}

export function table(tableName) {
  return sdk().table.tableId(tableName);
}

export function addRow(tableName, row) {
  return table(tableName)
    .addRow([row])
    .then((res) => res.content[0]);
}

export function updateRow(tableName, rowWithId) {
  return table(tableName)
    .updateRow([rowWithId])
    .then((res) => res.content[0]);
}

export function deleteRow(tableName, rowId) {
  return table(tableName)
    .rowId(rowId)
    .delete();
}

// The API rejects max_rows above 300 (with a 400 the SDK still resolves), so
// cap it and surface any failure instead of returning an empty result.
export function getAllRows(tableName, maxRows = 200) {
  return table(tableName)
    .getPagedRows({ max_rows: Math.min(maxRows, 300) })
    .then((res) => {
      if (res.status && res.status !== 200) {
        throw new Error(res.message || `Could not load ${tableName} (${res.status})`);
      }
      return res.content || [];
    });
}

export function zcql(query) {
  return sdk()
    .ZCatalystQL.executeQuery(query)
    .then((res) => {
      // The SDK resolves (rather than rejects) on a rejected query, handing
      // back an empty object; surface the real reason instead of {}.
      if (res.status && res.status !== 200) {
        throw new Error(res.message || `Query failed (${res.status})`);
      }
      return res.content || [];
    });
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
