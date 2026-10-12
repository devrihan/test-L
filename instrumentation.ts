// Next.js calls register() once at server start, before traffic is accepted.
//
// Config-manager is a HARD boot dependency. These are load-bearing configs
// (which academic years are shown, feature flags); a stale or guessed value can
// silently show wrong data. So if we cannot load real config from config-manager
// at boot, FAIL LOUD and refuse to start — no last-known-good snapshot, no
// baked-in defaults. A crashed boot is recoverable (config-manager returns, the
// container restarts and succeeds); a service quietly serving stale config is not.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // skip the edge-runtime pass
  const { refreshConfig, assertLoadedConfigValid } = await import("./app/lib/server/config");
  try {
    const version = await refreshConfig(true);
    // Loading is not enough — it must also satisfy the schema. This check is
    // what lets every reader in the app run without a fallback: past this
    // line, each key the code reads is known to be present and well-typed.
    assertLoadedConfigValid();
    console.log(`[config] loaded and validated ${version}`);
  } catch (e) {
    // Imported here, not at the top: this module is also compiled for the edge
    // runtime, where process.exit does not exist. Reaching it only from inside
    // the Node branch keeps it out of the edge bundle entirely.
    const { bootFatal } = await import("./app/lib/server/boot-fatal");
    bootFatal(
      "[config] FATAL: could not load valid config at boot — refusing to start " +
        "(no stale fallback for load-bearing config):",
      e,
    ); // kills the process so the deploy fails loudly instead of serving stale
  }
}
