// Shared between server config cache and the client ConfigProvider —
// no server-only imports allowed here.

export type JsonObject = Record<string, unknown>;

/**
 * A config value the code needs is missing, mistyped, or unresolvable.
 *
 * Its own type, because callers must be able to tell it apart from a network
 * failure. Data fetches in this app retry on failure and then tell the user to
 * check their connection — correct for a flaky request, wrong for a config
 * fault, which will fail identically on every retry and has nothing to do with
 * the user's connection. Retrying one of these ten times and then blaming the
 * network is how a loud failure becomes a quiet one.
 */
export class ConfigError extends Error {
  readonly name = "ConfigError";
}

export function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Read a dotted path ("teacherView.dashboard.linechart") out of a doc. */
export function dig(doc: JsonObject | undefined, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}
