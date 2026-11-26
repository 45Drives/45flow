# Quarterly staff account review

The admin Security settings provide a quarterly staff account report and
ownership controls. Reviews are report-only: accounts with no recorded
successful sign-in for 90 days are flagged for administrator review and are
never automatically disabled. An administrator explicitly records completion
of each quarter's review; the server stores the reviewed membership, login
timestamps, ownership counts, and unassigned-record counts.

Successful PAM sign-ins receive a stable application identity keyed by the
local UID and username. The identity and last successful sign-in timestamp are
stored durably. New projects and links created from a session with that
identity are attributed to it. Legacy sessions and tokens without the identity
remain unassigned; `created_by` values and audit history are not used to infer
staff ownership.

An administrator can transfer all projects and links from one staff identity
to a current staff-group member. Transfers are recorded. The Security settings
also list unassigned legacy records and allow an administrator to assign an
individual record after manual review; assignments are audited. Removing a
staff member through the application is blocked while that identity still owns
projects or links. Resources created after an account stops being available on
the server remain listed under the historical identity so they can be
transferred.

The report and ownership controls are available on Free and Pro servers.
Relevant routes are:

- `GET /api/admin/account-review` — current group, account activity, ownership
  counts, legacy unassigned counts, and this quarter's review record.
- `POST /api/admin/account-review/complete` — explicitly records the current
  quarter's review snapshot.
- `POST /api/admin/account-review/transfer` — transfers attributable projects
  and links to a current staff member.
- `POST /api/admin/account-review/assign` — manually assigns one unassigned
  project or link to a current staff member.
- `GET /api/admin/ownership-inventory?kind=project|link[&after=<id>]` —
  lists at most 50 records per page, including owner status and disabled or
  archived state. It is an inventory of current rows, not a point-in-time
  snapshot; concurrent changes may affect pagination.

These application controls do not replace host-level account and group
management. The implementation and automated tests do not certify signed
desktop packages, real OS credential stores, live HTTPS/certificate behavior,
or cross-browser acceptance; those remain part of B3 release acceptance.
