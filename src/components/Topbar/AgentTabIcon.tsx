// Per-agent brand-style glyphs for the topbar tab row. These are
// hand-drawn inline SVGs that match the look in the reference design
// (orange starburst, multi-point gem, etc.) — replace any of them
// later with the upstream brand mark without touching the call site.
//
// Each component renders at 1em × 1em and inherits `currentColor`
// where appropriate, so the active tab can keep its own text colour.

import type { AppId } from "@/shared/types";

type IconProps = { size?: number };

const wrap = (path: React.ReactNode, viewBox = "0 0 24 24") =>
  function Icon({ size = 18 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

// Claude Code — orange starburst (5 curved rays around a small core).
export const ClaudeIcon = wrap(
  <>
    <defs>
      <linearGradient id="claude-stroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FF8A4C" />
        <stop offset="1" stopColor="#D97757" />
      </linearGradient>
    </defs>
    <path
      d="M12 2.5c.6 3.4 1.6 5.6 3.5 7.5 1.9 1.9 4.1 2.9 7.5 3.5-3.4.6-5.6 1.6-7.5 3.5-1.9 1.9-2.9 4.1-3.5 7.5-.6-3.4-1.6-5.6-3.5-7.5-1.9-1.9-4.1-2.9-7.5-3.5 3.4-.6 5.6-1.6 7.5-3.5 1.9-1.9 2.9-4.1 3.5-7.5z"
      fill="url(#claude-stroke)"
    />
    <circle cx="12" cy="13.5" r="2.2" fill="#fff" />
  </>,
);

// Codex — colorful 4-point gem (one face fills, three faces outline).
export const CodexIcon = wrap(
  <>
    <defs>
      <linearGradient id="codex-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#74AAFF" />
        <stop offset="1" stopColor="#5B8DEF" />
      </linearGradient>
    </defs>
    <path
      d="M12 2.5l3.7 8.5L12 21.5l-3.7-10.5L12 2.5z"
      fill="url(#codex-fill)"
    />
    <path d="M12 2.5l3.7 8.5H8.3L12 2.5z" fill="#FF7A59" />
    <path
      d="M12 21.5l-3.7-10.5h7.4L12 21.5z"
      fill="#3DDC97"
    />
    <path
      d="M8.3 11l3.7 10.5L8.3 11zm7.4 0L12 21.5 15.7 11z"
      stroke="#0A0A0A"
      strokeOpacity=".15"
      strokeWidth="0.6"
    />
  </>,
);

// Gemini — multi-point sparkle (Google brand: 4-pointed with side dots).
export const GeminiIcon = wrap(
  <>
    <defs>
      <linearGradient id="gemini-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8AB4F8" />
        <stop offset="1" stopColor="#4F8DF7" />
      </linearGradient>
    </defs>
    <path
      d="M12 2.5c1 4.5 2.5 6 7 7-4.5 1-6 2.5-7 7-1-4.5-2.5-6-7-7 4.5-1 6-2.5 7-7z"
      fill="url(#gemini-fill)"
    />
    <path
      d="M18.5 4.5c.4 1.6.9 2.1 2.5 2.5-1.6.4-2.1.9-2.5 2.5-.4-1.6-.9-2.1-2.5-2.5 1.6-.4 2.1-.9 2.5-2.5zM5.5 17c.3 1.1.6 1.4 1.7 1.7-1.1.3-1.4.6-1.7 1.7-.3-1.1-.6-1.4-1.7-1.7 1.1-.3 1.4-.6 1.7-1.7z"
      fill="#8AB4F8"
    />
  </>,
);

// OpenCode — cyan { } brackets.
export const OpenCodeIcon = wrap(
  <>
    <path
      d="M9 7c-2.5 0-3.5 1.3-3.5 3.2v1.6c0 1.1-.6 1.7-1.5 2 1 .3 1.5 1 1.5 2v1.6c0 1.9 1 3.2 3.5 3.2"
      stroke="#22D3EE"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M15 7c2.5 0 3.5 1.3 3.5 3.2v1.6c0 1.1.6 1.7 1.5 2-1 .3-1.5 1-1.5 2v1.6c0 1.9-1 3.2-3.5 3.2"
      stroke="#22D3EE"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
  </>,
);

// OpenClaw — a three-pronged claw shape.
export const OpenClawIcon = wrap(
  <>
    <path
      d="M12 3c-1.5 3.2-2.2 5.5-2.2 8 0 1.6.4 3.2 1.1 4.6L12 21l1.1-5.4c.7-1.4 1.1-3 1.1-4.6 0-2.5-.7-4.8-2.2-8z"
      fill="#A78BFA"
    />
    <path
      d="M5 8c1.4 1.6 2.3 3.2 2.6 5 .2 1.2.1 2.4-.3 3.6L4 19c-1.2-1.4-1.7-3-1.5-4.8.2-1.7 1.1-3.7 2.5-6.2zM19 8c-1.4 1.6-2.3 3.2-2.6 5-.2 1.2-.1 2.4.3 3.6L20 19c1.2-1.4 1.7-3 1.5-4.8-.2-1.7-1.1-3.7-2.5-6.2z"
      fill="#7C3AED"
    />
  </>,
);

// Hermes — caduceus (winged staff with two intertwined snakes).
export const HermesIcon = wrap(
  <>
    <path d="M12 3v18" stroke="#CA8A04" strokeWidth="1.6" strokeLinecap="round" />
    <path
      d="M9 6c2 0 3 1.2 3 2.8 0 1.6-1 2.8-3 2.8-1.2 0-2-.5-2.5-1.3"
      stroke="#CA8A04"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M15 6c-2 0-3 1.2-3 2.8 0 1.6 1 2.8 3 2.8 1.2 0 2-.5 2.5-1.3"
      stroke="#CA8A04"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M9 12.5c2 0 3 1.2 3 2.7 0 1.5-1 2.7-3 2.7M15 12.5c-2 0-3 1.2-3 2.7 0 1.5 1 2.7 3 2.7"
      stroke="#CA8A04"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M3 4.5c2 0 3.4.7 4.2 2M21 4.5c-2 0-3.4.7-4.2 2"
      stroke="#EAB308"
      strokeWidth="1.4"
      strokeLinecap="round"
      fill="none"
    />
  </>,
);

// Lookup keyed by AppId. The render code falls back to Bot (lucide)
// for any id we haven't drawn a custom mark for yet.
export const AGENT_TAB_ICON: Partial<Record<AppId, React.ComponentType<IconProps>>> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
  gemini: GeminiIcon,
  opencode: OpenCodeIcon,
  openclaw: OpenClawIcon,
  hermes: HermesIcon,
};
