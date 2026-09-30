import { textToSpeech } from "@/lib/elevenlabs";

// Keeps a stray request from burning through the hackathon credits.
const MAX_CHARS = 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text: unknown = body?.text;

  if (typeof text !== "string" || !text.trim()) {
    return Response.json(
      { error: "Send JSON like { \"text\": \"Hallo\" }." },
      { status: 400 },
    );
  }
  if (text.length > MAX_CHARS) {
    return Response.json(
      { error: `Text is limited to ${MAX_CHARS} characters.` },
      { status: 413 },
    );
  }

  try {
    const audio = await textToSpeech(text);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[tts]", error);
    const message =
      error instanceof Error ? error.message : "Text to speech failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
