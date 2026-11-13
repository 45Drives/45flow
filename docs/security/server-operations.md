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
| `HB_HOST_SOCKET` (staged, opt-in) | Routes supported privileged host administration through the installed restricted host broker. |
| `HB_CREDENTIAL_SOCKET` (staged, opt-in) | Isolates the provider master key in the credential broker; unavailable brokers fail closed. |
| `ENFORCE_ADMIN_NETWORKS` (staged, opt-in) | `1` applies the root-managed nginx staff CIDRs to direct backend staff requests too. Configure and verify the readable allow file first; see the [network guide](deployment-network.md#staff-networks-and-proxies). |
| Admin Networks | nginx staff-access policy; separate from the backend firewall, account approval, SSH and Cockpit. |

### Dedicated service account: preparation only

The staged installer prepares a locked, non-login Unix account and exclusive
group named `houston45`, shared by Broadcaster's application modules. Earlier
staged deployments used `flow45`; renaming requires the stopped-service procedure
below, not a second account or a recursive ownership change. This account is
not the administrator enrollment group and must not be granted sudo, SSH or
Cockpit access.

Preparation preserves existing file owners and does not automatically grant
storage access or change the running service's UID. Conflicting existing
accounts or extra group membership cause an explicit error. Do not remove the
reserved service account during rollback while files may still refer to its UID.

### Controlled privilege migration

This remains an administrator-controlled B1 stage, not an automatic package
upgrade. Do not enable it by changing only `User=`.

1. Install and verify all three broker services and their `root:houston45`,
   mode-`0660` sockets. Keep their executables, units, parent directories and
   host configuration root-owned and not writable by the application account.
   Installation must not copy developer ownership onto system directories.
2. Stop or finish active transfers, retain independent recovery access and arm
   a timed rollback. Stop the main service before copying application state or
   finalizing storage grants; a still-running root process can create new
   private files after an earlier ACL grant.
3. On a supporting release, run the packaged
   `scripts/prepare-service-state.cjs --prepare` as root. It prepares selected
   SQLite databases and signing/license state under `/var/lib/45flow`, preserving
   originals. Conflicting, incomplete or changed preparation requires operator
   review; do not erase it and silently retry.
4. Use root-controlled service environment overrides for the prepared database,
   signing/license, branding, log and quarantine paths, plus all three broker
   sockets. Keep the provider master key in its root-only original location.
   `UPLOAD_BASE` is a URL setting, not a private staging directory.
5. Apply a reviewed systemd drop-in using `User=houston45`, `Group=houston45`,
   `UMask=0077`, no capabilities, `NoNewPrivileges`, a read-only system,
   protected home directories and private temporary storage. Writable paths
   must be limited to application state and the site's approved shares.
   Hide original shared databases and the provider master key from the main
   service. Start/order broker sockets with `Wants` and `After`; a broker outage
   must deny the affected operation without stopping unrelated application APIs.
6. Verify the actual process UID/capabilities, database file descriptors and
   mount namespace—not just the unit text or environment. Exercise real
   browsing, upload completion and antivirus scanning, recipient/media
   workflows, staff authorization and required host operations.
7. Perform an actual rollback and reapplication before disarming recovery.
   Confirm both versions use the authoritative migrated databases and preserve
   forward writes and signing secrets.

Once migrated state has been used, a root rollback must retain its environment
and database paths. Restoring an old database snapshot would lose newer writes.
Files created by the temporary root rollback may require a fresh journaled ACL
grant before returning to the application account; restore application-state ownership while
stopped, without changing customer-file owners. Keep original state and protected
recovery journals until the release-specific upgrade procedure permits removal.

These source-stage instructions do not certify every package upgrade, older
database schema, storage-wizard integration or external deployment.

### Rename an existing staged service account

On a supporting release, `scripts/ensure-service-account.cjs --rename-offline`
renames the reserved `flow45` account/group to `houston45` while preserving their
numeric UID/GID. Run it as root only in a maintenance window with independent
SSH/Cockpit access and timed recovery.

1. Preserve the installed bundle, unit definitions, drop-ins and configuration.
   Stop the main service, all three broker services and their sockets. Stop any
   bootstrap operation; no process may still use the old application UID.
2. Run the explicit offline rename helper. Account/group collisions, unexpected
   memberships and unsafe existing identities must be resolved, not bypassed.
3. Install the matching unit/socket/account definitions and update reviewed
   drop-ins to use `houston45`. Do not move authoritative databases, signing
   secrets, homes or customer files solely to change the account name.
4. Reload systemd, start the broker sockets and main service, and verify the
   actual UID/GID, empty capabilities, database descriptors and application
   workflows. Named ACLs should resolve to the new name with unchanged numeric
   IDs and effective access.
5. For rollback, stop the same services/sockets, use the helper's
   `--rollback-rename-offline` procedure, restore the saved matching unit/bundle
   configuration, reload systemd and verify both applications. Keep authoritative
   migrated state; do not restore stale databases.

### Shared application profiles

Broadcaster remains one service. App registration is additive: Storage Wizard,
45Flow, or both. Installing the second application must not replace the first
application's registration, databases, account or site network policy.

Storage Wizard-only operation does not activate 45Flow file/media routes or
transcode work. Its storage-management tools continue to use the applicable
SSH/Cockpit privilege checks. Shared API authentication and restricted root
helpers do not make the HTTP process an administrator.

Registration and dependency setup are distinct from approval of a site's TLS,
domain and public-access configuration. Adding 45Flow to a Storage Wizard-only
deployment still requires the guarded initial public-sharing setup. An
unverified nginx/TLS configuration must not be bypassed to complete registration.

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

The staged service-access migration uses explicit named POSIX ACLs, not recursive
ownership changes. It preserves existing users' effective access even when an ACL
mask must expand. Existing inherited ACLs can include the service account, but
directories without default ACLs keep their current creation policy unless the
site explicitly approves a change. New files created by another account may
therefore need an explicit service-access grant; do not silently override umasks
or widen group/other access to hide a permission failure. Keep the protected ACL
journal for rollback, and review any entries changed since migration rather than
overwriting newer site policy.

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

### Storage Wizard backup-client authentication

With Storage Wizard registered, a valid PAM login that supplies a client
installation ID can receive a backup-only token when the account is not approved
staff. Such tokens can manage only that authenticated user's and installation's
backup configurations and execution reports. They cannot access 45Flow,
staff settings, setup logs, privileged audit reporting, browser sessions or the
staff token-refresh endpoint. Requests remain subject to the existing network
policy; enabling this contract does not add allowed networks.

A valid PAM account need not have an interactive shell for backup-only access.
Samba-only passwords are not automatically PAM credentials: this stage does not
add a separate Samba password-verification backend. Accounts sharing the same
PAM credentials and known installation ID share that API identity; the ID is not
physical-device attestation.

Historical configurations/events without verified user ownership remain
staff-only. An approved staff caller can explicitly assign a configuration with
`PUT /api/storage-wizard/backup-configs/<uuid>?all=true`, providing both
`owner_user` and `client_id`. Historical events are retained staff-only; new
reports use verified user/client ownership. Do not infer ownership from the
old `smb_user` field or delete records to make synchronization succeed.

Update Storage Wizard before testing scheduled reporting. Previously generated
Linux/macOS/Windows scripts omitted the installation ID at login. The updated
client's existing script-version refresh regenerates these scripts on startup
and applicable run paths without recreating schedules or credentials. Verify the
refresh succeeded; do not delete working backup definitions to force it. Backup reporting
remains best-effort and does not prove a backup completed.

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

For staged B1 firewalld upgrades, verify backend-port restrictions in both runtime
and permanent policy across all configured zones. The installer adds rejection
rules without opening otherwise closed zones; it does not replace site firewall
review. Preserve the matching firewall helper and its protected change journal
when applying this stage manually. Its rollback removes only journaled additions,
not unrelated policy. Verify management access and backend isolation after both
upgrade and rollback; rolling back deliberately restores the previous exposure.
Reconcile the restriction when adding zones or changing the backend port.

If validation fails, use the saved package/configuration recovery procedure for
that release. Do not assume an older executable can read a newer database schema.
Database restoration requires a stopped-service, consistent recovery procedure
and matching protected keys; do not automatically overwrite live data or loosen
permissions.

### Optional PAM broker stage

Only after installing a server package containing the staged broker and units:

1. Reload systemd unit definitions and enable/start
   `houston-broadcaster-pam.socket`. Verify its socket is root-owned with mode
   `0660` and group `houston45` after account preparation; only the service belongs
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

- The packaged main unit remains root until the controlled privilege migration
  is completed. An optional PAM broker alone is insufficient; changing only
  systemd `User=` is not a supported migration.
- Staged descriptor-relative share operations require the packaged native
  helper and Linux `openat2` support. An unavailable boundary fails closed,
  rather than falling back to ordinary path-based operations. This confines
  share-path resolution; it is not a general subprocess or hostile-host sandbox.
- Share-media inputs use pinned descriptors and an explicit protocol/demuxer
  allowlist. External-reference MOV files and HLS/DASH/concat playlist inputs
  are rejected. Generated HLS output is not prohibited. Formats outside the
  supported input allowlist require a compatibility review before upgrading.
- Private-network defaults are not a substitute for reviewing every interface
  and firewall zone. nginx alone does not cover direct 9095: enable and verify
  the staged backend network guard for equivalent staff admission. Neither
  policy covers SSH, Cockpit or Samba access.
- Local test results do not prove Internet isolation, correct router/gateway
  policy or a trusted certificate chain. A license gate does not replace access
  control.

Keep site-specific test output and recovery commands private. Public release
summaries must state exact versions, validation scope and untested areas.
