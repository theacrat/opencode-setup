# Pull upstream updates

Provide `bun run update`, backed by an explicit installer update mode. Installation remains network-free for existing healthy snapshots; update intentionally fetches fresh revisions.

- Refresh all three native source repositories and all four selected vendor plugins from their recorded upstream repositories. Refresh pstack and Matt's compatibility stages before invoking the adapter's managed update so it does not merely copy an old local stage.
- Bundled thea-mode has no remote source and must not be fetched or overwritten. The npm adapter pin is a separate deliberate dependency upgrade, not a vendor source update.
- Validate every existing snapshot, managed receipt, disabled state, native link and configuration before any mutation. Edited, unmanaged and source-conflicting installations must fail without losing user changes. Disabled plugins stay disabled.
- Acquire and validate replacements privately, then publish with rollback/backup handling for interrupted or failed refreshes. Never uninstall a healthy package merely to update it. Preserve prior usable snapshots when retrieval or compatibility validation fails; report partial completion honestly when independent updates already succeeded.
- Update dry-run makes no writes or retrievals and reports which upstream sources would be fetched. Missing packages can be installed safely as part of update.
- Preserve aliases, complete resources, licences, unrelated config, permissions and credentials. No automatic hook trust, MCP sign-in or server restart.
- Tests must advance local Git fixture commits, run update, assert new revision and resource contents in native and vendor installs, preserve thea-mode and disabled state, and exercise edited-install refusal, acquisition/manager failure recovery and no-write dry-run. Keep strict lint/format/hooks and independent local Standards/Spec reviews. No PR.
