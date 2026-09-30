# KBC Challenge

Our hackathon entry for the KBC case.

## The Challenge

KBC wants to understand what each of its 2.3 million customers needs and respond at exactly the right moment. The ask is not another feature but a proof of concept for scalable personalisation: recognise a customer's situation, behaviour and intent, then adapt the experience across products, services and channels.

## Our Project

_TODO: one paragraph on the idea, who it helps, and what the demo shows._

## How To Run

You need Node 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then paste your ElevenLabs API key
npm run dev
```

Open http://localhost:3000. The voice check on the home page reads text aloud through ElevenLabs. If you hear it, your key works.

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`.

## ElevenLabs

Text to speech runs server side in `src/app/api/tts/route.ts`, so the API key never reaches the browser. Call it from a Client Component (`"use client"`):

```ts
const res = await fetch("/api/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Hallo!" }),
});
const mp3 = await res.blob();
```

Server code (Server Components, Server Actions, route handlers) cannot fetch a relative URL, so import `textToSpeech` from `@/lib/elevenlabs` and call it directly.

| Variable | Required | Default |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | Yes | |
| `ELEVENLABS_VOICE_ID` | No | `Xb7hH8MSUJpSbSDYk0k2` (a premade voice) |
| `ELEVENLABS_MODEL_ID` | No | `eleven_multilingual_v2` (speaks Dutch, French and English) |

Getting the hackathon credits:

1. Join the Discord server: https://discord.com/invite/VnBvbbcdEC
2. Get access to the `#coupon-codes` channel.
3. Click "Start Redemption", select the event and fill in the form with the email you registered with.
4. The bot sends you a unique coupon code. Redeem it on your ElevenLabs account and create an API key there.

## Project Structure

```
src/
  app/
    page.tsx           Home page
    api/tts/route.ts   Text to speech endpoint
  components/
    voice-check.tsx    Button that plays text through /api/tts
  lib/
    elevenlabs.ts      Server only ElevenLabs client
```

## Unfinished

- The concept itself: there are no customer signals, profiles or personalisation logic yet.
- Data: we have no real KBC data, so the demo will run on mock customers.
- ElevenLabs is wired up for text to speech only. Speech to text and conversational agents are not set up.
- No tests or deployment. `/api/tts` has no authentication, so anyone who can reach it spends our credits. Do not deploy it publicly as is.
