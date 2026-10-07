# Self-contained native skill sources

Replace the ai-config checkout dependency with a fixed upstream source registry and bundled personal guidance.

## Source registry

- `frontend-design` comes from `anthropics/skills`, directory `skills/frontend-design`.
- `web-design-guidelines`, `vercel-react-best-practices` and `vercel-composition-patterns` come from `vercel-labs/agent-skills`, using `skills/web-design-guidelines`, `skills/react-best-practices` and `skills/composition-patterns`.
- `property-based-testing`, `mutation-testing` and `sharp-edges` come from `trailofbits/skills`, using each matching `plugins/<name>/skills/<name>` directory.
- `thea-mode` is bundled at `skills/thea-mode`, including all supporting templates. This local copy is authoritative and has no remote update source.

## Contract

Download upstream repositories into installer-owned snapshots outside plugin discovery. Record upstream revision and integrity; repeat runs must validate and reuse healthy snapshots without network access or overwriting edits. Keep complete source resource hierarchies, aliases and licence attribution. Never import extra upstream skills or convert these skills to plugins.

Remove the runtime ai-config dependency and `--ai-config` option. Dry-run must neither download sources nor write files, including on first installation. Validate existing destinations before mutation. Fail honestly after partial downloads and allow a safe rerun.

Migrate existing native view links only when they exactly match the previous known ai-config source paths and aliases. Preserve unexpected, edited or unmanaged view entries; never delete source checkouts. Replace known legacy links only after all new sources are ready. The four agent plugins, compatibility stages, unrelated config and trust settings remain unchanged.

Use the strict thea-mode tooling already adopted. Verify CLI behaviour with offline Git fixtures, exact native alias discovery, repeat runs, malformed/edited snapshots, legacy-link migration and dry-run safety. Independent local Standards and Spec reviews remain required; no PR.

## Throughput checkpoint

- Blocking first steps. Capture the selected upstream paths and full bundled thea-mode tree before implementation.
- Independent workstreams. One owner implements the coupled download and migration flow; read-only reviews run separately.
- Shared mutable state. Tests use isolated config directories; only the implementation owner writes code.
- Smallest safe decomposition. A typed source registry and owned source snapshots extend native-skill installation, not a general package manager.
