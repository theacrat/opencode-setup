# OpenCode V2 setup

Install four vendor packages through the sibling `oc-agent-plugins` manager and selected loose skills from sibling `ai-config`. Requires Bun 1.4.2, Node 22.14 or newer, Git, and populated local checkouts. No credentials, hook/monitor trust, MCP connections or OpenCode startup are performed.

```sh
cd ../opencode-agent-plugins
bun install
bun run build
cd ../opencode-setup
bun install
bun run setup --dry-run
bun run setup
```

Explicit paths work on Linux, macOS and Windows. Quote paths containing spaces.

```sh
bun run setup --adapter "/path/to/opencode-agent-plugins" --ai-config "/path/to/ai-config" --config-dir "/isolated/opencode"
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

The adapter is registered by absolute directory. Existing adapter options remain intact; no adapter-wide format overrides are added. With default options Cloudflare uses its canonical Agent Plugins manifest, staged pstack and Matt Pocock use Claude, and 1Password uses Cursor. Existing format/component overrides can intentionally suppress vendor features and are not changed by setup.

1Password's upstream runtime requires its desktop app and Labs MCP Server on macOS or Linux. It is **not supported on Windows**. Snapshot installation on Windows does not make that runtime usable.

## Native skills and repeat runs

Read only `sources.json` data and skill contents from ai-config. Resolve source-root-relative or checkout-relative paths, plus `personal/skills`. Selected plugin origins, including `sources/mattpocock-skills` and `plugins/pstack`, are excluded. No ai-config installer code is used.

`<config-dir>/setup-native-skills` is a filtered directory of symlinks to complete original skill directories, or directory junctions on Windows. Its absolute path is registered in the V2 `skills` array. This preserves aliases such as `vercel-react-best-practices`, scripts, references and parent-relative resources without importing unselected siblings. V2 documents path-derived IDs; its documented source-root `SKILL` rule differs from observed 2.0.23 directory-derived IDs. The filtered parent view avoids relying on that discrepancy.

Keep ai-config and the adapter at the registered absolute locations. Moving either checkout requires updating the configuration and rebuilding the skill view. Changed or stale view entries are rejected, never removed automatically. Move the old view aside deliberately before rerunning. Native source contents remain live; vendor snapshots do not.

Repeat runs skip only healthy managed snapshots whose receipt identifies the exact selected Git URL, with no explicit ref, or the exact owned local stage for pstack and Matt Pocock. Stage digests must also match. Disabled snapshots remain disabled. Edited, unmanaged, duplicate or source-conflicting packages cause an actionable failure. Missing packages are installed at the upstream default branch using manager ownership safeguards. Updates are **explicit**, not a side effect of setup:

```sh
node ../opencode-agent-plugins/dist/cli.js info pstack --global
node ../opencode-agent-plugins/dist/cli.js doctor --global
node ../opencode-agent-plugins/dist/cli.js update pstack --global
```

For pstack and Matt Pocock, manager `update` only recopies the pinned local stage; it does not fetch upstream changes. For a deliberate upstream refresh, use manager `uninstall` for that package, preserve and move its corresponding `setup-sources/<name>` directory aside, then rerun setup. No automatic stage refresh is implemented. Native content stays live; compatibility stages and vendor snapshots stay pinned. Staging receipts use digest version 2 with length-framed paths, entry types, modes and file bytes. Older receipts are rejected rather than silently adopted; use the same deliberate refresh procedure.

No-write dry runs validate config, sources, link conflicts and manager inventory but do not retrieve upstream Git sources. They cannot prove future downloads or manifest compatibility. Installation failures retain earlier successful snapshots and report partial setup. Resolve the manager error and rerun. Configuration is written only after packages and links succeed. Do not run simultaneous setup processes or mutate the checkouts while setup is running.

## Development

```sh
bun install --frozen-lockfile
bun run check
bunx lefthook install
```

Optional integration checks require an installed V2 binary or the built sibling adapter. On PowerShell, set these environment variables with `$env:NAME = "value"` before running `bun run check`.

```sh
OPENCODE_TEST_BINARY=opencode bun run check
ADAPTER_TEST_DIR=../opencode-agent-plugins bun run check
```

Behavioural tests invoke the real installer CLI with temporary checkouts, local Git upstream fixtures and a manager CLI fixture. They cover comments, paths with spaces, exact vendor selection, aliases, resources, ownership conflicts, partial failure, disabled snapshots and dry-run safety. CI runs lint, formatting, type checking and tests on Linux, macOS and Windows. The optional native test starts a temporary V2 server with isolated configuration and state, waits for skill activation, verifies the exact alias IDs and stops the child. It does not load vendor MCP servers. Real upstream installation and rerun were verified on Linux with the sibling adapter.
