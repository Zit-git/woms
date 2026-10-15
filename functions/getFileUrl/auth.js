const catalystSDK = require('zcatalyst-sdk-node');

// Who is really calling. Identity comes from the Catalyst session or token on the request,
// verified by Catalyst itself. Request headers such as x-catalyst-user-id can be written by
// anyone, so they are never used to decide who someone is.
async function currentUser(req) {
  try {
    const user = await catalystSDK.initialize(req).userManagement().getCurrentUser();
    return user && user.user_id ? user : null;
  } catch {
    return null;
  }
}

module.exports = { currentUser };
