# Standards

- Use TypeScript with Bun and no `any` types.
- Keep the installer small. Delegate vendor ownership and installation to oc-agent-plugins rather than duplicating its logic.
- Pin the npm adapter dependency and OpenCode registration to the same version. Resolve the installed package's exported package.json and validated bin path; never use npx or download an adapter during setup. Local checkouts are opt-in through --adapter.
- Validate filesystem and configuration inputs before mutation. Preserve unrelated user configuration and never silently weaken trust or overwrite unmanaged packages.
- Use argument arrays for subprocesses, not shell interpolation. Support spaces in paths and Linux, macOS and Windows.
- Test observable CLI behaviour with isolated filesystem fixtures. Never write the developer's live OpenCode configuration from tests.
- Start tooling from thea-mode's complete TypeScript templates. Run `bun run check` before committing: type-aware, type-checking Oxlint (including warnings), Oxfmt and Vitest. Node >=24 loads the TypeScript tooling configs; Bun runs the installer and tests. There is no redundant tsc gate.
- Install hooks with `bunx lefthook install`. Commit messages must use conventional commits; the commit-msg hook and CI enforce this. Keep comments only where they explain a non-obvious reason.
- Narrow compatibility exception: installer-owned immutable pstack/Matt staging may retrieve fixed upstream repositories and digest its adjusted source tree. Only the checked invalid pstack manifest and Matt's checked in-tree AGENTS.md link are adjusted. The adapter retains all installed snapshot, receipt, fingerprint, update and conflict ownership. Do not generalise this into another package manager.

- Inline exceptions are limited to native Node imports required by the CLI/tests, the CLI's one-time environment capture and executable top-level await, and Node promisify's execFile callback typing. Keep the full template rules; do not disable rules to avoid fixes.
