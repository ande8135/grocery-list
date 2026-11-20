const base = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth="3.5">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth="2.5">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth="3">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MicIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth="2.5">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>
);
export const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
  </svg>
);
export const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth="3">
    <path d="M7 10l5 5 5-5" />
  </svg>
);
export const BagIcon = () => (
  <svg viewBox="0 0 96 96" {...base} strokeWidth="4">
    <path d="M24 34h48l-4 44a6 6 0 0 1-6 5.5H34a6 6 0 0 1-6-5.5z" fill="currentColor" fillOpacity=".1" />
    <path d="M36 34v-6a12 12 0 0 1 24 0v6" />
    <path d="M42 58l5 5 9-10" />
  </svg>
);
export const TagIcon = () => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth="2.5">
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.6 7.6a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0l-7.6-7.6a1 1 0 0 1-.3-.7z" />
    <circle cx="8.2" cy="8.2" r="1.2" fill="currentColor" />
  </svg>
);
