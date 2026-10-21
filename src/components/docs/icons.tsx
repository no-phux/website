import type { SVGProps } from "react";

/** Small stroke icons for reader chrome. Decorative: callers supply the accessible name. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CopyIcon = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);

export const MarkdownIcon = () => (
  <Icon>
    <rect x="1.5" y="3.5" width="13" height="9" rx="1.6" />
    <path d="M4 10.5v-5l2 2.2 2-2.2v5M11.5 5.5v5m0 0-1.6-1.7m1.6 1.7 1.6-1.7" />
  </Icon>
);

export const SourceIcon = () => (
  <Icon>
    <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon>
    <path d="M2.5 5h11M2.5 11h11" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);
