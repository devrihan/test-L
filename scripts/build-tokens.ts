#!/usr/bin/env tsx
/**
 * Build CSS tokens from the Tokens Studio for Figma export at /tokens.
 *
 * Sources:
 * - `_TW Color Primitives/Mode 1.json` — raw hex color ladders.
 * - `_TW Primitives/Mode 1.json` — Tailwind-style primitives (rounded.*, gap.*, etc.).
 * - `1. shadcn/ui - color modes/{light,dark}/{NEUTRAL}.json` — semantic shadcn tokens.
 * - `3. Radius/Mode 1.json` — radius scale (unused; we read --radius from the shadcn file).
 * - `4. Spacing/Mode 1.json` — semantic spacing tokens (spacing-xs, spacing-sm, ...).
 * - `5. Containers/Mode 1.json` — container max-widths + paddings.
 *
 * Output: replaces the AUTOGEN block in `app/theme.css`,
 * leaving the colour-mapping `@theme inline` and `@layer base` sections intact.
 *
 * Typography and shadows are intentionally NOT synced from Tokens Studio JSON —
 * they live as Figma text/effect styles. Keep Figma-aligned typography utilities
 * and component classes outside the AUTOGEN block in theme.css so token builds
 * preserve them.
 *
 * Usage:
 *   npm run tokens:build      regenerate app/theme.css from tokens/
 *   npm run tokens:check      exit non-zero if app/theme.css is out of sync
 *
 * Synced from web/packages/ui/scripts/build-tokens.ts — keep in step.
 * When web updates the script, copy it here and adjust the two path constants below.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { converter, parse } from "culori";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, ".."); // loam root (one level up from scripts/)
const TOKENS_DIR = join(REPO_ROOT, "tokens");
const TOKENS_THEME_CSS = join(REPO_ROOT, "app/theme.css");

const NEUTRAL = "slate" as const;
const START_MARKER = "/* AUTOGEN:TOKENS:START */";
const END_MARKER = "/* AUTOGEN:TOKENS:END */";

type TokenNode = {
  $type?: string;
  $value?: string | number;
  [key: string]: unknown;
};
type TokenTree = Record<string, TokenNode | unknown>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function isAlias(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("{") && value.endsWith("}");
}

function walkPath(tree: TokenTree, path: string[]): TokenNode {
  let node: unknown = tree;
  for (const segment of path) {
    if (node && typeof node === "object" && segment in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      throw new Error(`Alias path not found: ${path.join(".")}`);
    }
  }
  return node as TokenNode;
}

function resolveLiteral(value: string | number, lookup: TokenTree): string | number {
  if (typeof value === "number") return value;
  if (!isAlias(value)) return value;
  const path = value.slice(1, -1).split(".");
  const target = walkPath(lookup, path);
  if (target.$value === undefined) {
    throw new Error(`Alias resolution incomplete: ${value}`);
  }
  return resolveLiteral(target.$value as string | number, lookup);
}

const toOklch = converter("oklch");

function hexToOklch(hex: string): string {
  const parsed = parse(hex);
  if (!parsed) throw new Error(`Cannot parse color: ${hex}`);
  const ok = toOklch(parsed);
  if (!ok) throw new Error(`Cannot convert to oklch: ${hex}`);
  const l = Number(ok.l.toFixed(3));
  const c = Number((ok.c ?? 0).toFixed(3));
  const h = ok.h === undefined || Number.isNaN(ok.h) ? 0 : Number(ok.h.toFixed(3));
  const alpha = ok.alpha;
  const head = `${l} ${c} ${h}`;
  if (alpha !== undefined && alpha < 1) {
    return `oklch(${head} / ${(alpha * 100).toFixed(0)}%)`;
  }
  return `oklch(${head})`;
}

function pxToRem(px: number): string {
  return `${px / 16}rem`;
}

function flattenColorBlock(
  block: Record<string, TokenNode>,
  lookup: TokenTree,
  skip: Set<string>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, token] of Object.entries(block)) {
    if (skip.has(name)) continue;
    if (token.$type !== "color") continue;
    const hex = resolveLiteral(token.$value as string, lookup) as string;
    out.set(name, hexToOklch(hex));
  }
  return out;
}

function buildColorVars(shadcnFile: any, primitives: TokenTree): Map<string, string> {
  const skipFromTokens = new Set<string>([
    "primary-90",
    "secondary-80",
    "destructive-90",
    "radius",
    "radius-md",
    "radius-sm",
  ]);
  const tokens = flattenColorBlock(shadcnFile.tokens ?? {}, primitives, skipFromTokens);
  const charts = flattenColorBlock(shadcnFile.charts ?? {}, primitives, new Set());
  const sidebarRaw = flattenColorBlock(shadcnFile.sidebar ?? {}, primitives, new Set());

  const sidebar = new Map<string, string>();
  for (const [k, v] of sidebarRaw) {
    sidebar.set(k === "sidebar-background" ? "sidebar" : k, v);
  }

  return new Map<string, string>([
    ...tokens.entries(),
    ...charts.entries(),
    ...sidebar.entries(),
  ]);
}

function readRadiusRem(shadcnFile: any, twPrimitives: TokenTree): string {
  const radiusToken = (shadcnFile.tokens as any).radius;
  if (!radiusToken) return "0.5rem";
  const px = Number(resolveLiteral(radiusToken.$value as string, twPrimitives));
  return pxToRem(px);
}

function buildSpacingVars(spacing: TokenTree, twPrimitives: TokenTree): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, token] of Object.entries(spacing)) {
    const t = token as TokenNode;
    if (t.$type !== "number") continue;
    if (t.$value === undefined) continue;
    const px = Number(resolveLiteral(t.$value as string | number, twPrimitives));
    const short = `sp-${name.replace(/^spacing-/, "")}`;
    out.set(short, pxToRem(px));
  }
  return out;
}

function buildContainerVars(containers: TokenTree, twPrimitives: TokenTree): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, token] of Object.entries(containers)) {
    const t = token as TokenNode;
    if (t.$value === undefined) continue;
    const raw = resolveLiteral(t.$value as string | number, twPrimitives);
    const px = typeof raw === "number" ? raw : Number(raw);
    if (Number.isNaN(px)) continue;
    out.set(name, pxToRem(px));
  }
  return out;
}

function renderVars(vars: Map<string, string>, prefix = "  "): string {
  const lines: string[] = [];
  for (const [k, v] of vars) lines.push(`${prefix}--${k}: ${v};`);
  return lines.join("\n");
}

function generateBlock(): string {
  const colorPrimitives = readJson<TokenTree>(join(TOKENS_DIR, "_TW Color Primitives/Mode 1.json"));
  const twPrimitives = readJson<TokenTree>(join(TOKENS_DIR, "_TW Primitives/Mode 1.json"));
  const lightFile = readJson<any>(join(TOKENS_DIR, `1. shadcn/ui - color modes/light/${NEUTRAL}.json`));
  const darkFile = readJson<any>(join(TOKENS_DIR, `1. shadcn/ui - color modes/dark/${NEUTRAL}.json`));
  const spacingFile = readJson<TokenTree>(join(TOKENS_DIR, "4. Spacing/Mode 1.json"));
  const containerFile = readJson<TokenTree>(join(TOKENS_DIR, "5. Containers/Mode 1.json"));

  const lightColors = buildColorVars(lightFile, colorPrimitives);
  const darkColors = buildColorVars(darkFile, colorPrimitives);
  const radiusRem = readRadiusRem(lightFile, twPrimitives);
  const spacing = buildSpacingVars(spacingFile, twPrimitives);
  const containers = buildContainerVars(containerFile, twPrimitives);

  return [
    ":root {",
    `  --radius: ${radiusRem};`,
    "",
    "  /* colors (light) */",
    renderVars(lightColors),
    "",
    "  /* containers */",
    renderVars(containers),
    "}",
    "",
    ".dark {",
    "  /* colors (dark) */",
    renderVars(darkColors),
    "}",
    "",
    "@theme {",
    "  /* semantic spacing scale — utilities like gap-sp-xxs, p-sp-sm, m-sp-3xl (never bare p-3xl, which clashes with max-w-3xl in Tailwind v4) */",
    [...spacing.entries()].map(([k, v]) => `  --spacing-${k}: ${v};`).join("\n"),
    "}",
  ].join("\n");
}

function applyToCss(generated: string, css: string): string {
  const start = css.indexOf(START_MARKER);
  const end = css.indexOf(END_MARKER);
  if (start === -1 || end === -1) {
    throw new Error(`AUTOGEN markers not found in ${TOKENS_THEME_CSS}`);
  }
  const before = css.slice(0, start + START_MARKER.length);
  const after = css.slice(end);
  return `${before}\n${generated}\n${after}`;
}

function main() {
  const check = process.argv.includes("--check");
  const css = readFileSync(TOKENS_THEME_CSS, "utf-8");
  const generated = generateBlock();
  const next = applyToCss(generated, css);

  if (check) {
    if (next !== css) {
      console.error("✗ Token drift: app/theme.css is out of sync with tokens/. Run `npm run tokens:build`.");
      process.exit(1);
    }
    console.log("✓ Tokens in sync with app/theme.css");
    return;
  }

  if (next === css) {
    console.log("✓ app/theme.css already in sync — no write needed");
    return;
  }

  writeFileSync(TOKENS_THEME_CSS, next);
  console.log(`✓ Wrote ${TOKENS_THEME_CSS}`);
}

main();
