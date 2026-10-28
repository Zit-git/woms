const locationTitle = (loc) =>
  `${loc.location_code}${loc.bay ? ` · Bay ${loc.bay}` : ''}${loc.rack_level ? ` · Level ${loc.rack_level}` : ''} - ${loc.occupied ? 'Occupied' : 'Empty'}`;

// A rack as it stands in the warehouse: one column per bay, the levels stacked upwards like a slide of cards
// (level 1 at the bottom, level 2 above it and a step to the right, and so on). A rack without bays or
// levels (older data) keeps the flat row of boxes. Every position can be opened.
// `classify(loc)` (optional) colours the positions for choosing one: it returns { state, reason } where state
// is 'available', 'suggested', 'selected' or 'unavailable' (not clickable, `reason` is shown on hover).
export default function RackLevels({ locations, onPick, classify }) {
  if (locations.length === 0) return <span className="muted small">No storage locations in this rack.</span>;
  const box = (loc, extra = {}) => {
    const c = classify ? classify(loc) : null;
    const stateClass = c ? ` pick-${c.state}` : loc.occupied ? ' occupied' : ' empty';
    return {
      type: 'button',
      className: 'location-box' + stateClass + (extra.card ? ' level-card' : ''),
      title: c?.reason ? `${loc.location_code} - ${c.reason}` : c ? `${loc.location_code} - ${c.state === 'selected' ? 'Chosen' : c.state === 'suggested' ? 'Suggested' : 'Available'}` : locationTitle(loc),
      onClick: () => onPick(loc),
      disabled: c?.state === 'unavailable',
      style: extra.style,
      'data-level': loc.rack_level || undefined,
      'data-state': c?.state,
    };
  };
  if (!locations.some((l) => l.bay || l.rack_level)) {
    return (
      <div className="location-flat">
        {locations.map((loc) => (
          <button key={loc.ROWID} {...box(loc)}>
            {loc.location_code}
          </button>
        ))}
      </div>
    );
  }
  const bays = new Map();
  locations.forEach((loc) => {
    const key = loc.bay ? String(loc.bay) : '';
    if (!bays.has(key)) bays.set(key, []);
    bays.get(key).push(loc);
  });
  const byLevel = (a, b) => (Number(a.rack_level) || 0) - (Number(b.rack_level) || 0) || String(a.location_code).localeCompare(String(b.location_code));
  return (
    <div className="rack-bays">
      {[...bays.entries()]
        .sort(([a], [b]) => (Number(a) || 0) - (Number(b) || 0))
        .map(([bay, list]) => (
          <div className="rack-bay" key={bay || 'none'}>
            <div className="rack-bay-label">{bay ? `Bay ${bay}` : 'No bay'}</div>
            <div className="level-stack">
              {[...list].sort(byLevel).map((loc, i) => (
                <button key={loc.ROWID} {...box(loc, { card: true, style: { '--i': i } })}>
                  <span className="level-tag">L{loc.rack_level || i + 1}</span>
                  <span className="level-code">{loc.location_code}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
