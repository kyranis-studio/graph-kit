/**
 * Modern muted color palette for CLI output
 * Used across all GraphKit execution engines and logging
 */

export const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  gray: '\x1b[90m',
  white: '\x1b[37m',
  silver: '\x1b[92m',
  rose: '\x1b[95m',
  gold: '\x1b[93m',
  sky: '\x1b[94m',
  coral: '\x1b[91m',
  teal: '\x1b[96m',

  bgGray: '\x1b[100m',
  bgRose: '\x1b[45m',
  bgTeal: '\x1b[46m',

  line: '─',
  arrow: '▸',
  bullet: '·',
  check: '✓',
  cross: '✗',
  warn: '⚠',
  dot: '·',
} as const;

export type ColorCode = typeof Colors[keyof typeof Colors];

export function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${Colors.reset}`;
}

export function bold(text: string): string {
  return `${Colors.bold}${text}${Colors.reset}`;
}

export function dim(text: string): string {
  return `${Colors.dim}${text}${Colors.reset}`;
}

export function box(label: string, content: string, colorCode: string): string {
  const border = color(Colors.line.repeat(50), colorCode);
  return `\n${border}\n${bold(color(` ${label}`, colorCode))}\n${border}\n${content}`;
}
