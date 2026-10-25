// A popup keeps a working copy of the saved record while the user types. Whenever the record is re-read
// (every save triggers a re-read), the copy must NOT be reset to it: anything typed in another field and
// not yet saved would be wiped, and its save would then see "nothing changed" and silently never happen.
// Only the fields whose saved value really changed are taken over.
export function applyServerChanges(form, previousSaved, nextSaved) {
  const before = previousSaved || {};
  const after = nextSaved || {};
  const out = { ...form };
  new Set([...Object.keys(before), ...Object.keys(after)]).forEach((key) => {
    if (before[key] !== after[key]) out[key] = after[key];
  });
  return out;
}
