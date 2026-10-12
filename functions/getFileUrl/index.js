const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { BUCKETS } = require('./constants');

const app = express();
app.use(express.json());

const BUCKET_KEYS = { DOCUMENTS: BUCKETS.DOCUMENTS, CARGO_PHOTOS: BUCKETS.CARGO_PHOTOS };
const URL_LIFETIME_SECONDS = '3600';

// POST body: { fileId, bucketKey: 'DOCUMENTS'|'CARGO_PHOTOS' }
// Returns a short-lived signed link so the browser can show an uploaded
// photo/signature/PDF. The buckets stay private; only signed-in callers can
// ask for a link (the function itself requires authentication).
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req, { scope: 'admin' });
  try {
    const { fileId, bucketKey } = req.body || {};
    if (!fileId || (bucketKey && !BUCKET_KEYS[bucketKey])) {
      return res.status(400).send({ error: `fileId is required; bucketKey, if given, must be one of ${Object.keys(BUCKET_KEYS).join(', ')}` });
    }
    const stratus = catalystApp.stratus();
    // The Documents table doesn't record which bucket a file went to, so when
    // the caller doesn't know, look for the object in each bucket.
    const candidates = bucketKey ? [BUCKET_KEYS[bucketKey]] : Object.values(BUCKET_KEYS);
    let bucketName = null;
    for (const name of candidates) {
      const found = await stratus.bucket(name).headObject(fileId, { throwErr: false }).catch(() => null);
      if (found) {
        bucketName = name;
        break;
      }
    }
    if (!bucketName) bucketName = candidates[0];
    const signed = await stratus.bucket(bucketName).generatePreSignedUrl(fileId, 'GET', { expiryIn: URL_LIFETIME_SECONDS });
    if (!signed?.signature) throw new Error('No link was returned for this file.');
    return res.status(200).send({ url: signed.signature });
  } catch (err) {
    console.error(err.stack || err);
    return res.status(500).send({ error: err.message || 'Could not create a link for this file' });
  }
});

module.exports = app;
