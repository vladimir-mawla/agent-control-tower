# Agent Control Tower

A control tower that decides what to do about an already-running agent it did not start, using only
what that agent chooses to report about itself.

Two or more autonomous agents can end up colliding over the same resource while already mid-flight.
Detecting the collision is easy. The hard problem this project targets is refusing to grant an
intervention more forceful than the offending agent's own corroborated, checkpointed evidence can
actually support — because "just halt it" is the move most likely to be destructive when the tower
is wrong about what that agent was mid-way through doing. See `.genesis/PLAN.md` for the full claim,
the closed `Intervention` vocabulary, and the nine-milestone plan.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript, deployed to Vercel
- Vitest for tests, `lib/` kept framework-free
- Build uses the webpack bundler explicitly (`next dev --webpack`, `next build --webpack`) with
  `experimental.extensionAlias` set in `next.config.ts` — Turbopack (Next 16's default) cannot
  resolve the NodeNext-style `.js`-suffixed relative imports `lib/` will use once it exists; see the
  comment in `next.config.ts` for the full reasoning.

## Running it

```bash
npm ci            # never `npm install` for restoring deps — see the note below
npm run dev       # local dev server
npm run typecheck # tsc against both tsconfig.lib.json and tsconfig.json
npm test          # vitest
npm run build     # production build
npm run lint      # next lint
```

**Always use `npm ci`, not `npm install`, to restore dependencies.** npm 11.5.1 has a documented bug
where `install` against an existing lockfile can silently drop the platform-specific
`@rolldown/binding-*` package that Vitest resolves through, and `npm test` then fails with a bare
"Cannot find native binding" that gives no hint the *install*, not the code, is at fault. `npm ci`
does not have this problem.

## Status

This is a genesis-only repository. It has the tooling skeleton, the `.genesis/` planning artifacts,
and a placeholder home page — no engine code and no domain logic yet. `lib/contracts/**` (M1) is a
separate milestone with its own PR and its own independent verifier, and each of the other eight
milestones in `.genesis/PLAN.md` follows the same pattern. There is **no live URL yet**; M2 deploys a
minimal skeleton to Vercel next, deliberately early rather than left to the end.
