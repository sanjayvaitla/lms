/**
 * Global UI constants shared across the entire client.
 * Import from here — never redefine these in individual files.
 *
 * Usage:
 *   import { resolveCardBg, STATUS_STYLES, COLOR_TOKENS } from '../../lib/constants';
 */

import type { CourseStatus, CourseLevel } from '../types/api';

// ── Category → card background (fallback when no colorToken set) ──────────────
export const CATEGORY_BG: Record<string, string> = {
  'Web Dev': 'bg-cyan-50 border-cyan-100',
  'Python':  'bg-green-50 border-green-100',
  'AI/ML':   'bg-amber-50 border-amber-100',
  'Java':    'bg-orange-50 border-orange-100',
  'Mobile':  'bg-purple-50 border-purple-100',
  'DevOps':  'bg-indigo-50 border-indigo-100',
};
export const CATEGORY_BG_DEFAULT = 'bg-sky-50 border-sky-100';

// ── Category → badge colour (fallback) ───────────────────────────────────────
export const CATEGORY_TAG: Record<string, string> = {
  'Web Dev': 'bg-cyan-400 text-white',
  'Python':  'bg-emerald-400 text-white',
  'AI/ML':   'bg-amber-400 text-white',
  'Java':    'bg-orange-400 text-white',
  'Mobile':  'bg-purple-400 text-white',
  'DevOps':  'bg-indigo-400 text-white',
};
export const CATEGORY_TAG_DEFAULT = 'bg-sky-400 text-white';

// ── Category → progress bar colour (fallback) ─────────────────────────────────
export const PROGRESS_COLOR: Record<string, string> = {
  'Web Dev': 'bg-cyan-400',
  'Python':  'bg-emerald-400',
  'AI/ML':   'bg-amber-400',
  'Java':    'bg-orange-400',
  'Mobile':  'bg-purple-400',
  'DevOps':  'bg-indigo-400',
};
export const PROGRESS_COLOR_DEFAULT = 'bg-sky-400';

// ── Course status badge styles ────────────────────────────────────────────────
export const STATUS_STYLES: Record<CourseStatus, string> = {
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  NEW:      'bg-cyan-100 text-cyan-700',
  DRAFT:    'bg-gray-100 text-gray-600',
  ARCHIVED: 'bg-rose-100 text-rose-700',
};

// ── Course level emoji icons ──────────────────────────────────────────────────
export const LEVEL_ICON: Record<CourseLevel, string> = {
  BEGINNER:     '\u{1F7E2}',
  INTERMEDIATE: '\u{1F7E1}',
  ADVANCED:     '\u{1F534}',
};

// ── Card colour tokens — must match server validators/course.validator.ts ─────
export const COLOR_TOKENS = [
  'emerald', 'cyan', 'purple', 'amber', 'rose', 'indigo', 'sky', 'orange',
] as const;

export type ColorToken = typeof COLOR_TOKENS[number];

// ── Token → dot/swatch colour (colour picker circles) ────────────────────────
// Spelled out in full so Tailwind JIT always includes these classes.
export const COLOR_PREVIEW: Record<ColorToken, string> = {
  emerald: 'bg-emerald-400',
  cyan:    'bg-cyan-400',
  purple:  'bg-purple-400',
  amber:   'bg-amber-400',
  rose:    'bg-rose-400',
  indigo:  'bg-indigo-400',
  sky:     'bg-sky-400',
  orange:  'bg-orange-400',
};

// ── Token → card background (the actual grid card + modal preview strip) ─────
export const COLOR_BG_PREVIEW: Record<ColorToken, string> = {
  emerald: 'bg-emerald-50 border-emerald-200',
  cyan:    'bg-cyan-50 border-cyan-200',
  purple:  'bg-purple-50 border-purple-200',
  amber:   'bg-amber-50 border-amber-200',
  rose:    'bg-rose-50 border-rose-200',
  indigo:  'bg-indigo-50 border-indigo-200',
  sky:     'bg-sky-50 border-sky-200',
  orange:  'bg-orange-50 border-orange-200',
};

export const COLOR_TOKEN_CARD_BG: Record<ColorToken, string> = {
  emerald: 'bg-emerald-50 border-emerald-100',
  cyan:    'bg-cyan-50 border-cyan-100',
  purple:  'bg-purple-50 border-purple-100',
  amber:   'bg-amber-50 border-amber-100',
  rose:    'bg-rose-50 border-rose-100',
  indigo:  'bg-indigo-50 border-indigo-100',
  sky:     'bg-sky-50 border-sky-100',
  orange:  'bg-orange-50 border-orange-100',
};

export const COLOR_TOKEN_TAG: Record<ColorToken, string> = {
  emerald: 'bg-emerald-400 text-white',
  cyan:    'bg-cyan-400 text-white',
  purple:  'bg-purple-400 text-white',
  amber:   'bg-amber-400 text-white',
  rose:    'bg-rose-400 text-white',
  indigo:  'bg-indigo-400 text-white',
  sky:     'bg-sky-400 text-white',
  orange:  'bg-orange-400 text-white',
};

export const COLOR_TOKEN_PROGRESS: Record<ColorToken, string> = {
  emerald: 'bg-emerald-400',
  cyan:    'bg-cyan-400',
  purple:  'bg-purple-400',
  amber:   'bg-amber-400',
  rose:    'bg-rose-400',
  indigo:  'bg-indigo-400',
  sky:     'bg-sky-400',
  orange:  'bg-orange-400',
};

// ── Resolver helpers — use these in every component ───────────────────────────

/** Returns card background class driven by colorToken, falls back to category. */
export function resolveCardBg(colorToken: string, category: string): string {
  return COLOR_TOKEN_CARD_BG[colorToken as ColorToken]
    ?? CATEGORY_BG[category]
    ?? CATEGORY_BG_DEFAULT;
}

/** Returns category tag badge class driven by colorToken, falls back to category. */
export function resolveTagStyle(colorToken: string, category: string): string {
  return COLOR_TOKEN_TAG[colorToken as ColorToken]
    ?? CATEGORY_TAG[category]
    ?? CATEGORY_TAG_DEFAULT;
}

/** Returns progress bar class driven by colorToken, falls back to category. */
export function resolveProgressColor(colorToken: string, category: string): string {
  return COLOR_TOKEN_PROGRESS[colorToken as ColorToken]
    ?? PROGRESS_COLOR[category]
    ?? PROGRESS_COLOR_DEFAULT;
}

// ── Reusable form element class strings ───────────────────────────────────────
export const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all';
export const LABEL_CLS = 'block text-xs font-medium text-gray-700 mb-1';
export const ERROR_CLS = 'text-xs text-red-500 mt-1';
