# OpenCode V2 setup

Install the plugins and skills below on Linux, macOS or Windows. No `ai-config` checkout is needed.

## Install

You need **Bun 1.4.2 or newer**, **Node 22.14 or newer**, **Git** and **OpenCode V2**.

Run these commands from this repo:

```sh
bun install
bun run setup
```

To preview changes without downloading or writing anything:

```sh
bun run setup --dry-run
```

Setup installs globally and preserves your existing OpenCode settings. Running it again keeps healthy installations; it does not fetch updates.

Keep this repo where you installed it. OpenCode loads the bundled `thea-mode` skill from `skills/thea-mode`.

## Update

```sh
bun run update
```

This pulls fresh upstream versions of all four plugins and the seven downloaded skills. It leaves bundled `thea-mode` and the pinned `oc-agent-plugins` adapter version unchanged.

Use `bun run update --dry-run` to preview. Updates refuse to overwrite edited or unmanaged installations and print where previous source copies are backed up. Disabled plugins stay disabled.

## What's included

Plugins load through [`oc-agent-plugins`](https://github.com/theacrat/oc-agent-plugins), pinned to `0.2.2`:

| Plugin      | Source                                                                             | Skill prefix         |
| ----------- | ---------------------------------------------------------------------------------- | -------------------- |
| 1Password   | [1Password/cursor-plugin](https://github.com/1Password/cursor-plugin)              | `1password:`         |
| Cloudflare  | [cloudflare/skills](https://github.com/cloudflare/skills)                          | `cloudflare:`        |
| pstack      | [theacrat/pstack-generic](https://github.com/theacrat/pstack-generic), pstack only | `pstack:`            |
| Matt Pocock | [mattpocock/skills](https://github.com/mattpocock/skills)                          | `mattpocock-skills:` |

Loose skills keep their unprefixed names:

- `frontend-design` from [Anthropic](https://github.com/anthropics/skills).
- `web-design-guidelines`, `vercel-react-best-practices` and `vercel-composition-patterns` from [Vercel](https://github.com/vercel-labs/agent-skills).
- `property-based-testing`, `mutation-testing` and `sharp-edges` from [Trail of Bits](https://github.com/trailofbits/skills).
- `thea-mode`, carried in this repo with its templates. It has no remote source.

## After installation

OpenCode normally reloads the configuration automatically. Setup does not grant hook or monitor trust, change credentials or sign in to MCP servers.

- **Cloudflare:** if its MCP server asks for authentication, sign in through `/mcps`.
- **1Password:** install the desktop app, enable its Labs MCP Server and make `1password-mcp` available on your PATH. Its MCP and local secret mounts support macOS and Linux, not Windows.

## Options and troubleshooting

The default config directory is `~/.config/opencode`. `OPENCODE_CONFIG_DIR` takes precedence, followed by `XDG_CONFIG_HOME/opencode`. To choose another directory:

```sh
bun run setup --config-dir "/path/to/opencode"
bun run update --config-dir "/path/to/opencode"
bun run setup --help
```

If setup reports conflicting or edited files, preserve them and resolve the reported conflict before rerunning. Do not run setup and update at the same time.

If an update is interrupted, it may leave a lock or recovery journal. Inspect the reported paths and backups before removing anything. Some earlier updates may already have succeeded.

For package diagnostics:

```sh
npx oc-agent-plugins@0.2.2 doctor --global
```

## Development

Development checks require **Node 24 or newer**.

```sh
bun install --frozen-lockfile
bun run check
bunx lefthook install
```

Checks run strict type-aware lint, formatting and tests. Hooks and CI enforce conventional commits. To also test native skill discovery, set `OPENCODE_TEST_BINARY=opencode` before running checks.

`--adapter "/path/to/opencode-agent-plugins"` selects a local adapter checkout for development. Tests can use one through `ADAPTER_TEST_DIR`.

Implementation details are in [native skill sources](docs/native-skill-sources.md) and [upstream updates](docs/update-sources.md).
