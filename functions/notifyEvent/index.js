const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { logAudit } = require('./audit');

const app = express();
app.use(express.json());

// Section 3.5 event catalog -> subject line templates.
const EVENT_TEMPLATES = {
  TASK_ASSIGNMENT: 'New task assigned',
  TASK_REMINDER: 'Task reminder',
  TASK_COMPLETION: 'Task completed',
  INBOUND_ARRIVAL: 'Inbound cargo arrived',
  PENDING_VERIFICATION: 'Goods receipt pending verification',
  VAL_ASSIGNMENT: 'VAL task assigned',
  DISPATCH_READY: 'Cargo ready for dispatch',
  OPERATIONAL_EXCEPTION: 'Operational exception raised',
  GOODS_RECEIVED_CONFIRMATION: 'Goods received confirmation',
  GRN_ISSUED: 'Goods Receipt Note issued',
  VAL_COMPLETION: 'Value added service completed',
  CARGO_READY_FOR_DISPATCH: 'Your cargo is ready for dispatch',
  DISPATCH_CONFIRMATION: 'Dispatch confirmation',
  EXCEPTION_NOTIFICATION: 'Exception notification',
};

// POST body: { eventType, recipientEmail, recordId?, message?, module? }
// Sends the internal/customer email notifications listed in the WOMS spec (section 3.5).
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);

  try {
    const { eventType, recipientEmail, recordId, message, module } = req.body;
    if (!eventType || !recipientEmail) {
      return res.status(400).send({ error: 'eventType and recipientEmail are required' });
    }
    const subject = EVENT_TEMPLATES[eventType] || eventType;

    const email = catalystApp.email();
    await email.sendMail({
      from_email: process.env.WOMS_NOTIFY_FROM_EMAIL || 'no-reply@woms.example.com',
      to_email: [recipientEmail],
      subject,
      content: message || `${subject}${recordId ? ` (ref: ${recordId})` : ''}`,
    });

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType: 'NOTIFY_EVENT',
      module: module || 'Notifications',
      recordId: recordId || '',
      details: { eventType, recipientEmail },
    });

    return res.status(200).send({ eventType, recipientEmail, subject });
  } catch (err) {
    return res.status(500).send({ error: err.message || 'Failed to send notification' });
  }
});

module.exports = app;
