// Sink for errors that happen in the BROWSER, so they reach somewhere the team
// can actually read them.
//
// Next already logs server-thrown errors into the container log and hands the
// browser only a `digest` to correlate against. Client-thrown errors get no
// such treatment — and the config contract throws in client components
// (useFeatureFlag), so without this an operator would see a user report "server
// error" with nothing on the server side to match it to.
//
// Output goes to stdout, which is the container log (Coolify → Logs, or
// `docker logs`), tagged `[client-error]` so it is greppable.

export const dynamic = "force-dynamic";

/** Hard caps so a misbehaving or hostile client cannot flood the log. */
const MAX_MESSAGE = 2000;
const MAX_STACK = 4000;

interface Body {
  message?: unknown;
  digest?: unknown;
  name?: unknown;
  stack?: unknown;
  pathname?: unknown;
}

const str = (v: unknown, cap: number): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, cap) : undefined;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(null, { status: 204 }); // never make reporting itself fail
  }

  // Deliberately NOT the full URL. Loam's routes carry student identity in the
  // query string (?name=…&admission=…), and an error log is not a place to put
  // that. The path alone is enough to locate the page.
  const rawPath = str(body.pathname, 200) ?? "unknown";
  const pathname = rawPath.split("?")[0].split("#")[0];

  console.error(
    "[client-error]",
    JSON.stringify({
      name: str(body.name, 100) ?? "Error",
      message: str(body.message, MAX_MESSAGE) ?? "(no message)",
      digest: str(body.digest, 100),
      pathname,
      at: new Date().toISOString(),
      stack: str(body.stack, MAX_STACK),
    }),
  );

  return new Response(null, { status: 204 });
}
