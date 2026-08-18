const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { TABLES } = require('./constants');
const { logAudit } = require('./audit');

const app = express();
app.use(express.json());

const BUSINESS_ROLES = ['System Administrator', 'Warehouse Manager', 'Warehouse Supervisor', 'Warehouse Operator'];

// Native Catalyst roles only gate console/API access; fine-grained module
// access is governed separately by RolePermissions. Only System
// Administrators get the elevated native role.
const CATALYST_ROLE_ID = {
  'System Administrator': '11648000001127006', // App Administrator
  default: '11648000001127007', // App User
};

// POST body: { firstName, lastName, email, businessRole, redirectUrl, warehouseId? }
// Invites a new Catalyst project user and creates the matching AppUsers row
// that drives business-role-based UI gating.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);

  try {
    const { firstName, lastName, email, businessRole, redirectUrl, warehouseId } = req.body;
    if (!firstName || !email || !businessRole || !redirectUrl) {
      return res.status(400).send({ error: 'firstName, email, businessRole and redirectUrl are required' });
    }
    if (!BUSINESS_ROLES.includes(businessRole)) {
      return res.status(400).send({ error: `businessRole must be one of ${BUSINESS_ROLES.join(', ')}` });
    }

    const roleId = CATALYST_ROLE_ID[businessRole] || CATALYST_ROLE_ID.default;
    const userManagement = catalystApp.userManagement();

    const registered = await userManagement.registerUser(
      { platform_type: 'web', redirect_url: redirectUrl },
      { first_name: firstName, last_name: lastName || '', email_id: email, role_id: roleId }
    );

    const catalystUserId = registered.user_details.user_id;

    const datastore = catalystApp.datastore();
    await datastore.table(TABLES.APP_USERS).insertRow({
      catalyst_user_id: String(catalystUserId),
      email,
      business_role: businessRole,
      warehouse_id: warehouseId || undefined,
      user_status: 'Active',
    });

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType: 'INVITE_USER',
      module: 'System Administration',
      recordId: String(catalystUserId),
      details: { email, businessRole },
    });

    return res.status(200).send({ email, businessRole, catalystUserId });
  } catch (err) {
    console.error(err.stack || err);
    return res.status(500).send({ error: err.message || 'Failed to invite user' });
  }
});

module.exports = app;
