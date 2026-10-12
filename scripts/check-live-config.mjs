// Pre-deploy check: does the config-manager document this build will boot
// against actually satisfy this build's schema?
//
// Run it BEFORE deploying. The dashboard validates config at boot and exits if
// it is invalid, so a document missing a key this build reads means the new
// container cannot start. This turns that from a failed deploy into a one-line
// answer beforehand, with no coupling between the two services at runtime.
//
//   CFGMGR_URL=https://config.inferentics.com \
//   CFGMGR_TOKEN="$(secret get configmgr_consumer_token_loam)" \
//   node scripts/check-live-config.mjs
//
// Exits 0 when the live document is servable by this build, 1 when it is not.
// Warnings (keys config carries that this build does not read) do not fail it —
// that is the normal state while a new flag is being rolled out.

import { formatIssues, validateConfigRows } from "../app/lib/config-schema.ts";

const url = process.env.CFGMGR_URL;
const token = process.env.CFGMGR_TOKEN;
const service = process.env.CFGMGR_SERVICE ?? "loam";

if (!url || !token) {
  console.error("[check-config] CFGMGR_URL and CFGMGR_TOKEN are required");
  process.exit(1);
}

const res = await fetch(`${url}/api/v1/config?service=${service}`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`[check-config] config-manager answered ${res.status}`);
  process.exit(1);
}

const body = await res.json();
const rows = body.configs ?? [];
const version = body.version_string ?? body.version ?? "unknown";
const result = validateConfigRows(rows);

console.log(`[check-config] ${service} ${version}: ${rows.length} documents`);
for (const w of formatIssues(result.warnings)) console.log(`  warning  ${w}`);

if (result.valid) {
  console.log(`[check-config] OK — this build can boot against ${version}`);
  process.exit(0);
}

for (const e of formatIssues(result.errors)) console.error(`  ERROR    ${e}`);
console.error(
  `\n[check-config] This build would REFUSE TO BOOT against ${version}.` +
    `\nFix the document in config-manager first, then re-run. Do not deploy.`,
);
process.exit(1);
