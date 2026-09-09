# P21 Quote-Volume Ordering Helper #1 — exact failure evidence

- Canonical GOLDEN remains Gate #326 / run `34296922584`.
- Non-canonical helper run `34303109761`, job `102314086333`, failed only at `Reconstruct exact ordering candidate from Gate326 GOLDEN`.
- Fresh decoded job log proves Python `json.loads(os.environ['PAYLOAD_JSON'])` failed with `json.decoder.JSONDecodeError: Invalid control character at: line 1 column 767 (char 766)`.
- Setup, checkout, Node 22.16.0, and npm 10.9.2 pin succeeded. All scope/install/verifier/test/build/package/self-removal stages were skipped after reconstruction failure.
- Classification: helper transfer/serialization defect, not candidate verdict and not canonical gate failure.
- The failed method embedded a large JSON object in a YAML environment scalar. Do not repeat unchanged.
- Next safe repair must materially change transfer representation (for example independently encoded payload/file transport that is not parsed as raw JSON from the YAML env scalar), while reconstructing only the same six-file provider-neutral ordering responsibility from exact Gate326 GOLDEN.
- No Top-N/Top-30, freshness, state, provider, or UI work is authorized by this checkpoint.
