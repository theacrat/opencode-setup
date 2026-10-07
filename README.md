# OpenCode V2 setup

Install four vendor packages through the pinned npm `oc-agent-plugins@0.2.2` manager, seven native upstream skills and bundled personal guidance. Requires Bun 1.4.2, Node 22.14 or newer and Git. No ai-config or adapter checkout is required. No credentials, hook/monitor trust, MCP connections or OpenCode startup are performed.

```sh
bun install
bun run setup --dry-run
bun run setup
```

Explicit paths work on Linux, macOS and Windows. Quote paths containing spaces.

```sh
bun run setup --config-dir "/isolated/opencode"
bun run setup --help
```

Configuration directory priority is `--config-dir`, non-empty `OPENCODE_CONFIG_DIR`, non-empty `XDG_CONFIG_HOME` plus `/opencode`, then `~/.config/opencode`. Both existing `opencode.json` and `opencode.jsonc` are validated before any mutation. JSONC comments, unrelated options and permissions are retained. If both exist, the existing adapter's document is edited, otherwise JSONC is preferred. An absent configuration becomes `opencode.jsonc`.

## Installed packages

| Repository                | Selection            | Skill namespace             |
| ------------------------- | -------------------- | --------------------------- |
| `1Password/cursor-plugin` | Root                 | `1password:<skill>`         |
| `cloudflare/skills`       | Root                 | `cloudflare:<skill>`        |
| `theacrat/pstack-generic` | `pstack` only        | `pstack:<skill>`            |
| `mattpocock/skills`       | Root plugin manifest | `mattpocock-skills:<skill>` |

The Matt Pocock root includes a plugin manifest with explicit nested skill paths. The manager does not expand marketplace-only packages. The pstack marketplace is not installed.

Two narrow upstream compatibility exceptions require immutable installer-owned staging under `<config-dir>/setup-sources`, outside vendor discovery. pstack's schema-less root `plugin.json` fails manager validation; staging omits only that file after checking its identity and valid Claude manifest. Matt Pocock's `AGENTS.md -> CLAUDE.md` link fails the manager's Git-link policy; staging materialises only that verified in-tree file link. Complete package resources are retained. Original manifests/link details, upstream Git revision and a content digest are recorded in `compatibility.json`. Neither sibling checkout nor an installed snapshot is edited. Stages are published by directory rename, and edited/unowned stages are rejected. Interrupted unpublished staging directories remain for inspection.

The adapter is registered as `oc-agent-plugins@0.2.2`. Setup resolves the installed npm package's exported package.json and CLI bin, without npx or runtime adapter downloads. Existing unversioned/versioned npm registrations and local paths whose package.json identifies `oc-agent-plugins` are replaced rather than duplicated. Existing object options and comments remain intact; unrelated local plugins are untouched. `--adapter "/path/to/opencode-agent-plugins"` optionally selects a built local checkout and registers its absolute directory for development. Existing local override registrations remain unchanged. No adapter-wide format overrides are added. With default options Cloudflare uses its canonical Agent Plugins manifest, staged pstack and Matt Pocock use Claude, and 1Password uses Cursor. Existing format/component overrides can intentionally suppress vendor features and are not changed by setup.

Vendor skill IDs and displayed names both use `<plugin>:<skill>`. Native loose skills keep their unprefixed aliases.

1Password's upstream runtime requires its desktop app and Labs MCP Server on macOS or Linux. It is **not supported on Windows**. Snapshot installation on Windows does not make that runtime usable.

## Native skills and repeat runs

The fixed registry selects `frontend-design` from `anthropics/skills`; `web-design-guidelines`, `vercel-react-best-practices` and `vercel-composition-patterns` from `vercel-labs/agent-skills`; and `property-based-testing`, `mutation-testing` and `sharp-edges` from `trailofbits/skills`. Complete repository trees, including shipped licence files and notices, are retained under `<config-dir>/setup-native-sources`, outside discovery. Git retrieval uses an isolated environment and empty hooks/templates. In-tree regular-file links are materialised with original targets recorded; escaping, cyclic, dangling or directory links and submodules fail closed. Git metadata is retained separately from the payload. `source.json` records the upstream revision and a version-3 length-framed digest of every payload entry, including dotfiles. Healthy snapshots are validated and reused without network access or overwriting local changes.

`skills/thea-mode` is the authoritative bundled local guidance, including its complete TypeScript templates. It has no remote update source. Bundled guidance and reference templates are preserved byte-for-byte, excluded narrowly from formatting and not treated as installer executable code by lint. No ai-config data or code is read at runtime; `--ai-config` is no longer accepted.

`<config-dir>/setup-native-skills` is a filtered directory of symlinks to complete original skill directories, or directory junctions on Windows. Its absolute path is registered in the V2 `skills` array. This preserves aliases such as `vercel-react-best-practices`, scripts, references and parent-relative resources without importing unselected siblings. V2 documents path-derived IDs; its documented source-root `SKILL` rule differs from observed 2.0.23 directory-derived IDs. The filtered parent view avoids relying on that discrepancy.

Keep this setup checkout at its registered location for bundled thea-mode. A local adapter override must also stay at its registered location. Existing native links are migrated only when the alias and target exactly match the previous known sibling `ai-config/sources/<origin>/<selected-path>` or `ai-config/personal/skills/thea-mode`. Even dangling known links can migrate, but arbitrary other paths and unmanaged entries are preserved and rejected. Replacement happens only after all native snapshots are ready; source checkouts are never removed. Move unexpected entries aside deliberately before rerunning.

Repeat runs skip only healthy managed snapshots whose receipt identifies the exact selected Git URL, with no explicit ref, or the exact owned local stage for pstack and Matt Pocock. Stage digests must also match. Disabled snapshots remain disabled. Edited, unmanaged, duplicate or source-conflicting packages cause an actionable failure. Missing packages are installed at the upstream default branch using manager ownership safeguards. Updates are **explicit**, not a side effect of setup:

```sh
npx oc-agent-plugins@0.2.2 info pstack --global
npx oc-agent-plugins@0.2.2 doctor --global
npx oc-agent-plugins@0.2.2 update pstack --global
```

For pstack and Matt Pocock, manager `update` only recopies the pinned local stage; it does not fetch upstream changes. For a deliberate upstream refresh, use manager `uninstall` for that package, preserve and move its corresponding `setup-sources/<name>` directory aside, then rerun setup. No automatic stage refresh is implemented. Native snapshots also stay pinned: preserve and move the relevant `setup-native-sources/<name>` directory aside deliberately to retrieve a new revision. Staging receipts use digest version 2 with length-framed paths, entry types, modes and file bytes. Older receipts are rejected rather than silently adopted; use the same deliberate refresh procedure.

No-write dry runs validate bundled guidance, existing source snapshots, config, link conflicts and manager inventory, and plan missing snapshots without retrieving upstream Git sources, including on first installation. They cannot prove future downloads or manifest compatibility. Installation failures retain earlier successful snapshots and unpublished scratch directories and report partial setup. Resolve the error and rerun. Configuration is written only after packages and links succeed. Do not run simultaneous setup processes or mutate the checkouts while setup is running. Offline repeat installation does not imply offline skill execution: web-design-guidelines, for example, fetches its external guidelines when used.

These explicit manager commands may download the pinned package through npx. Setup itself always uses the installed dependency, including dry runs. Adapter upgrades are deliberate changes to the exact dependency, lockfile and registration version, followed by checks and a setup rerun; vendor updates do not upgrade the adapter.

## Development

Development tooling requires Node >=24 to load the TypeScript configs; the installer manager still requires Node >=22.14. `bun run check` uses the complete thea-mode templates: Oxlint enforces type-aware lint, type checking and zero warnings, then Oxfmt and Vitest run. No separate tsc gate is needed. Hooks and CI also enforce conventional commit messages.

```sh
bun install --frozen-lockfile
bun run check
bunx lefthook install
```

The real manager integration runs against the installed npm package by default. `ADAPTER_TEST_DIR` optionally selects a built local adapter. Native discovery checks require an installed V2 binary. On PowerShell, set these environment variables with `$env:NAME = "value"` before running `bun run check`.

```sh
OPENCODE_TEST_BINARY=opencode bun run check
ADAPTER_TEST_DIR=../opencode-agent-plugins bun run check
```

Behavioural tests invoke the real installer CLI with temporary checkouts, local Git upstream fixtures and a manager CLI fixture. npm-default tests invoke the actual published manager with isolated configuration, install and rerun against local Git fixtures, migrate registrations while preserving options, and verify no-write dry runs with Git retrieval forbidden. They also cover comments, paths with spaces, exact vendor selection, aliases, resources, ownership conflicts, partial failure and disabled snapshots. CI runs lint, formatting, type checking and tests on Linux, macOS and Windows. The optional native test starts a temporary V2 server with isolated configuration and state, waits for skill activation, verifies the exact alias IDs and stops the child. It does not load vendor MCP servers. Earlier real upstream installation and rerun were verified on Linux with a local adapter override.
