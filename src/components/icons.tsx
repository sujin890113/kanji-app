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

export const LockIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const UndoIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Base>
);

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Base {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Base>
);

export const SpeakerIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Base>
);

export const PlayIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 5v14l12-7z" />
  </Base>
);

export const PenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
    <path d="M14.5 6.5l3 3" />
  </Base>
);
