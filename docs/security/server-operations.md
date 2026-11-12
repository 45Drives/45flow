# Server configuration, upgrades and rollback

[Security guides](README.md) | [Network guide](deployment-network.md) |
[Credential handling](credentials.md)

Use a maintenance window, preserve working SSH/Cockpit access, and check the
installed server's release notes. The explicit storage-root, staff-group and PAM
broker controls below are [staged B1 changes](README.md#version-and-release-scope),
not a promise that an older server package implements them.

## Configuration ownership

Service environment overrides normally live in
`/etc/default/houston-broadcaster` on Debian/Ubuntu and
`/etc/sysconfig/houston-broadcaster` on Rocky. The service loads both when they
exist; the latter takes precedence for duplicate keys. Check both before editing
and keep deliberate overrides consistent. Do not assume a client update changes
server policy.

| Setting or control | Meaning |
|---|---|
| `ROOT_DIR` (staged) | Existing, approved, non-root storage directory. |
| `ADMIN_GROUP` (staged) | Approved local staff group; default `houston-broadcaster-admins`. |
| `REQUIRE_ADMIN_GROUP` (staged) | `1` enables the group requirement; staged default `0` preserves existing access until enrollment. |
| `HOST` | Backend bind address; normally `0.0.0.0`, optionally `127.0.0.1` after compatibility checks. |
| `HB_PAM_SOCKET` (staged, opt-in) | Enables verification through the installed private PAM broker rather than direct PAM. Configure only after the broker is installed and verified. |
| Admin Networks | nginx staff-access policy; separate from the backend firewall, account approval, SSH and Cockpit. |

### Dedicated service account: preparation only

The staged installer prepares a locked, non-login Unix account and exclusive
group named `flow45`. The product name remains 45Flow; the Unix name starts with
a letter for compatibility with the supported account manager. This account is
not the administrator enrollment group and must not be granted sudo, SSH or
Cockpit access.

Preparation preserves existing file owners and does not automatically grant
storage access or change the running service's UID. Conflicting existing
accounts or extra group membership cause an explicit error. Do not remove the
reserved service account during rollback while files may still refer to its UID.

## Approve storage, then select projects

The approved root is the top-level area 45Flow may use, not an individual
project. For a ZFS installation, choose the intended pool/dataset mount. Without
a pool, an administrator can provision a directory such as `/srv/45flow` on
suitable storage. Neither the first discovered pool nor `/` is a safe automatic
fallback.

Project directories sit below that root, for example
`/srv/45flow/project-a` and `/srv/45flow/project-b`. Selecting a project in the
application must not widen the host-approved storage boundary.

With the staged boundary enabled, file workflows fail closed without a usable
explicit root. Existing installations relying on an implicit `/` must configure
their intended storage before upgrading to a release enforcing this rule.
Absolute paths must remain inside the approved storage. Symlinks pointing outside
it are rejected; internal symlinks are permitted. Legacy `fromRoot=1` browsing
means the approved storage root, not the host filesystem root.

Do not recursively change customer-file ownership to make an error disappear.
Verify the mount, permissions and required service access first. Upload staging,
application state and private service configuration are not additional
customer-selectable storage roots.

## Enroll staff before enforcing a group

On a release supporting the group control:

1. Identify approved PAM accounts and retain independent SSH/Cockpit recovery
   access. Create the intended local staff group if it does not exist.
2. Enroll the approved accounts and verify their group membership on the host.
3. Set `ADMIN_GROUP` as needed and `REQUIRE_ADMIN_GROUP=1` in the active service
   environment. Restart Broadcaster during the maintenance window.
4. Verify an enrolled account can sign in and use required workflows, while a
   non-member is denied. Membership checks also apply to already-issued tokens.

This requirement covers authenticated staff API access, not only endpoints named
"admin". Recipient links retain their separate access rules. If membership
cannot be verified, access is denied; do not treat a lookup failure as approval.

For rollback, restore `REQUIRE_ADMIN_GROUP=0` and restart Broadcaster. That
deliberately restores legacy account access, so keep the network restrictions
in place and verify recovery before removing any group or enrollment.

## Upgrade and rollback checklist

Before upgrading:

- Record installed server/client versions, ports, storage mounts, configuration
  and required integrations in private operational records.
- Preserve the current packages and configuration, including nginx policy and
  certificate references. Take consistent SQLite backups, not uncoordinated
  copies of open database/WAL files.
- Back up provider keys separately from encrypted data, and protect TLS private
  keys and session-signing secrets. Follow the [credential recovery contract](credentials.md#key-backup-rotation-and-recovery).
- Arrange a tested recovery path and stop or finish active transfers before a
  service restart.

After upgrading, verify service health, real staff sign-in, an allowed and a
denied account/network, approved and rejected file paths, representative
upload/download/transcode workflows, and intended recipient links. Check SSH and
Cockpit independently. Validate nginx configuration before a reload; preserve
customer-edited allowlists and deployed certificate/port settings.

If validation fails, use the saved package/configuration recovery procedure for
that release. Do not assume an older executable can read a newer database schema.
Database restoration requires a stopped-service, consistent recovery procedure
and matching protected keys; do not automatically overwrite live data or loosen
permissions.

### Optional PAM broker stage

Only after installing a server package containing the staged broker and units:

1. Reload systemd unit definitions and enable/start
   `houston-broadcaster-pam.socket`. Verify its socket is root-owned with mode
   `0660` and group `flow45` after account preparation; only the service belongs
   in this group. The earlier root-only PAM stage used `0600`. Do not grant
   access to unrelated users.
2. Set `HB_PAM_SOCKET=/run/houston-broadcaster-pam/auth.sock` in the active service
   environment and restart Broadcaster.
3. Verify real staff sign-in and file workflows, plus independent SSH/Cockpit
   access. During controlled acceptance, verify a broker outage denies login
   and that restoring it restores login. Keep independent recovery access open.

An unavailable configured broker denies login rather than silently falling back.
Package installation does not opt existing deployments into this stage.
To revert it, restore the previous configuration/bundle as appropriate, remove
`HB_PAM_SOCKET`, restart Broadcaster and verify login before disabling the broker
socket and service. This does not change host PAM, SSH or Cockpit configuration.

## Operating limits

- The main service still requires root for supported host-management workflows.
  An optional PAM broker alone does not make the application unprivileged.
  Changing only systemd `User=` is not a supported migration.
- Path validation is not atomic filesystem isolation. Do not rely on it as a
  sandbox against hostile local users changing share paths concurrently.
- Private-network defaults are not a substitute for reviewing every interface
  and firewall zone. The nginx policy does not cover direct 9095, SSH, Cockpit or
  Samba access.
- Local test results do not prove Internet isolation, correct router/gateway
  policy or a trusted certificate chain. A license gate does not replace access
  control.

Keep site-specific test output and recovery commands private. Public release
summaries must state exact versions, validation scope and untested areas.
