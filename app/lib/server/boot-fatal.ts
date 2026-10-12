import "server-only";

// Aborting the process lives here, on its own, so that instrumentation.ts can
// reach it through a dynamic import from inside its Node-runtime branch.
//
// Next also compiles instrumentation.ts for the edge runtime, where
// process.exit does not exist. The branch guard already prevents it running
// there, but the bundler's static analysis still saw the call and logged
// "A Node.js API is used (process.exit)" on every compile — several times per
// page load. That noise is worth removing on its own terms: a log full of
// harmless errors is one a real error hides in, which is exactly what happened
// while debugging this.

export function bootFatal(message: string, cause: unknown): never {
  console.error(message, cause);
  process.exit(1);
}
