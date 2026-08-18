const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { TABLES, BUCKETS } = require('./constants');
const { logAudit } = require('./audit');
const { formatDatetime } = require('./datetime');

const app = express();
// Base64-encoded photos/documents inflate ~33% over binary size; 15mb keeps
// reasonable warehouse photos/scans well within range.
app.use(express.json({ limit: '15mb' }));

const BUCKET_KEYS = { DOCUMENTS: BUCKETS.DOCUMENTS, CARGO_PHOTOS: BUCKETS.CARGO_PHOTOS };

// POST body: { fileBase64, fileName, bucketKey: 'DOCUMENTS'|'CARGO_PHOTOS',
//   docType, linkedModule, linkedRecordId, uploadedBy }
// Uploads a document/photo to the right Stratus bucket and records it in
// the Documents table against whatever module/record it belongs to.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);

  try {
    const { fileBase64, fileName, bucketKey, docType, linkedModule, linkedRecordId, uploadedBy } = req.body;
    if (!fileBase64 || !fileName || !bucketKey || !linkedModule || !linkedRecordId) {
      return res
        .status(400)
        .send({ error: 'fileBase64, fileName, bucketKey, linkedModule and linkedRecordId are required' });
    }
    const bucketName = BUCKET_KEYS[bucketKey];
    if (!bucketName) {
      return res.status(400).send({ error: `bucketKey must be one of ${Object.keys(BUCKET_KEYS).join(', ')}` });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const bucket = catalystApp.stratus().bucket(bucketName);
    const safeFileName = `${linkedModule.replace(/\s+/g, '')}-${linkedRecordId}-${Date.now()}-${fileName}`;
    // A plain putObject() resolves to just `true` on success -- Stratus
    // objects are addressed by their key, not a separate returned id, so
    // the key we chose IS the identifier to store.
    await bucket.putObject(safeFileName, buffer, { overwrite: true });

    const datastore = catalystApp.datastore();
    const documentRow = await datastore.table(TABLES.DOCUMENTS).insertRow({
      linked_module: linkedModule,
      linked_record_id: String(linkedRecordId),
      doc_type: docType || 'Operational Attachment',
      file_id: safeFileName,
      uploaded_by: uploadedBy || '',
      uploaded_date: formatDatetime(),
    });

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType: 'UPLOAD_DOCUMENT',
      module: linkedModule,
      recordId: String(linkedRecordId),
      details: { fileName: safeFileName, bucket: bucketName, docType },
    });

    return res.status(200).send({
      fileName: safeFileName,
      bucket: bucketName,
      documentId: documentRow.ROWID || documentRow.data?.ROWID,
    });
  } catch (err) {
    console.error(err.stack || err);
    return res.status(500).send({ error: err.message || 'Failed to upload file' });
  }
});

module.exports = app;
