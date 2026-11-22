# YouTube API Services – Audit and Quota Extension Form · draft answers

Draft in English for the form at https://support.google.com/youtube/contact/yt_api_form.
Field labels for Sections 1–5 were read from the live form on 21 Nov 2026. **Sections 6 and 7 could not be read automatically** (the page was cut off): check their real fields and adapt the text below.
`[COMPLETAR]` = only the owner knows it. `[ELIGE]` = a decision for the owner, with a recommendation.

Everything below must stay consistent with what is published at:
- Primary Access URL: https://spotmi.com.sv/es/ezra (English: https://spotmi.com.sv/en/ezra)
- Privacy Policy URL: https://spotmi.com.sv/es/privacidad#ezra-youtube (English: https://spotmi.com.sv/en/privacidad#ezra-youtube)
- Terms of Service URL: https://spotmi.com.sv/es/terminos#ezra-youtube

⚠️ These pages exist only in the local branch `feat/ezra-youtube-api` of spotmi-web until you review and publish them. Do not send the form before they are live.

---

## Section 1 · Request Type
**Select the reason for your request:** ✅ Decided (21 Nov): “Complete a compliance audit to request for additional quota” (already selected in the form). Reason: “Complete a compliance audit to request for additional quota”, then in Section 5 choose “No change / Default quota (10k quota points)” unless you really need more `search.list` calls (default: 100 per day). The point of the audit is to have the project verified; Ezra already keeps every upload private by design.

## Section 2 · Organization and Contact Information
- **Are you applying:** [ELIGE] “As an organization or on behalf of an organization…” if Spotmi is a registered entity; otherwise “As an individual user”.
- **Your Full Legal Name:** [COMPLETAR]
- **Your Organization's Legal Name:** [COMPLETAR] (write “self” if applying as an individual)
- **Parent Company Name (if applicable):** [COMPLETAR or leave empty]
- **Your Organization's Primary Website:** https://spotmi.com.sv
- **Country / Street Address / City / State/Province / Postal Code:** [COMPLETAR] (Country: “Other (please specify)” → El Salvador)
- **Category:** [ELIGE] Recommended: “Other (please specify)” → “Tourism directory (El Salvador)”. Alternative: “Media and Entertainment”.
- **Organization Size / Type:** [ELIGE] Probably “Startup (fewer than 10 employees)”.
- **Primary Contact Information:** Name [COMPLETAR] · Email: hola@spotmi.com.sv (or your own address [COMPLETAR])
- **Primary Technical Contact / Primary Business Contact:** “Same as Primary Contact” or [COMPLETAR]

## Section 3 · Business Model and Google Contacts
**Describe your organization's work as it relates to YouTube** (100–5000 characters):

> Spotmi (https://spotmi.com.sv) is a public tourism directory for El Salvador: places, tourism businesses, experiences and events. Spotmi publishes its own short videos about El Salvador on its YouTube channel, Spotmi (@spotmisv).
>
> Ezra is Spotmi's internal content tool. It runs only on one team computer, bound to the loopback address 127.0.0.1; it is not a public service and has no external users. Ezra uses YouTube API Services only with Spotmi's own channel, authorized through OAuth 2.0 with the scopes youtube.readonly, youtube.upload and yt-analytics.readonly. It does four things:
> 1. Shows the team the channel's statistics (channels.list, playlistItems.list, videos.list and YouTube Analytics reports: views, estimated minutes watched, subscribers gained and lost by day). These are held in memory for up to 15 minutes and never written to disk.
> 2. Runs an occasional “Viral videos” lookup (search.list ordered by viewCount + videos.list) so the team can see which public videos on a topic perform best, as a trend reference. Ezra stores only video IDs, titles, channel names, thumbnail URLs, durations and public statistics, shows the lookup date, and deletes all of it 30 days after the lookup. It never downloads, caches or cuts YouTube audiovisual content.
> 3. Uploads videos the team owns (or has written permission from the author) with videos.insert, always with privacyStatus=private, and only after a team member has approved that exact version and authorized the YouTube destination by typing a confirmation word. The team then reviews and publishes the video by hand in YouTube Studio.
> 4. Lets the team disconnect at any time: Ezra revokes the token at oauth2.googleapis.com/revoke, deletes the encrypted local token, clears the cached statistics and removes video IDs from its upload log.
>
> Tokens are stored encrypted (AES-256-GCM) in a local SQLite database. No YouTube data is sold or shared with third parties.

- **Who is your target audience?** “Internal Users”
- **How does your API Client monetize or generate revenue?** “Free service (we do not charge users)” — Ezra is an internal tool with no revenue of its own. (If the form allows, add “Other: internal tool, not offered to anyone outside the Spotmi team”.)
- **Advertising questions:** Not applicable.
- **Do you currently have a designated Google Partner Manager or YouTube Partner Manager?** “No, I do not have a Google representative”
- **How did you first learn about the YouTube Data API?** “Google Developer Documentation”
- **Content Owner ID(s) / Google Ads Customer ID(s):** leave empty unless you have them [COMPLETAR].

## Section 4 · API Client Overview and Access Information
- **API Client Name:** Ezra
- **Does this API Client name contain the word "YouTube"?** No, the name does not contain "YouTube"
- **Primary Access URL:** https://spotmi.com.sv/es/ezra
- **Privacy Policy URL:** https://spotmi.com.sv/es/privacidad#ezra-youtube
- **Terms of Service URL (Optional):** https://spotmi.com.sv/es/terminos#ezra-youtube
- **Is your API Client publicly accessible?** No
- **Demo Account Username / Password:** leave empty. Ezra runs only on the owner's computer (127.0.0.1), so a remote demo account is not possible. The end-to-end screencast goes in Section 6.
- **Login URL:** leave empty.
- **Special Instructions for Access:**
> Ezra is an internal tool that runs only on the Spotmi team's computer at http://127.0.0.1:3000 and is not reachable from the internet, so we cannot provide a demo account. Section 6 includes an end-to-end screencast showing the OAuth consent, channel statistics, a "Viral videos" lookup, a private upload of our own test video and the result in YouTube Studio, plus disconnect/revoke. The interface is in Spanish.
- **Acknowledgment:** tick it (it only applies if you give credentials).

## Section 5 · Use Cases and Quota Extension Details
- **How many project numbers are you adding?** 1
- **Google Cloud Project Number:** 1092191323833 (prefix of the OAuth client ID used by Ezra; double-check it on the project dashboard of “My First Project” before sending)
- **Use Case Category:** “Internal Company Tool”, “Video Uploading & Account Management”, “Analytics & Reporting”
- **Does this API Client require users to sign in with their Google Account (OAuth 2.0)?** Yes
- **Derived metrics / data storage agreement (36 months):** ✅ Do **not** opt in. Ezra deletes public statistics of other channels after 30 days and does not keep derived metrics.
- **Expected API Usage Volume:** Fewer than 1,000 requests per day
- **Required evidence (JPEG/PNG):**
  - Privacy Policy screenshots: the section “Ezra y servicios de la API de YouTube” on https://spotmi.com.sv/es/privacidad#ezra-youtube (show the Google Privacy Policy link, the 30-day deletion and the revocation link). Take them after publishing.
  - Homepage screenshot “showing where Privacy Policy link is located with YouTube branding visible”: the footer of https://spotmi.com.sv has the “Privacidad” link. ⚠️ The homepage has no YouTube branding today; also attach a screenshot of https://spotmi.com.sv/es/ezra, which names YouTube and links the policies (both, once published).
  - Terms of Service: screenshot or PDF of https://spotmi.com.sv/es/terminos#ezra-youtube.
- **Conditional evidence:** OAuth flow screenshots (Google consent screen), upload interface screenshots (Ezra preview with “Autorizar publicación”), dashboard screenshots (Apps › YouTube). The form notes that for uploads and internal tools a screencast is required → link it in Section 6.
- **Quota Details for Project #1 — endpoints used:** youtube.channels.list, youtube.playlistItems.list, youtube.videos.list, youtube.search.list, youtube.videos.insert. (YouTube Analytics API `reports.query` is a separate API with its own quota; mention it in the description if there is no checkbox for it.)
- **Total quota requested:** ✅ “No change / Default quota (10k quota points)”. If you choose more, a justification draft:
  - search.list — Total per day: 10 calls · Justification: “Manual, owner-triggered ‘Viral videos’ lookups for content research; each lookup makes one search.list call (≈100 units) plus one videos.list call. Typical use is under 5 lookups per day.”
  - videos.insert — Total per day: 5 · Justification: “Only the team's own videos, uploaded as private after human approval; typically 0–3 per day.”

## Section 6 · Other Supporting Materials (labels not verified — check the live form)
Likely content:
- **Screencast (end-to-end):** link to the recording following `docs/youtube-audit/screencast-script.md` [COMPLETAR link, unlisted].
- **Architecture diagram:** `docs/youtube-audit/architecture-diagram.png`
- **User flow diagram:** `docs/youtube-audit/user-flow-diagram.png`
- Suggested accompanying text:
> Ezra is an internal tool that runs only on one team computer (127.0.0.1). The architecture diagram shows where each piece of YouTube API data travels and where it is stored (encrypted tokens in local SQLite; channel metrics in memory ≤15 minutes; other channels' public metadata deleted after 30 days). The user-flow diagram covers connect (OAuth), metrics, the "Viral videos" lookup, the private upload of our own video with human approval, and disconnect/revoke. The screencast shows the same flows live; the interface is in Spanish.

## Section 7 (not verified — check the live form)
Probably final declarations or additional comments. If there is a free-text field:
> Ezra does not download, cache or modify YouTube audiovisual content, does not access other users' channels, and every upload is private and approved by a person first. Data about other channels' videos is deleted 30 days after each lookup, and disconnecting revokes the Google token immediately. Contact: hola@spotmi.com.sv.

---

## Facts this draft relies on (checked in the code on 21 Nov 2026)
- Scopes: `src/lib/granjas/adaptadores.ts` (youtube.readonly, youtube.upload; yt-analytics.readonly when “Autorizar métricas” is used).
- Upload: `videos.insert` resumable with `privacyStatus: "private"` (same file).
- Revocation: `https://oauth2.googleapis.com/revoke` in `revocar`, called by `desconectar` (`src/lib/granjas/conexiones.ts`), which also deletes the token row, clears the metrics cache and the video IDs in receipts (test: `tests/youtube-cumplimiento.test.ts`).
- Encryption: AES-256-GCM (`src/lib/granjas/cripto.ts`).
- Metrics cache: in memory, 15 min (`src/lib/granjas/youtube-metricas.ts`).
- Viral videos: `search.list` + `videos.list` (`src/lib/produccion/virales-youtube.ts`); 30-day deletion in `src/lib/produccion/virales-caducidad.ts` and `purgarReferenciasVencidas` in `src/lib/granjas/clips.ts`.
- Loopback only: `next dev --hostname 127.0.0.1` / `next start --hostname 127.0.0.1` (`package.json`).
