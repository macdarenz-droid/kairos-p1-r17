# Direct candidate upload and canonical gate publication
Version: KAIROS-DIRECT-PUBLISH-V1-2026-09-11

## Purpose and scope

Use the connected GitHub Git Data tools to publish the exact candidate ZIP and its canonical gate configuration in one commit. No upload/reconstruction bridge workflow or chunk files in the repository are needed when this runtime exposes the required capabilities.

This is an upload mechanism, not an Astra-only model feature. It was used successfully for Gate382 (commit c8527f2429411e02a5c4d0763d3074ec9b5f8aac, run34586253466) and to launch Gate383 (commit775c5d82bfd8c9623757c2ec6cc1ea30abffedc3, run34588719761). Gate383's final status must be checked fresh; launch does not imply PASS.

The user requested this instruction/document update while Gate383 was running. That authorizes this documentation-only update, not a competing candidate or gate. Source, candidate archives and .github/workflows/kairos-gate.yml are unchanged by this documentation update.

## Preconditions

- Read the current master handoff and user instructions. Fresh canonical evidence wins.
- Check automation/manual-takeover and lease state. Do not reactivate paused workers or change schedules as part of adopting this method.
- Discover the actual tools available in the invoking worker. Do not assume a scheduled worker has the same tools as live chat.
- Required: filesystem/exec access to exact ZIP bytes plus connected GitHub create_blob, create_tree, create_commit, update_ref and read/fetch capabilities. In this environment their names are mcp__codex_apps__github_create_blob, github_create_tree, github_create_commit, github_update_ref and github_fetch under the same prefix. Read actual tool schemas.
- A running/queued canonical gate or helper still means monitor that exact run only. No competing source/candidate/gate publication.
- Reconstruct candidates from latest FULL canonical GOLDEN, prove intended delta and zero unintended removals, run appropriate tests, verify clean kairos_p76/ ZIP root and integrity.
- Acquire/verify the shared execution lease before mutations, recheck before every later mutation, refresh main and Actions after each repository write. No force push or access-control workarounds.

## 1. Freeze and identify the candidate

Record filename, byte size, SHA-256 and Git blob object ID before upload.
Git blob identity is SHA-1 of:
  UTF8("blob " + decimalByteLength + NUL) + exact ZIP bytes.
Do not confuse this with SHA-256 of the ZIP.

Read current main's commit SHA and its tree SHA. Keep both for the final fast-forward transaction. Verify the current canonical gate identity/status, latest GOLDEN archive identity and .github/workflows/kairos-gate.yml at that exact commit.

## 2. Transfer exact binary bytes to create_blob

Base64-encode the ZIP bytes and call the GitHub create_blob tool with:
- repository_full_name: macdarenz-droid/kairos-p1-r17
- encoding: base64
- content: the complete encoded ZIP

Do not pass binary content through update_file/create_file wrappers that only accept UTF-8 text. Do not paste multi-megabyte base64 into a chat message.

In code-mode, retain intermediate tool outputs in variables/store rather than printing the bytes. The prior exec transport silently shortened a single large output at roughly 1 MiB. A larger requested token budget did not prevent that. Use bounded reads when necessary:
- Read the frozen file at offsets 0, 600000, 1200000, ... bytes.
- Each full chunk is 600000 bytes (divisible by 3), yielding at most 800000 base64 characters.
- Full chunks must have no padding. Only the final chunk may have '=' padding.
- Verify every exec read succeeded and its trimmed output length is exactly 4*ceil(chunkByteLength/3).
- Concatenate chunk encodings in offset order; total encoded length must be 4*ceil(totalByteLength/3).
- Decode/compare SHA-256 where supported and always compare returned GitHub blob SHA against the precomputed Git blob identity.
- Tool limits can change; shrink chunks if needed. Never silently accept truncation or fabricate missing bytes.

Independent chunk reads may run together only against the same frozen file. Repository mutations remain sequential. Keep transport chunks in transient memory; never commit base64 chunk files, upload scripts or helper artifacts to the root.

Creating a blob does not publish a path, launch a workflow or promote a candidate.

## 3. Construct one atomic tree and commit

After rechecking lease, main and Actions, call create_tree with:
- base_tree_sha: the freshly verified current main tree
- candidate entry: exact filename, mode100644, type blob, returned verified blob SHA
- gate entry: .github/workflows/kairos-gate.yml, mode100644, type blob, complete intended UTF-8 workflow
- only necessary report/architecture/checkpoint entries under docs/

Preserve unrelated tree entries by using the base tree. Keep GOLDEN, active candidate, rollback and unresolved evidence. Do not delete historical artifacts merely to simplify upload.

Gate changes must correctly name/pin the GOLDEN base and new candidate filename, size and SHA-256, set the exact allowed candidate-vs-GOLDEN delta, retain all required regression/historical stages and both artifact uploads. Add dedicated checks for the new responsibility; never weaken old checks just to pass.

Before publication, review the workflow diff and candidate delta. Use create_commit with this tree and current main as its parent. Record the returned commit SHA. A detached commit still does not launch the gate.

## 4. Publish by a guarded fast-forward

Recheck lease ownership, current main and Actions immediately before update_ref:
- If another gate/helper started, stop publication and follow the one-chain rule.
- If main changed, inspect the new changes and reconstruct the tree on the new parent only when still in scope. Never overwrite concurrent work.
- If unchanged, call update_ref with branch_name main, the new commit SHA and force false.

The canonical workflow normally starts through its existing push paths when the atomic commit changes its workflow file/candidate path. There is no separate bridge or dispatch required for this tested mechanism.

Read main and Actions again. Verify:
- main points to the exact published commit;
- the run is Kairos Controlled Roadmap Gate at .github/workflows/kairos-gate.yml;
- head_sha equals the published commit;
- job verify-current-candidate exists;
- the run's candidate/base identity matches the intended transaction.

If a write response is ambiguous, inspect main/tree/commit and Actions before retrying. Do not publish a duplicate just because a tool timed out. If the run does not appear, inspect workflow push filters and commit paths first.

## 5. Verification and continuity

Monitor only the exact new run while queued/in_progress. Promote only after every required canonical stage succeeds plus both exact-run KAIROS_CURRENT_CANDIDATE and KAIROS_GATE_EVIDENCE artifacts are verified, including nested candidate identity when required.

An artifact download tool returning a signed URL does not prove local extraction. If retrieval fails, report it accurately and use available exact-run identity evidence without pretending a download succeeded.

Update only necessary docs/ continuity records; no new bridge files, root helper scripts, duplicate candidate copies or redundant reports. Preserve the canonical candidate artifact required by the gate. Record candidate/hash/blob, parent/new commit, run/job, tests actually run, blockers, next action and control state. Release only the owned lease after continuity is saved; honor the current manual/paused mode.

## Capability failure and fallback

Direct publication is preferred, not a guarantee of scheduled-runtime access. If a worker lacks binary-byte access or Git Data tools, first inspect available supported methods and existing documented upload mechanisms. Do not claim this is an Astra-model restriction. Do not invent a tool or bypass permissions.

Do not automatically create bridge files/workflows. Record the exact missing capability and preserve the candidate; exhaust a safe direct mechanism first. If an existing approved fallback remains necessary, use only that bounded mechanism under the same lease/one-chain/gate rules and explain why. A permission denial is not an invitation to use another route around that denial.

## Validation evidence for adopting this document

This method published Gate382 directly, which subsequently completed FULL canonical PASS. The same method launched Gate383 without bridge files. The worker's prompt points here, but its own capability availability remains to be verified at runtime. Existing worker/supervisor enablement and schedules are not changed by this documentation task.
