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
  sdk().auth.signOut(redirectUrl);
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
