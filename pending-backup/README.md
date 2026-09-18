# Kairos pending-work backup (autonomous gate chain handoff)

This branch is a one-shot backup, not part of the project history. It holds the
locally-drafted, locally-verified work directories for Kairos gates that had not
yet been packaged/pushed as candidate zips when this snapshot was taken, so the
autonomous gate chain can be resumed (by this session or a different assistant)
even if the drafting session's ephemeral scratchpad is lost.

Extract with:
  tar xzf pending-backup/kairos-pending-control.tar.gz
  tar xzf pending-backup/kairos-pending-work-A-500-514.tar.gz
  tar xzf pending-backup/kairos-pending-work-B-515-529.tar.gz

Each `workN/kairos_p76/` is a full checkout of the repo with phase N's changes
already applied and locally validated (tsc, vitest, build, verifiers). The
`gatechain.sh`, `pkgnext.sh`, `reapply-ledger.py`, `closureN.py`, `draftNdocs.py`
and `workflowN.py` scripts, plus `gatechain-plan-remaining.tsv`, are the control
scripts that turn each workN directory into a pushed, CI-dispatched, main-landed
gate. See the session's own explanation of the process for how to drive them.

State as of this snapshot: main is at Gate499 (P26.2). Gate500 (P26.3) is
packaged, pushed to claude/kairos-trading-journal-hftwax, and mid-CI. Gates
501-529 are drafted in workNNN/ but not yet packaged or pushed.
