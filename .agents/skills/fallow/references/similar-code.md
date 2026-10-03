# Semantic Similar-Code Workflow & Architecture

Similar-code is an opt-in, local semantic discovery workflow powered by vector embeddings. It complements deterministic `fallow dupes`; it does not replace clone detection, tests, or human judgment.

For official upstream documentation and internal design specifications, see the [Fallow Similar Code Analysis Specification](https://git.mitgai.net/fallow-rs/fallow/blob/main/docs/similar-code-analysis.md).

---

## 1. Hardware Architecture & Runtime

- **Inference Engine**: Fallow executes the companion embedding model (`jina-embeddings-v2-base-code`) via Hugging Face's **Candle** framework.
- **CPU-Only Execution**: The Candle runtime compiled in Fallow is strictly **CPU-only**. It does NOT support GPU or CUDA flags.
- **Multi-Threading Optimization**: Parallel computation across CPU cores is controlled via the `--threads` CLI flag. In `@francogp/auditor`, the suite automatically allocates all available physical/logical cores via `--threads ${os.availableParallelism()}` to maximize throughput.

---

## 2. Vector Cache Architecture & Storage Locations

Fallow persists downloaded model weights, tokenizers, and computed function embeddings inside standard OS-level user cache directories to avoid recomputing vectors on successive runs:

- **Windows**: `%LOCALAPPDATA%\fallow\similar-code` (typically `C:\Users\<user>\AppData\Local\fallow\similar-code`)
- **Linux**: `~/.cache/fallow/similar-code` (or `$XDG_CACHE_HOME/fallow/similar-code`)
- **macOS**: `~/Library/Caches/fallow/similar-code`

### Cache Directory Hierarchy:
```
<cache-root>/fallow/similar-code/
├── models/     # Pinned ONNX weights and tokenizer vocabulary files (~160MB)
└── vectors/    # SQLite/embedded vector index containing cached function embeddings
```

### Windows OS Error 3 Invariant (`ensureFallowCacheDirs`):
On Windows systems, Fallow's Rust runtime may fail with `os error 3: The system cannot find the path specified` if the parent directories do not exist prior to database initialization. `@francogp/auditor` and repository setup scripts (`setup-windows.ps1`, `setup-linux.sh`) pre-create both `models/` and `vectors/` subdirectories (`ensureFallowCacheDirs`) before invoking the CLI.
With the vector cache active, subsequent runs retrieve cached embeddings in ~1.9 seconds rather than ~230 seconds (a 90x speedup).

---

## 3. Workflow Steps

1. **Check Readiness & Setup**:
   Check model status with `fallow similar-code status --format json --quiet`. If the local model is not initialized, run:
   ```bash
   npx fallow similar-code setup --local --yes
   ```
   If automatic model setup fails during an audit run, `@francogp/auditor` displays a prominent Box-Drawing warning banner with this exact command and records `fallow-similar-code-failed` as a non-fatal warning (`severity: 'warning'`), leaving other suites unblocked.

2. **Run Discovery**:
   Preserve its independent JSON envelope so inspection and review use the exact candidate set:
   ```bash
   fallow similar-code --file src/services/api.ts --format json --quiet > similar-code.json
   ```

   In Node, call `detectSimilarCode({ files: ["src/services/api.ts"] })`. Over MCP, call standalone `find_similar_code` with `paths: ["src/services/api.ts"]`. Do not use Code Mode for similar-code because its 30-second window cannot accommodate documented cold inference. The standalone MCP tools have a dedicated 15-minute timeout.

3. **Inspect a Candidate**:
   Hand off the original raw discovery document so inspect selects that exact candidate without rerunning global retrieval or ranking:
   ```bash
   fallow similar-code inspect sc_example --candidates similar-code.json \
     --format json --quiet
   ```

   Over MCP, call standalone `inspect_similar_code` with `candidate_id` and a typed `snapshot` containing the unchanged discovery `schema_version`, `generation`, selected `candidate`, `completion`, and `diagnostics`. Treat `generation.scope.paths` as provenance, not as an argument list. Inspect re-extracts only the two snapshot endpoints, validates both current source hashes, and fails closed on stale source. Review source, callers, callees, tests, side effects, ownership, and missing evidence.

4. **Author a Verdict Document**:
   Keep the three axes independent. `refactor_safe: true` requires `behaviorally_equivalent: true`, which requires `candidate_worthy: true`. Use `null` for an undecided axis, use `needs-human-review`, and abstain when evidence is incomplete.

   ```json
   {
     "schema_version": "1",
     "verdicts": [
       {
         "candidate_id": "sc_example",
         "review_key": "scr_example",
         "candidate_worthy": true,
         "behaviorally_equivalent": false,
         "refactor_safe": false,
         "outcome": "related-but-distinct",
         "rationale": "Both normalize input, but only one preserves empty values."
       }
     ]
   }
   ```

5. **Join Candidates and Verdicts**:
   Join raw candidates and verdicts without changing either input:
   ```bash
   fallow similar-code review --candidates similar-code.json --verdicts verdicts.json \
     --require-verdict-for-each-candidate --format json --quiet
   ```

   Only `completion.status: "complete"` makes an empty candidate list conclusive for the admitted scope. Candidates remain advisory and unverified until the separate verdict flow supplies source-grounded judgment.

---

## 4. Specifically Defined Remote Deployments Only (Environment Variable Bypass)

In specifically defined remote CI pipelines, containerized environments, or GitHub Pages deployment workflows where downloading model weights is undesirable in headless ephemeral runners, set `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`). This cleanly bypasses vector semantic duplication checks with 0 errors without modifying `audit.config.ts`. There is NO CLI flag.

> [!CAUTION]
> **Strict Local Execution Mandate & Absolute Bypassing Prohibition**:
> AI agents and developers MUST NEVER set `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` or `AUDIT_SKIP_SIMILAR=1` during local development, interactive coding turns, bug triage, or local verification runs. In local environments, vector semantic duplication runs via Candle CPU in ~2s leveraging local disk caches. Running vector analysis locally is mandatory to catch semantic duplication before pushing code.

