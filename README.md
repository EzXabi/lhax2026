# KBC Home

**The customer shares, KBC guides.** A working English-language household demo built with the existing Next.js App Router, React, TypeScript and Tailwind stack.

Sofie and Tom start in a household. Sofie invites Maria; Maria joins, chooses what Tom may see, and reports “I am moving in with my son.” Deterministic guidance explains its source and the permission that enabled it. Revocation takes effect on the next server read.

All people, profiles and balances are fictitious. There are no banking connections, payments, emails, financial recommendations, transaction inference or LLM calls.

## Run locally

Use Node.js 20.9 or newer and npm. Node 24 was used for verification.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local`:

- `DEMO_PASSWORD`: choose a non-empty demo password. All three demo personas use this password.
- `SESSION_SECRET`: use a random secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- `APP_ORIGIN`: optional canonical origin, without a trailing slash, such as `http://localhost:3000`. Set the external HTTPS origin if a trusted proxy terminates HTTPS. Leave blank for the local multi-host demo described below.
- `ELEVENLABS_API_KEY`: optional. The entire core journey works without it. Optional voice/model overrides are in `.env.example`.

Do not commit `.env.local`. The app refuses sign-in if the password is empty or the session secret has fewer than 32 characters. Restart after changing environment variables.

```powershell
npm run dev
```

Open [KBC Home](http://localhost:3000). Select **Sofie**, **Tom**, or **Maria** and enter the configured demo password. **Switch persona** signs out before returning to persona selection. This is a demo mechanism, not production authentication.

For a production-mode local rehearsal, stop the development server, then run:

```powershell
npm run build
npm start
```

Use **Me → Reset demo data** to restore the initial story for every connected demo session. This resets synthetic records and history but keeps currently authenticated sessions signed in. Restarting the Node process resets both data and active sessions.

## Four screens

- **Today:** personal and explicitly shared guidance, working checklist, dismissal, source/rule explanation and optional English narration.
- **Home:** household members, invitation links, authorized balances and reported moments, and household departure.
- **Me:** own synthetic profile, information sources, reported moments, report action, sign-out and demo reset.
- **Privacy:** independent balance/life-moment switches for each recipient and a timestamped, ordered consent history.

**Continue without saving** opens a general checklist in temporary React memory. It makes no API call, creates no moment/card/analytics record and pauses background refreshes for that view. Exiting, reloading or signing out clears its progress. There is no browser storage, analytics SDK or service worker. Ordinary server request logs are not an analytics system and are not a record of checklist choices.

## Architecture

```text
Browser → Next.js route handlers → session + authorization → domain functions → demo store
```

`src/lib/server/` contains server-only modules:

| Module | Responsibility |
| --- | --- |
| `session.ts` | Password-protected demo sessions, HMAC signatures, expiry, session revocation, throttling and origin checks |
| `store.ts` | Typed synthetic records, initial seed, reset, domain errors and audit events |
| `permissions.ts` | The single `canAccess(viewerId, subjectId, category)` policy and consent history |
| `household.ts` | Random invitations, hashed tokens, acceptance, active membership and departure |
| `moments.ts` | The deterministic `PARENT_MOVES_IN_V1` rule, cards, explanations and authorized snapshots |
| `http.ts` | Small request validators, English error responses and private-response headers |

`src/lib/contracts.ts` contains public response types only. No private seed records are imported into client components or passed through server-rendered props. The browser reads them only through authorized responses.

The store is initialized once on `globalThis`. Invitation validation, consumption and membership activation are synchronous, so they cannot interleave within the supported single Node process. There is deliberately no database or ORM.

### Authorization behavior

- A signed-in persona may access their own supported data.
- Cross-person reads require both active membership in the same household and the subject's explicit grant to that recipient for that category.
- Household roles and membership alone never grant private-data access. Names and membership are part of the explicitly joined household directory; ages, occupations and locations remain own-profile information.
- The highest consent sequence determines the effective choice. Old events remain in the subject's history.
- The actor always comes from the verified session. A supplied `viewerId` never changes identity. Only the subject can change their preferences.
- Leaving revokes grants in both directions and expires related outstanding invitations. Rejoining does not restore old grants.
- Cards store a source-moment reference, rule and checklist identifiers, not copied household text. Text, explanations, checklist actions and speech re-check the same policy.
- A moments grant makes already reported moments available too; nothing is inferred from transactions. The demo supports one moment per persona. Reporting it again reopens the owner's checklist without duplicating it or undoing other recipients' dismissals.
- Private responses, including errors and audio, return `Cache-Control: no-store`. The client refreshes after changes, on window focus and about every two seconds while visible and signed in. Failed reads clear the previous private view.
- Revocation blocks subsequent server reads immediately. Client displays update on their next successful refresh. Previously seen or downloaded information cannot be recalled. Switching sharing off sends no notification to other members.

### Sessions and invitations

Sessions expire after four hours. Cookies are signed, HttpOnly, SameSite=Strict and Secure under HTTPS. Logout invalidates the server-side session as well as clearing the cookie. Every mutation checks its request origin. With `APP_ORIGIN` unset, the request's Host header is used with its URL protocol; forwarded-host overrides are not trusted.

Login is limited to 12 attempts per persona and 40 total attempts per 15-minute window in the local process. Successful attempts also count, so use reset rather than repeatedly signing in during rehearsal. Rate limits reset on process restart, not with the demo-data reset.

Invitations contain 32 random bytes. Only SHA-256 token hashes are stored. Each invitation expires after seven days and is accepted once, only by its intended authenticated recipient. Links use a URL fragment so the token is not sent in the initial page request; the app removes the fragment after reading it. No invitation email is sent.

The audit records include actor, action, resource, outcome and time for session and domain actions. Snapshot reads are side-effect-free. This is a compact demonstration log, not a durable or complete security audit trail.

## API surface

| Endpoint | Behavior |
| --- | --- |
| `POST /api/session` | `{ personaId, password }` signs in |
| `DELETE /api/session` | Signs out and invalidates the session |
| `GET /api/demo` | Returns the authenticated persona's authorized snapshot |
| `GET /api/demo?cardId=...` | Re-checks access and returns an authorized card and explanation |
| `POST /api/demo` | Validated `invite`, `accept`, `consent`, `report`, `check`, `dismiss`, `leave` or `reset` action |
| `POST /api/tts` | Accepts only `{ cardId }`; authorizes and narrates server-generated text |

Invitation, household, subject, recipient and card identifiers are checked by the domain operations. Unauthorized fields are omitted from JSON, not merely hidden by the interface.

## Optional voice

The existing server-side ElevenLabs client is reused. The former unrestricted text endpoint has been replaced: arbitrary text is rejected. The server authorizes the card, limits approved text to 1,000 characters and allows five requests per persona per minute. It checks access again after generating the short clip and before returning it. The client checks access again before playback and stops locally held audio when a refresh removes its source card.

Without credentials, **Listen** shows an English fallback and the written checklist remains usable. Actual ElevenLabs audio generation was not exercised because no key was configured. The missing-key fallback and unauthorized/arbitrary-text rejection were verified. Synthetic authorized card text is sent to ElevenLabs only when narration is explicitly requested with credentials configured.

## 90-second demo script

Preparation: reset the demo. Open two independent browser profiles/windows, or use `localhost:3000` for Sofie/Maria and `tom.localhost:3000` for Tom with `APP_ORIGIN` blank. Both hosts reach the same local server but have separate host-only cookies. Two tabs on the same host share a session. Sign Tom in ahead of time.

1. **0–15 seconds — Sofie / Home.** “The customer shares, KBC guides. Sofie and Tom have explicitly formed a household, but membership does not reveal private information.” Create Maria's invitation and copy the link.
2. **15–30 seconds — Maria.** Switch persona, open the invitation, sign in as Maria and accept. “Joining is a choice. Sharing is a separate choice.” Turn on **Balance** and **Life moments** for **Tom**. Leave Sofie's switches off.
3. **30–45 seconds — Maria / Me.** Report “I am moving in with my son” and save. Open **Why am I seeing this?** “Maria reported this herself. A named, deterministic rule turns it into a practical checklist.”
4. **45–60 seconds — Tom / Today and Home.** Show his household card, explanation and Maria's synthetic balance. “The explanation names Maria and the specific life-moments permission. Balance is a different permission.”
5. **60–75 seconds — Maria / Privacy, then Tom / Home.** Turn off balance sharing. Watch Tom's balance field disappear on refresh while his guidance remains. “The next server read denies the balance. There is no notification, and the moment permission remains.”
6. **75–90 seconds — Maria / Home.** Leave the household. Show Tom's card and Maria's member entry disappear. “Leaving ends household access. Rejoining would need fresh permissions. The customer stays in control.”

If time remains, show **Continue without saving**: check an item, exit, and reopen to show that nothing was retained.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

With the local server running and `.env.local` configured:

```powershell
npm run test:integration
```

Integration tests **reset shared demo data before and after the journey**. Do not run them during a live presentation. Set `TEST_ORIGIN` if testing another local port.

The focused domain tests cover default denial, recipient/category independence, consent ownership, revocation, departure and rejoining, card ownership, invitation reuse/expiry/wrong recipient, signed-session tampering/expiry/logout, origin validation, throttling and side-effect-free reads. The HTTP integration test uses independent cookie jars and asserts that unauthorized balances and moments are absent from JSON, and that previously authorized card and speech requests are denied after departure.

The browser rehearsal also exercised invitation acceptance, independent sharing switches, both explanation types, temporary checklist clearing, automatic balance removal and guidance removal across two independent sessions. Layout was inspected at mobile and desktop widths. All authored UI, sample content, errors and documentation are in English; the supplied background images under `tmp/` are preserved unchanged.

## Deliberate limitations

- **One local Node process only.** No persistence, multi-instance support, serverless deployment, cross-process synchronization or production scaling. Data and sessions may reset on restart. Development reload behavior is not a durability guarantee.
- The password is shared by demo personas; this is not identity verification or production authentication. Do not use real customer data or publicly deploy this demo as a banking application.
- Three adult personas, one household, two sharing categories and one supported moment. No minor-consent workflow, Lotte, financial advice, savings goals, payment detection, proactive contact, delivery channels or dashboards.
- No cloud infrastructure, additional backend, ORM, component framework, LLM, banking integration or analytics. No deployment or security scan is claimed.
