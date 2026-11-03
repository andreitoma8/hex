/**
 * The dashboard's small icon set: 1.5px strokes on a 24px grid, drawn in
 * currentColor so they inherit text color. Icons are decoration — every use
 * sits next to a text label or carries an aria-label on its button.
 */
type P = React.SVGProps<SVGSVGElement>;

function Base({ children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      {children}
    </svg>
  );
}

export const IconToday = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);
export const IconModel = (p: P) => (
  <Base {...p}>
    <rect x="3.75" y="3.75" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.75" y="13.75" width="6.5" height="6.5" rx="1.5" />
    <path d="M10.25 7h3.5a3 3 0 0 1 3 3v3.75" />
  </Base>
);
export const IconReview = (p: P) => (
  <Base {...p}>
    <path d="M6.75 3.75h7.5l4.5 4.5v11.25a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V4.5a.75.75 0 0 1 .75-.75Z" />
    <path d="M9 13.5l2 2 4-4.5" />
  </Base>
);
export const IconChanges = (p: P) => (
  <Base {...p}>
    <path d="M7.5 20.25 3.75 16.5 7.5 12.75M3.75 16.5h12M16.5 3.75l3.75 3.75-3.75 3.75M20.25 7.5h-12" />
  </Base>
);
export const IconBoard = (p: P) => (
  <Base {...p}>
    <rect x="3.75" y="4.5" width="4.5" height="15" rx="1.25" />
    <rect x="9.75" y="4.5" width="4.5" height="10" rx="1.25" />
    <rect x="15.75" y="4.5" width="4.5" height="12.5" rx="1.25" />
  </Base>
);
export const IconReport = (p: P) => (
  <Base {...p}>
    <path d="M6.75 3.75h10.5a.75.75 0 0 1 .75.75v15a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75v-15a.75.75 0 0 1 .75-.75Z" />
    <path d="M9 8.25h6M9 11.25h6M9 14.25h3.75" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5.25 5.25" />
  </Base>
);
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IconChevron = (p: P) => (
  <Base {...p}>
    <path d="m9 5.25 6.75 6.75L9 18.75" />
  </Base>
);
export const IconMic = (p: P) => (
  <Base {...p}>
    <rect x="9" y="3" width="6" height="11.25" rx="3" />
    <path d="M5.25 11.25a6.75 6.75 0 0 0 13.5 0M12 18v3" />
  </Base>
);
export const IconSun = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.75" />
    <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.06 1.06M17.34 17.34l1.06 1.06M5.6 18.4l1.06-1.06M17.34 6.66l1.06-1.06" />
  </Base>
);
export const IconMoon = (p: P) => (
  <Base {...p}>
    <path d="M20.25 14.6A8.25 8.25 0 0 1 9.4 3.75a8.25 8.25 0 1 0 10.85 10.85Z" />
  </Base>
);
export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5.25 12.75 4.5 4.5 9-10.5" />
  </Base>
);
export const IconArrowRight = (p: P) => (
  <Base {...p}>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </Base>
);
export const IconExternal = (p: P) => (
  <Base {...p}>
    <path d="M13.5 4.5h6v6M19.5 4.5 11.25 12.75M17.25 13.5v5.25a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 .75-.75h5.25" />
  </Base>
);
export const IconMenu = (p: P) => (
  <Base {...p}>
    <path d="M3.75 7.5h16.5M3.75 12h16.5M3.75 16.5h16.5" />
  </Base>
);
export const IconSidebar = (p: P) => (
  <Base {...p}>
    <rect x="3.75" y="4.5" width="16.5" height="15" rx="2.25" />
    <path d="M9.75 4.5v15" />
  </Base>
);
export const IconUndo = (p: P) => (
  <Base {...p}>
    <path d="M9 14.25 4.5 9.75 9 5.25" />
    <path d="M4.5 9.75h10.125a4.875 4.875 0 0 1 0 9.75H12" />
  </Base>
);
