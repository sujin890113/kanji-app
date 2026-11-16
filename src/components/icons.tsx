/** 단순 선 아이콘. 색은 currentColor를 따른다. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...rest }: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const TodayIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </Base>
);

export const LevelsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h4v-5h4v-5h4V5h4" />
  </Base>
);

export const GridIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16" />
  </Base>
);

export const StatsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 20V12M10 20V6M15 20v-9M20 20V9" />
  </Base>
);

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Base>
);

export const BackIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 5 8 12l7 7" />
  </Base>
);
