import "server-only";
import { readFile } from "node:fs/promises";

// Interim config source until config-manager is deployed: the committed
// config-stub.json read straight from disk (CONFIG_STUB_ENABLED=true).
// Changing prod flags = edit the file -> merge -> auto-deploy reads it at
// boot. Shared by the config module (source mode) and the /api/dev/config-stub
// route (HTTP inspection/local parity).

export function stubEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CONFIG_STUB_ENABLED === "true";
}

export async function readStub(): Promise<{ version: string; configs: unknown[] }> {
  const raw = await readFile(process.env.CONFIG_STUB_PATH ?? "config-stub.json", "utf8");
  // Version derives from content, so every edit reads as a new version.
  return { version: `loam:stub-${hash(raw)}`, configs: JSON.parse(raw) };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
