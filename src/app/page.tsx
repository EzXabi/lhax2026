import { VoiceCheck } from "@/components/voice-check";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-24">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">KBC challenge</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          A proof of concept for how KBC understands, supports and guides its
          customers at scale. Work in progress.
        </p>
      </header>
      <VoiceCheck />
    </main>
  );
}
