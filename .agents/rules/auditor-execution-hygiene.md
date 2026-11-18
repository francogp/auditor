# Auditor Execution Hygiene & Windows PowerShell Rules

These rules apply unconditionally on every task across all repositories governed by `@francogp/auditor`.

## 1. Windows PowerShell Command Chaining

- **Default: ONE command per `run_command` call.** Read its exit code and output before running the next command.
- **NEVER chain commands with unconditional `;` in PowerShell** (e.g. `npm run auditor:fix; npm run fmt; npm run build`). PowerShell `;` executes the next command even if the previous one failed.
- **NEVER use `&&` in Windows PowerShell** (syntax error in PowerShell 5.1).
- If chaining two commands in PowerShell is strictly necessary, guard explicitly:
  `cmd1 ; if ($LASTEXITCODE -eq 0) { cmd2 }`

## 2. Fast-Fail Verification Order & Zero-Redundancy

Verify from fastest to heaviest (`fmt ⊂ auditor:lint ⊂ auditor ⊂ auditor:full ⊂ build`):

1. **Iterative edits**: run `npm run auditor:lint` (or `npm run auditor task=<suiteId>` when fixing one failing suite).
2. **Never repeat included steps**:
   - `npm run auditor:fix` already formats — **never** follow it with `npm run fmt`.
   - `npm run auditor:lint` and `npm run auditor` already run `oxfmt` — **never** run `npm run fmt` before them.
   - `npm run test:coverage` already runs all tests — **never** run `npm test` before it.
   - `npm run build` already executes `auditor:full` (`oxlint`, `oxfmt`, `fallow`, `md`, `test_coverage`) + compile + `auditor:post-build` — **never** run `fmt`, `auditor:lint`, or `auditor` before or after `npm run build`.
3. **Inspection CLI**: use `npm run auditor:next` (or `npm run auditor:findings phase=setup`) without unnecessary `--`.
