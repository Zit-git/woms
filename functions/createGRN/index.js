const catalystSDK = require('zcatalyst-sdk-node');
const express = require('express');
const PDFDocument = require('pdfkit');
const { TABLES, BUCKETS } = require('./constants');
const { logAudit } = require('./audit');
const { formatDatetime } = require('./datetime');

const app = express();
app.use(express.json());

function renderGrnPdf({ grnNumber, inboundAdvice, cargoRows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Goods Receipt Note', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`GRN Number: ${grnNumber}`);
    doc.text(`Inbound Advice: ${inboundAdvice.ROWID}`);
    doc.text(`Customer ID: ${inboundAdvice.customer_id}`);
    doc.text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fontSize(13).text('Cargo Received', { underline: true });
    doc.moveDown(0.5);
    cargoRows.forEach((c) => {
      doc.fontSize(10).text(
        `#${c.ROWID}  ${c.description || ''}  qty=${c.qty || ''} ${c.unit || ''}  status=${c.status}`
      );
    });
    doc.end();
  });
}

// POST body: { inboundAdviceId: string, verifiedBy?: string }
// Generates a GRN row + PDF from all Cargo rows tied to an InboundAdvice.
app.post('/', async (req, res) => {
  const catalystApp = catalystSDK.initialize(req);
  const datastore = catalystApp.datastore();

  try {
    const { inboundAdviceId, verifiedBy } = req.body;
    if (!inboundAdviceId) {
      return res.status(400).send({ error: 'inboundAdviceId is required' });
    }

    const inboundTable = datastore.table(TABLES.INBOUND_ADVICE);
    const inboundAdvice = await inboundTable.getRow(inboundAdviceId).catch(() => null);
    if (!inboundAdvice) {
      return res.status(404).send({ error: `InboundAdvice ${inboundAdviceId} not found` });
    }

    const zcql = catalystApp.zcql();
    const cargoRows = await zcql
      .executeZCQLQuery(
        `SELECT ROWID, description, qty, unit, status FROM Cargo WHERE inbound_advice_id = ${inboundAdviceId}`
      )
      .then((rows) => rows.map((r) => r.Cargo));

    const grnNumber = `GRN-${inboundAdviceId}-${Date.now()}`;
    const pdfBuffer = await renderGrnPdf({ grnNumber, inboundAdvice, cargoRows });

    const bucket = catalystApp.stratus().bucket(BUCKETS.DOCUMENTS);
    const fileName = `${grnNumber}.pdf`;
    await bucket.putObject(fileName, pdfBuffer, { overwrite: true, contentType: 'application/pdf' });

    const grnTable = datastore.table(TABLES.GRN);
    const insertedGrn = await grnTable.insertRow({
      inbound_advice_id: inboundAdviceId,
      grn_number: grnNumber,
      generated_date: formatDatetime(),
      verified_by: verifiedBy || '',
      status: 'Generated',
      document_id: fileName,
    });

    const documentsTable = datastore.table(TABLES.DOCUMENTS);
    await documentsTable.insertRow({
      linked_module: 'GRN',
      linked_record_id: String(insertedGrn.ROWID),
      doc_type: 'Goods Receipt Note',
      file_id: fileName,
      uploaded_by: verifiedBy || '',
      uploaded_date: formatDatetime(),
    });

    await logAudit(catalystApp, {
      userId: req.headers['x-catalyst-user-id'] || '',
      actionType: 'CREATE_GRN',
      module: 'Inbound Operations',
      recordId: inboundAdviceId,
      details: { grnNumber, fileName },
    });

    return res.status(200).send({ grnNumber, fileName, bucket: BUCKETS.DOCUMENTS, inboundAdviceId });
  } catch (err) {
    return res.status(500).send({ error: err.message || 'Failed to create GRN' });
  }
});

module.exports = app;
