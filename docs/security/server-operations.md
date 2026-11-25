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

On builds with the audit export safeguard, an export is refused if its audit
record cannot be written. Check the Broadcaster logs and audit database storage,
resolve the write failure, then retry; no export file is provided on failure.

The audit history includes sign-ins and sessions, access and administrative
changes (including staff-group changes through 45Flow), review decisions and
approver changes, and recorded transfer activity. Group changes made directly
outside 45Flow require separate operating-system audit monitoring.
For staff-group requests, a requested entry without a changed entry does not
prove whether membership changed: the host broker may have failed after the
operating-system change. Check current membership and the host-broker journal.
Completed share uploads include file and version IDs; ZIP downloads record each
identified file and whether the archive response completed. An incomplete ZIP
record does not prove which individual bytes reached the recipient. Denied
requests and repeated desktop stream requests are rate-limited in the audit
trail, so individual repeated requests are not all represented as separate rows.
Retained records survive deletion of the share's own activity history.
Hash-chain verification detects changes to retained records, but a sufficiently
privileged server operator can rewrite the whole chain. An independently
administered collector provides a separate copy for comparison.

On builds with packaged storage setup, root-owned `flow45-state.env` and then
`storage.env` under `/etc/45drives/houston-broadcaster/` are loaded afterwards.
They select isolated application state and the approved storage root. Use the
Storage setup screen to change that root: editing only the legacy environment
files does not update the systemd writable-path grant.

| Setting or control | Meaning |
|---|---|
| `ROOT_DIR` (staged) | Existing, approved, non-root storage directory. |
| `ADMIN_GROUP` (staged) | Approved local staff group; default `houston-broadcaster-admins`. |
| `REQUIRE_ADMIN_GROUP` (staged) | `1` enables the group requirement. Packaged-setup builds enable it and enroll root; earlier staged builds default to `0` until enrollment. |
| `HOST` | Backend bind address; normally `0.0.0.0`, optionally `127.0.0.1` after compatibility checks. |
| `HB_PAM_SOCKET` (staged) | Enables verification through the installed private PAM broker rather than direct PAM. Packaged setup configures it; older builds require verified manual configuration. |
| `HB_HOST_SOCKET` (staged) | Routes supported privileged host administration through the installed restricted host broker; configured by packaged setup. |
| `HB_CREDENTIAL_SOCKET` (staged) | Isolates the provider master key in the credential broker; configured by packaged setup and unavailable brokers fail closed. |
| `ENFORCE_ADMIN_NETWORKS` (staged, opt-in) | `1` applies the root-managed nginx staff CIDRs to direct backend staff requests too. Configure and verify the readable allow file first; see the [network guide](deployment-network.md#staff-networks-and-proxies). |
| Admin Networks | nginx staff-access policy; separate from the backend firewall, account approval, SSH and Cockpit. |

### Security alert emails

In **Settings → Email**, configure **Security alert emails** separately from
review and download alerts. SMTP must be configured and enabled. Existing
security alert rules include repeated failed sign-ins, forbidden requests,
selected administrative changes, malware or scanner failures, and audit-chain
breaks. Forbidden-request alerts are limited to one every ten minutes; consult
the audit log for other requests.

The server queues one message per configured recipient and retries unconfirmed
sends. A timeout or restart can result in a duplicate; SMTP acceptance does not
prove delivery to the mailbox. Pending messages are shown in settings. Check the
service logs and SMTP configuration if they remain pending. Removing an address
removes its queued messages, although a send already in progress may complete.
Alerts that cannot be recorded because the audit database is unavailable cannot
be queued there; monitor audit-write failures independently.

### Audit forwarding

Set `AUDIT_SYSLOG_HOST` to a trusted syslog collector to forward audit events.
`AUDIT_SYSLOG_PROTOCOL` selects `udp` (default) or `tcp`; `AUDIT_SYSLOG_PORT`
defaults to 514 and `AUDIT_SYSLOG_FACILITY` to local0 (16). TCP uses RFC 6587
octet-counted frames. Restart Broadcaster after changing its environment, and
confirm receipt at the collector. The connection is not encrypted; use a trusted
network or a secure tunnel.

Monitor the service journal or operations log for `audit.forward.failed`.
TCP connection errors, write errors and a full 1,000-event queue are reported;
UDP local send errors are reported too. Forwarding is best effort: the queue is
in memory, events may be lost on overflow, disconnection or restart, and a
successful local send or connection does not confirm collector receipt.
`audit.forward.transport_recovered` reports transport recovery, not delivery.

### Packaged service account and first-run storage setup

Supporting builds now install the service sandbox, not just its preparation
helpers. The installer stops Broadcaster, snapshots selected application state
under `/var/lib/45flow`, preserves signing keys and original databases, and
generates the state environment. It never refreshes that state from an old
legacy database after activation.

The packaged main process runs as `houston45` without capabilities. All three
broker sockets are ordered before it. With no approved storage root, file APIs
remain unavailable until an administrator completes Storage setup. A pre-existing
valid root is preserved together with a matching systemd writable-path grant.
Customer-file ownership is not recursively changed; filesystem access for the
service account must be granted by the storage administrator.

The staff group requirement is enabled for packaged setup. Root is enrolled to
allow first-run administration; manage other existing local users through
**Staff server accounts**. These are server accounts, not recipient-link accounts.
An administrator's custom service overrides remain their responsibility.

Migration errors stop activation rather than falling back to a root service or
stale database. Keep independent SSH/Cockpit access and review the private
migration manifest before retrying. These changes remain subject to the
release-specific package acceptance checks.

### Earlier staged builds: preparation only

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

For earlier staged builds without packaged activation, use this
administrator-controlled procedure. Do not enable it by changing only `User=`.

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
   The packaged unit orders the host socket before the main service. If a
   non-root systemd service lacks `HB_HOST_SOCKET`, discovery uses the packaged
   host socket by default; other host operations still require the explicit
   environment setting in step 4. A missing or inaccessible broker is reported,
   not bypassed by granting the main service write access to Avahi files.
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

On servers with Storage Wizard registered, administrators can use
Settings → Two-step sign-in → Review backups to review configurations whose
user or installation ownership is missing or invalid. Verify each assignment
independently with the owner; the saved Samba username is only a hint.
Assignments and server-record removals are logged. Removing a record does not
delete backup files or stop a schedule. An empty list does not prove earlier
assignments were verified or that a backup completed. Staff two-step sign-in
can be enabled with unresolved records, but affected backup clients may not be
able to manage or report on them until ownership is assigned.

Update Storage Wizard before testing scheduled reporting. Previously generated
Linux/macOS/Windows scripts omitted the installation ID at login. The updated
client's existing script-version refresh regenerates these scripts on startup
and applicable run paths without recreating schedules or credentials. Verify the
refresh succeeded; do not delete working backup definitions to force it. Backup reporting
remains best-effort and does not prove a backup completed.

For rollback, restore `REQUIRE_ADMIN_GROUP=0` and restart Broadcaster. That
deliberately restores legacy account access, so keep the network restrictions
in place and verify recovery before removing any group or enrollment.

## Staff two-step sign-in

Staff can be required to enter a code from an authenticator app when they sign
in. It is available on Free and Pro, and **off by default**: until an
administrator turns it on, staff sign in with a password exactly as before and
no grace period is running.

**What it covers.** Staff sign-in from the desktop app and the browser, and the
staff API. It does not cover recipients of share links (recipient MFA is
separate work) and it is not single sign-on. Passwords and codes still cross
the network unprotected if submitted to the legacy direct port 9095 over HTTP.
MFA endpoints and MFA-code login requests reject HTTP, but that rejection cannot
protect secrets already sent on the wire. Always use a verified HTTPS connection
for two-step sign-in (see the [network guide](deployment-network.md)).

**Turning it on.**

1. An administrator needs their own authenticator first. On the server, as
   root, issue a one-time enrollment code for that account:

   ```
   sudo node /opt/45drives/houston-broadcaster/dist/mfa-admin.js issue-code <username>
   ```

   The command uses the running Broadcaster service's database. Start the
   service first. If it is stopped, explicitly set `DB_FILE` to the service's
   database path:

   ```
   sudo env DB_FILE=/path/to/database node /opt/45drives/houston-broadcaster/dist/mfa-admin.js issue-code <username>
   ```

   The code lasts 15 minutes, works once and does not sign anyone in. The
   person still needs their password, adds the key to an authenticator app, and
   confirms a code before anything changes. They are then shown ten
   single-use recovery codes, once.
2. In Settings → Two-step sign-in, the enrolled
   administrator enters their password and a current code and turns it on.
   Review any warning about older Storage Wizard records (see above).
3. The first time it is turned on starts one 14-day grace period for the whole
   server. Staff who have set it up need a code immediately. Everyone else can
   still sign in with a password until the deadline, are told when it is, and
   after it must finish setup first. Turning it off and on again keeps the
   original deadline and everyone's setup; it does not restart the clock.
4. Turning it on ends the turning-on administrator's current sign-in, and each
   person's earlier password-only sign-ins end when they set up or when the
   deadline passes. People sign in again with a code.

**Enrolling other staff.** They choose *Set up two-step sign-in* on the sign-in
screen (or in Settings), enter their password and ask for approval. They are
shown a short code. They read it to an administrator **you have verified is
that person, in person or over a channel you already trust**. The
administrator matches it under Settings → Two-step sign-in → Waiting for approval, enters their own current
code, and approves. Approval lasts 15 minutes. Administrators cannot approve
themselves; a sole administrator uses the root command above.

**Lost authenticator or lost phone.**

- A person with recovery codes can sign in with one (each works once). The
  set can be replaced under Settings → Two-step sign-in → Your recovery codes with a current
  authenticator code. Save the new codes before closing; old codes stop
  working immediately. If the connection fails during replacement, the old
  codes may already have stopped working: try again with a fresh authenticator
  code or contact an administrator.
- Otherwise they request approval again, or root issues a code for them. Setting
  up again replaces the old authenticator and recovery codes and ends their
  sessions.
- If every administrator has lost their authenticator, root issues a code for
  one of them. No path recovers access with a password alone, and none
  disables the requirement from the sign-in page.

**Turning it off or on again.** Needs the administrator's password and a
current authenticator code (a recovery code is not accepted). Both are logged
with the administrator's name.

**Storage Wizard.** While two-step sign-in is on, scheduled backups keep using
their existing login, with no code, **provided the script sends the
installation ID** (as updated Storage Wizard scripts do). A staff account used
for backups then receives a backup-only credential that works for that user's
backup records and nothing else: not 45Flow, not Settings, not this feature.
Scripts generated before the installation ID existed log in as an ordinary
staff sign-in and would be asked for a code, so update Storage Wizard and let
it regenerate its scripts *before* turning two-step on. Storage Wizard's administrative
actions (registering the app, reading server logs, privileged audit reports) need
a staff sign-in that includes a code. Until Storage Wizard is updated to
prompt for one, those actions fail with a sign-in error while two-step is on;
backups are unaffected.

**Older 45Flow versions** cannot enter a code. While it is on, an enrolled
person using one is refused with a message to update, and after the deadline
so is everyone. Update desktop clients before the deadline.

**Update note.** The credential broker must run the updated build to protect
authenticator secrets. The packaged installers restart it; after a manual copy
of files, run `systemctl restart houston-broadcaster-credentials`. Until then,
setting up or signing in with two-step fails closed with "temporarily
unavailable" rather than falling back to a password.

**Logs.** Setup requests, approvals, enrollments, recovery-code use, failures,
and turning it on or off are written to the operations log and audit trail,
without codes or secrets. Authenticator secrets are encrypted at rest with the
same root-protected key as other provider secrets. Back up that key (see
[credentials](credentials.md)) with the database; without it, enrolled staff
must be enrolled again.

**Limits.** Five wrong codes lock that account's code entry for 15 minutes
(held in memory; a restart clears it). This also means someone who knows a
password can keep that person from signing in by entering wrong codes; the
network allowlist and rate limits are the mitigation. Open WebSocket
connections are not closed when a sign-in is ended. Anyone who can read the server's
database as the service account can alter the policy. This feature has not had
an independent security review.

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
Repeat bootstrap checks each zone's existing rules in batches. Initial
installation or repair of missing rules can still take longer because each
missing rule is individually verified and added.

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
