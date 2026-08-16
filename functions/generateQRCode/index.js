const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const QRCode = require('qrcode');
const { TABLES, BUCKETS } = require('./constants');
const { logAudit } = require('./audit');

const app = express();
app.use(express.json());

// POST body: { cargoId: string }
// Generates a QR payload for a Cargo row, renders it to a PNG, stores the
// PNG in the woms-qr-labels bucket, and writes the code back onto Cargo.qr_code.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);
  const datastore = catalystApp.datastore();
  const cargoTable = datastore.table(TABLES.CARGO);

  try {
    const { cargoId } = req.body;
    if (!cargoId) {
      return res.status(400).send({ error: 'cargoId is required' });
    }

    const cargoRow = await cargoTable.getRow(cargoId).catch(() => null);
    if (!cargoRow) {
      return res.status(404).send({ error: `Cargo ${cargoId} not found` });
    }

    const qrPayload = `WOMS-CARGO-${cargoId}`;
    const pngBuffer = await QRCode.toBuffer(qrPayload, { type: 'png', width: 400 });

    const bucket = catalystApp.stratus().bucket(BUCKETS.QR_LABELS);
    const fileName = `cargo-${cargoId}.png`;
    await bucket.putObject(fileName, pngBuffer, { overwrite: true, contentType: 'image/png' });

    await cargoTable.updateRow({ ROWID: cargoId, qr_code: qrPayload });

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType: 'GENERATE_QR_CODE',
      module: 'QR Code & Label Management',
      recordId: cargoId,
      details: { qrPayload, fileName },
    });

    return res.status(200).send({
      cargoId,
      qrPayload,
      fileName,
      bucket: BUCKETS.QR_LABELS,
    });
  } catch (err) {
    console.error(err.stack || err);
    return res.status(500).send({ error: err.message || 'Failed to generate QR code' });
  }
});

module.exports = app;
