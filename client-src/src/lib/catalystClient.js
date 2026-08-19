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

export function getAllRows(tableName, maxRows = 200) {
  return table(tableName)
    .getPagedRows({ max_rows: maxRows })
    .then((res) => res.content || []);
}

export function zcql(query) {
  return sdk()
    .ZCatalystQL.executeQuery(query)
    .then((res) => res.content || []);
}

export function callFunction(functionName, args = {}, method = 'POST') {
  return sdk()
    .function.functionId(functionName)
    .execute({ method, args })
    .then((res) => res.json());
}
