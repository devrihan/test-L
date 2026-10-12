import { getConfigVersion, resolveDoc } from "@/app/lib/server/config";
import { configScopeFromSession } from "@/app/lib/server/session";

export const dynamic = "force-dynamic"; // always reflect the live in-memory cache

// Browser pass-through: client code can't read server memory (and
// NEXT_PUBLIC_* vars are frozen at build time), so it gets config here.
// Only ever returns the school-resolved view — one school's users never
// receive another school's config.
export async function GET() {
  const session = await configScopeFromSession();
  if (session.status !== "resolved") {
    // No school means no config to hand out. Saying so beats returning {},
    // which a caller would read as "this school has no flags set".
    return Response.json(
      {
        error: "NO_SCHOOL_IN_SESSION",
        detail:
          session.status === "anonymous"
            ? "not signed in"
            : "the signed-in account's token carries no schoolId claim",
      },
      { status: 409 },
    );
  }
  return Response.json(
    {
      version: getConfigVersion() ?? null,
      feature_flags: resolveDoc("feature_flags", session.scope),
      academic_year_scope: resolveDoc("academic_year_scope", session.scope),
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
