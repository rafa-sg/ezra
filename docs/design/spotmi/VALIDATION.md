# Spotmi design validation — 2026-10-06

This is an isolated local design prototype, not a connected production application.

## Observed checks

- `npm run check`: passed lint, TypeScript and 39 domain tests.
- `npm run build`: passed Next.js production compilation.
- `npm run test:integration`: passed all 5 integration scenarios using independent test data.
- Prototype bundle/server: starts on `127.0.0.1:4177`; external connections are blocked by its CSP.
- Source form: rejected HTTP, accepted an authorized HTTPS sample URL as pending, retained it across reload. It did not fetch the URL.
- Creative: the observed local flow generated a view and approved version 1. The owner's screenshots also show this state. Export delivers sample JSON by design; an automated browser download-event check timed out, so downloaded file contents were not independently verified.
- Conversation takeover: “Tomar conversación” changed the selected sample chat to human attention and paused the test bot; “Reanudar prueba” restored the previous test state.
- Requirements dialog: received keyboard focus on its close button and closed with Escape.
- Desktop navigation fix: at 1280 × 800 all 8 items fit inside the navigation viewport (last item bottom 650px, nav bottom 702px). On page scroll the sidebar stayed at top 0. No horizontal page overflow.
- Mobile at 390 × 844: page width matched viewport width; opening the menu exposed all 8 destinations above the workspace. Selecting Ajustes closed it. Inbox and settings were captured.
- No browser console errors observed in the final check.

## Screenshot evidence

- `screenshots/sidebar-corrected.png`: viewport proof of all desktop navigation items.
- `screenshots/desktop-overview.png`, `desktop-sources.png`, `desktop-content.png`: initial full-page design views, before the sidebar correction.
- `screenshots/desktop-inbox.png`: human takeover in the local example conversation.
- `screenshots/mobile-inbox.png`, `mobile-settings.png`, `mobile-navigation.png`: phone layout and menu.

## Owner feedback and remaining design work

The owner disliked much of the visual treatment and requested an explanation of 8 supplied screenshots, with purpose, behavior, advantages, disadvantages and proposed additions. Only the specific sidebar-height defect has been corrected in this pass. Do not treat the rest of the visual direction as approved.

Recommended next design iteration: reduce introductory banners and oversized cards; clarify headings; separate panel appearance, creative templates and trusted bot knowledge; add reviewable control over logo, fonts, spacing, templates and preview formats. These additions are proposals, not implemented features.

Real source extraction, social authorization, AI replies, image export/rendering through a provider, cost metering, full FAQ management and editable bot policies remain future implementation work. The JSON export, sample chats and counters must continue to be described accurately as local demonstrations.
