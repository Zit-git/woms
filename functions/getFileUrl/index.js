const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const { BUCKETS } = require('./constants');

const app = express();
app.use(express.json());

const BUCKET_KEYS = { DOCUMENTS: BUCKETS.DOCUMENTS, CARGO_PHOTOS: BUCKETS.CARGO_PHOTOS };
const URL_LIFETIME_SECONDS = '3600';
// Files up to this size are returned inline (base64) so they display without
// depending on a signed link; larger ones fall back to a signed link.
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain',
};
const contentTypeFor = (name) => CONTENT_TYPES[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

async function readAll(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > INLINE_LIMIT_BYTES) return null; // too big to send inline
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// POST body: { fileId, bucketKey?: 'DOCUMENTS'|'CARGO_PHOTOS' }
// Returns { contentType, base64 } for a file the browser can show, or
// { url } (a short-lived signed link) for large files. The buckets stay
// private; only signed-in callers can call this function. The Documents table
// doesn't record which bucket a file went to, so unless told, each bucket is tried.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req, { scope: 'admin' });
  try {
    const { fileId, bucketKey } = req.body || {};
    if (!fileId || (bucketKey && !BUCKET_KEYS[bucketKey])) {
      return res.status(400).send({ error: `fileId is required; bucketKey, if given, must be one of ${Object.keys(BUCKET_KEYS).join(', ')}` });
    }
    const stratus = catalystApp.stratus();
    const names = bucketKey ? [BUCKET_KEYS[bucketKey]] : Object.values(BUCKET_KEYS);
    // Try the named bucket first, then the other one, in case it was uploaded elsewhere.
    const candidates = bucketKey ? [...names, ...Object.values(BUCKET_KEYS).filter((n) => !names.includes(n))] : names;

    let lastError = null;
    for (const name of candidates) {
      try {
        const bucket = stratus.bucket(name);
        const body = await readAll(await bucket.getObject(fileId));
        if (body === null) {
          const signed = await bucket.generatePreSignedUrl(fileId, 'GET', { expiryIn: URL_LIFETIME_SECONDS });
          return res.status(200).send({ url: signed.signature, contentType: contentTypeFor(fileId) });
        }
        return res.status(200).send({ contentType: contentTypeFor(fileId), base64: body.toString('base64') });
      } catch (err) {
        lastError = err;
      }
    }
    console.error('getFileUrl: not found in any bucket', fileId, lastError && (lastError.stack || lastError));
    return res.status(404).send({ error: 'The file could not be found in storage.' });
  } catch (err) {
    console.error(err.stack || err);
    return res.status(500).send({ error: err.message || 'Could not load this file' });
  }
});

module.exports = app;
