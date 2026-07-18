import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle
        cx="12"
        cy="12"
        r="3.75"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.28 5.28l1.42 1.42M17.3 17.3l1.42 1.42M18.72 5.28 17.3 6.7M6.7 17.3l-1.42 1.42"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M20 15.2A8.35 8.35 0 0 1 8.8 4a8.4 8.4 0 1 0 11.2 11.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="18"
        x="3"
        y="3.5"
      />
      <path
        d="M8.5 20.5h7M12 16v4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 8.2v4.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="16.3" fill="currentColor" r="1" />
      <path
        d="M10.2 4.2 2.8 17a2 2 0 0 0 1.73 3h14.94a2 2 0 0 0 1.73-3L13.8 4.2a2.08 2.08 0 0 0-3.6 0Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M20 6.5v5h-5M4 17.5v-5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M6.1 9A7 7 0 0 1 18 6.5l2 2M4 15.5l2 2A7 7 0 0 0 17.9 15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function TemperatureIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M14.7 14.2V5.7a3.2 3.2 0 0 0-6.4 0v8.5a5 5 0 1 0 6.4 0Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M11.5 8v8.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function HumidityIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 3.2S6.4 9.4 6.4 14a5.6 5.6 0 1 0 11.2 0C17.6 9.4 12 3.2 12 3.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function AirconIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="18"
        x="3"
        y="4"
      />
      <path
        d="M7 9.5h10M7.2 17c.7-1.5 2-2.3 3.8-2.3M16.8 17c-.7-1.5-2-2.3-3.8-2.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconBase>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="m8 10 4 4 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconBase>
  );
}
