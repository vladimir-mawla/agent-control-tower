import IncidentDemo from "../components/demo/IncidentDemo";

/**
 * M8 — the interactive demo. This page itself stays a server component (no
 * "use client" here); `IncidentDemo` is the one client boundary, and it is
 * the only place this app calls into the real engine
 * (`components/demo/compute-demo-view.ts`) — see that file's own header
 * for why the engine calls live there and not in this page.
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
        Below: the same incident-remediation scenario{" "}
        <code>npm run demo:incident</code> runs on the command line, live in
        the browser. Nothing here is a scripted transcript — every panel is
        the real return value of this repository&rsquo;s own conflict
        detector, gate, and arbitration engine, recomputed on every change
        you make.
      </p>
      <IncidentDemo />
    </main>
  );
}
