# OpenCode V2 skill and agent-plugin installer

## Requirements

- Provide one cross-platform TypeScript script runnable with Bun on Linux, macOS and Windows.
- Use the exact production dependency `oc-agent-plugins@0.2.2` as the native V2 adapter and its package manager to install vendor packages globally. Resolve its exported package.json to locate the installed CLI without npx or runtime downloads. `--adapter PATH` remains an optional built local checkout override. Vendor skill IDs and displayed names both use their plugin prefix.
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

- V2 `plugins` and `skills` are arrays. Default plugin registration uses `oc-agent-plugins@0.2.2`; the explicit local override uses its absolute directory. Recognise unversioned and versioned npm registrations, retain object options, and migrate the known former sibling path when using the default. Reject duplicate registrations. Skill IDs are path-derived. Documentation describes source-root `SKILL.md` as `SKILL`, but isolated V2 2.0.23 runtime probes derive the directory ID. Use a filtered parent view to preserve aliases without relying on this discrepancy.
- Register one absolute filtered skill-view directory containing directory symlinks (junctions on Windows) to complete ai-config skill directories. Link names retain sources.json aliases. Never import the whole upstream parent, which would expose excluded skills.
- The adapter CLI uses `--global --json` and `OPENCODE_CONFIG_DIR`; inventory includes ownership receipts, source identity and fingerprint problems. Skip only healthy managed packages from the exact expected Git source or approved pinned compatibility stage; updates remain explicit manager operations.
- The manager requires a root plugin manifest, not just a marketplace. Matt Pocock currently supplies `.claude-plugin/plugin.json` at the marketplace root. pstack uses `--subdir pstack` only.
- Implementation and review are serial in this worker because nested delegation is prohibited. Independent Standards and Spec review remain a parent-session gate; local self-review is not represented as independent review.
- Real manager installation into `/tmp/opencode/setup-integration-20261007` installed 1Password and Cloudflare, then rejected pstack's root `plugin.json` for a missing `$schema`. Runtime format fallback does not affect manager metadata validation. This is an upstream integration blocker, not a passing end-to-end gate.
- Compatibility exception approved during integration. pstack and Matt Pocock use immutable installer-owned local staging receipts instead of Git receipts. Omit only pstack's checked invalid root manifest and materialise Matt's verified `AGENTS.md -> CLAUDE.md` link. Store revision, adjustment and digest outside discovery. Manager still owns installed snapshots. Explicit stage refresh requires uninstall and moving the old owned stage aside. With these exceptions the real four-package installation succeeds.
- Real repeat setup skipped all four healthy packages. Adapter `inspect --no-agent-plugins` loaded all four installed snapshots, 99 skills and two pstack agents, with only expected untrusted 1Password hook warnings. Native fixture discovery passes separately without loading vendor MCP servers.
- Local `ADAPTER_TEST_DIR=../opencode-agent-plugins OPENCODE_TEST_BINARY=opencode bun run check` passes 17 tests, lint, formatting and TypeScript. The native V2 2.0.23 integration waits for asynchronous activation and discovers precisely the three fixture aliases, with built-in skills excluded from the assertion. Windows junction creation and rerun checks run in the CI fixture suite; actual Windows native discovery is not locally verified.
- Final fresh real-manager installation at `/tmp/opencode/setup-final-integration-20261007` succeeded for all four vendors with unchanged default adapter format settings. Compatibility Git subprocesses use an empty global config, isolated home, empty hooks/template and a minimal environment; fixture Git replacements live only in test PATH wrappers.
