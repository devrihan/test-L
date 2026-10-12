import "server-only";
import { dig, isPlainObject, type JsonObject } from "../config-shared";
import { readStub } from "./config-stub-source";
import { formatIssues, splitScope, validateConfigRows, type ValidationResult } from "../config-schema";

// Runtime product config, fetched from config-manager and held in process
// memory. Contract + rationale: infnotes/dev/handoffs/cld_loam_config_consumer_mechanism.md
//
// Config-manager is a HARD dependency. A process that cannot load AND validate
// real config at boot refuses to start (see instrumentation.ts). A RUNNING
// process keeps its in-memory cache and survives transient config-manager
// blips; only a fresh boot requires config-manager to be up.
//
// Because boot validation guarantees every key the code reads is present and
// well-typed (app/lib/config-schema.ts), the readers below can throw on a
// missing value.

type ConfigRow = {
  config_name: string;
  scope_type: "global" | "school" | (string & {});
  config: JsonObject;
};

type ConfigCache = {
  rows: ConfigRow[];
  version: string; // opaque, e.g. "loam:44"
  fetchedAt: number; // epoch ms of last successful contact
};

// One instance per Node process, shared across all requests and bundles
// (globalThis because Next can instantiate a module once per bundle boundary).
const g = globalThis as unknown as {
  __loamConfig?: ConfigCache;
  __loamConfigInflight?: Promise<string> | null;
  __loamConfigForced?: boolean;
};

function findRow(configName: string): ConfigRow | undefined {
  return g.__loamConfig?.rows.find((r) => r.config_name === configName);
}

/**
 * The doc a reader should see: the scope's subtree for school-scoped docs
 * (a school key like "1"/"all", or a variant key like "1:review" — see
 * session.ts), the doc itself otherwise. Throws rather than returning
 * undefined.
 */
export function resolveDoc(configName: string, scope?: string): JsonObject {
  const row = findRow(configName);
  if (!row) {
    throw new Error(
      `[config] document '${configName}' is not loaded — config-manager does not serve it to this app`,
    );
  }
  if (row.scope_type !== "school") return row.config;
  if (!scope) {
    throw new Error(
      `[config] cannot resolve '${configName}': no scope for this session. The schoolId claim ` +
        `is missing from the access token, so there is no scope to read config from.`,
    );
  }
  const subtree = row.config[scope];
  if (!isPlainObject(subtree)) {
    // Name which axis failed: a missing school is an onboarding gap, a missing
    // variant is a mistyped or stale claim.
    const [base, variant] = splitScope(scope);
    const present = Object.keys(row.config);
    const detail = variant
      ? `variant '${variant}' of school '${base}'. Variants this document carries for that school: ` +
        `${present.filter((k) => splitScope(k)[0] === base && splitScope(k)[1]).join(", ") || "none"}`
      : `school '${base}'. Schools this document carries: ` +
        `${present.filter((k) => !splitScope(k)[1]).join(", ")}`;
    throw new Error(`[config] document '${configName}' has no scope '${scope}' — no ${detail}`);
  }
  return subtree;
}

/**
 * Read one value by dotted path ("teacherView.dashboard.linechart").
 * Pure in-memory lookup — no I/O, safe on any request path.
 */
export function getConfigValue<T>(configName: string, path: string, opts: { scope?: string }): T {
  const v = dig(resolveDoc(configName, opts.scope), path);
  if (v === undefined) {
    throw new Error(
      `[config] '${configName}.${path}' is not set${opts.scope ? ` for scope '${opts.scope}'` : ""} — ` +
        `the code reads it, so config-manager must define it`,
    );
  }
  return v as T;
}

function commit(rows: ConfigRow[], version: string): void {
  g.__loamConfig = { rows, version, fetchedAt: Date.now() };
}

/** Validate what is currently held against the schema (diagnostics/tests). */
export function validateLoadedConfig(): ValidationResult {
  return validateConfigRows(g.__loamConfig?.rows ?? []);
}

export function assertLoadedConfigValid(): void {
  const res = validateLoadedConfig();
  if (!res.valid) {
    throw new Error(`config failed schema validation:\n  ${formatIssues(res.errors).join("\n  ")}`);
  }
}

/** Version currently held (undefined before the first successful load). */
export function getConfigVersion(): string | undefined {
  return g.__loamConfig?.version;
}

/**
 * Re-fetch from config-manager. force=true bypasses the ETag (used by the
 * refresh route). THROWS on any failure — callers decide what a failure means
 * (boot refuses to start; a runtime refresh keeps the existing cache).
 */
export async function refreshConfig(force = false): Promise<string> {
  // Coalesce concurrent refreshes — but only onto a request that is at least as
  // forceful. A forced refresh must never piggyback on an in-flight unforced
  // one: that request carries an If-None-Match and can answer 304, returning
  // the version already held without fetching anything. The push endpoint
  // reports whatever this resolves to as its acknowledgement, so config-manager
  // would record this consumer as holding a version it never received.
  if (g.__loamConfigInflight && !(force && !g.__loamConfigForced)) {
    return g.__loamConfigInflight;
  }
  g.__loamConfigForced = force;
  g.__loamConfigInflight = doFetch(force).finally(() => {
    g.__loamConfigInflight = null;
    g.__loamConfigForced = false;
  });
  return g.__loamConfigInflight;
}

async function doFetch(force: boolean): Promise<string> {
  // Interim source mode: read the committed stub file directly (no HTTP, works
  // at boot). Enabled explicitly via CONFIG_STUB_ENABLED=true.
  if (process.env.CONFIG_STUB_ENABLED === "true") {
    const { version, configs } = await readStub();
    commit(configs as ConfigRow[], version);
    return version;
  }
  const base = process.env.CONFIG_MANAGER_URL;
  if (!base) throw new Error("CONFIG_MANAGER_URL not set");
  const res = await fetch(`${base}/api/v1/config?service=loam`, {
    headers: {
      authorization: `Bearer ${process.env.CONFIG_MANAGER_TOKEN}`,
      ...(!force && g.__loamConfig ? { "if-none-match": `"${g.__loamConfig.version}"` } : {}),
    },
    cache: "no-store", // opt out of Next's fetch caching — always hit the network
    signal: AbortSignal.timeout(5000), // a slow config-manager must never hang a request
  });
  if (res.status === 304 && g.__loamConfig) {
    g.__loamConfig.fetchedAt = Date.now();
    return g.__loamConfig.version;
  }
  if (!res.ok) throw new Error(`config-manager responded ${res.status}`);
  const body = (await res.json()) as { version: string; configs: ConfigRow[] };
  commit(body.configs, body.version);
  return body.version;
}
