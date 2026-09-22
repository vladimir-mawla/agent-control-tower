/**
 * Placeholder home page — genesis only, no engine code and no domain logic.
 *
 * M2 will replace this with a deployed skeleton that exposes a real health
 * endpoint (app/api/health) backed by M1's frozen contracts. M8 will build
 * the actual interactive demo (live conflict injection against the
 * incident-response domain from M6). Until then this page exists only so
 * `npm run build` has something real to render.
 */
export default function Home() {
  return (
    <main>
      <h1>Agent Control Tower</h1>
      <p>
        A control tower that decides what to do about an already-running
        agent it did not start, using only what that agent chooses to report
        about itself.
      </p>
      <p>
        This project is in progress. No live demo exists yet — see the
        README for current status.
      </p>
    </main>
  );
}
