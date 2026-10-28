// What a Handling Unit label shows, shared by every label print.
// The HU number is the inbound reference plus the package number, e.g. IB-2026-243231-004.
export function huNumber(inboundReference, packageNo) {
  if (!inboundReference) return packageNo ? String(packageNo) : '';
  return `${inboundReference}-${String(packageNo || '').padStart(3, '0')}`;
}

// The ids in a print link (?ids=1,2,3): digits only, no repeats, in the order given.
export function idsFromQuery(text) {
  const seen = new Set();
  return String(text ?? '')
    .split(',')
    .map((t) => t.replace(/\D/g, ''))
    .filter((t) => t && !seen.has(t) && seen.add(t));
}

// The link that prints labels for these Handling Units (opens the label sheet in the same app).
export function labelsPath(baseUrl, ids) {
  return `${baseUrl}print/labels?ids=${[...ids].map((i) => String(i).replace(/\D/g, '')).filter(Boolean).join(',')}`;
}

// Every storage position has a QR label to stick on the rack: WOMS-LOC-<position id>. Scanning (or typing) it picks
// that position; typing the position code (RT2-A1-R01-B1-L1) works too.
export const LOCATION_QR_PREFIX = 'WOMS-LOC-';
export const locationQr = (id) => `${LOCATION_QR_PREFIX}${String(id).replace(/\D/g, '')}`;
export function locationIdFromCode(text) {
  const m = new RegExp(`^${LOCATION_QR_PREFIX}(\\d+)$`, 'i').exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

// The position a scanned or typed text means among `locations` (rows with ROWID and location_code), or null.
export function findLocationByCode(locations, text) {
  const id = locationIdFromCode(text);
  const typed = String(text ?? '').trim().toUpperCase();
  if (!id && !typed) return null;
  return (locations || []).find((l) => (id ? String(l.ROWID) === id : String(l.location_code || '').toUpperCase() === typed)) || null;
}

// The link that prints position labels: a whole warehouse, one rack (rack=), or one position (position=).
export function locationLabelsPath(baseUrl, { warehouse, rack, position }) {
  const q = [['warehouse', warehouse], ['rack', rack], ['position', position]]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${String(v).replace(/\D/g, '')}`)
    .join('&');
  return `${baseUrl}print/locations?${q}`;
}
