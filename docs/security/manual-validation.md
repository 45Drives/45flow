# Staged B1 manual acceptance checklist

[Security guides](README.md) | [Server operations](server-operations.md)

Use a maintenance window and disposable test data on an approved share. These
checks are for the staged server/client changes, not certification of an older
package. Keep site addresses, screenshots containing credentials, raw logs and
recovery records private. Never put passwords or tokens in command arguments.

Record the exact Broadcaster, 45Flow and Storage Wizard builds tested, plus
pass/fail/not-tested for each applicable item. Do not mark backup execution as
passed merely because its API report was accepted.

## 1. Management access and service identity

- [ ] Open a second SSH connection before changing anything. Confirm Cockpit
  remains usable before and after the update, restart and rollback.
- [ ] Check `systemctl show houston-broadcaster -p User -p Group -p MainPID`.
  After the controlled rename, expect `houston45` for both names and the same
  numeric UID/GID as before. A source/package update alone does not perform the
  controlled UID migration.
- [ ] Inspect the reported PID's actual user/group and `/proc/<pid>/status`.
  The migrated main process must have zero effective/permitted capabilities and
  `NoNewPrivs: 1`; do not rely on unit text alone.
- [ ] Verify all three broker sockets are root-owned, mode `0660`, with the
  exclusive service group. Ordinary users must not be members of that group.
- [ ] Compare representative customer-file owners and numeric ACL entries
  before/after. A rename must not change either. Directories without default
  ACLs must not acquire them implicitly.
- [ ] Confirm application settings, projects, links, backup configurations,
  histories and signing identity survive restart. Follow the controlled
  rollback procedure; never replace authoritative state with an old snapshot.

## 2. Staff authentication and networks

- [ ] An approved staff account can sign in to 45Flow desktop and browser.
  Existing trusted-certificate behavior and browser CSRF writes still work.
- [ ] An ordinary non-staff account cannot obtain a 45Flow/browser staff
  session or access staff API documentation, settings or setup logs.
- [ ] Remove a disposable staff account from the approved group: its existing
  staff token must lose access. Restore membership and verify recovery.
- [ ] From an approved network, unauthenticated protected requests are denied.
  From an unapproved network, even a genuine staff token is denied.
- [ ] Forged forwarded-address headers do not bypass direct-backend policy.
  Check SSH/Cockpit separately: the application allowlist does not govern them.

## 3. 45Flow file and sharing workflows

- [ ] Browse an approved project, upload a small file and verify the stored
  bytes. Test multi-chunk upload and cancellation separately.
- [ ] Rename, move and delete only disposable files inside the approved root.
- [ ] Requests outside the approved root, traversal paths and outward symlinks
  are rejected. Internal symlinks and valid files alongside a dangling symlink
  still behave correctly.
- [ ] Complete an upload with the real configured malware scanner. Verify a
  quarantined/rejected result with an approved scanner test fixture, not malware.
- [ ] Create a disposable recipient link. Test full download, byte ranges,
  supported video playback/transcoding and the intended recipient permissions.
- [ ] Test file versions/snapshots and relevant review workflows. Check that
  outside-reference media or unsupported playlist inputs fail explicitly.

## 4. Storage Wizard ordinary backup clients

Use the updated Storage Wizard build and a valid ordinary PAM-backed account,
without adding it to the staff group.

- [ ] Create a small backup to a dedicated test destination. Verify the actual
  files and contents, not just the task's status or server metadata.
- [ ] Confirm configuration synchronization succeeds and new start/end reports
  appear for the correct authenticated user and installation.
- [ ] Test a deliberate harmless backup failure; its error report must not
  claim success. A reporting outage must not abort the actual backup.
- [ ] Test the schedule on every supported client platform you ship. Existing
  scripts must refresh automatically on updated-client startup because old
  script login requests omitted the installation ID. Existing schedules and
  protected credentials must remain intact.
- [ ] A second installation cannot read/update/delete the first one's configs
  or attach reports to its backup UUID. Repeat with another PAM user using the
  same installation-ID value.
- [ ] Body `client_id`, another UUID and `all=true` cannot widen backup-only
  access. Staff settings, setup logs, privileged audit routes, 45Flow and staff
  session refresh reject the backup-only token.
- [ ] Session expiry and staff-initiated revocation deny further reports;
  signing in again restores only the permitted backup access.
- [ ] Previously unattributed records stay available to staff, not ordinary
  clients. Explicitly assign one disposable configuration through the documented
  staff API and verify only its designated user/installation gains access.
  Its historical unattributed events remain staff-only and are not deleted.
- [ ] Verify deletion and restore workflows using test data. Removing API
  metadata is not proof that a scheduled task was removed from the client.

## 5. Storage Wizard administration

- [ ] As approved staff on the approved LAN, open setup logs and existing
  read-only host/ZFS inventories. Direct-LAN logs must not become public through
  nginx or loopback-proxy access.
- [ ] Exercise SSH/Cockpit Scheduler, a harmless disposable dataset/share
  setup, backup scheduling and restore using your normal administrative
  credentials. The shared HTTP service account must not gain sudo.
- [ ] Confirm current setup logs remain visible. Host-written temporary logs
  may be hidden by service `PrivateTmp`; verify your actual setup/log paths
  rather than disabling the sandbox to hide a failure.

## 6. Installation profiles and safe recovery

Use separate disposable hosts/VMs for installation-order testing; do not
unregister applications or remove live databases to simulate a fresh install.

- [ ] Storage Wizard-only: required storage tooling and APIs work; 45Flow
  file/media routes and background transcode work are inactive.
- [ ] 45Flow-only: sharing/media/scanning and approved-share workflows work.
- [ ] Storage Wizard then 45Flow: perform the guarded initial TLS/public-sharing
  setup; both app registrations and existing Storage Wizard data survive.
- [ ] 45Flow then Storage Wizard: both registrations and existing 45Flow data,
  certificates and network policy survive. Repeat setup to verify idempotency.
- [ ] Perform the documented account rename and its rollback while stopped.
  Check actual numeric identities, state access, broker sockets and both apps
  after reapplication. Collision/running-process errors must stop the operation.
- [ ] In controlled testing, a configured PAM/provider/host broker outage fails
  the affected operation explicitly without root fallback or loss of unrelated
  application health. Restore the broker and recheck SSH/Cockpit.

## 7. Deployment boundary and credential contract

- [ ] Verify direct backend exposure from every relevant interface/firewall
  zone, including IPv6. Check runtime and permanent policy after reboot.
- [ ] Verify router, Internet and VPS paths separately if your release claims
  external isolation. Local/LAN tests cannot establish those results.
- [ ] SMTP configuration reports safe status, never stored secret values.
  Test a real notification, key/store outage and controlled recovery; keep
  provider-key backups separate from encrypted database backups.
- [ ] Confirm no passwords, usable tokens or key material appear in evidence,
  process arguments or shared logs. Report limitations and not-tested items
  explicitly before release.
