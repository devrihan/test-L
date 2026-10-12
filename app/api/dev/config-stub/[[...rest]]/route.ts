import { readStub, stubEnabled } from "@/app/lib/server/config-stub-source";

export const dynamic = "force-dynamic";

// HTTP view of the stub config source (see config-stub-source.ts). In stub
// mode the config module reads the file directly — this route exists for
// inspection and for pointing CONFIG_MANAGER_URL at a *separate* loam
// instance if that's ever useful. Catch-all so the fetch path suffix
// (/api/v1/config?service=loam) appended to CONFIG_MANAGER_URL still matches.
export async function GET() {
  if (!stubEnabled()) return new Response("not found", { status: 404 });
  try {
    return Response.json(await readStub());
  } catch {
    return Response.json({ version: "loam:stub-empty", configs: [] });
  }
}
