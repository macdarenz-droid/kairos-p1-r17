# Handover: where the work paused and how to go on

**Paused on 2026-10-25 at the owner's request.** Nothing is running: the loop, the hourly "Kairos loop backup check-in" (disabled, not deleted) and the watching of PR #35 are all stopped. Read this file, then `CLAUDE.md`, before you do anything.

## Where it stopped
- **Upgrade U17 — Lost access and invite tools (P7.A1)**, the next upgrade after U16 in Relay `docs/architecture/UPGRADE_PLAN.md`.
- **Branch:** `claude/repo-progress-check-zbc6hi`: the commit that adds this file, on top of `b61a6c8`. **PR #35** (draft) into the base `claude/kairos-architecture-review-vrpkmo`. Never into `main`.
- **Done, reviewed, on the branch:**

  | Task | What | Commits |
  |---|---|---|
  | T-062a | the activation Worker as a tested package | `f7fa953` |
  | T-062b | 3 devices per code: D1 migration 0002, device routes, CI deploy | `3b26135`, fix `eaea13f` |
  | T-062c | the owner's code tool (`npm run codes`) | `0f37e04`, fix `820a8f2` |
  | T-062d | a release build stops without the activation settings | `ab266e7` |
  | T-062e | the invite screen: logo, plain words, "Lost access?", a copy of the journal | `b200d84`, fix `83d4590` |
  | T-062f | "Your devices" on Profile, and the daily check | `ff01efb`, fix `b61a6c8` |

- **CI:** the last fully green run is on `83d4590` (T-062a–e): unit tests, build, e2e and both Workers. The push with T-062f and this file was still running when work paused. Its result is in Relay `PROJECT_STATE.md` and on PR #35's checks.
- **Each task's notes** (as built, reviews, fixes) are in Relay `tasks/u17/T-062.md` under "Amendments while building".
- **Not done yet for U17:** see "Next steps" 1–3.

## Next steps, in order
0. **To resume:** remove the "Work is paused" line near the top of `CLAUDE.md`. Keep this file current until U17 is closed in Relay, then delete it by the deletion rule below (Relay backup first).
1. **Check CI on the branch tip** (PR #35 → Checks). Fix anything red except the Cloudflare Pages check (below), and push the fix to the same branch.
2. **Merge U17 into the base** once CI is green on the branch tip (the Cloudflare Pages check is red for a known reason, below):
   - in a clean worktree at `origin/claude/kairos-architecture-review-vrpkmo`, run `git merge --no-ff <branch tip> -F <message file>` (`-F -` does not work);
   - check the merge's tree equals the branch tip and its parents are the base and the tip;
   - push it to the base; mark PR #35 ready or close it as merged.
3. **Close U17 in Relay** (one file per topic; never post secrets or link URLs):
   - `tasks/TASKS.md`: replace the U17 section with the text under "U17 done text" below (fill in the merge commit), and add U18 as `next`;
   - `tasks/u17/T-062.md`: add T-062f's notes under "Amendments while building" if they are not there yet;
   - `PROJECT_STATE.md`: U17 done, U18 next; add to the owner's list that the Pages build now needs `VITE_KAIROS_ACTIVATION_ENDPOINT` and `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI`, plus U17's owner steps (below). Keep the "Owner alerts" line as it is;
   - `docs/architecture/ARCHITECTURE.md`: the activation Worker row (now a tested package, deployed by CI, D1 with devices), and replace the outdated "about 1,800 passing tests" line with the current count;
   - the Relay dashboard: U17 items done, progress updated;
   - one `LOG.md` line (`append_file`).
4. **Start U18 — P17.A2 "A chart a beginner can use"** (UPGRADE_PLAN #18). Draft its task text against the code and the decisions first, as U17's was (`tasks/u17/T-062.md`, decisions D274–D285 in Relay `docs/DECISIONS.md`), publish it, then build.

## U17 done text (for `tasks/TASKS.md`)
> ## U17 — Lost access and invite tools (P7.A1) · done
> All U17 tasks are merged into the base (last merge `<the merge commit>`, PR #35); each counts as `done` for `needs`: T-062a, T-062b, T-062c, T-062d, T-062e, T-062f. Text: `tasks/u17/T-062.md` (shared context first; what was built differently and the review rounds are under "Amendments while building" at its end); decisions D274–D285. The activation Worker is a tested package in `app/backend/activation-worker/`, deployed by CI from `main` once the owner turns it on. One invite code works on 3 devices (D1 migration 0002), and a retry never takes a second place. The owner makes, lists, revokes and frees codes with `npm run codes` on their own computer. A release build stops without the activation settings (CI builds with `build:qa`). The invite screen shows the logo, says in plain words what went wrong, opens "Lost access? Here's what to do", and offers a copy of the journal. Profile shows "Your devices" with Remove, and a daily check sends a removed device back to the invite screen at its next start, with its journal kept. Nothing stored changed shape: no new schema version and no backup format change; the daily check is one device-only metadata record (`device.activation.check.v1`). Going live needs the owner's Cloudflare steps for U17 (PROJECT_STATE). Not checked live (UNVERIFIED): the real Worker and D1, the owner's code tool against the live database, device names on real phones, Safari, and a screen reader.

## How each task was run (keep doing it this way)
1. **Plan:** write the task text against the real code and the owner's decisions; publish it in Relay (`tasks/uNN/T-0NN.md`, decisions in `docs/DECISIONS.md`) and list the tasks in `tasks/TASKS.md`.
2. **Build:** one builder per task in its own git worktree, branched from the current tip. It follows `CLAUDE.md`, proves each new or changed test fails before the change and passes after, and runs the checks below. Two builders may run at once when their files barely overlap; the later one rebases onto the earlier one.
3. **Review:** a fresh reviewer that did not build it reads the diff against the task text and decisions, runs its own fail-before checks, and returns PASS or findings (blocking or optional). Fix blocking findings, and optional ones that are real bugs or cheap; re-check the fix. A small, low-risk diff the supervisor may review alone.
4. **Push and check CI:** fast-forward the branch and push. Check CI directly on the new commit (a green result may not wake a waiting session).
5. **Record:** each task's "as built" and review notes go under "Amendments while building" in its Relay task file, plus one `LOG.md` line.
6. **Merge** the whole upgrade into the base only after every task passed review and CI is green, then close it out (step 3 above).

## Checks (inside `app/`)
- `npm ci` (once)
- `npm run typecheck`
- `npx vitest run --reporter=dot --silent=true <files>`; full suite `npm test -- --reporter=dot --silent=true` (about 3 min)
- `npm run build:qa 2>&1 | tail -20` (`npm run build` is the release build and stops without the activation settings)
- `npx playwright test --reporter=line` (port 4317; only one run at a time)
- Workers (in `app/backend/kairos-api` and `app/backend/activation-worker`): `npm run typecheck`, `npm test`, `npm run build` (a dry run)

## Known things that are not bugs in this branch
- **CI's first step refuses changes outside `app/`** and the listed root files (`CLAUDE.md`, `README.md`, `.ignore`, `.gitignore`, `.github/workflows/ci.yml`, `.claude/`). That is why this file lives in `.claude/`.
- **Cloudflare Pages check is always red** on PRs: the owner's Pages settings. It is commented on each PR. From T-062d on, a Pages build also needs the two activation settings.
- **Timing tests under heavy load:** `journal-history-performance`, `journal-open-trade-update`, `results-rates-on-their-own` and `trade-edit-screen` failed once each while two full suites ran at once. Each passed alone and in the next full run, and CI has not failed on them. If one fails alone, look at it then.
- **Two harmless leftovers in T-062f** (found in review, left as is): a tab whose activation another tab replaced keeps asking `/devices/check` once an hour for that session and changes nothing; and a test would still pass if `isSameActivation` compared only `activationId` (safe, as `activation_id` is unique in D1).
- **Deploy jobs** "deploy kairos-api (main)" and "deploy activation (main)" are skipped on PRs; they run only on `main`, and the activation one only with `KAIROS_ACTIVATION_DEPLOY=on`.

## Owner steps waiting (details in Relay `PROJECT_STATE.md` and `tasks/u17/T-062.md` › "Owner steps for U17")
- **O8:** add D1 · Edit to the CI token, check the names `kairos-activation` (Worker) and `kairos-activation-db` (D1), and set the GitHub variable `KAIROS_ACTIVATION_DEPLOY=on`.
- **Pages:** set `VITE_KAIROS_ACTIVATION_ENDPOINT` and `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` (Production, and Preview if used).
- **The code tool, once:** Node 22, `npm ci` and `npx wrangler login` in `app/backend/activation-worker`, then `npm run codes -- list` and revoke short hand-made codes.
- **A phone check:** clear Kairos's data, type the code again, restore the backup, and see "2 of 3" under More › Profile › Your devices.
- Older ones (O1, O2, O4a, O4b, O6, O9, O10, O12, the Library PDFs for T-034e) are listed in `PROJECT_STATE.md`.

## Rules that are easy to miss
- Push only to `claude/repo-progress-check-zbc6hi`; merge into the base only after review PASS and green CI; never push to `main`; never force-push or rewrite shared history.
- Never post secrets, keys or link URLs (Relay links carry a token).
- Deleting a file needs, in order: a copy in Relay `backup/<repo path>`, the git delete, and a `LOG.md` line with `restore: git checkout <commit-before> -- <path>`.
- Commits end with the two trailer lines the session gives (`Co-Authored-By`, `Claude-Session`); no model name in commits.
