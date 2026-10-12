import type { JsonObject } from "./config-shared";

// The contract between this app's code and config-manager.
//
// Every key listed here is one the code READS. A value that is missing or the
// wrong type is a startup failure.
//
// Adding a flag has a required order:
//   1. add the key to the config-manager document (accepted; running instances
//      report it as an unknown-key warning, which is harmless)
//   2. add it here and use it in code, then deploy
// Doing it the other way round means the new build cannot boot, because the
// document it validates against does not yet carry the key.
//
// That ordering is why an UNKNOWN key is a warning and a MISSING key is an
// error.

export type FieldType = "boolean" | "string[]";

// A scope key is a school id, optionally joined to a config variant by a single
// colon: "1", "all", "1:review". The two halves are different kinds of thing —
// the school says whose data the account belongs to, the variant says which
// settings it sees — so the key is really a pair, and everything that reasons
// about scopes splits it rather than treating it as an opaque string.
//
// A key with two colons, or a variant that is not a plain lowercase word, is a
// write-time error.
export const VARIANT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Split a scope key into [school, variant]; variant is undefined when absent. */
export function splitScope(scope: string): [string, string | undefined] {
  const i = scope.indexOf(":");
  return i === -1 ? [scope, undefined] : [scope.slice(0, i), scope.slice(i + 1)];
}

export interface DocSchema {
  scope_type: "school" | "global";
  /** Scope keys that must always be present in a school-scoped document. */
  requiredScopes: string[];
  /** Every key the code reads. All are required. */
  fields: Record<string, FieldType>;
}

// "all" is the scope internal/ops accounts authenticate with (the schoolId
// claim is literally "all"), so it is structural rather than a customer scope
// and every school-scoped document must carry it.
const ADMIN_SCOPE = "all";

export const CONFIG_SCHEMA: Record<string, DocSchema> = {
  feature_flags: {
    scope_type: "school",
    requiredScopes: [ADMIN_SCOPE],
    fields: {
      // Teacher-role surfaces derived from error classification
      // (beaver#566/569/572/575/577) — shown only where a school opts in.
      show_remediation_table_exam_page: "boolean",
      show_remediation_table_student_page: "boolean",
      show_common_mistakes_exam_page: "boolean",
      show_common_mistakes_chapter_page: "boolean",
      show_common_mistakes_question_page: "boolean",
      show_common_mistakes_student_page: "boolean",
      show_common_mistake_column_student_table: "boolean",
      show_common_mistake_column_students_page: "boolean",
      show_smart_cohorts_chapter_page: "boolean",
      show_answer_script_feedback_student_page: "boolean",
      // Teacher's per-student detail page — Performance tab (beaver#660).
      show_performance_tab_student_detail_page: "boolean",
      // Row click-through: navigate to the detail page vs open the drawer.
      route_to_detail_chapter_table: "boolean",
      route_to_detail_question_table: "boolean",
      route_to_detail_student_table: "boolean",
      // "Add to plan" CTAs on remediation drawers, mistake and cohort cards,
      // the question drawer and the student exam detail. There is no plan
      // builder behind them yet, so each is a dead button.
      show_add_to_plan: "boolean",
      // Student-role views, on the student's own login (beaver#643/644/660).
      show_remediation_student_exam_page: "boolean",
      // "Scoring marks left on the table" card on the student exam page —
      // off while classification coverage is too thin for it to look real.
      show_scoring_left_table_student_exam_page: "boolean",
      show_common_mistakes_student_exam_page: "boolean",
      show_common_mistakes_student_chapter_page: "boolean",
      show_common_mistakes_student_dashboard: "boolean",
      show_question_performance_student_analysis_page: "boolean",
      show_questions_nav_student: "boolean",
      // The Tutorial page and its sidebar item, for every role. The only
      // recording is the DPS-specific walkthrough (beaver#906), so a school
      // that is not DPS turns this off until a general one exists.
      show_tutorial: "boolean",
      // Cohorts with error classification, as "<grade>|<subject>" entries
      // (e.g. "12|Mathematics"). Every classification surface ANDs its own
      // show_* flag with membership here, so the school-wide flags can be on
      // while classification shows only where it exists.
      classified_cohorts: "string[]",
    },
  },
  academic_year_scope: {
    scope_type: "school",
    requiredScopes: [ADMIN_SCOPE],
    fields: {
      // Academic years hidden from the whole dashboard. Empty array = show all.
      excluded_years: "string[]",
      // Also hide exams whose id carries no parseable year token ('Midterm',
      // 'PB1', 'Annual Examination'). Those are legacy uploads that predate the
      // <grade>_<subject>_<type>_26_27 naming and would otherwise surface under
      // every academic year forever.
      exclude_yearless: "boolean",
    },
  },
};

export interface ValidationIssue {
  doc: string;
  scope?: string;
  key?: string;
  problem: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ConfigRowLike {
  config_name: string;
  scope_type: string;
  config: JsonObject;
}

function typeOk(value: unknown, type: FieldType): boolean {
  if (type === "boolean") return typeof value === "boolean";
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Check one scope subtree (or a whole global document) against a field map. */
function checkFields(
  doc: string,
  scope: string | undefined,
  subtree: JsonObject,
  schema: DocSchema,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  for (const [key, type] of Object.entries(schema.fields)) {
    if (!(key in subtree)) {
      errors.push({ doc, scope, key, problem: `missing (code reads it; expected ${type})` });
    } else if (!typeOk(subtree[key], type)) {
      errors.push({
        doc,
        scope,
        key,
        problem: `expected ${type}, got ${Array.isArray(subtree[key]) ? "array" : typeof subtree[key]}`,
      });
    }
  }
  for (const key of Object.keys(subtree)) {
    if (!(key in schema.fields)) {
      warnings.push({ doc, scope, key, problem: "set in config but no code reads it" });
    }
  }
}

/**
 * Validate a single document against its schema. A document this app does not
 * know about is a warning, not an error — other consumers share the service
 * namespace.
 */
function validateDoc(
  configName: string,
  scopeType: string,
  config: JsonObject,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const schema = CONFIG_SCHEMA[configName];

  if (!schema) {
    warnings.push({ doc: configName, problem: "not in this app's schema — ignored by it" });
    return { valid: true, errors, warnings };
  }

  if (scopeType !== schema.scope_type) {
    errors.push({ doc: configName, problem: `expected scope_type '${schema.scope_type}', got '${scopeType}'` });
    return { valid: false, errors, warnings };
  }

  if (schema.scope_type === "global") {
    checkFields(configName, undefined, config, schema, errors, warnings);
    return { valid: errors.length === 0, errors, warnings };
  }

  // School-scoped: the top-level keys are scope ids. Which customer scopes
  // exist is data, not something this app can know — so the rule is that the
  // structural scopes must be present, at least one customer scope must exist,
  // and every scope that IS present must be complete.
  for (const scope of schema.requiredScopes) {
    if (!isPlainObject(config[scope])) {
      errors.push({ doc: configName, scope, problem: "required scope missing" });
    }
  }
  // Scope keys are checked as PAIRS, not as opaque strings. Three rules:
  const scopeKeys = Object.keys(config);
  const schoolsPresent = new Set<string>();
  for (const key of scopeKeys) {
    const [school, variant] = splitScope(key);
    if (variant === undefined) {
      schoolsPresent.add(school);
      continue;
    }
    // 1. The variant half must be a plain lowercase word, and there is exactly
    //    one separator — "1:review:x" and "1:Review" are mistakes, not scopes.
    if (variant.includes(":") || !VARIANT_PATTERN.test(variant)) {
      errors.push({
        doc: configName,
        scope: key,
        problem: `malformed variant '${variant}' — expected one colon and a lowercase name, e.g. '1:review'`,
      });
    }
    // 2. A variant is a variant OF something. An orphan means the school it
    //    varies was deleted or never written, and every account of that school
    //    would fail while the document still looked complete.
    if (!(school in config)) {
      errors.push({
        doc: configName,
        scope: key,
        problem: `variant scope with no base — school '${school}' is not in this document`,
      });
    }
  }
  // 3. At least one real school.
  const customerSchools = [...schoolsPresent].filter((s) => !schema.requiredScopes.includes(s));
  if (customerSchools.length === 0) {
    errors.push({ doc: configName, problem: "no school scope present — every reader would fail" });
  }
  for (const [scope, subtree] of Object.entries(config)) {
    if (!isPlainObject(subtree)) {
      errors.push({ doc: configName, scope, problem: "scope value is not an object" });
      continue;
    }
    checkFields(configName, scope, subtree, schema, errors, warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate everything config-manager holds for this service. Run at boot — the
 * process refuses to start unless this passes.
 */
export function validateConfigRows(rows: ConfigRowLike[]): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  for (const name of Object.keys(CONFIG_SCHEMA)) {
    if (!rows.some((r) => r.config_name === name)) {
      errors.push({ doc: name, problem: "document absent from config-manager" });
    }
  }
  for (const row of rows) {
    const res = validateDoc(row.config_name, row.scope_type, row.config);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** One-line-per-issue rendering for boot logs and API responses. */
export function formatIssues(issues: ValidationIssue[]): string[] {
  return issues.map(
    (i) => `${i.doc}${i.scope ? `[${i.scope}]` : ""}${i.key ? `.${i.key}` : ""}: ${i.problem}`,
  );
}
