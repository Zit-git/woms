const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { logAudit } = require('./audit');

const app = express();
app.use(express.json());

// POST body: { actionType, module, recordId?, details? }
// Thin HTTP wrapper around the shared logAudit() helper, for callers outside
// this function set (e.g. a future web client) that need to write an audit
// entry without going through one of the other functions.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);

  try {
    const { actionType, module, recordId, details } = req.body;
    if (!actionType || !module) {
      return res.status(400).send({ error: 'actionType and module are required' });
    }

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType,
      module,
      recordId,
      details,
    });

    return res.status(200).send({ status: 'logged' });
  } catch (err) {
    return res.status(500).send({ error: err.message || 'Failed to log audit entry' });
  }
});

module.exports = app;
