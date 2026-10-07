# Spotmi in ezrá — product design and integration proposal

Date: 2026-10-06. Status: **reviewable design, local simulation only**.

## What is delivered

A responsive, interactive prototype for the eight proposed sections, a behavior specification, an implementation architecture, and a staged cost and integration plan. The prototype deliberately cannot call production APIs: its preview server sends `connect-src 'none'` and serves only three generated static files on `127.0.0.1:4177`.

Run from the repository root:

```sh
node scripts/preview-spotmi-design.mjs
```

Open <http://127.0.0.1:4177>. “Ver móvil” provides an additional narrow layout preview. The React/TypeScript source uses the repository's existing dependencies; esbuild is already installed through the development dependency tree. No package was installed. Output goes to ignored `work/spotmi-design/`. This is a design harness, not a replacement Next.js application or a production server.

State is validated with Zod and saved under the independent browser key `ezra:spotmi-design:v1`. Demo data never enters `data/`. Reset affects only this demo. The preview does not load production accounts, business records, media, credentials, or automation state.

The sample sources use reserved `.example` domains. Conversations, counts, generated views, verifications, and run records are explicitly simulated. The text renderer and reply examples are deterministic local behaviors, not Orshot output or an AI model. The prototype exports a **JSON proposal**, not a finished production image or social post. The wordmark uses a typographic treatment and a Lucide compass; replace this proposed mark with the approved Spotmi logo asset during implementation.

## Recommended visual direction

**A local editorial studio with an operational inbox.** Spotmi's ocean blue, warm yellow, tourism vocabulary, and spacious cards connect the dashboard to the supplied public-site references. ezrá remains visible as the platform behind the business workspace.

The dark sidebar anchors navigation. The warm canvas keeps long operational sessions calm. Blue is reserved for clear primary actions; yellow marks emphasis and selection. Green represents a verified or successful state, always accompanied by text. Photography belongs inside authorized content previews, not behind controls. The prototype uses an original typographic composition instead of pretending an illustration is a real destination photograph.

| Token     | Proposed value | Purpose                                       |
| --------- | -------------- | --------------------------------------------- |
| `primary` | `#06354C`      | Primary actions and branded creative          |
| `sidebar` | `#172838`      | Workspace navigation                          |
| `accent`  | `#D4AF32`      | Selected navigation and restrained highlights |
| `canvas`  | `#F7F5EF`      | Warm background                               |
| `surface` | `#FFFFFF`      | Forms, cards, and conversations               |
| `success` | muted green    | Verified knowledge and completed work         |

The palette is inferred from screenshots, not a verified brand manual. Existing `readableOnWhite` logic darkens the chosen primary color for white button text. Fonts stay local/system. Main controls have visible focus states; mobile form inputs use 16px text and primary actions target at least 44px height.

Desktop: a persistent sidebar, compact header, next action, derived operational counts, creative preview, and attention queue. Mobile: a menu toggle, stacked sections, readable forms, and a conversation list above the selected thread. The five required flows are responsive: dashboard, sources, creative workflow, unified inbox, and bot configuration.

## Information architecture

| Section              | Main decision                                        | Primary action             | Empty/error behavior                                            |
| -------------------- | ---------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| Resumen              | What needs attention next?                           | Crear contenido            | Guide setup; no fabricated social metrics                       |
| Lugares y eventos    | Which facts can Spotmi use?                          | Empezar con una fuente     | Keep unknown prices, dates, and locations blank                 |
| Contenido            | Is this exact version ready?                         | Generate preview / approve | Explain missing source, text, or render                         |
| Automatizaciones     | What ran and what needs recovery?                    | Probar flujo               | A first-run guide; failure includes a cause and recovery action |
| Bandeja              | Can the bot answer, or must a person take over?      | Tomar conversación         | Unknown facts route to human attention                          |
| Conexiones y fuentes | Is this an authorized account or an information URL? | Añadir fuente              | Separate connection requirements from source verification       |
| Marca y conocimiento | What can the business say, and how?                  | Approve knowledge          | Editing trusted knowledge removes approval                      |
| Ajustes              | Which channels and rules are enabled?                | Select Off/Test            | Live activation shows prerequisites, never a fake connection    |

Production access/retention/backup controls remain a specified extension of Ajustes; the prototype focuses on bot modes and budget. Places/events show an intentional empty state and field outline rather than invented listings. Frequency configuration is a future capability in the specification, not an active scheduler in the mockup.

## Important control behavior

| Control                         | Prototype behavior                                              | Production contract                                                                      |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Navigation                      | Changes the local view                                          | Preserve selected business; authorize every server query                                 |
| Ver móvil / Ver escritorio      | Changes the prototype container width                           | Preview-only; not a product setting                                                      |
| Añadir fuente                   | Opens a keyboard-accessible native dialog                       | Validate ownership/authorization and source type                                         |
| Guardar en la demo              | Saves a pending URL locally; rejects non-HTTPS and duplicates   | Record allowlist, consent, fetch policy, and verification separately                     |
| Verificar en demo               | Changes a sample verification flag                              | Show extracted facts, original URL, observation date, and owner decision before approval |
| Retirar verificación            | Removes verification and revokes draft approval                 | Invalidate dependent knowledge and content; prevent queued use                           |
| Ver requisitos                  | Shows the relevant channel checklist                            | Start official authorization only when the selected integration is implemented           |
| Fuente del contenido            | Selects a sample source                                         | Only approved, unexpired source facts are usable                                         |
| Objetivo editorial              | Changes the example caption                                     | Record intent as part of the generation input                                            |
| Título / Texto / Formato        | Updates preview and revokes render/approval                     | Create a new editorial revision; never mutate an approved snapshot                       |
| Generar vista local             | Builds a local typographic preview and records a demo run       | Reserve budget; call the chosen renderer; validate output; store a versioned asset       |
| Aprobar versión en demo         | Requires reviewed checkbox, verified source, and generated view | Bind approval to content, media, brand, facts, and template revisions                    |
| Descargar propuesta de ejemplo  | Downloads JSON marked `simulation: true`                        | Future export bundles text and authorized media; exporting is not publication            |
| Probar flujo                    | Records an explicitly local simulation                          | Execute only in the selected mode with audit and idempotency                             |
| Pausar pruebas                  | Blocks starting simulated jobs                                  | Stop new starts and revoke unsent jobs; do not promise to undo accepted external work    |
| Ver ejecución                   | Opens the explanation of the sample run                         | Show inputs, step results, costs, timing, retry eligibility, and correlation ID          |
| Conversation selection          | Selects a channel-specific demo thread                          | Scope by business, connection, and provider conversation ID                              |
| Tomar conversación / Pausar bot | Immediately switches the sample thread to human control         | Atomically acquire human ownership and cancel queued bot sends                           |
| Resolver                        | Closes the demo thread and disables its composer                | Close only the local handling state, not the platform conversation                       |
| Reanudar prueba                 | Restores bot ownership only when channel Test is enabled        | Explicitly release human ownership; recheck channel and message eligibility              |
| Probar como Visitante           | Adds a fake inbound message and runs local reply rules          | Real inbound events come only from verified provider webhooks                            |
| Probar como Propietario         | Adds a local human reply and pauses the bot                     | Authorize the operator; obey the channel's sending window                                |
| Bot Off                         | No sample automatic replies                                     | Store inbound messages; no bot sends                                                     |
| Bot Test                        | Local sample replies only                                       | Run evaluation on fixtures or shadow drafts, never external sends                        |
| Bot Live                        | Unavailable; requirements are visible                           | Enable only after server-side readiness checks and explicit owner activation             |
| Approve knowledge               | Approves the edited sample FAQ                                  | Version the facts, approvals, provenance, expiry, and permitted use                      |
| Restablecer demo                | Confirmation then replacement of this demo state                | Preview-only; never reset real business data                                             |

A real Live bot automatically answers routine supported questions. It does not ask the owner to approve each routine reply. Human review is for knowledge and policy changes, unsupported questions, and escalation. Social publishing is a separate capability: approval of a creative version does not authorize arbitrary edits, outbound promotions, or bot activation.

## State models

**Source:** `draft → authorized → collecting → needs_verification → verified`, with `paused`, `expired`, `blocked`, and `failed` alternatives. Account authorization and fact verification are different records.

**Knowledge:** `proposed → approved → expired/revoked`. Store fact-level provenance, `observedAt`, `verifiedAt`, `validFrom/validUntil`, approver, and revision. A newer scrape cannot silently replace an approved answer. Conflicting facts route to review.

**Creative:** `draft → generated → in_review → approved → exported`. Editing copy, media, source facts, template, or brand creates a new unapproved revision. Publishing, if added later, uses a separate approved send job and provider-confirmed result.

**Job:** `queued → reserved → running → completed`, with `blocked`, `failed`, `cancelled`, and `outcome_unknown`. A timeout after dispatch is not proof that nothing happened. Reconcile before retrying a render or message that might already have been accepted.

**Conversation:** `bot_owned → human_requested → human_owned → resolved`. An explicit action can return ownership to the bot. New incoming messages may reopen a resolved thread using a documented policy; the demo requires an explicit restart. Channel mode is independent from conversation ownership.

## Proposed implementation architecture

Keep Next.js, TypeScript, CSS variables, Lucide, Zod, and the existing access model for the local stage. Extend business profiles with a reusable editorial/tourism preset rather than checking whether `name === "Spotmi"`. Preserve the current `appearance` fields and translate them into semantic theme tokens.

ezrá owns state and authorization. n8n is a candidate executor, not the database and not the approval authority. It receives signed/secret-authenticated jobs and returns validated results. It never edits workspace JSON directly.

Suggested domain records, each including `businessId` and `schemaVersion`:

- `Source`: kind, URL/account reference, authorization, allowlist, limits, schedule, last result.
- `Connection`: provider, external account ID, granted capabilities, server credential reference, health, expiry.
- `KnowledgeFact`: normalized value, provenance, revision, approval, validity, permitted uses.
- `CreativeTemplate`: provider/local renderer, template revision, dynamic field schema, permitted media policy.
- `CreativeVersion`: exact copy, source fact revisions, media hashes, brand/template revision, approval.
- `AutomationJob`: mode, type, idempotency key, status, reserved budget, provider IDs, attempts, outcome.
- `Conversation`: connection, external thread ID, channel, ownership, revision, escalation reason.
- `Message`: provider event/message ID, direction, delivery status, timestamps, policy snapshot.
- `BotPolicy`: channel modes, response scope, fallback, escalation, retention, and revision.
- `BudgetLedger`: monthly business and global caps, reservations, settlement, and unresolved charges.

### Collection and creative flow

1. Owner selects a specific authorized source and extraction purpose.
2. Server checks allowlist, mode, limits, and budget before dispatch.
3. Use API/RSS first. Apify is an optional adapter for an individually assessed Actor and source. No generic URL crawler, login-cookie harvesting, or private-message scraping.
4. Bound redirects, pages, bytes, result count, execution time, frequency, and concurrency. Guard server-side URL fetches against loopback/private-network access and DNS/redirect changes.
5. Check robots.txt where applicable and source/platform permissions. A timeout or blocked source has a visible failure; it does not trigger an unbounded retry.
6. Deduplicate by source and normalized content identity. Keep the minimum fields and original links. Store full text or third-party media only under a separately documented authorized policy; current pilot restrictions remain in force.
7. Propose structured facts; require explicit verification before they enter business knowledge.
8. Generate copy only from approved, valid facts and permitted brand instructions. Source text is untrusted input. Unknown prices, dates, stock, and capacity stay unknown.
9. Render a selected template with authorized assets. Validate dimensions, text overflow, format, output size, and asset provenance. Prefer one 4:5 and one 1:1 image initially; 9:16 is a designed extension.
10. Review the exact version and export. Future publishing has an independent activation and authorization contract.

The local renderer fallback should use versioned SVG/HTML templates with escaped text and controlled assets, then a deterministic server rasterizer. It is not a new generative-image service. AI-generated media, if added, must retain labeling and cannot masquerade as a verified destination photo.

### Incoming-message flow

1. Verify webhook challenge and event signatures; map the provider account to a business on the server. Never trust a client-supplied business ID for this mapping.
2. Persist/deduplicate provider events and acknowledge promptly. Ignore outgoing echoes and prevent bot loops.
3. Check channel mode, conversation ownership, response eligibility, current knowledge/policy revision, and budget.
4. Retrieve only approved, unexpired facts for the active business. Never mix knowledge or conversations between tenants.
5. Known routine question: compose a concise answer, identify the business assistant, and dispatch automatically if Live is enabled. Test remains local/shadow only.
6. Unknown, stale, conflicting, complaint, payment, unverified availability, or human request: hand off. Do not fabricate a booking, refund, price, or action confirmation.
7. Immediately before sending, atomically recheck conversation ownership/revision and channel activation. A human takeover between generation and send must cancel the pending bot response.
8. Store provider acceptance/delivery separately. On an unknown outcome, reconcile before retrying. Rate-limit per conversation and per business; coalesce rapid incoming messages to avoid reply bursts.

Do not allow the model to change its own policy, access other tenants, execute arbitrary URLs/tools, grant discounts, issue refunds, or send promotional campaigns. Customer input is conversation data, not an instruction to override the bot's business policy.

### Persistence and deployment boundary

Local JSON and a single-process writer remain adequate for design and bounded simulation. Extend validated schemas with backward-compatible migration and media-inclusive backup before local integration. Test against a separate `work/` data folder.

Before continuous production: choose durable storage/queue semantics, encrypt credential references at rest, enforce per-business server authorization, implement retention/export/deletion, establish backups and recovery, and expose only a hardened HTTPS webhook ingress. A public webhook cannot reach a sleeping Mac. Do not tunnel or deploy the present loopback-only pilot as a shortcut.

A production storage/hosting decision is deliberately pending. No Supabase, ORM, hosting subscription, or infrastructure migration is introduced by this proposal.

## Phased delivery and acceptance gates

| Phase                      | Work                                                            | Exit criteria                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Design                 | This prototype and specification                                | Owner can inspect the five main desktop/mobile flows; behavior is explicit                                                                         |
| 1 — Local simulation       | Extract typed domain models/adapters and fixtures into the app  | Tenant isolation, invalidation, duplicate events, budget reservations, and human takeover races tested; no external effects                        |
| 2 — One verified source    | One owner-authorized RSS/site source under current restrictions | Bounded request, robots behavior, provenance, deduplication, failure path, and explicit verification pass                                          |
| 3 — One rendering template | One branded template, local first or Orshot Free if configured  | Text fit, permitted assets, formats, cost reservation, exact-version review, export, and failure recovery pass                                     |
| 4 — One messaging channel  | Recommend Instagram test account first, subject to eligibility  | Official permissions verified; test recipient events; Off/Test/Live isolation; handoff; duplicate prevention; opt-out and window handling verified |
| 5 — Expansion              | Facebook Messenger, then WhatsApp, then additional businesses   | Per-channel onboarding and pricing confirmed; tenant isolation and credentials audited; actual measured costs fit budget                           |
| 6 — Continuous operation   | Eligible source schedules and reliable hosting                  | Hosting/storage/security decision implemented, missed-run policy defined, recovery tested; no catch-up bursts                                      |

Source scheduling and bot messaging are separate approvals. Turning on routine inbound replies does not turn on collection schedules, marketing outreach, or automatic creative publication. A second tenant cannot inherit Spotmi's credentials or enabled modes.

## Budget comparison

Public prices checked on 2026-10-06; no account-specific entitlement or subscription was inspected. Taxes, exchange rates, and later pricing changes are not included. Verify the actual account before activation.

| Option                                | Published basis / planning allowance                       | Decision for the USD 20 ceiling                                                                           |
| ------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Current local prototype               | USD 0 service calls                                        | Available now; no live integration                                                                        |
| Local RSS and deterministic rendering | No external API fee; local machine runtime                 | Preferred first bounded source and renderer                                                               |
| Apify Free                            | USD 5 platform credit, no card required                    | Candidate only after Actor-specific costs/permissions are assessed; no paid overflow                      |
| Apify Starter                         | USD 19/month plus usage                                    | Consumes almost the whole total budget; not recommended for this pilot                                    |
| Orshot Free                           | 100 render credits/month; one workspace; REST API included | Candidate for a small Spotmi-only template pilot                                                          |
| Orshot Launch                         | USD 39/month                                               | Exceeds total budget                                                                                      |
| Orshot social publishing add-on       | USD 12/month per social account                            | Two accounts would be USD 24 before other costs; exclude                                                  |
| n8n Community local                   | No software subscription for qualifying usage              | Existing candidate; operation stops with the Mac; license fit for client configuration needs confirmation |
| WhatsApp                              | Category/market/window-dependent pricing                   | No blanket zero-cost promise; verify number, region, category, and any intermediary fees                  |
| AI                                    | Model and data-processing terms not selected               | Allocate at most USD 5/month; deterministic FAQs can run without an LLM                                   |
| Hosting/storage                       | No supplier selected                                       | Planning allocation only, not a verified quote                                                            |

**Proposed future allocation, not a price promise:** hosting/storage USD 7 + AI USD 5 + messaging USD 3 + contingency USD 5 = USD 20. Apify and Orshot must remain within eligible free allowances; otherwise pause or use the local fallback. If reliable hosting/storage or license requirements cannot fit the allocation, retain a local/test pilot rather than silently exceed the cap.

Example sizing assumptions: 20 posts × 2 image sizes = 40 template renders/month. 300 conversations × 4 replies = 1,200 possible model calls; at an assumed 1,000 input and 200 output tokens per reply, budget against 1.2M input and 0.24M output tokens using the chosen provider's current rates. This is a volume scenario, not measured Spotmi traffic. Apify costs cannot be inferred from result count alone without selecting the Actor and its pricing model.

Enforce a global USD 20 cap and subordinate business/provider caps in the server ledger. Reserve worst-case cost before dispatch, include retries and uncertain outcomes, and reconcile after completion. A dashboard warning alone is not a spending limit. Unknown charges block further paid dispatch until reconciled.

## Integration requirements and uncertainty register

| Area               | Established for the design                                                                                                 | Must be verified before implementation/live use                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apify              | API token authenticates Apify; Actors have their own purpose/costs                                                         | Fresh restricted token; Actor ID/version; source permission; full cost model; limits; retention                                                             |
| Orshot             | Template rendering API and published free allowance exist                                                                  | Actual account allowance; template ID; dynamic-field names; media rights; output lifetime; callbacks; per-business asset isolation                          |
| Instagram          | Professional-account messaging is supported by the Meta platform                                                           | Actual account eligibility; chosen Instagram Login vs Facebook Login path; exact permission names; required access tier/review; webhook fields; reply rules |
| Facebook Messenger | Page messaging and a standard response window are documented                                                               | Page control; app roles; Page token/permissions; subscribed events; review for real customers; current exceptions                                           |
| WhatsApp           | Approved templates outside the 24-hour service window; human escalation required for automation                            | WABA and number eligibility; Business App coexistence path; registration impact; exact webhook/token permissions; current rates and account-specific fees   |
| Meta webhooks      | Requires reachable ingress for actual inbound events                                                                       | Signature verification, challenge handling, account routing, retry/deduplication, credential expiry, HTTPS deployment                                       |
| n8n license        | Official help permits some provider-managed client workflows; client workflow configuration changes the licensing analysis | Classify ezrá's future client controls before commercialization; do not assume hiding the editor avoids licensing requirements                              |
| Live bot knowledge | Can be scoped to approved Spotmi facts                                                                                     | Real FAQs, business hours, escalation recipient/availability, privacy and retention settings                                                                |

Several Meta developer pages returned rate limiting or were not retrievable in this research session; the Meta-maintained Postman collection is a useful reference but its rendered pages exposed limited content. Exact scope strings and the selected onboarding path are intentionally **unverified**, not represented as implementation-ready API configuration. No live setup was attempted.

## Sources and research notes

- [Apify API authentication and scoped tokens](https://docs.apify.com/integrations/api): tokens belong on the server; exposed tokens should be rotated; scopes must match intended resources.
- [Apify pricing](https://apify.com/pricing): Free credit and Starter subscription comparison above.
- [Apify usage and resources](https://docs.apify.com/actors/running/usage-and-resources): compute, transfers, proxy, and storage can contribute to usage.
- [Orshot API reference](https://orshot.com/docs/api-reference): render templates and manage assets through authenticated API calls.
- [Orshot pricing](https://orshot.com/pricing): free quota, paid plan, API availability, and optional social publishing pricing.
- [Meta Instagram collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api): professional-account and messaging reference; exact implementation details require a fresh verification.
- [Meta Messenger Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api): standard reply-window reference; confirm current permissions and exceptions for the app.
- [WhatsApp pricing](https://business.whatsapp.com/products/platform-pricing): published categories, market-dependent prices, and service-window treatment. Use current official pricing, not forum pricing claims.
- [WhatsApp business messaging policy](https://business.whatsapp.com/policy): templates outside the service window, clear human escalation, and responsible use of message data.
- [n8n license use cases](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case): distinguish provider-managed workflows from customer-configurable automations.
- [NN/g empty-state guidance](https://www.nngroup.com/articles/empty-state-interface-design/): empty views should explain the next action; this informs Places/Events and first-run history.
- [Community discussion: client approvals](https://www.reddit.com/r/socialmedia/comments/1t3igie/whats_your_workflow_for_client_approvals_mine_is/): anecdotal accounts of fragmented feedback and version confusion informed the central review flow. These comments are not evidence of API capabilities or vendor superiority.

## Review walkthrough

1. Open Resumen; compare desktop and mobile layouts.
2. Open Conexiones y fuentes; inspect account requirements and register an example HTTPS source.
3. Open Contenido; choose the verified sample source, edit text and format, generate a local view, review and approve. Edit again and confirm approval is revoked.
4. Open Bandeja; ask “¿Qué es Spotmi?” as a visitor in the Instagram sample. Then ask for a person or an unknown price. Confirm bot ownership transfers to human handling.
5. Open Ajustes; compare Off/Test and the visible Live prerequisites. No channel can be activated for real.
6. Reload to inspect local demo persistence. Download the sample JSON only after approval. Reset only when you want to discard prototype changes.

See `VALIDATION.md` for observed checks and screenshot inventory.
