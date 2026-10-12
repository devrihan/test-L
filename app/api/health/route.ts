import { getConfigVersion } from "@/app/lib/server/config";

// Liveness probe for the container platform.
//
// Reads no config values and touches no upstream service: this answers "is this
// process able to serve?", not "is the whole system well".
//
// The reported version is the config the process actually holds — it
// distinguishes the new container from the old one after a deploy. Middleware
// does not run on /api/*, so this needs no session.

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", config_version: getConfigVersion() ?? null });
}
