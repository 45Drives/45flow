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
| Staff alert addresses (copies of every review decision and first download) | App: Settings → Email (SMTP), under the server settings | `src/renderer/components/AdminStaffAlertsPanel.vue` |
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
