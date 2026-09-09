# P21 Quote-Volume Ordering Transfer Repair — queued

- Canonical GOLDEN remains Gate #326 / run `34296922584`.
- Active responsibility remains provider-neutral deterministic quote-volume ordering only; Top-N/Top-30 remains separate later ownership.
- Helper #1 run `34303109761` failed only in reconstruction because raw JSON transported through YAML env contained literal control characters and `json.loads(...)` rejected it before scope/install/tests/build/package ran.
- This invocation changed strategy rather than rerunning unchanged: temporary workflow `.github/workflows/repair-ordering-helper-json-transfer.yml` was added at main commit `9c4be522765ea9d98e14e1269e951042f1050feb` to make one exact parser repair (`json.loads(..., strict=False)`) in the existing ordering helper, self-remove, and push the repaired helper definition.
- Exact repair workflow run `34306366578` was freshly observed QUEUED on head `9c4be522765ea9d98e14e1269e951042f1050feb`.
- No canonical gate retarget and no Top-N/Top-30 work occurred.
- Next safe action: monitor exact repair run `34306366578` only. If it succeeds, refresh main/Actions and monitor the exact ordering reconstruction run triggered by the helper-definition change; do not create a competing helper. If it fails, inspect exact failed step/log before another mutation.
