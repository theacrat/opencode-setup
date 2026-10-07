# Standards

- Use TypeScript with Bun and no `any` types.
- Keep the installer small. Delegate vendor ownership and installation to oc-agent-plugins rather than duplicating its logic.
- Validate filesystem and configuration inputs before mutation. Preserve unrelated user configuration and never silently weaken trust or overwrite unmanaged packages.
- Use argument arrays for subprocesses, not shell interpolation. Support spaces in paths and Linux, macOS and Windows.
- Test observable CLI behaviour with isolated filesystem fixtures. Never write the developer's live OpenCode configuration from tests.
- Run lint, formatting and tests before committing. Keep comments only where they explain a non-obvious reason.
- Narrow compatibility exception: installer-owned immutable pstack/Matt staging may retrieve fixed upstream repositories and digest its adjusted source tree. Only the checked invalid pstack manifest and Matt's checked in-tree AGENTS.md link are adjusted. The adapter retains all installed snapshot, receipt, fingerprint, update and conflict ownership. Do not generalise this into another package manager.
