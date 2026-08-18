// Minimal 18x18 stroke icons, no external dependency.
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const IconGrid = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconUsers = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
    <path d="M16 4.3c1.5.4 2.6 1.8 2.6 3.4 0 1.7-1.2 3.1-2.7 3.4" />
    <path d="M19 14.7c1.8.6 3 2.4 3 4.5" />
  </svg>
);

export const IconWarehouse = (p) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 4l9 6.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M9 20v-6h6v6" />
  </svg>
);

export const IconInbound = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
    <path d="M12 3v8" />
    <path d="M8.5 7.5 12 11l3.5-3.5" />
  </svg>
);

export const IconBox = (p) => (
  <svg {...base} {...p}>
    <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
    <path d="M3.8 7.3 12 12l8.2-4.7" />
    <path d="M12 12v9" />
  </svg>
);

export const IconQr = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3z" />
    <path d="M20 14v3" />
    <path d="M14 20h3" />
    <path d="M20 20h1" />
  </svg>
);

export const IconChecklist = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8" />
    <path d="M8 12.5 9.5 14l2.5-3" />
    <path d="M8 18h5" />
  </svg>
);

export const IconLayers = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="M3 12l9 5 9-5" />
    <path d="M3 16l9 5 9-5" />
  </svg>
);

export const IconOutbound = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
    <path d="M12 11V3" />
    <path d="M8.5 6.5 12 3l3.5 3.5" />
  </svg>
);

export const IconChart = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20V10" />
    <path d="M11 20V4" />
    <path d="M18 20v-7" />
    <path d="M3 20h18" />
  </svg>
);

export const IconGear = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
  </svg>
);

export const IconLogout = (p) => (
  <svg {...base} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);
