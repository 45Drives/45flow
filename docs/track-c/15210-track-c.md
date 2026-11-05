# Project 15210: Track C execution graph

**Current state, 2026-11-05:** C5 is now Active in native Princess, with its route-restriction and setup/private-administration documentation tasks Complete; four other tasks remain open. Its reference gateway source passed independent machine checks, review and final standing checks, and is pushed on its feature branch with evidence commit `d01228f90e25569feead68680b316e9888b91376`. No gateway was deployed; G3-G7 remain human RED. C2's decision-storage model is locally committed; independent review found a stale-version collection-summary bug, now in bounded correction (bounce 1). C3's SMTP invitation/durable-retry core is now being implemented against a local test sink. C1's partial public-address/No-IP core is independently cleared but not production-wired. C1/C2/C3 actual starts and current notes are confirmed in native Princess, though the writer ignores their requested Active/execution labels. No picker or fake completion was used. C4 remains Active, with 3 Complete/4 Execution/3 Todo and all ten tasks assigned to `mpyne`; its performance/human acceptance remain open. C6 preparation is locally committed at `9c30392939ab06710aa94ee62f408bb0bde095a9` and independently cleared, not browser acceptance. Only the existing linked C4 PRs are open; no new PR, merge or deployment. See [the execution record](15210-track-c-execution.md) and decisions 41-48. Set task statuses from evidence without asking the user to select them.

## Outcome and boundaries

Clients review and approve shared media from any device. Charter v6 is the requirements baseline. Track C owns its client screens, feature APIs, recipient app, tests and guides. Track A owns the shared shell/design system/browser platform; Track B owns shared server security, credentials, sessions and permission contracts. Security-alert emails remain B4.

Confirmed decisions: [15210-track-c-decisions.md](15210-track-c-decisions.md).

Licensing is resolved: No-IP is the only Pro-licensed Track C feature; the other Track C features are not Pro-gated (decision 39). Preserve the agreed No-IP fallback behavior. Earlier unresolved-packaging notes are superseded.

| Thread | Existing Princess ID | Canonical gates in houston-broadcaster | Charter effort |
|---|---|---|---|
| C1 Public Address & No-IP | f4393eae-9d41-4f4c-ade6-8a1f2ab2fdb1 | `gates/c1-professional-public-address-no-ip.md` | 24 h |
| C2 Client Review & Approvals | 6499728a-d138-4168-a100-ac8820743397 | `gates/c2-client-review-approvals.md` | 24 h |
| C3 Email Sharing & Notifications | ee2b1157-1d89-41f8-93bf-bc1df84d73cc | `gates/c3-email-sharing-notifications.md` | 16 h |
| C4 Playback, Transcoding & Bandwidth | f370250a-5f38-40e5-a9ff-f03581e384d9 | `gates/c4-playback-transcoding-bandwidth.md` | 32 h |
| C5 Remote Client Access | b0aae1ad-ad98-4eff-93e7-3d2fa0d260ec | `gates/c5-remote-client-access-share-gateway.md` | 24 h |
| C6 Browser Workflow Validation | 9c442d8b-56e1-4b93-a203-9a97f6ed12a3 | `gates/c6-browser-workflow-validation.md` | 16 h |

136 h is the existing charter allocation, not a new bottom-up estimate or a promised completion date. No effort, start or end fields were changed by this planning interview.

## Source and workspace registry

| Surface | Planning checkout | Baseline |
|---|---|---|
| Client | `/home/mpyne/gitprojects/copilot-worktrees/45flow/mpyne1-potential-pancake` | `6e6a3fdfcd43e6786449c36be23f371f901b2d11` |
| Server + recipient | `/home/mpyne/gitprojects/copilot-worktrees/houston-broadcaster/mpyne1-stunning-sniffle` | `e4d8dba4a63095be327a63b99db00707d86582d5` |

Canonical gate commands run from the server checkout. For client checks, set `FLOW_CLIENT_REPO` explicitly to the isolated client checkout. Never operate in either main checkout. These paths identify the original local working surfaces; another execution host must receive the reviewed documents and candidate revisions rather than assuming these paths exist there.

Navigation used direct source and GitHub file/tree reads because the Graft CLI/MCP was not available. The recipient app lives in `studiosharevideoplayer`, not a third repository. Server tests use Vitest rooted at `server`, viewer tests use its workspace runner, and client acceptance tests must use `.test.js`: the current client runner excludes `.test.ts` and `.spec.ts`.

## First end-to-end moment

In the dedicated lab, an owner emails a hostname-based HTTPS review link; a recipient on an outside network opens it without VPN/app installation, plays a low-bandwidth rendition, comments/marks up a PDF and approves an individual version as the designated approver. Replacing that version requires new approval. The owner sees status, notifications and CSV/JSON history. Administration remains unreachable publicly.

Reach the direct-address laboratory slice before finishing every polish task. Add the gateway path once its boundary is ready; repeat the same recipient workflow rather than accepting a separate proxy-only demo.

## Unknowns that change the plan

| Unknown | Resolution/hilltop | Consequence |
|---|---|---|
| A/B integration contracts are unavailable | Capture agreed, versioned component/browser, credential, session and approval-permission contracts | Production adapters/UI bindings wait; pure feature logic can proceed against explicitly provisional fixtures |
| No-IP host-creation access | C1 G1 chooses supported API or approved website fallback from real provider evidence | Determines the setup workflow, not whether hostname-based URLs or DDNS updates are required |
| GPU candidate verified; protocol and targets remain open | Candidate inventory and H.264 NVENC smoke passed; C4 G1 still needs reference media/hashes, encoding/network protocol, baseline and approved numeric targets | Existing-contract job work can proceed; performance-dependent choices and C4 G8 cannot finish beforehand |
| Gateway boundary | C5 explicit route inventory, nginx/WireGuard policy and B review | May revise the public route allowlist; never solve it by exposing the full API |

Do not treat unresolved discovery as a mock success. If an answer changes downstream work, stop that branch and re-author its affected gates with the user.

## Task graph and Wait Test

These are execution tasks inside the six existing threads, not requests to create more Princess threads.

| Node | Bounded task | Real prerequisites | Output / affected territory |
|---|---|---|---|
| H-A | Obtain A handoff | Upstream owner | Versioned shared components/browser capability contract |
| H-B | Obtain B handoff | Upstream owner | Versioned credential/session/approval authorization contract and boundary review process |
| D-1 | Verify No-IP API access | Dedicated test account | C1 G1 evidence and selected creation flow; no secret persistence |
| D-4 | Locate GPU and measure baseline | User-supplied server | C4 G1 evidence and approved thresholds |
| P-6 | Author browser matrix/fixtures | Confirmed decisions | C6 fixture cases; no claim that real browsers passed |
| C1-core | Hostname/DDNS policy and provider adapter | D-1 | Feature-local server module and tests |
| C4-core | Playback selection and job/backfill policy | Existing job/player contracts | Feature-local media logic/tests; defer target-dependent choices until D-4 |
| C5-infra | Reference nginx/WireGuard setup and negative-route fixtures | H-B boundary contract | Gateway config/guide; no live deployment before lab authorization |
| C2-core | Review-context/version model and decision/event contract | H-B approval contract | Feature-local review API/schema/tests; event schema handed to C3 |
| C3-mail | Mail delivery/retry worker and status model | H-B mail-credential contract | Feature-local mail module/test sink; does not need finished C2 screens |
| C1-integrate | Public-address setup and real credential integration | H-A, H-B, C1-core | Settings adapter, client child component and live C1 lab check |
| C2-integrate | Approval screens/PDF markup/export | H-A, C2-core | Shared-component consumers, viewer markup and CSV/JSON exports |
| C4-integrate | Profiles, real encoder selection and browser playback | H-A, C4-core, D-4 for performance choices | Shared-setting integration, viewer/player/job integration and real metrics |
| C3-integrate | Invitations, review/download events and visible status | H-A, C1 URL contract, C2 event contract, C3-mail | UI adapters/event consumers; no need to wait for unrelated PDF polish |
| C5-integrate | Public route policy and large-transfer recovery | C1 URL contract, agreed recipient-route inventory, C5-infra, B review | Real outside-network gateway checks |
| C6-final | Cross-feature real browser/upgrade acceptance | Real A/B integrations and C1-C5 evidence | Signed matrix/report and routed/closed release blockers |

Potential width after prerequisites: D-1, D-4 and P-6 are independent; C1-core and C4-core are separate lanes; C2-core, C3-mail and C5-infra can overlap after the applicable B contracts. Do not serialize C3's transport worker behind the complete C2 UI. C6 fixture authoring does not wait for C1-C5 completion; final acceptance does.

Every listed edge changes the dependent task's interface, environment or acceptance result. Calendar order alone is not a dependency. Do not convert this graph into a six-thread width-one chain.

## Territory / integration policy

| Shared territory | Collision | Handling |
|---|---|---|
| Client `SettingsModal.vue`, `CreateLinkView.vue`, `useApi.ts` | C1/C3/C4 settings and capabilities | Feature-local components/modules; serialize shared adapters after the relevant upstream contract |
| Server `settings.js`, `links.js`, database schema/migrations and route registration | C1/C2/C3/C4/C5 integrations | Isolated worktrees per lane; one integration owner serializes shared-file merges and rechecks invalidated gates |
| Viewer `ShareView.vue`, `CommentsPanel.vue`, `VideoPlayer.vue`, annotation components | C2/C4/C6 | Separate feature modules where practical; merge behind feature gates rather than concurrent edits in one checkout |
| Proxy config and public route inventory | C5 with B and changing C2/C3 endpoints | B-reviewed allowlist; repeat outside-network denial checks when exposed routes change |

Isolation does not make incompatible shared-file edits independent. Do not change A/B-owned shared foundations to bypass an unavailable handoff.

## Verification and release policy

All gates start RED. Executors cannot change criteria or mark their own work GREEN. A fresh-context verifier owns machine verdicts; named human signers own manual verdicts. Jordan Keough is the independent manual/end-to-end reviewer and must not approve implementation he produced.

Tests referenced by the gate drafts are specifications for ordinary tests to add with the existing runners, not existing tests claimed to pass. Use golden fixtures/provider contracts for expected results, unique temporary storage, a local mail sink and blocked system-changing subprocesses in ordinary tests. Real-provider, gateway, hardware and device checks use separately authorized, explicitly named lab resources.

Use the existing builds/test runners. Standing suites run once at final landing, not on every bounce; rerun affected/invalidated checks after changes. Record evidence with revision, environment, exact command, deciding outcome and log path. Never mark missing hardware, unsupported API access or unavailable devices GREEN.

Plan for at most two correction bounces, then stop for a diagnosis and user-approved escalation. Do not increase the budget to force a pass. After a gate turns GREEN, recalibrate downstream assumptions; report actual plan changes, not routine progress.

Each feature phase includes its guide, browser check and upgrade/regression check. C6 collects standalone-update evidence and final combined acceptance. Existing charter dates are context, not authorization to skip prerequisites or promise a date with unresolved hardware/contracts.

## Initial readiness and authorization (planning baseline)

- Ready now: review these drafts; obtain upstream contracts; organize lab resources; resolve No-IP API access.
- Not ready for unattended end-to-end execution: required A/B integration evidence, real GPU measurements/targets and live lab/device evidence remain outstanding.
- Not authorized by this draft: feature implementation, deploy/scan of any production/customer system, commits/pushes/PRs, changing Princess dates/estimates or replacing the user's earlier stop.
- Princess gate-path references have not been written. The user must authorize that metadata change separately; the table above maps the existing IDs to the canonical files without changing records.

## Gate confirmation at the planning baseline

The user confirmed the six canonical gate drafts and this graph as the planning baseline on 2026-11-04, with upstream/hardware/licensing blockers left open. Implementation and Princess changes remain paused. All 46 gate verdicts remain RED; confirming the criteria is not acceptance of an implementation.

Authoring preflight: the installed gates linter reported zero diagnostics across the six canonical files. This is syntax validation only, not execution evidence. Any subsequent change to scope or acceptance must be recorded in the sibling decisions log before execution.

Subsequent authorization: decision 32 permits work that is ready now. The preceding confirmation records the original pause, not the current implementation state. GPU measurements/targets, actual A/B integration evidence and independent acceptance are still required where applicable. Decision 39 resolves Track C licensing; it is no longer a blocker.

## Current completion frontier

Decision 35 requests continued progress toward thread completion after the candidate GPU passed its approved functional check. The GPU access/functionality blocker is cleared, not the real-performance approval gate.

| Thread | Work that can progress | Still needed for completion |
|---|---|---|
| C1 | Provider workflow discovery and feature-local policy work as prerequisites become available | Real No-IP workflow/account evidence, B credential/API contract, A integration, trusted-HTTPS outside-network acceptance |
| C2 | Feature-local fixture/export preparation; production integration waits for actual permission/session contracts | A/B handoffs, implemented review/PDF/export workflows, real browser acceptance |
| C3 | Feature-local delivery/status work after its mail-credential contract; event consumers need not await finished C2 screens | B mail contract, C1 URL and C2 event contracts, authorized SMTP/inbox evidence and integration |
| C4 | Machine-scope implementation READY: G2-G7 GREEN, integration bugs resolved, review clear; authorized generated-doc fix reviewed and full server recheck passes, builds/viewer checks pass | Full thread still needs G1 media/protocol/baseline/approved targets, applicable shared-setting integration and G8 real-hardware acceptance; Princess has 3 complete / 4 execution / 3 todo tasks, not a complete thread; no deployment or merge authorized |
| C5 | Feature-local reference fixtures after B boundary/route agreement; not inherently blocked by provisioning | B review, C1 URL/route inventory, named VPS/site lab, authorized external gateway and large-transfer acceptance |
| C6 | Browser matrix and golden fixture authoring can begin before all features finish | Actual A/B and C1-C5 integration evidence, real desktop/mobile devices and Jordan's independent acceptance |

No whole C1-C6 thread is complete. Continue independent ready work rather than treating every external dependency as a stop on all coding. Never substitute provisional fixtures for the upstream contracts or live evidence required by a gate.

## Clarified external inputs

- Track A supplies the shared shell, navigation/layout/design-system components and browser platform. Track C owns its feature-specific screens and APIs. Track B supplies server authorization, session/credential rules and the network boundary, not a generic set of UI elements that C must wait for.
- Before declaring an implementation task blocked on A/B, identify the specific missing interface/component and check whether an existing implementation can be used. No missing shared UI component has been established as a blocker to the completed C4 machine implementation.
- C4 playback-start time, transferred bytes and GPU/CPU transcode elapsed time still need comparable baseline/candidate measurements. The charter requires faster playback/encoding and reduced mobile data; it does not supply numeric thresholds. The synthetic 60-frame NVENC smoke is functionality evidence, not a performance benchmark.
- No-IP/SMTP accounts and human manual tests are acceptable for real-provider acceptance (decision 40); they need not hold up independent fixture/feature work.
- C5's B review concerns a concrete share-only public allowlist, private administration/backend port 9095, authorization/proxy trust and fail-closed tunnel behavior. It is not approval of C's UI.
- Jordan's acceptance uses the authored C4/C5/C6 procedures and a candidate/environment-specific result matrix. Required cases must pass, not remain unexecuted; missing measurements or real devices cannot be replaced with mock results.
