# Linked Forks and Version Compare

Date: 2026-11-13, scope revised 2026-11-16
Status: Planned (threads LF1–LF5 under Princess #15210); implementation not started
Decisions: [linked-forks-and-version-diff-decisions.md](linked-forks-and-version-diff-decisions.md)

## Summary

Staff can **fork** any version of a file into a new, independent file that permanently records the exact version it came from. Staff and share recipients can **compare** two versions side by side on the share page: two versions of one file, a fork against its source, or two sibling forks.

This phase is manual comparison only. There is no automatic change detection, no text diff and no explicit version publishing (see Out of scope).

## Scope (2026-11-16)

1. **Forks.** A fork is an independent file with its own versions, linked to the exact source version (`assets.forked_from_version_id`). Staff only. Created from Link Details → Versions. Private until attached to a link ("Add to this link", off by default). Decisions 7, 8.
2. **Compare on the share page.** Video, images, PDF and text. Same media kind only, within one family (a root file plus all forks descending from it). Recipients compare only files attached to the link; staff use the same page through **Compare with…** (decisions 9, 14).
3. **Video.** One shared timeline; both videos start at 0; no offset. The shorter side shows an "ended" state past its end (decisions 3, 4).
4. **Faithful media.** Each pane shows only its own version. A missing web copy is prepared on demand; nothing is ever substituted (decision 6).
5. **Comments, not approvals, in compare mode.** Comments go to side A or B with exact version and anchor; approvals stay in Preview (decision 10).
6. **Fork sources are never deleted** by any path (decision 12).
7. **Phones.** Media stacks A over B with one timeline; documents use an A | B toggle (decision 13).
8. **Free and Pro alike.** No new license restriction (decision 11).

## Out of scope

- Automatic change detection of any kind: pixel diffs, changed time ranges, masks, comparison jobs or caches (decision 1).
- Text/code line diff. Text compares as two plain panes of the actual content (decision 2).
- Video alignment offsets and automatic scene matching (decision 4).
- Explicit version publishing, per-link review targets and legacy-link conversion (decision 5). Today's rule stands: recipients see every version of an attached file.
- A compare screen inside the management app (decision 14).
- Merge/rebase, propagation between source and fork, recipient-created forks, copying comments/approvals/permissions to forks, inferring forks from names, OCR or semantic document diffs.

## Current code (evidence)

| Area | Finding | Where |
|---|---|---|
| Recipient version access | A version is allowed when its file belongs to the link | `houston-broadcaster/server/api/transcodes.js:71` (`assertVersionInLink`) |
| Version stream | Serves the version's snapshot (original bytes); falls back to the live file when the requested version is the latest | `api/transcodes.js:1612-1655` |
| Watermarked images | Resolves the **latest** watermarked image even when an older version is requested (bug for compare) | `api/transcodes.js:1678-1700` |
| Web copies | HLS / proxy MP4 are per version (`transcode_jobs.asset_version_id`) | `utils/transcodeArtifacts.js`, `utils/transcodeBackfill.js` |
| File copy | Only inline copies exist (version restore) | `api/files.js:357-362` |
| Foreign keys | Turned off during migrations; cannot be relied on for delete protection | `database/db.js:160-201` |
| Paths that remove versions/snapshots | Version delete, snapshot/artifact delete, link-delete cleanup, project-delete cleanup | `api/files.js:458`, `api/files.js:557-573`, `api/links.js:4094`, `api/projects.js:506` |
| Test runners | Server: vitest, root `server/` (`yarn test test/<file>`). Player: vitest + jsdom. App: vitest | `vitest.config.js`, `studiosharevideoplayer/package.json`, `45flow/package.json` |

## Contracts

These are fixed by this plan so threads can start in parallel. A change to a contract pauses the consumers and reruns their checks.

### C-SCHEMA (owner LF1)

- `assets.forked_from_version_id INTEGER NULL` referencing `asset_versions.id`, indexed. Existing assets stay `NULL`.
- `assets.fork_label TEXT NULL`.
- New table `fork_jobs`: `id`, `idempotency_key TEXT UNIQUE NOT NULL`, `source_version_id`, `dest_rel_dir`, `dest_filename`, `fork_label`, `attach_link_id NULL`, `state` (`queued` | `copying` | `done` | `failed`), `progress` (0–100), `error_code NULL` (`server_restarted` | `not_enough_space` | `name_taken` | `source_unavailable` | `copy_failed`), `result_file_id NULL`, `created_by`, `created_at`, `updated_at`.
- Added in both `system_files/opt/45drives/houston-broadcaster/scripts/init_db.py` (fresh install) and `server/database/db.js` (runtime upgrade). Idempotent.
- Readiness check: `yarn test test/linked-forks-lf1.test.js -t '^LF1 schema upgrades twice and preserves existing assets$'` exits 0 on the revision consumers rebase onto.

### C-FORK-API (owner LF1)

- `POST /api/files/:fileId/forks` (staff, `requireAuth`). Body `{ sourceVersionId, destRelDir, filename, label?, attachLinkId?, idempotencyKey }`. Returns `202 { ok, jobId }`; the same `idempotencyKey` returns the same `jobId`.
  Errors: `400` invalid input or path escape; `404` unknown file/version; `409 { code: 'name_taken' }`; `425 { code: 'source_not_ready' }` when the source snapshot isn't retained yet.
- `GET /api/fork-jobs/:jobId` → `{ ok, state, progress, errorCode, fileId }`.
- `POST /api/fork-jobs/:jobId/retry` → `202` for a `failed` job; `409` otherwise.
- `GET /api/files/:fileId/lineage` (staff) → `{ ok, origin, family }` where `origin = { fileId, filename, assetVersionId, versionNumber, available } | null` and `family = [{ fileId, filename, label, forkedFrom: { fileId, assetVersionId, versionNumber } | null, versions: [{ assetVersionId, versionNumber }] }]`.
- `is fork source` helper: `server/utils/forkLineage.js` → `forksOfVersion(assetVersionId)` returns `[{ fileId, filename }]`.

### C-VERSION-MEDIA (owner LF2)

- `server/utils/versionMedia.js` → `resolveVersionMedia({ assetVersionId, scope })`, where `scope` carries the link/recipient watermark context. Returns `{ state: 'ready', kind, hlsUrl?, proxyUrl?, url? }` or `{ state: 'preparing', kind }`. Never returns media belonging to another version or the live file.
- When a video version has neither HLS nor proxy MP4, `resolveVersionMedia` queues that version's transcode through the existing job path (at most one active job per version and kind) and returns `preparing`.
- Version-scoped token media routes return `425 { ok: false, code: 'version_media_preparing', assetVersionId }` instead of substituting.

### C-COMPARE (owner LF3)

- `GET /api/token/:token/compare?a=<assetVersionId>&b=<assetVersionId>` → `200 { ok, kind: 'video'|'image'|'pdf'|'text', sides: { a: Side, b: Side } }`.
  `Side = { fileId, assetVersionId, versionNumber, filename, label, forkedFrom: {...} | null, media: <resolveVersionMedia result>, review: { state } }`.
- `400 { code: 'kind_mismatch' }` for different kinds; `400 { code: 'not_related' }` for different families; `404` (same body as unknown ID) when either file isn't attached to the link.
- `GET /api/token/:token/files/:fileId/lineage` → same shape as the staff route, filtered to attached files only. `forkedFrom` is `null` when the origin file isn't attached.
- Share-page deep link: `?compare=<a>,<b>` (asset version IDs). Unrelated query parameters are kept.
- Capability flag: share metadata gains `capabilities.compare = true`; older players ignore it, newer players hide Compare when it's absent.

## Threads

One thread per unknown. Full gates are in `houston-broadcaster/gates/`.

| Thread | Unknown | Gates file | Repos |
|---|---|---|---|
| LF1 Fork lineage and copy | Can a fork be made as an independent copy of an exact version, linked to it, without ever leaving a partial or duplicate fork, and can its source never be deleted? | `gates/lf1-fork-lineage-and-copy.md` | server, app |
| LF2 Faithful version media | Can every version be shown with its own media only, prepared on demand when missing? | `gates/lf2-faithful-version-media.md` | server |
| LF3 Family compare access | What can a recipient compare without revealing files that aren't shared? | `gates/lf3-family-compare-access.md` | server |
| LF4 Compare workspace | Can two panes stay in step on one timeline, with comments on the right side, at desktop and phone widths? | `gates/lf4-compare-workspace.md` | player |
| LF5 End-to-end acceptance | Does fork → attach → compare → comment work end to end in real browsers and phones? | `gates/lf5-forks-compare-acceptance.md` | all three |

## Dependency graph

```
LF1 ──(C-SCHEMA ready)──┐
                        ├──> LF3 ──┐
LF2 ──(C-VERSION-MEDIA)─┘          │
                                   ├──> LF5 (end-to-end + sign-off)
LF4 (against C-COMPARE fixtures) ──┤
LF1 (fork API, dialog) ────────────┘
```

| Thread | Prerequisites | Start condition and evidence | Verification/landing prerequisites | Territory owner and integration order |
|---|---|---|---|---|
| LF1 | None | Now | LF1 gates G1–G6 pass | Owns C-SCHEMA, C-FORK-API, `db.js`/`init_db.py` schema, `api/files.js`, `api/projects.js` and `api/links.js` cleanup guards, `utils/forkLineage.js`, new `api/forks.js`, app fork dialog and Versions-tab changes in `LinkDetailsModal.vue`. Lands first. |
| LF2 | None | Now | LF2 gates G1–G4 pass | Owns `api/transcodes.js` version stream and watermark lookup, `utils/versionMedia.js`. Lands before LF3. |
| LF3 | LF1 (schema), LF2 (media helper) | Early start allowed when the C-SCHEMA readiness check passes on an LF1 revision, and `utils/versionMedia.js` exists on an LF2 revision with its G1 passing. Manager records both revisions and rebases LF3 onto them. | LF1 and LF2 verified and landed; LF3 gates rerun on the combined revision | Owns new `api/compare.js`, token lineage route, `capabilities.compare`. Shares `routes.js` and `utils/route-inventory.js` with LF1: LF1 lands first, LF3 rebases. |
| LF4 | None for building (works against C-COMPARE fixture responses) | Now | LF4 gates G1–G5 pass against fixtures | Owns player compare components, sync coordinator, `ShareView.vue` compare mode, `CommentsPanel.vue` A/B context, `ReviewDecisionPanel.vue` hiding, deep-link parsing. No server files. |
| LF5 | LF1, LF2, LF3, LF4 | All four verified and landed on `feat/linked-forks` in both repos | LF5 G1–G3 pass on the combined revisions; G4 human sign-off | Owns **Compare with…** in `LinkDetailsModal.vue` (after LF1's changes), the user guide section, and the end-to-end walkthrough script. |

**Edges cut by the Wait Test:** LF2 → LF4 and LF3 → LF4 (the player builds against fixed contract fixtures; real integration is proven in LF5). LF1 → LF2 (no shared logic or files).
**Edges kept:** LF1 → LF3 (family walk reads `forked_from_version_id`; shared `routes.js`). LF2 → LF3 (compare context embeds `resolveVersionMedia`). Everything → LF5.
**Tiers:** tier 0 = LF1 ∥ LF2 ∥ LF4; tier 1 = LF3; tier 2 = LF5. **End-to-end moment:** LF5 G1, the scripted fork → attach → compare → comment run.

## Checkpoint budget

1 human checkpoint: LF5 G4, Jordan Keough's browser and phone sign-off. Real devices and taste-level layout judgement can't be automated with the tools in these repos (jsdom has no layout engine; Playwright isn't a dependency). Every other gate auto-passes.

## Risks carried into the gates

- **Video bytes vs browser playback:** retained snapshots may be ProRes/MXF. Compare panes always use web copies (C-VERSION-MEDIA), never the raw snapshot stream.
- **Two video streams at once** doubles bandwidth. Both panes use the same quality level, so Data Saver halves both. Measured in LF5.
- **PDF memory:** the existing loader renders every page with a 10 MB preview limit. Compare loads only the visible page of each side (LF4).
- **Old/cached players** must keep working against an upgraded server: no response shape changes, only additions (LF3 G5).
- **Unpublishing doesn't exist yet** (decision 5): anything attached is visible, including in compare.
