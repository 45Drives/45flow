---
name: premium-feature-integration
description: Use this skill when implementing a paid/pro 45Flow feature that may require client changes, houston-broadcaster API changes, license gating, or compatibility checks against the free/community studio-share app.
---

# Premium Feature Integration

Use this workflow for paid/pro feature work in `45flow`.

## 1. Classify the feature

Classify the requested feature as one of:

- client-only
- client plus existing API
- client plus new/changed API route
- client plus server-side license gating
- client plus database/schema/persistence change
- shared behavior that may affect the community app

Do not start editing until this classification is clear.

## 2. Find the closest existing behavior

Search for similar behavior before creating new patterns.

Look for:

- existing components
- existing composables/stores
- existing API client functions
- existing server routes
- existing license checks
- existing settings persistence
- existing upload/share/review-link flows

Prefer extending an existing pattern over inventing a parallel one.

## 3. Define the client/server boundary

If `houston-broadcaster` is involved, define:

- route path
- method
- request body
- response body
- auth/token requirements
- license requirement
- unlicensed behavior
- error shape
- client fallback behavior

If the server repo is unavailable, do not invent implementation details. Create a clear API contract and mark the server work as required follow-up.

## 4. Apply premium licensing rules

For premium-only features:

- Add client-side gating only for UX.
- Require server-side enforcement for real protection.
- Reuse existing license-checking patterns.
- Ensure unlicensed servers fail safely.
- Ensure free/community behavior is not broken.

## 5. Implement the smallest vertical slice

Prefer a working vertical slice over a large partial refactor.

A good first slice usually includes:

- UI entry point
- state/types
- API client call
- server route or mocked/scaffolded contract
- loading/error state
- license handling
- basic validation

## 6. Validate

Run the most relevant available checks:

- install/build/typecheck/lint/test command from repo instructions
- targeted test command when available
- manual smoke-test steps if automated tests are absent

## 7. Summarize

End with:

- feature behavior implemented
- files changed
- client changes
- server/API changes
- license-gating behavior
- community/free compatibility impact
- validation performed
- remaining follow-ups