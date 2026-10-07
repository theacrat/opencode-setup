# OpenCode V2 skill and agent-plugin installer

## Requirements

- Provide one cross-platform TypeScript script runnable with Bun on Linux, macOS and Windows.
- Use the sibling `./opencode-agent-plugins` checkout (relative to the parent of this repo by default) as the native V2 adapter and its package manager to install vendor packages globally.
- Install exactly 1Password (`1Password/cursor-plugin`), Cloudflare (`cloudflare/skills`), pstack (`theacrat/pstack-generic`, subdirectory `pstack`) and Matt Pocock (`mattpocock/skills`) as agent plugins. Do not install the entire pstack marketplace.
- Import other loose skills from sibling `./ai-config` as native skills, not agent plugins. Read only its data and skill contents; do not reuse its installer logic. Exclude skills supplied by the four selected plugin packages, including Matt Pocock and pstack source entries.
- Preserve complete skill resource directories and references. Prefer absolute native skill source paths rather than copying or flattening skill directories.
- Respect `OPENCODE_CONFIG_DIR`, then `XDG_CONFIG_HOME/opencode`, then `~/.config/opencode`; accept explicit adapter, ai-config and config-directory paths.
- Preserve unrelated existing JSON/JSONC settings and comments. Reject malformed configuration before mutations. Register the adapter once and add native skill paths without duplicates.
- Be repeatable without overwriting unmanaged or edited vendor snapshots. Use the adapter's ownership safeguards. Report partial failure honestly; never grant hook or monitor trust, store credentials, start OpenCode or connect MCP servers.
- Provide a no-write dry-run and useful help. Validate inputs before making changes; fail with a nonzero exit and actionable message.
- Document prerequisites, invocation, update behaviour, plugin namespaces, source-path portability and the upstream 1Password Windows runtime limitation.
- Verify via automated tests, lint and formatting, CI on all three OSes, and independent local Standards and Spec review loops. No PRs.

## Design

Represent selected vendor packages as a fixed typed registry. Let the existing adapter manager own Git retrieval, snapshots, receipts and conflict handling. Keep installer configuration editing and native skill source selection in this repo. Native paths retain the original resource hierarchy without importing ai-config's installation logic.

## Verification checkpoint

- Blocking first steps. Confirm V2 configuration and adapter CLI contracts before implementation.
- Independent workstreams. Implementation has one owner; Standards and Spec reviews run independently.
- Shared mutable state. Only the implementation owner writes source. Reviews are read-only. Tests use isolated temporary config directories.
- Smallest safe decomposition. One installer plus behavioural tests and documentation; do not reimplement package management.

## Contract checkpoint

- V2 `plugins` and `skills` are arrays. Local plugin registration uses the absolute adapter directory. Skill IDs are path-derived; a source-root `SKILL.md` has ID `SKILL`, so individual skill directories cannot be registered directly.
- Register one absolute filtered skill-view directory containing directory symlinks (junctions on Windows) to complete ai-config skill directories. Link names retain sources.json aliases. Never import the whole upstream parent, which would expose excluded skills.
- The adapter CLI uses `--global --json` and `OPENCODE_CONFIG_DIR`; inventory includes ownership receipts, source identity and fingerprint problems. Skip only healthy managed packages from the exact expected Git source; updates remain explicit manager operations.
- The manager requires a root plugin manifest, not just a marketplace. Matt Pocock currently supplies `.claude-plugin/plugin.json` at the marketplace root. pstack uses `--subdir pstack` only.
- Implementation and review are serial in this worker because nested delegation is prohibited. Independent Standards and Spec review remain a parent-session gate; local self-review is not represented as independent review.
