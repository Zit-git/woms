const { TABLES } = require('./constants');
const { formatDatetime } = require('./datetime');

async function logAudit(catalystApp, { userId, actionType, module, recordId, details }) {
  const datastore = catalystApp.datastore();
  const table = datastore.table(TABLES.AUDIT_LOG);
  await table.insertRow({
    user_id: userId || '',
    action_type: actionType,
    module,
    record_id: recordId || '',
    details: details ? JSON.stringify(details) : '',
    event_timestamp: formatDatetime(),
  });
}

module.exports = { logAudit };
