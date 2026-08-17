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

export function signOut(redirectUrl) {
  // auth.signOut() itself only ever fires a real logout round-trip to
  // accounts.zoho.com in one of its internal branches -- in the branch this
  // project actually hits, it just deletes a cookie client-side (which
  // silently no-ops if the path/domain don't match how it was set) and
  // redirects straight back without ever invalidating the server session,
  // so the SSO session survives and the embedded sign-in widget silently
  // re-authenticates on reload. auth.signOutUrl() computes the same
  // accounts-domain logout URL the SDK uses internally (correct domain/
  // region, no guessing) without navigating, so we can force the real
  // top-level navigation to it ourselves.
  return sdk()
    .auth.signOutUrl(redirectUrl)
    .then((res) => {
      const url = res?.content?.signout_url || res?.content?.data?.signout_url;
      window.location.href = url || redirectUrl;
    })
    .catch(() => {
      window.location.href = redirectUrl;
    });
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
