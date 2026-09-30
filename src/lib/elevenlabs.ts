import "server-only";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Premade voice every account has, and a model that speaks Dutch, French and English.
const DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

let client: ElevenLabsClient | undefined;

export function getElevenLabs() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local and add your key.",
    );
  }
  client ??= new ElevenLabsClient({ apiKey });
  return client;
}

/** Returns an MP3 stream of `text` spoken by the configured voice. */
export async function textToSpeech(text: string) {
  return getElevenLabs().textToSpeech.convert(
    process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    {
      text,
      modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
      outputFormat: "mp3_44100_128",
    },
  );
}
