import { textToSpeech } from "@/lib/elevenlabs";
import { body, failure, json, privateHeaders, string } from "@/lib/server/http";
import { cardView } from "@/lib/server/moments";
import { rateLimit, requireSession, sameOrigin } from "@/lib/server/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { sub } = requireSession(request);
    const data = await body(request);
    const cardId = string(data.cardId);
    const card = cardView(sub, cardId);
    rateLimit(`voice:${sub}`, 5, 60_000);
    if (!process.env.ELEVENLABS_API_KEY)
      return json(
        {
          error:
            "Voice is not set up for this demo. You can still read the full checklist below.",
        },
        503,
      );
    const text = `${card.title}. ${card.body} ${card.checklist.map((c) => c.text).join(" ")}`;
    if (text.length > 1000)
      return json(
        {
          error:
            "This card is too long to read aloud. Please use the written checklist.",
        },
        400,
      );
    const stream = await textToSpeech(text);
    // Check permission again after the external call, before returning any audio.
    const audio = await new Response(stream).arrayBuffer();
    cardView(sub, cardId);
    requireSession(request);
    return new Response(audio, {
      headers: { ...privateHeaders, "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    return failure(error);
  }
}
