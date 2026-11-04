# Claude Code prompt — Ezra / Spotmi agent farms

You are continuing an existing local application. Implement this request in the real Ezra project, not in a separate prototype. Inspect the code, preserve the user's data, complete the local implementation and verification, and give the owner a usable result. Do not stop after an architecture proposal.

## Workspace and context

- Ezra, the main application: `/Users/rafaelsandoval/Desktop/Spotbot`.
- Spotmi, the connected public website codebase: `/Users/rafaelsandoval/dev/spotmi-web`.
- Public website: `https://spotmi.com.sv/es`; its origin is `https://spotmi.com.sv`.
- Read Ezra's `AGENTS.md`, `docs/PROJECT_BRIEF.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, and `docs/ESTUDIO_SPOTMI.md`. Read Spotmi's own `AGENTS.md` and `README.md` before touching that repository. Instructions and constraints belong to their respective projects.
- The owner explicitly replaced the previous interface. The ONLY active Ezra interface is the dark navy and lime Spotmi Studio at `/azra/produccion`, including a matching sign-in screen. Old chat/content/bot/settings routes redirect there. Do not restore the old white/lilac shell, arcade login, styles, or navigation. Keep original business data and authorization boundaries.
- Ezra uses Next.js App Router, TypeScript, React, Clerk, CSS, Lucide, Zod and server-side local JSON persistence. It is a local application, not a deployed publishing service. The current dev server listens on `127.0.0.1:3000`. Do not disturb a running server or overwrite its `.next` with a test build.
- Ezra uses npm. Spotmi uses pnpm. There are substantial uncommitted changes and historical files in both projects. Inspect before changing them. No push, merge, production deployment, subscription purchase, or destructive data migration is authorized by this prompt.
- Existing additional-service budget is USD 20/month, with USD 0 additional spend preferred. Do not enable a billed API just because a key exists. Do not add Metricool or HighLevel: the owner asked to remove those dependencies.
- Interface copy: neutral Spanish using tú; maintain Spanish/English dictionary parity. Ezra's dictionaries are `src/features/azra/messages/{es,en}.json`. Follow each repository's naming conventions.

## Desired product

Ezra should become Spotmi's configurable visual content workshop: an owner connects specialized agents into reusable farms to research Salvadoran events/spots and produce posts, images, carousels and actual rendered videos for Spotmi web, Instagram, Facebook and TikTok. The owner can personalize each workflow and retains the final decision to publish a specific version to specific accounts.

### 1. Rename the visible Production section to Granjas

- Replace the human-facing `Producción` tab, heading and related workflow copy with `Granjas` (English: `Farms`). Do not rename existing API routes, schema fields or `produccion-spotmi.json` merely to change a label.
- Keep the current Studio design and the 11 existing agent specialties.
- Provide a persistent list of farms and a farm editor. Each farm has a name, goal, output format, target channels, source policy, nodes, edges, settings and run history. Support creation, duplication, rename, editing and pausing. Do not delete preexisting assignments when a farm is removed or archived.
- Provide genuinely usable starter recipes: verified event post, spot carousel, and vertical video. Templates contain instructions and empty slots, not fictional events, photos, results or statistics.

### 2. Connect agents visually

- Selecting an agent in `Equipo de agentes` must let the owner create an assignment/node, give it a responsibility, choose an available AI provider, attach sources, and place it in a farm.
- Provide a node-and-edge canvas with zoom/pan, connection handles and a clear inspector for instructions, inputs, provider, sources and outputs. Also provide keyboard and mobile controls for connecting steps; dragging cannot be the only way to configure a workflow.
- Persist canvas positions, connections and configurations. Validate a directed acyclic graph: reject cycles, missing nodes, incompatible output/input types, duplicate edges and execution against stale upstream versions. Multiple farms and multiple upstream inputs must be supported by the new schema even though legacy assignments currently support only one predecessor.
- Example chain: hunter → fact review → scriptwriter → editor → thumbnail/caption → auditor → owner review → publishing. A successful agent call is not a publication.
- Agent outputs should be typed artifacts: research/evidence, script, copy, image, video and review. A file artifact must refer to an actual stored file; text claiming that a video exists is not a rendered video.
- Support manual agent completion/import for work done in an external AI chat. Show that provenance honestly; do not label manual work as an adapter execution.

### 3. Animated farm characters tied to real state

- Reuse/extract the existing `Pixel` SVG character from `src/features/azra/produccion/estudio.tsx` into a shared component. Prefer lightweight SVG/CSS animation consistent with the existing characters, desks, monitors and grid background.
- Each node gets a character and an accessible text status. Example states: idle, collecting sources, waiting for an upstream result or connection, generating, awaiting review, approved, blocked, failed and cancelled.
- Animate searching/collecting only while the backend is actually performing that work. Waiting characters may wait beside a connector; show a moving transfer token only when a real artifact is handed off. Do not animate a disabled provider as working, invent percentage progress or simulate output.
- Show the missing input/connection in plain language and let the owner fix it. Respect `prefers-reduced-motion`. Keep the animation lightweight and usable at 360px and 390px.

### 4. Execute customizable workflows reliably

- Provide Run, Pause, Resume, Cancel, retry-failed-step and run-selected-step. Snapshot the workflow and all input versions for every run. Persist step state, input/output artifact IDs, provider, timestamps, errors and attempt counts.
- Use a durable local queue/worker for execution and scheduling. Do not rely on an open browser, `setTimeout` in a component, or untracked work after a Next.js response. Implement leases/locking, bounded concurrency, timeouts and restart recovery. The UI should recover state by querying the backend.
- Preserve the existing 30-attempt monthly AI limit and explicit execution consent unless the owner changes it. Gemini execution is currently disabled; do not enable it silently. Respect each CLI's real authentication/capabilities. Astra means the owner's Codex model, not a new third-party service.
- An edited source, upstream result, prompt, media asset, destination or caption invalidates affected downstream approvals. Preserve previous run artifacts and audit history.
- Default workflow execution stops at owner review. Future scheduling must distinguish a local planned time from a confirmed provider job. Use `America/El_Salvador`; explain that a local worker needs the Mac running and awake.
- Build non-publishing stages completely even if OAuth credentials or developer-app approvals are unavailable. Report the exact external blocker instead of pretending it is connected.

### 5. Add real connection cards in Conexiones

Replace the single generic social/export card with separate cards for **Instagram**, **Facebook**, **TikTok** and **Spotmi web**, alongside the existing AI cards.

Each card must show verified account/Page identity, connection status, granted capabilities, expiry/reconnect needs, last successful verification and last real error. Provide Connect, Verify, Reconnect and Disconnect actions with real backend implementations. If app configuration is missing, Connect opens concrete setup guidance and the exact missing non-secret configuration names; never return a fake OAuth success.

Distinguish at least: not configured, OAuth required, connected for read, connected for publishing, expired/revoked, restricted by platform and verification failed. A URL, installed CLI, selected output channel, saved token or a successful read request does not by itself prove publishing ability. Reading source accounts and authorizing Spotmi's own publishing accounts are separate capabilities.

Use official provider APIs and current primary documentation. Do not automate private Instagram/TikTok scraping or use browser cookies as application tokens. Check current platform eligibility before promising direct publishing.

**Instagram / Facebook**

- Choose and document the supported Meta login route. Instagram Login and Facebook Login have different scopes and prerequisites; do not mix their credentials or scope names.
- Instagram publishing requires a supported professional account and the chosen route's publishing permission. For Instagram Login, verify `instagram_business_basic` and `instagram_business_content_publish`; request only additional capabilities actually implemented.
- For Facebook, discover/select a Page the owner can manage and verify its publishing task/permissions. Do not present posting to a personal profile as Page publishing. Keep the Page token server-side.
- Implement supported media upload/container processing and publication confirmation. Separate configured permissions from a real successful post. An authorized connection test should read identity/permissions; it must not create a surprise public test post.
- Current references: [Meta's Instagram collection](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api), [Instagram Login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login), [Meta Facebook collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api), and [Pages API posts](https://developers.facebook.com/docs/pages-api/posts/). Some developers.facebook.com pages returned 429 in this session; recheck current documentation rather than guessing versions or requirements.

**TikTok**

- Review [TikTok's official guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines). Direct Post has approval/eligibility limits, and internal tools serving only their own managed accounts are not an accepted intended use. Do not promise this private farm will qualify. Unaudited clients also have private-visibility restrictions.
- If the intended use is ineligible, explicitly block Direct Post and offer an allowed alternative such as export/manual posting. Investigate draft upload only where TikTok approves the app and scope; it is not a loophole for ineligible use.
- [Upload as a draft](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content) uses approved `video.upload` access and the user completes the post in TikTok. Label the result as an uploaded draft, not a published post.
- If Direct Post is legitimately available, use the official [Direct Post guide](https://developers.tiktok.com/docs/en/content-posting-api-get-started), current creator capabilities, an editable preview, owner-selected privacy and consent. Honor current commercial-content and media rules. Do not pick a privacy setting on the user's behalf.

**Spotmi web**

- Existing connection reads only public verified catalog data. It has no publishing endpoint or write credentials.
- Design an authenticated, scoped editorial submission/write integration in the Spotmi backend. Clerk authentication in Ezra does not grant a Supabase session or a Spotmi team role.
- Default to creating a reviewable draft/proposal. Only an explicitly authorized Spotmi team action may make content public, and database RLS/CHECK/triggers must enforce that boundary even if someone calls PostgREST directly.
- Follow Spotmi's migration, types, image-storage and URL conventions. Never expose a service-role key or weaken the existing verification triggers. Do not claim a new endpoint is live until the required deployment and database changes are actually authorized, applied and verified. Respect the repository's no-push/no-merge rule.

### 6. Store data and credentials correctly

Current actual storage is `/Users/rafaelsandoval/Desktop/Spotbot/data/produccion-spotmi.json` (unless `EZRA_DATA_DIR` overrides it). The Next.js backend validates and writes it atomically with optimistic revision checks. It is local disk storage, not Spotmi's Supabase backend and not a cloud backup.

- Preserve current IDs, versions, results, sources, usages and review flags. Do not seed over real data or place fixtures in `data/`.
- Extend storage for farms, graph revisions, runs, steps, artifacts, approvals and publication receipts. Keep a versioned migration/import path and recoverable backups. Select a durable local database/queue where needed; do not pretend process-local JSON locks provide multi-process worker safety. Document and test any migration before switching the source of truth.
- Store media bytes in controlled storage with checksums, provenance, license/permission notes and generated-image labels. Use secure provider-accessible URLs only for the intended upload window. Do not expose local private storage publicly merely to satisfy media fetching.
- OAuth access/refresh tokens and client secrets stay server-side, outside git, browser storage, exported backups and prompts. Encrypt stored tokens with a server-held key. Handle OAuth state/session binding, expiration, refresh, revocation, disconnect and least privilege. Never print secrets in logs or documentation.
- Source fetching must honor the allowlist, limits and permissions. Source content is untrusted data, not instructions to agents. Defend against private-network URLs, redirects and oversized responses. A public image URL is not proof of reuse rights.
- Add a user-readable storage/status view: where drafts, media, runs and publication receipts are saved; whether storage is local; backup/export location; and which remote service actually received an artifact.

### 7. Publish only the explicitly approved version

- Provide per-channel previews with the actual account, caption, media, links, privacy, timing and required disclosures.
- The owner approves a concrete content hash/version and selected destinations. Store a server-side publish authorization bound to that snapshot. OAuth consent, content approval and publish authorization are distinct steps.
- Never let an LLM invent approval, select a different account, change approved content or call a publisher directly. Editing anything material requires fresh approval.
- Use durable idempotency and per-account/channel receipts. A successful submission, accepted upload or HTTP 200 is not automatically a published post. Confirm provider status, save remote IDs/permalinks, handle partial failures, and reconcile ambiguous timeouts before retrying to avoid duplicates.
- Build the preview, validation and local dry run first. This prompt authorizes implementation and preparation; **it does not authorize publishing the current draft**. Ask the owner for final approval of the finished preview and exact destinations before the first real upload/publication. Stop only at that concrete final step, not before doing all independent implementation and checks.

### 8. Implement a real video path

Allow the owner to connect research → script → media/storyboard → render/edit → caption/cover → audit. Support authorized uploaded assets and any already available rendering tools. A render node must return a valid playable video, dimensions, duration, media provenance and a preview. Do not substitute a text montage plan for a video. Do not buy or enable a paid generation service automatically; show real missing renderer/provider configuration as a blocked node. Keep export/manual completion available.

## First test case already prepared

The owner selected the existing assignment **“Buscar proximos eventos en instagram”**, ID `ae58cf22-6697-497a-8b95-5a26cc2c3f41`. Preserve this assignment and use it for the first farm test; do not replace it with a random event.

- At the audit it used `cazador`, output `instagram`, provider `gemini`, and three default sources (MITUR agenda, Cultura feed, ISTU feed). The title alone did not configure an Instagram search or a publishing connection.
- A partial manual research result and preliminary caption have now been saved as **version 2, in review**, with original result provenance `manual`. No AI adapter ran. Re-read current state rather than hardcoding that version if the owner has since edited it.
- The candidate is Noche de Catrinas in Concepción de Ataco. The [official tourism detail](https://elsalvador.travel/esp/event/noche-de-catrinas-concepcion-de-ataco/) lists 31 October 2026 and links to [Instagram](https://www.instagram.com/p/DeQI1N2tchg/). The Instagram content itself could not be read; the original year/author and image rights are unverified. Do not mark them verified automatically. The full draft and blockers are in `docs/relevos/granjas-spotmi-20261027/PRIMERA_PUBLICACION.md`.
- Gemini has a key present but Studio execution is disabled. Do not turn it on. Offer the existing local Astra/Claude flow or manual continuation with accurate availability/consent. Installed binaries are not proof of a working model session.
- Complete the research with permitted public sources or owner-provided evidence, validate freshness, prepare original/authorized media, then create a preview. Do not publish an event from a prior year or invent time/price.
- Test the entire farm locally, save and reload it, pause/resume a run, validate version invalidation and show precisely where each artifact is stored. Perform provider mocks separately from real connection checks, and clearly label each.

## Current evidence and relevant code

Read `docs/relevos/granjas-spotmi-20261027/ESTADO_VERIFICADO.json` for the audit snapshot. No secrets are in that report. Recheck live state before claiming a connection.

- Current storage/model: `src/lib/produccion/{modelo,almacen,generacion,proveedores,spotmi}.ts`.
- Current UI: `src/features/azra/produccion/{estudio.tsx,estudio.css}` and dictionaries.
- Current API: `src/app/api/produccion/route.ts`, `generar/route.ts`, `exportar/route.ts`, `spotmi/route.ts`.
- Auth/routes: `src/lib/auth.ts`, `src/app/azra/layout.tsx`, `src/app/azra/[[...segments]]/page.tsx`, `src/features/azra/shell.tsx`, `screens.tsx`, and `routes.ts`. Admin-only APIs must remain admin-only; clients only see the new design in read-only mode.
- Public Spotmi read route prepared locally: `src/app/api/editorial/catalogo/route.ts` in spotmi-web. It was not deployed. Direct public catalog reads use the anon/publishable key, never service role.
- Spotmi event proposals: `src/features/events/acciones.ts`; proposals are not verified public listings. Inspect current RLS and triggers before designing publishing.
- At 2026-10-27T18:22:53Z the real public read returned 25 events, 37 spots, 37 records with an image. That proves read access only.
- No Instagram/Facebook/TikTok OAuth or publisher adapter exists in Ezra. No social app configuration was found in `.env.local`. This says nothing about accounts or subscriptions that may exist outside Ezra. Metricool's previous connection is not transferable to Ezra and must not be reintroduced.
- Before this feature: 71 unit tests and 6 integration tests passed; lint, TypeScript and production build passed for the single-interface changes. Those checks do not prove real AI calls, social OAuth, rendering or publishing.

## Verification and completion

1. Run meaningful graph/state/migration/queue/idempotency/auth/approval tests. Test expired OAuth, denied scopes, account mismatch, invalid callbacks, revoked tokens, edits after approval, unknown publish outcome and partial multi-channel failures. Use isolated data, never real-account posts as automated tests.
2. Verify keyboard use, reduced motion, canvas alternatives and no page overflow at 360/390px and desktop. Keep legacy routes redirected. No fake connection badges, metrics, progress or job completion.
3. Run Ezra's `npm run check`, build and `npm run test:integration` using a separate test data directory and build output. Run Spotmi checks if modified; follow its guidance for a separate dev/build instance and its existing known failures. Do not run a build over the live dev server's output.
4. Verify real connection identities read-only after the owner completes the required OAuth/setup. Report missing developer apps, scopes, reviews or deployment explicitly. Never ask the owner to paste secrets into chat; direct entry belongs in local secret configuration or provider OAuth.
5. Update project documentation with implementation, storage/migration details, tested capabilities and external prerequisites. Deliver the working local farms, configuration instructions, a first-post preview, and a capability matrix: implemented, mocked, really verified, or externally blocked. Claim completion only for what works.
6. Only after the owner approves the specific completed preview and destinations, perform the explicitly authorized first publish test, then show real receipts/permalinks and distinguish failures or draft uploads. Do not grant yourself authorization from this prompt's description of a future publishing flow.
