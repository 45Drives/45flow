# 45Flow Premium Copilot Instructions

## Repository role

This repository is the paid/pro version of the 45Flow app. It is the primary application currently under active feature development.

The related free/community app repository is `studio-share`. The free version is mostly stable and should not be modified unless the task explicitly requires keeping behavior aligned between free and paid versions.

The shared server/API package is `houston-broadcaster`. It supports both the free and paid versions. Premium-only API behavior is gated by server licensing.

## Product model

There are two app editions:

- `studio-share`: free/community version
- `45flow-premium-dev`: paid/pro version

Premium features should be implemented in this repo unless the feature clearly belongs in shared infrastructure or the server API.

Do not accidentally backport paid-only UI, paid-only feature logic, or premium-only workflows into the free/community repo.

## Server/API relationship

The app talks to `houston-broadcaster`, which provides shared API behavior for both free and paid versions.

Before implementing a feature, determine whether it is:

1. Client-only
2. Client plus existing API
3. Client plus new/changed API route
4. Client plus server licensing gate
5. Client plus persistence/database/server schema change

If a feature touches any of the following, inspect or define the `houston-broadcaster` API behavior before implementing:

- share links
- review links
- upload sessions
- local upload behavior
- QuickShare behavior
- project or directory sharing
- transcoding state
- comments
- annotations
- custom branding
- white-label behavior
- auth
- token validation
- license-gated routes
- paid/pro feature checks
- server-side persistence

If the `houston-broadcaster` repo is not available in the current workspace, do not invent server behavior. Instead, implement only safe client-side scaffolding and clearly document the required server/API contract.

## Feature implementation rules

When adding a feature:

1. Search for the closest existing implementation first.
2. Trace the current UI/state/API flow before editing.
3. Prefer the smallest coherent vertical slice.
4. Reuse existing composables, stores, API clients, types, and UI patterns.
5. Keep LocalUploadPanel and QuickShare behavior consistent when they represent the same conceptual workflow.
6. Avoid broad rewrites unless the task specifically requires them.
7. Preserve existing behavior unless the request explicitly changes it.
8. Keep free/community and paid/pro boundaries clear.

## Premium/licensing rules

Premium features may require server-side license checks in `houston-broadcaster`.

Do not rely only on client-side hiding for paid/pro restrictions. Client-side gating is useful for UX, but server-side enforcement is required for real premium protection.

When a feature is premium-only, identify:

- UI gating
- API route gating
- server license check
- fallback behavior when unlicensed
- error handling for expired/missing/invalid license

## Expected output after work

After making changes, summarize:

- what changed
- files changed
- whether the change is client-only or requires `houston-broadcaster`
- any API contract assumptions
- any premium/license gating added or required
- validation performed
- follow-up work