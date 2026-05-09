export const Colors = {
  // ANSI style codes
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Background colors (true color 24-bit)
  bg: "\x1b[48;2;13;13;14m", // #0d0d0e deep background (near black)
  bgSurface: "\x1b[48;2;24;24;27m", // #18181b Surface/cards (dark gray)
  bgElevated: "\x1b[48;2;36;36;39m", // #242427 Elevated surfaces
  bgGray: "\x1b[48;2;24;24;27m", // #18181b alias for bgSurface
  bgAccent: "\x1b[48;2;98;130;255m", // #6282ff Accent backgrounds
  bgAccentTint: "\x1b[48;2;24;28;44m", // #181c2c Subtle accent tint (12.5% blue)
  bgSuccessTint: "\x1b[48;2;42;50;37m", // #2a3225 Subtle success tint (12.5% green)
  bgSuccess: "\x1b[48;2;166;228;108m", // #a6e46c Success backgrounds
  bgError: "\x1b[48;2;248;113;113m", // #f87171 Error backgrounds

  // Text colors (true color 24-bit)
  textPrimary: "\x1b[38;2;220;220;224m", // #dcdcdc
  textSecondary: "\x1b[38;2;145;145;152m", // #919198
  textMuted: "\x1b[38;2;85;87;97m", // #555761
  accent: "\x1b[38;2;98;130;255m", // #6282ff
  accentHighlight: "\x1b[38;2;139;92;246m", // #8b5cf6
  success: "\x1b[38;2;166;228;108m", // #a6e46c
  warning: "\x1b[38;2;249;198;80m", // #f9c650
  error: "\x1b[38;2;248;113;113m", // #f87171
  info: "\x1b[38;2;137;221;255m", // #89ddff

  // Legacy aliases (mapped to PRD-equivalent colors)
  gray: "\x1b[38;2;85;87;97m",
  white: "\x1b[38;2;220;220;224m",
  silver: "\x1b[38;2;220;220;224m",
  rose: "\x1b[38;2;248;113;113m",
  gold: "\x1b[38;2;249;198;80m",
  sky: "\x1b[38;2;98;130;255m",
  coral: "\x1b[38;2;248;113;113m",
  teal: "\x1b[38;2;166;228;108m",

  bgTeal: "\x1b[48;2;166;228;108m",
  bgRose: "\x1b[48;2;248;113;113m",

  // Unicode symbols
  line: "─",
  arrow: "▸",
  bullet: "●",
  check: "✓",
  cross: "✗",
  warn: "⚠",
  dot: "·",
} as const;

export type ColorKey = keyof typeof Colors;

export function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${Colors.reset}`;
}

export function bold(text: string): string {
  return `${Colors.bold}${text}${Colors.reset}`;
}

export function dim(text: string): string {
  return `${Colors.dim}${text}${Colors.reset}`;
}

export function applyBg(text: string, bgCode: string): string {
  return `${bgCode}${text}${Colors.reset}`;
}

export function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") {
    return value.length > 50 ? value.slice(0, 50) + "..." : value;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    try {
      const str = JSON.stringify(value);
      return str ? (str.length > 50 ? str.slice(0, 50) + "..." : str) : "";
    } catch {
      return String(value);
    }
  }
  return String(value);
}
