/** Runs once when the server starts: reports setup problems, and refuses to start a deployed site with an unsafe secret. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
