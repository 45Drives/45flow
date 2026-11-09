# 45Flow design system

One set of values and a small set of pieces, so every screen (desktop and browser — same code) looks and behaves the same. Build new screens, including Track C review and approval screens, from these pieces. Don't hand-roll buttons, modals or notice boxes.

`yarn check:ui` (also part of `yarn test`) fails on the old patterns and names the replacement.

Building a Track C screen (approvals, comments, email)? Start with [track-c-ui-guide.md](./track-c-ui-guide.md). It covers which codebase each screen goes in, the shared status words, and copy-ready recipes.

## Where things live

| Layer | File | Owns |
|---|---|---|
| houston-common-css | `houston-common/houston-common-css/src/index.css` | Base classes shared by all Houston apps: `.btn`, `.btn-sm`, `.btn-danger`, `.btn-ghost`, `.input-textlike`, `.text-label`, `bg-default`, `bg-accent`, `border-default`, `text-default`. Don't edit for 45Flow-only needs. |
| Tokens | `src/renderer/styles/tokens.css` | Brand/button tokens plus theme-independent semantic tokens: `--flow-danger-*`, `--flow-dismiss-*`, `--flow-{info,success,warning,danger,neutral,muted}-*`, radius, spacing, type sizes, stacking layers. |
| Themes | `src/renderer/styles/themes.css` | The theme palettes. Themes set primary/secondary/brand values only — never danger, warning, dismiss or notice colours. |
| houston overrides | `src/renderer/styles/houston-overrides.css` | Every 45Flow override of a houston class (theme-coloured primary/secondary, success, checkboxes, focus rings). |
| App | `src/renderer/styles/app.css` | Page frame, textured background, table rows, progress bars, header. |
| Components | `src/renderer/styles/components.css` | The `.flow-*` classes and `.btn-dismiss` / `.btn-xs`. |
| Pieces | `src/renderer/ui/` | `FlowButton`, `FlowField`, `FlowCard`, `FlowModal`, `FlowNotice`, `FlowChip`, `FlowEmpty`, `FlowSwitch`. |

`src/renderer/style.css` only imports these in cascade order. Don't reorder the imports.

The pieces are self-contained Vue components that reuse houston's CSS classes. They don't import `@45drives/houston-common-ui`, so they work in unit tests that mock that package.

## Buttons

Pick the variant by what the button *does*, never by the colour you want.

| Variant | Use for | Class |
|---|---|---|
| `primary` | The main action on a screen or dialog (one per area). | `btn btn-primary` |
| `secondary` | Other actions. | `btn btn-secondary` |
| `dismiss` | Close, Cancel, Back to …, Log out — leaves without changing anything. Fixed tonal red in every theme. (A wizard's "Back" to the previous step is `secondary`.) | `btn btn-dismiss` |
| `danger` | Removes, deletes, disables or stops something (data, access, a running job). houston's rose. | `btn btn-danger` |
| `success` | Positive confirmation such as Enable or Save & close. | `btn btn-success` |
| `ghost` / `outline` / `icon` | Quiet tertiary actions. | houston classes |

Sizes: default, `btn-sm`, `btn-xs` (small table/row actions). `btn-block` for full width.

```vue
<FlowButton variant="danger" size="xs" @click="remove(item)">Remove</FlowButton>
<button class="btn btn-dismiss" @click="close">Cancel</button>   <!-- same result -->
```

Close/Cancel is red-tinted but never solid, so it can't be confused with a red theme's primary or with a danger action.

## Field

Label, control, help text and error, linked for screen readers.

```vue
<FlowField label="Project name" id="new-project-name" help="Shown to your team" :error="nameError" required>
  <template #default="{ id, describedBy }">
    <input :id="id" v-model="name" :aria-describedby="describedBy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
  </template>
</FlowField>
```

Props: `label`, `id` (generated if omitted), `help`, `error`, `required`, `optional`. Slots: default (scoped `{ id, describedBy, invalid }`), `label`, `help`.

## Card

```vue
<FlowCard>…</FlowCard>                         <!-- surface: elevated panel -->
<FlowCard variant="inset" padding="sm">…</FlowCard>  <!-- section inside another surface -->
<FlowCard variant="plain" class="…">            <!-- houston CardContainer look; for pages that style on top of it -->
  <template #header>…</template>
  …
  <template #footer>…</template>
</FlowCard>
```

`padding`: `none | sm | md | lg`. `headerClass`, `bodyClass`, `footerClass` pass through.

## Modal

```vue
<FlowModal v-model="open" title="New Project" description="A project is a folder on your server." size="lg">
  <template #header-actions><button class="btn btn-secondary">Comments</button></template>
  …body…
  <template #footer>
    <button class="btn btn-dismiss" @click="open = false">Cancel</button>
    <button class="btn btn-primary" @click="save">Create</button>
  </template>
</FlowModal>
```

- Renders a header Close (`btn-dismiss`) unless `hide-close`. Escape, the Close button and the backdrop all close it. `busy` blocks all three; `close-on-backdrop="false"` and `:dismissible="false"` narrow them. `:before-close="fn"` can veto (return `false`), e.g. to confirm discarding edits.
- Emits `update:modelValue` (false) and `close` with the reason (`'close' | 'escape' | 'backdrop'`).
- Sizes (max width): `sm` 28rem, `md` 36rem (default), `lg` 48rem, `xl` 64rem, `2xl` 80rem, `full`. `position="top"` pins it near the top for tall content. `surface="default"` uses `bg-default` instead of `bg-accent`.
- Classes and attributes on `<FlowModal>` (such as `data-tour`, fixed heights) land on the panel. `panel-class`, `header-class`, `body-class`, `footer-class` and `flush` (no body padding) adjust the layout. `:header-attrs="{ 'data-tour': '…' }"` puts attributes on the header row (guided-tour targets).
- Slots: default (body), `title`, `header` (replaces the title block), `header-actions` (before Close), `footer`.
- Nested modals stack in the order they open and Escape closes only the top one. Don't set z-index on modals.
- Focus moves into the dialog (to `[autofocus]`, `initial-focus`, or the panel), Tab stays inside it, and focus returns to the trigger on close.

For a yes/no question use `ConfirmDeleteModal` (built on FlowModal).

## Notice

```vue
<FlowNotice tone="warning" title="Not on a storage pool">Media can fill a small disk fast.</FlowNotice>
<FlowNotice tone="danger" size="sm" live>Low space: 12 GB left.</FlowNotice>
<FlowNotice tone="success" plain size="sm">On storage pool tank</FlowNotice>
```

Tones: `info`, `success`, `warning`, `danger`. `size="sm"` for dense forms, `plain` for an inline coloured line with no box, `hide-icon`, `live` to announce changes. Slots: default, `title`, `icon`, `actions`.

## Status chip

```vue
<FlowChip tone="success" dot>Active</FlowChip>
<span class="flow-chip flow-chip--warning">Expiring</span>
```

Tones: `neutral`, `info`, `success`, `warning`, `danger`, `muted`. `size="sm"`, `dot`.

## Empty state

```vue
<FlowEmpty title="No projects yet" description="Create a project to start sharing.">
  <template #icon><FolderIcon /></template>
  <template #actions><FlowButton variant="primary" @click="create">New Project</FlowButton></template>
</FlowEmpty>
```

`compact` for small panels and table bodies.

## Switch

```vue
<FlowSwitch v-model="inviteOnly" label="Invite-only links" :disabled="busy" />
```

An on/off toggle (headless UI `Switch`). `label` is the accessible name only; put the visible label beside it, usually in a settings row. Use a switch for a setting that takes effect as a yes/no. For a choice between two named options (Local Network / Internet, 24-hour / 12-hour), use buttons with `role="radio"` instead so both options are visible.

## Lists, avatars and tabs

For people, teams and other records in a dialog, use one bordered list with lines between rows. Don't put a bordered box inside another bordered box.

```vue
<ul class="flow-list">
  <li class="flow-list__row">
    <span class="flow-avatar" :style="{ '--flow-avatar-color': user.display_color }">JD</span>
    <div class="min-w-0 flex-1">
      <p class="flow-list__title truncate">Jane Doe</p>
      <p class="flow-list__meta truncate">@jane · jane@acme.com</p>
    </div>
    <button class="btn btn-secondary btn-xs">Edit</button>
  </li>
</ul>
```

- `flow-list__row--interactive` adds a hover state (use it on a `<label>` row with a checkbox); `flow-list__row--selected` tints a chosen row with the theme colour.
- Wrap a row plus expandable detail in `flow-list__group` so the dividing lines stay correct.
- `flow-avatar` shows initials on a person's comment colour; `flow-avatar--sm` is smaller and `flow-avatar--team` is a rounded square for teams.
- Tabs: a `div.flow-tabs[role=tablist]` of `button.flow-tab[role=tab]` with `aria-selected`. `flow-tab__count` is the small count badge.

The quiet line and surface colours come from `--flow-line`, `--flow-surface-sunken`, `--flow-surface-hover`, `--flow-accent-soft` and `--flow-accent-line` in `tokens.css` (app only; the share player does not use them). Dialogs (`.flow-modal__panel`) also get thin, theme-neutral scrollbars.

## Grouped rows and data tables

For a details or settings page, put label/value rows in a `flow-group` under a `flow-subhead`. Each row is a label (plus optional help line) on the left and a value or control on the right; the group draws one border with lines between rows.

```vue
<p class="flow-subhead flow-subhead--first">Who can open it</p>
<div class="flow-group">
  <div class="grid grid-cols-[1fr_auto] items-center gap-x-6 py-3">…label…<FlowSwitch v-model="on" label="Allow comments" /></div>
  <div class="grid grid-cols-[1fr_auto] items-center gap-x-6 py-3">…</div>
</div>
```

`LinkDetailsModal` builds these rows with its `DetailRow`; `SettingsModal` still has its own scoped `settings-group` / `SettingRow` with the same look. For tabular records (files, activity, versions) use `div.flow-table-wrap > table.flow-table`: a quiet uppercase header, lines between rows and no cell borders. `flow-table__num` right-aligns numbers.

## Status colour helpers

For things that aren't a whole notice or chip:

| Need | Use |
|---|---|
| Status text (errors, "Connected", warnings) | `text-flow-danger`, `text-flow-warning`, `text-flow-success`, `text-flow-info`, `text-flow-muted` |
| Status dot | `flow-dot flow-dot--success` (`info`, `warning`, `danger`, `neutral`) |
| Solid status fill (meters, bars) | `bg-flow-success` (`info`, `warning`, `danger`, `neutral`) |
| Status border | `border-flow-danger` (`info`, `success`, `warning`, `neutral`) |
| Tinted box that isn't a notice (highlighted row, badge-like block) | `flow-tone-warning` + `border` (sets text, background and border colour) |
| In scoped CSS | `var(--flow-warning-fg)`, `var(--flow-warning-bg)`, `var(--flow-warning-border)`, `var(--flow-warning-solid)` … |

`text-flow-*`, `bg-flow-*` and `border-flow-*` are Tailwind colours (see `tailwind.config.cjs`), so variants such as `hover:text-flow-danger` work.

Theme-coloured accents stay on `bg-primary`, `text-primary`, `border-primary`. Blue link text (`text-blue-500 hover:underline`) is allowed.

## Stacking layers

Use the named Tailwind layers instead of `z-[N]`: `z-raised` (10), `z-header` (30), `z-dropdown` (50), `z-dock` (50), `z-banner` (1200), `z-overlay` (1500), `z-modal` (2000, managed by FlowModal), `z-popover` (3500), `z-tour` (4000), `z-critical` (5000).

A deliberate full-screen layer that isn't a dialog (drag-and-drop target, tour spotlight) keeps its own markup and gets `data-flow-overlay` so the guard knows it's intentional.

## What the guard rejects

| Rule | Replacement |
|---|---|
| `btn-delete` | `btn-danger` |
| `ss-chip` | `FlowChip` / `flow-chip` |
| `fixed inset-0` element without `data-flow-overlay` | `FlowModal` |
| `z-[N]` | named layer |
| `bg-`/`border-` + red, rose, pink, amber, yellow, orange, green, emerald, lime, teal, cyan, sky or blue shade | `FlowNotice`, `FlowChip`, `flow-tone-*`, `flow-dot--*`, `bg-flow-*`, `bg-primary` |
| `text-` + red, rose, pink, amber, yellow, orange, green, emerald or lime shade | `text-flow-*` |
| houston `text-danger` / `text-success` / `text-warning`, `border-danger` … | `text-flow-*` / `border-flow-*` |
| Close / Cancel / Back to … / Log out button without the dismiss variant | `btn-dismiss` (a "Cancel" that stops running work is `btn-danger` with a `flow-ui-allow` note) |

For a genuine exception (for example a colour swatch that shows a user's chosen colour), add `flow-ui-allow: <reason>` in a comment on that line or an HTML comment on the line above.

## Share player

The client-facing share page (`houston-broadcaster/studiosharevideoplayer`) uses the same system:

| App | Player |
|---|---|
| `src/renderer/styles/tokens.css` (semantic section) | `src/styles/flow-tokens.css`, a mirror. Keep the values identical. |
| `src/renderer/styles/components.css` | `src/styles/flow-components.css`, adapted to the player's `--panelSolid` / `--border` / `--fg` / `--muted` |
| `src/renderer/ui/*` | `src/ui/*`: same API, minus `FlowCard`; Notice icons come from Font Awesome |
| `scripts/design-system-guard.cjs` | `scripts/design-system-guard.cjs` (port); `yarn check:ui`, runs in the player's `yarn test` |

When you change a token value or a piece's props in one codebase, make the same change in the other. Differences in the player are listed in [track-c-ui-guide.md](./track-c-ui-guide.md#differences-in-the-player).
