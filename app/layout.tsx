import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "agent-control-tower",
  description:
    "A control tower that decides what to do about an already-running agent it did not start, using only what that agent chooses to report about itself.",
};

/**
 * Minimal App Router shell — infrastructure only, mirroring decision-
 * engine's, shadow-run's, and memory-ledger's own root layout shape. No
 * project-specific UI exists yet (that is M8's job); this file's only
 * reason to exist at genesis is so app/ has at least one real entry point
 * for `npm run typecheck` (tsconfig.json) and `npm run build` to check,
 * ahead of M1's contracts and M2's deployed health endpoint.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
