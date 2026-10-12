import { refreshConfig } from "@/app/lib/server/config";

// Push target for config-manager: forces a re-fetch and returns the version
// loam now holds — that response IS the acknowledgement config-manager records.
export async function POST(req: Request) {
  const expected = process.env.CONFIG_REFRESH_TOKEN;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const version = await refreshConfig(true); // forced re-fetch, bypasses ETag
    return Response.json({ version });
  } catch (e) {
    // loam couldn't reach config-manager; cache unchanged — config-manager
    // shows this consumer as pending.
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
