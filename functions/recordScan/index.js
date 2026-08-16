const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { TABLES, SCAN_CONTEXTS } = require('./constants');
const { logAudit } = require('./audit');
const { formatDatetime } = require('./datetime');

const app = express();
app.use(express.json());

const CONTEXT_TO_CARGO_STATUS = {
  receiving: 'Received',
  storage: 'Stored',
  relocation: 'Stored',
  val: 'In VAL',
  dispatch: 'Dispatched',
};

// POST body: { cargoId, scannedBy, scanContext, locationId? }
// Logs a scan event and, where applicable, updates Cargo.status / current_location_id.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);
  const datastore = catalystApp.datastore();

  try {
    const { cargoId, scannedBy, scanContext, locationId } = req.body;
    if (!cargoId || !scanContext) {
      return res.status(400).send({ error: 'cargoId and scanContext are required' });
    }
    if (!SCAN_CONTEXTS.includes(scanContext)) {
      return res.status(400).send({ error: `scanContext must be one of ${SCAN_CONTEXTS.join(', ')}` });
    }

    const scanTable = datastore.table(TABLES.SCAN_HISTORY);
    await scanTable.insertRow({
      cargo_id: cargoId,
      scanned_by: scannedBy || '',
      scan_context: scanContext,
      scan_timestamp: formatDatetime(),
    });

    const cargoTable = datastore.table(TABLES.CARGO);
    const cargoUpdate = { ROWID: cargoId };
    const newStatus = CONTEXT_TO_CARGO_STATUS[scanContext];
    if (newStatus) cargoUpdate.status = newStatus;
    if (locationId && (scanContext === 'storage' || scanContext === 'relocation')) {
      cargoUpdate.current_location_id = locationId;
    }
    if (Object.keys(cargoUpdate).length > 1) {
      await cargoTable.updateRow(cargoUpdate);
    }

    if (locationId && (scanContext === 'storage' || scanContext === 'relocation')) {
      const movementTable = datastore.table(TABLES.CARGO_MOVEMENT_LOG);
      await movementTable.insertRow({
        cargo_id: cargoId,
        to_location_id: locationId,
        moved_by: scannedBy || '',
        movement_type: scanContext === 'storage' ? 'putaway' : 'relocation',
        movement_timestamp: formatDatetime(),
      });
    }

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType: 'RECORD_SCAN',
      module: 'QR Code & Label Management',
      recordId: cargoId,
      details: { scanContext, locationId },
    });

    return res.status(200).send({ cargoId, scanContext, status: newStatus || null });
  } catch (err) {
    return res.status(500).send({ error: err.message || 'Failed to record scan' });
  }
});

module.exports = app;
