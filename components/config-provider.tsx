"use client";

import { createContext, useContext } from "react";
import { ConfigError, dig, type JsonObject } from "@/app/lib/config-shared";
import { setAcademicYearScope } from "@/app/lib/filters";

// Carries the server-resolved feature_flags doc (see app/layout.tsx) down to
// client components. Values are snapshotted per render — a config change
// shows up on the next navigation/refresh, which is fine for product config.
// A component that must react without navigation can poll /api/config instead.

const ConfigContext = createContext<JsonObject>({});

export function ConfigProvider({
  value,
  academicYearScope,
  children,
}: {
  value: JsonObject;
  // School-resolved academic_year_scope (app/layout.tsx), or null when the
  // session has no school (the pre-login render). Pushed into the sync filters
  // helpers so every page's year/exam options and row filters drop excluded
  // years and (when configured) year-less legacy exam ids. Set synchronously
  // here: this provider renders before any child that filters. For null it is
  // deliberately NOT set — filters.ts holds no default, so a filter running
  // without a school throws rather than defaulting to "hide nothing".
  academicYearScope: { excludedYears: string[]; excludeYearless: boolean } | null;
  children: React.ReactNode;
}) {
  if (academicYearScope !== null)
    setAcademicYearScope(academicYearScope.excludedYears, academicYearScope.excludeYearless);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/** The whole (school-resolved) feature_flags doc. */
export function useFeatureFlags(): JsonObject {
  return useContext(ConfigContext);
}

/**
 * One flag by dotted path, e.g. useFeatureFlag("show_common_mistakes_exam_page").
 *
 * There is deliberately no fallback argument. The server validates the whole
 * feature_flags document against app/lib/config-schema.ts before the process
 * accepts traffic, so every flag the code reads is guaranteed present — and a
 * fallback here would be a second, invisible source of truth that can disagree
 * with config-manager. It has done exactly that before: flags whose call-site
 * fallback said "show" while the document said "hide", harmless only for as
 * long as the document kept winning.
 *
 * So a missing flag is a fault, and this throws. Rendering the surface would
 * mean guessing whether a school wants it shown.
 */
export function useFeatureFlag<T = boolean>(path: string): T {
  const v = dig(useContext(ConfigContext), path);
  if (v === undefined) {
    throw new ConfigError(
      `[config] feature flag '${path}' is not set for this session. The code reads it, so it must ` +
        `exist in the feature_flags document in config-manager (see app/lib/config-schema.ts).`,
    );
  }
  return v as T;
}

/**
 * "Add to plan" has no plan builder behind it yet — every instance is a dead
 * button (see show_add_to_plan in app/lib/config-schema.ts). Hidden
 * everywhere, for every school, until that ships: not a per-school config
 * choice, so it does not read show_add_to_plan directly at each of the
 * several call sites (mistake cards, cohort cards, the question drawer, the
 * remediation drawers) — one of them already drifted out of sync with the
 * others once. Still reads the flag so a config-manager schema fault still
 * surfaces; the return value is just pinned to false regardless of it.
 * Flip this back to `return useFeatureFlag('show_add_to_plan')` when plans
 * ship.
 */
export function useShowAddToPlan(): boolean {
  useFeatureFlag('show_add_to_plan');
  return false;
}
