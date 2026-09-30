"use client";

import { useState } from "react";

/** Plays text through /api/tts so you can confirm the ElevenLabs key works. */
export function VoiceCheck() {
  const [text, setText] = useState("Hallo! Welkom bij KBC. Hoe kan ik je vandaag helpen?");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function speak() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500">Voice check</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
      />
      <button
        onClick={speak}
        disabled={status === "loading" || !text.trim()}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {status === "loading" ? "Generating..." : "Speak"}
      </button>
      {status === "error" && <p className="text-sm text-zinc-500">{error}</p>}
    </section>
  );
}
