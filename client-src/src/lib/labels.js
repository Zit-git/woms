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
