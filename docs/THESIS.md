# Two years out: authorization, not detection, is the bottleneck

Collision detection between running agents will be commoditized within two years — any diff over
shared-resource claims can do it, and this project's own `detectConflicts` needed no novel idea to get
there, just discipline: order-independence, idempotence, a typed failure instead of a crash. The scarce
thing will be what a supervisor is allowed to do once it sees a collision — specifically, whether it can
tell a real human sign-off from a fabricated one.

This project's own `HumanId`/`HumanAuthorization` types cannot make that distinction. Nothing in `lib/`
can confirm `authorizedBy` names a consenting human, and an outside caller can construct a
fully-authorized-looking forced halt that never happened (`tests/failures/03`). That gap is not a bug
this project failed to close; it is a property of every system in this shape lacking a cryptographic
identity layer underneath — and most production multi-agent supervisors lack one today.

**The claim, stated so it can be wrong:** within two years, most production supervisors of this kind
will still refuse to autonomously force-stop a colliding agent without a human in the loop — not because
the industry solves the harder detection or arbitration problem, but because nobody ships a cheap,
widely-adopted way to verify a claimed human authorization actually came from a consenting human at the
moment it is presented.

**What would falsify this:** a broadly-adopted, low-friction primitive for exactly this moment — a
signed, hardware- or platform-backed "a human approved this action" token, verifiable without a shared
secret — reaching common use in agent tooling. If that ships, forced intervention becomes verifiable
rather than merely trusted, and supervisors like this one stop being stuck at "ask a human every time."
