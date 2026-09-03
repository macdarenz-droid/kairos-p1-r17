# KAIROS ARCHITECTURE MAP (Living Document)

## Purpose

This is not a file tree. GitHub already shows where files sit. This
document answers a different question: **which phase owns which
concept, fact, or boundary, and where does that ownership live in
code.** It exists so that six months from now, or for a new developer,
"where do I look for X" and "am I allowed to touch Y" have a fast,
authoritative answer instead of requiring a re-read of forty phases of
handoffs.

## Maintenance rule (read this before editing)

Update this file **at every phase-closure gate**, not at the end of
the project. Each update must come from the same evidence discipline
as everything else in Kairos:

- Only add a row once a phase has an actual **canonical PASS**.
- Pull the "owner," "file/module," and "boundary" columns from the
  real diff and the phase's own stated non-scope — never from memory
  or assumption.
- If a later phase changes an existing owner (e.g. a boundary gets
  split or a module gets renamed), **edit the existing row** with a
  note like "moved from X in P17.9" rather than leaving two
  conflicting entries.
- This file is descriptive, not authoritative. If it ever disagrees
  with the actual code or a canonical gate, the code/gate wins, and
  this file gets corrected — never the other way around.

---

## Core Truth Ownership

| Concept / Truth | Owner (Phase) | File / Module | Boundary — what it must NOT do |
|---|---|---|---|
| Journal execution truth (entry/exit/qty as user logged) | P9 / P10 | *(fill in exact path)* | Never silently overwritten by market data |
| Derived financial metrics (P&L, R-multiple, fees, risk) | P11 (Calculation Brain) | *(fill in exact path)* | UI is never a second calculation owner |
| Journal history / record listing | P12 | *(fill in exact path)* | — |
| Visual P&L presentation | P13 | *(fill in exact path)* | Must not aggregate incomparable currencies |
| Trade visualizer (plan vs. actual diagram) | P14 | *(fill in exact path)* | Not-to-scale disclosure until real geometry exists |
| Market data acquisition (provider-neutral) | P15 | *(fill in exact path)* | Never overwrites journal execution truth |
| Binance Spot live feed (concrete provider) | P16 | *(fill in exact path)* | Provider mapping is not journal execution truth |
| Chart rendering / presentation | P17 | *(fill in exact path)* | Presentation only — never decides financial truth |
| Drawing tools (trend lines, boxes) | P18 (planned) | — | Must not be absorbed into P17 |

---

## Cross-Cutting Rules (not owned by one phase, apply everywhere)

| Rule | Established In | Notes |
|---|---|---|
| One owner per number/fact | P0 architecture lock | Two legitimately different facts (e.g. execution price vs. market reference price) may coexist — the bug is either masquerading as the other |
| Decimal-safe math, no binary float for money | P0 / P11 | — |
| Offline-first — journal works with no network | P0 / P15 | Market/cloud features are enhancements, never dependencies |
| Local PASS ≠ canonical PASS | Process rule (all phases) | Only GitHub Actions canonical run is authoritative |
| Motion/animation is presentation-only | P14 (established) / P40 (final polish) | Never gates a real data/business state change |

---

## How to use this file

- **"Where do I find X?"** — scan the Concept column, go to the
  File/Module column.
- **"Am I allowed to change Y here?"** — check the Boundary column
  before touching it; if a change would cross that boundary, it
  belongs to a different phase/owner, not this one.
- **"Does a new patch conflict with existing ownership?"** — check
  this table before scoping a new patch. If the new patch would touch
  a row it doesn't own, that's a sign the patch is scoped too broadly.

---

*Last updated: (fill in at next phase closure) — currently a starter
template with phase ownership sketched from known handoffs. File
paths need to be filled in from actual repo evidence, not assumed.*
