import type { ReactElement } from "react";

interface IconProps {
  className?: string;
}

// Minimal inline icons drawn with currentColor so warning states never
// rely on color alone (they always accompany text).

export function WarningIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 2.2 14.4 13H1.6L8 2.2Z" />
      <path d="M8 6.4v3" />
      <circle cx="8" cy="11.6" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.4v3.4" />
      <circle cx="8" cy="5" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StatusDot({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 8 8"
      width="8"
      height="8"
      aria-hidden="true"
      className={className}
    >
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}
