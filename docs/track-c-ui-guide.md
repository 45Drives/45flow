# Building Track C screens with the 45Flow design system

How to build the C2 (Client Review & Approvals) and C3 (Email Sharing & Notifications) screens from the shared pieces, so they ship looking like the rest of 45Flow with no one-off styling (Req A-11; the A7 review checks for it).

The rules and component APIs are in [design-system.md](./design-system.md). This page covers which pieces to use and where each screen goes.

## Which codebase a screen goes in

Track C touches two front ends. Both have the same pieces with the same names and props:

| Who uses the screen | Codebase | Pieces | Guard |
|---|---|---|---|
| The **client / reviewer** (opens a share link) | `houston-broadcaster/studiosharevideoplayer` | `src/ui` (`FlowModal`, `FlowNotice`, `FlowChip`, `FlowField`, `FlowEmpty`, `FlowButton`) | `yarn check:ui`, runs in the player's `yarn test` |
| **Your team** (desktop app or `/app/` in a browser) | `45flow-premium-dev` | `src/renderer/ui` (same pieces plus `FlowCard`) | `yarn check:ui`, runs in `yarn test` |

For C2, the approver's **Approve this version / Request changes** actions, comment resolve/reopen and PDF annotations are on the share page (player). Your team reads decisions, history and reports in the app (Link Details, Comments Review, exports). For C3, the email-sharing dialogs and notification settings go in the app. Email bodies are not Vue screens, but use the same status words listed below.

### Comment resolution (2026-11-16)

- Staff can resolve or reopen feedback from Comments Review or the share-page
  Comments panel. Authors may reopen their own feedback, but cannot resolve it.
  Being the designated approver does not grant resolution authority.
- Both interfaces show **Resolved at {timestamp}**, using the server timestamp
  in the viewer's local timezone. Reopening removes that label. Resolution
  never approves or rejects a version.
- The player offers **Staff sign in**, including on protected links. Use a
  server account over HTTPS; the browser receives an httpOnly session cookie,
  not the desktop token. An existing staff browser session also works. **Staff
  sign out** revokes that browser session (also signing out the web app in that
  browser); desktop sessions and invited-recipient credentials stay separate.
  The player header offers **Staff sign in** beside the recipient's **Log out**.
  While a staff browser session is active, **Staff sign out** replaces both.
  The Comments panel does not duplicate staff sign-in or sign-out.
  Sign-out failures remain visible and do not clear local identity state.
  Staff can view a valid review without impersonating an invited recipient;
  that access does not grant recipient comment/upload/download or approval
  authority. Link expiry and disablement still apply to viewing.
- Both resolution endpoints use the same persisted history and publish
  `comment.updated`. Repeating the current state preserves its timestamp and
  does not add another history entry or live update. The app applies the
  returned comment instead of inventing a local timestamp.
- Compatibility: `PATCH /api/links/:linkId/comments/:commentId` retains its
  authenticated Pro gate and response shape `{ok, comment}`; `resolved` must
  be a boolean. Optional `tags` are preserved when omitted.
  `PATCH /api/token/:token/comments/:id/resolution` retains its existing
  Free/Pro availability and `{ok, comment, event}` shape. Staff browser writes
  send the CSRF token from `GET /api/session?passive=1`; guest reopening uses
  the original comment session. No schema migration or new route is needed.
- Resolution emails and feedback subscriptions are described below.

### Requesting changes (2026-11-16)

- Only the verified, designated invited approver may decide. Approval and
  rejection do not require a comment and remain independent of resolution.
- **Request changes** requires at least one unresolved top-level comment
  on the **same link, file and current version**. Deleted comments, other
  links/versions, unversioned legacy comments, and replies on resolved threads
  do not satisfy that requirement.
- The confirmation checks current feedback when opened. If unresolved
  feedback exists, another comment is optional. Otherwise, **What needs to
  change?** is required. Feedback entered here becomes a real unresolved
  comment authored by the verified approver, not merely a decision note.
  It is also retained in decision history and existing decision emails.
- The comment and decision commit together. A stale decision/version or a
  failed save leaves neither an orphan comment nor a partial decision.
  The player sends `expected_latest_decision_id`, so concurrent submissions
  or retries against the same prior state cannot duplicate popup feedback.
  A committed comment publishes the usual `comment.created` live update.
- API: `GET /api/token/:token/review-decisions?asset_version_id=...` adds
  `unresolvedCommentCount`. The existing `POST` keeps `{ok, decision}` and
  accepts the existing nullable text `note`; for `changes_requested`, a
  nonblank note is also saved as a comment. A missing prerequisite returns
  **409 `feedback_required`** without saving. The popup stays open and asks
  for feedback if staff resolved the final comment while it was open.
  Posting popup feedback requires the recipient's existing comment
  permission (**403 `no_comment_access`**). Other auth/conflict rules and
  Free/Pro availability are unchanged. No route or schema migration is added.
- Older players sending a change-request note automatically create a
  comment on updated servers. Updated players connected to an older server
  retain its required-note behavior; atomic comment creation and server
  enforcement require the updated server. Callers omitting the optional
  optimistic-concurrency field retain the existing append-per-decision
  contract rather than gaining retry deduplication.

### Feedback notifications and resolution emails (2026-11-16)

- **Settings → Email (SMTP) → Staff alerts** keeps the server-wide recipient
  list and adds individual switches for new comments, replies, reopened
  feedback, review decisions and first downloads. New feedback email switches
  start off; existing decision/download subscriptions are preserved.
- The notification bell adds persistent feedback for the selected server:
  comments, replies and reopened feedback, with a link back to the review.
  Read/clear state and event preferences are separate for each staff account.
  These three in-app event types start enabled. The latest 50 matching events
  are shown alongside the existing transient app notification history.
- **Link Details → Review → Resolution emails** lets staff explicitly opt
  invited clients in per link. Only the resolved comment's author is emailed,
  and only while they retain viewing access and an active account with an email
  address. Expired or disabled links do not send client resolution emails.
  Other reviewers do not receive that author's resolution email.
  Group-derived invitations are supported. Guest signup is described below.
  This opt-in never grants approval authority.
- Resolution emails include the comment, file/version, recorded timestamp and
  review link. Resolving an already-resolved comment does not email again.
  Enabling a subscription does not mail earlier events. There is no historical
  feedback backfill when upgrading.
- Both comment entry points, replies, changes-requested popup comments and both
  resolution entry points write durable source events inside their existing
  database writes. Rolled-back comments do not produce notifications. The
  worker runs at startup and every 30 seconds; the app polls every 30 seconds
  with `X-Background-Request: 1` so polling does not extend idle sessions.
- Emails reuse the existing SMTP settings, outbound-mail switch and durable
  outbox. Stable event/recipient keys prevent duplicate queueing on replay.
  Source-processing errors are logged and deferred five minutes rather than
  blocking newer feedback. Failed or uncertain SMTP outcomes are not retried
  automatically; inspect and explicitly retry them in **Link Details →
  Activity**. Mail queued while SMTP is unavailable also needs that explicit
  retry. "Sent" means accepted by SMTP, not delivered to an inbox.
- These new staff-only controls are available on Free and Pro servers; they
  do not change existing comment, approval or license permissions. Browser
  writes retain staff-session CSRF protection. Older servers show an update
  notice for the new controls; legacy staff-address saves preserve event choices
  on updated servers.
- Persistence is additive: `feedback_events` and source triggers,
  `feedback_inbox_state`, and `feedback_resolution_subscriptions`. The existing
  `mail.staff_alert_emails` setting remains a string array; event choices and
  enablement cursors live separately in `mail.staff_alert_email_events`, saved
  atomically with the addresses.

New API contracts (all require verified server staff; existing standard error
responses apply):

| Route | Request / response |
|---|---|
| `GET /api/feedback/notifications` | `{ok, items, unreadCount, cursor, events}`; items include link/file/version, comment text, actor, timestamp and read state |
| `PATCH /api/feedback/notifications` | Either `{action:"read"\|"clear",cursor}` or `{events:{comments,replies,reopened}}` with booleans; returns the refreshed inbox. Cursors cannot exceed committed event history; malformed requests return 400 |
| `GET /api/links/:id/feedback-notifications` | `{ok,items:[{id,name,user_email,enabled}]}` for currently eligible invited clients; 404 for missing/open links |
| `PUT /api/links/:id/feedback-notifications` | `{userId,enabled:boolean}`; returns saved recipient choices; 400 for invalid/ineligible recipients |

`GET/PUT /api/admin/mail/staff-alerts` add `subscriptions`, an array of
`{email,events:{comments,replies,reopened,decisions,downloads}}`, while preserving
`emails` and `max`. Every event choice must be boolean and each configured address
must appear once; invalid choices return 400.

### Guest email signup (2026-11-16)

- On open, comments-enabled review links, **Set name / Change name** includes
  an optional email address and **Email me when my feedback is resolved**.
  New signups are unchecked by default. Existing pending/confirmed choices
  are loaded for that guest comment session; unchecking stops updates.
- Guests must open the confirmation email and explicitly press **Confirm
  email** before receiving resolution updates. Confirmation expires after
  24 hours and cannot be replayed after use, cancellation or unsubscribe.
  Opening the email link alone does not change a subscription.
- Updates apply only to comments authored by that guest's browser-tab comment
  session on that link, not everyone sharing the same display name. Confirmation
  can happen on a different device but does not transfer comment ownership.
  Closing the original tab ends that comment session; a new tab has a different
  identity. No recipient account, viewing access or approval authority is created.
- Confirmation emails and resolution updates include cancel/unsubscribe links.
  Those open a confirmation dialog and require a button press. Unsubscribe still
  works on disabled or expired links. Queued guest email retries are blocked once
  cancelled, replaced or no longer eligible; already in-flight email cannot be recalled.
- Confirmation capability keys are signed, scoped to one subscription and action,
  and carried in URL fragments, not HTTP paths/query strings. Email addresses are
  never added to public comments or the staff feedback inbox.
- Signup is rate-limited to five requests per IP per 15 minutes, plus a five-minute
  cooldown per link/session or link/address. An SMTP failure is shown explicitly
  and does not pretend the address is confirmed; commenting without email remains
  available. Existing SMTP settings, egress controls and manual email retry apply.
- Additive persistence: `feedback_guest_subscriptions` stores link/session-hash,
  email, capability nonce, consent state and event watermark. No earlier feedback
  is mailed when confirmation is enabled.

Guest API (Free and Pro, publicly routed under the existing token API):

| Route | Request / behavior |
|---|---|
| `GET /api/token/:token/feedback-email` | `x-comment-session` header; returns `{ok,state:"off"\|"pending"\|"confirmed",email}` only for that session; no-store |
| `POST /api/token/:token/feedback-email` | `{enabled:true,session_id,email}`; queues confirmation and attempts SMTP, 202 on acceptance, 503 if unsent, 400 invalid input, 429 cooldown/limit |
| `DELETE /api/token/:token/feedback-email` | `{session_id}`; disables and invalidates pending confirmation |
| `POST /api/token/:token/feedback-email/confirm` | `{key}`; signed email capability, 400 invalid/wrong-link, 410 expired/used/cancelled or unavailable review |
| `POST /api/token/:token/feedback-email/unsubscribe` | `{key}`; signed opt-out capability; independent of link password/expiry/disablement, grants no access |

Reading/changing preferences requires existing comment access on a valid open
link, including its password when protected. Confirm/unsubscribe capabilities
authorize only the named email action, never file or comment access.

## Screens that exist

Build on these instead of starting new ones.

| Screen | Where | File |
|---|---|---|
| Approve this version / Request changes / Reject, status chip, history | Share page, above the viewer (invite-only links) | player `src/components/ReviewDecisionPanel.vue` |
| Approver (read-only, Change opens Edit), current status per file, decision history | App: Link Details → Review | `src/renderer/components/LinkReviewPanel.vue` (data: `composables/useLinkReview.ts`) |
| Approver picker (saved with Save & close, after invites) | App: Link Details → Edit → Who can open it | `src/renderer/components/modals/LinkDetailsModal.vue` |
| Decision per version | App: Link Details → Versions (Review column) | `LinkDetailsModal.vue` |
| Every email for the link (invitations, download alerts, review decisions) with Retry | App: Link Details → Activity | `src/renderer/components/LinkEmailsPanel.vue` |
| Invite by email (lists earlier invitations for the link, with the reason a send failed) | App: Link Details → Overview | `src/renderer/components/EmailInvitationPanel.vue` |
| "Email this link" (optional) after a link is made | App: Create link result, QuickShare last step | `EmailInvitationPanel.vue` with `compact` |
| Email (SMTP) settings, required From address, Send test email | App: Settings → Email (SMTP) | `src/renderer/components/AdminSmtpPanel.vue` |
| Staff alert addresses and per-address feedback/decision/download choices | App: Settings → Email (SMTP), under the server settings | `src/renderer/components/AdminStaffAlertsPanel.vue` |
| Invited-client resolution email opt-in | App: Link Details → Review | `src/renderer/components/LinkFeedbackNotificationsPanel.vue` |
| Persistent selected-server feedback history and preferences | App: Notification bell | `src/renderer/components/NotificationBell.vue` |
| Review chip per link, sort, "Needs attention" filter | App: Links table and a project's links (Review column) | `src/renderer/views/ManageLinks.vue`, `utils/reviewStatus.ts` (`reviewSummaryView`) |
| PDF markup on its page and version | App: Comments Review → View drawing | `modals/AnnotationViewerModal.vue`, `utils/pdfPage.ts` |
| Internet links Ready / Not ready | App: Settings → Internet sharing | `modals/SettingsModal.vue` |
| Playback mode (Auto / Data Saver / Best) and size hint | Share page, quality row | player `src/Views/ShareView.vue` |

Server routes behind them: `GET /api/links/:id/review-decisions`, `GET/POST/DELETE /api/links/:id/review-approver`, `GET/POST /api/token/:token/review-decisions` (adds `approver`, `canDecide`, `isCurrentVersion`, `actorNames`), `GET /api/links/:id/emails` (adds `staffAlertCount`), `GET/PUT /api/admin/mail/staff-alerts`, `POST /api/admin/credentials/smtp/test`, a `reason` code on every email row (`no_from_address`, `auth_failed`, `connection_failed`, `tls_failed`, `refused`, `interrupted`; words in `utils/emailStatus.ts`), `linkId` on link-create responses, the `review` counts on each item of `GET /api/links` and `GET /api/projects/:id/links` (`null` unless the link is invite-only with files), and `GET /api/links/:linkId/files/:fileId/frame?asset_version_id=` (returns PDF bytes for PDFs).

## Status words and colours

Use these exact labels and tones on both sides so a decision looks the same to the client and to your team.

**Version decision (C-04, C-05)**

| State | Label | Chip |
|---|---|---|
| No decision yet | Awaiting approval | `info` |
| Approved | Approved | `success` (with `dot`) |
| Changes requested | Changes requested | `warning` |
| Rejected | Rejected | `danger` |
| Older version, replaced | Superseded | `muted` |

Only the link's designated approver can decide, and only on an invite-only link. In the app, a file whose link has no approver (or is open) shows "—" instead of "Awaiting approval". The app uses `reviewStateView()` in `src/renderer/utils/reviewStatus.ts`.

**Comment state (C-06)**

| State | Label | Chip / text |
|---|---|---|
| Open | Open | `neutral` |
| Resolved | Resolved | `muted` with a ✓. **Not `success`**, so resolving every comment never looks like an approval. |

**Email delivery (C3)**

| State | Label | Chip |
|---|---|---|
| Queued / sending (`pending`, `sending`) | Sending | `info` |
| Queued but email isn't set up, or the settings couldn't be read | Not sent | `warning` |
| Accepted by the mail server (`accepted`) | Sent | `success` |
| Refused by the mail server (`rejected`) | Failed | `danger` |
| No answer, or the connection dropped mid-send (`timeout`, `ambiguous`) | Unconfirmed | `warning` |

"Sent" never means the inbox received it. "Unconfirmed" means it may or may not have arrived, so a retry can send it twice; say so in the help text. Retry is allowed for every status except `sending` and `accepted`. The app uses `emailStatusView()` in `src/renderer/utils/emailStatus.ts`; mirror it in the player if the player ever shows email state.

Settings' **Delivery problems** includes failed/unconfirmed emails and emails
that have stayed pending or sending for ten minutes. **Dismiss** persistently
hides that email's problem for everyone on the server, including when its link
has been deleted. It keeps delivery status and attempt history and does not
cancel, retry or recall mail. Per-link email history remains available for
existing links; missing or archived links cannot be retried from this list.

Dismissal uses authenticated `POST /api/emails/{invitationId}/dismiss` with no
payload and returns `{ ok: true, dismissed: true, invitationId }`. It is
idempotent and available without a Pro license. Invalid ids return 400, missing
email records 404, and persistence failures 500; failed dismissals leave the row
visible. The server lazily creates the additive `mail_problem_dismissals` table;
existing mail rows, delivery claims and SMTP outcomes are not rewritten.

## Button choices

| Action | Variant | Why |
|---|---|---|
| Approve this version | `success` | Positive decision. Fixed green, so it never looks like a red theme's primary. |
| Request changes (opens the form) | `secondary` | Not destructive and not the main path. |
| Reject (opens a confirm with an optional reason) | `danger` | Turns the version down. |
| Send request (inside the form) | `primary` | Main action of that dialog. |
| Resolve / Reopen comment | `secondary`, `size="sm"` | Bookkeeping, not a decision. |
| Withdraw / clear a decision, delete an annotation | `danger` | Removes something. |
| Cancel / Close in any dialog | `dismiss` | Leaves without changing anything. |
| Send email | `primary` | |

## Recipes

These are simplified skeletons. Wire them to the real API and B3 permissions.

### Approval panel (player, C-04 / C-05)

```vue
<div class="panel rounded-xl p-4 flex flex-col gap-3">
  <div class="flex items-center gap-2">
    <span class="font-semibold">Version {{ version.index }}</span>
    <FlowChip :tone="decisionTone" :dot="decision === 'approved'">{{ decisionLabel }}</FlowChip>
  </div>

  <FlowNotice v-if="previousApproval" tone="info" size="sm">
    Version {{ previousApproval.versionIndex }} was approved by {{ previousApproval.by }} on {{ previousApproval.at }}.
    This version needs its own approval.
  </FlowNotice>

  <div v-if="canDecide" class="flex flex-wrap gap-2">
    <FlowButton variant="success" :loading="saving" loading-text="Saving…" @click="approve">Approve this version</FlowButton>
    <FlowButton variant="secondary" @click="requestOpen = true">Request changes</FlowButton>
  </div>
  <p v-else class="text-sm text-flow-muted">Only {{ approverName }} can approve this version.</p>
</div>
```

In the app, put the same content in `<FlowCard variant="inset">` instead of `.panel`.

### Request changes dialog (player)

```vue
<FlowModal v-model="requestOpen" title="Request changes" :description="`Tell the team what needs to change in Version ${version.index}.`" size="sm" hide-close :busy="saving">
  <FlowField label="What needs to change?" required :error="noteError">
    <template #default="{ id, describedBy }">
      <textarea :id="id" v-model="note" :aria-describedby="describedBy" rows="4" autofocus class="w-full rounded-lg inputish px-3 py-2 text-sm" />
    </template>
  </FlowField>
  <template #footer>
    <FlowButton variant="dismiss" @click="requestOpen = false">Cancel</FlowButton>
    <FlowButton variant="primary" :disabled="!note.trim()" :loading="saving" loading-text="Sending…" @click="sendRequest">Send request</FlowButton>
  </template>
</FlowModal>
```

### Decision history (both sides, C-05 / C-08)

```vue
<FlowEmpty v-if="!history.length" compact title="No decisions yet" />
<ul v-else class="flex flex-col gap-2">
  <li v-for="d in history" :key="d.id" class="flex items-center gap-2 text-sm">
    <FlowChip :tone="toneFor(d.decision)" size="sm">{{ labelFor(d.decision) }}</FlowChip>
    <span>Version {{ d.versionIndex }} · {{ d.by }} · {{ d.at }}</span>
  </li>
</ul>
```

### Comment resolve row (player, C-06)

```vue
<FlowChip :tone="c.resolved ? 'muted' : 'neutral'" size="sm">{{ c.resolved ? '✓ Resolved' : 'Open' }}</FlowChip>
<span v-if="c.resolvedBy" class="text-xs text-flow-muted">by {{ c.resolvedBy }}</span>
<FlowButton variant="secondary" size="sm" @click="toggleResolved(c)">{{ c.resolved ? 'Reopen' : 'Resolve' }}</FlowButton>
```

### PDF annotations (player, C-07)

Extend the existing `AnnotationToolbar` / `AnnotationCanvas`; don't build a second toolbar. Use `flow-selected` for the active tool or page, and a `FlowNotice tone="warning" size="sm"` when marks belong to a different version than the one on screen.

### Email share dialog (app, C3)

```vue
<FlowModal v-model="open" title="Share by email" size="md">
  <FlowNotice v-if="!mailConfigured" tone="warning" size="sm" class="mb-3">
    Email isn't set up on this server yet. Open Settings → Email to add it.
  </FlowNotice>
  <div class="flex flex-col gap-3">
    <FlowField label="To" help="Separate addresses with commas.">
      <template #default="{ id, describedBy }">
        <input :id="id" v-model="to" :aria-describedby="describedBy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
      </template>
    </FlowField>
    <FlowField label="Message" optional>
      <template #default="{ id }">
        <textarea :id="id" v-model="message" rows="3" class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
      </template>
    </FlowField>
  </div>
  <template #footer>
    <button class="btn btn-dismiss" @click="open = false">Cancel</button>
    <button class="btn btn-primary" :disabled="!mailConfigured || !to.trim()" @click="send">Send</button>
  </template>
</FlowModal>
```

Notification settings go in `SettingsModal` as `SettingRow`s, like the existing sections.

## Differences in the player

- `.btn` on its own is the theme's primary colour. Always add a variant class (`btn-primary`, `btn-dismiss`, …) or use `FlowButton`.
- There is no `FlowCard`. Use `.panel` (translucent) or `.panel-solid`.
- Inputs use `.inputish`, which already gets the theme focus ring. Use `flow-focus-within` on a wrapper that holds an input plus a button. Don't add `focus:ring-blue-*`.
- `flow-selected` marks an active toggle or a highlighted drop target.
- Tailwind v4 is compiled by Vite on every build. There is no pre-built `tailwind.css` to regenerate.
- The named z-index layers (`z-modal` …) exist only in the app. In the player, `FlowModal` handles its own layering.

## Before you hand a screen to review

1. Run `yarn check:ui` in each repo you touched. It must say "clean".
2. Check the screen in dark mode and in a red theme (Enterprise). Dismiss buttons should still look different from primary and danger.
3. Use only the keyboard: Tab reaches every control, Escape closes the top dialog, and focus returns to the button that opened it.
4. Make sure status words match the tables above on both the share page and in the app.
5. If you needed a colour or component the system doesn't have, add it to the shared pieces (and the player mirror). Don't use `flow-ui-allow` to get around it.
