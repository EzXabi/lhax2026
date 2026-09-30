"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { CardView, Category, Snapshot } from "@/lib/contracts";
import { HouseIllustration, Icon } from "./icons";

type Tab = "today" | "home" | "me" | "privacy";
type ModalName = "report" | "leave" | "reset" | null;
const personas = [
  { id: "sofie", name: "Sofie", note: "Start the household story" },
  { id: "tom", name: "Tom", note: "See what is shared with you" },
  { id: "maria", name: "Maria", note: "Choose what to share" },
];
const generalChecklist = [
  "Review your home insurance information together.",
  "Discuss household arrangements and everyday responsibilities.",
  "Choose which information to share, and with whom.",
];
const money = (value: number) =>
  new Intl.NumberFormat("en-BE", { style: "currency", currency: "EUR" }).format(
    value,
  );
const date = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    signal,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error || "Something went wrong. Please try again.",
      response.status,
    );
  return result;
}
function Avatar({
  id,
  name,
  small = false,
}: {
  id: string;
  name: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${id} ${small ? "avatar-small" : ""}`}
      aria-hidden="true"
    >
      {name.charAt(0)}
    </span>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="kbc-mark">
        <i />
        KBC
      </span>
      <span className="brand-divider" />
      <span>
        Home<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={close}
    >
      <div className="section-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function HomeApp() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [persona, setPersona] = useState("sofie");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<{
    url: string;
    expiresAt: string;
  } | null>(null);
  const [invitee, setInvitee] = useState("maria");
  const [modal, setModal] = useState<ModalName>(null);
  const [temporary, setTemporary] = useState(false);
  const [temporaryDone, setTemporaryDone] = useState<number[]>([]);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const audio = useRef<{
    element: HTMLAudioElement;
    url: string;
    cardId: string;
  } | null>(null);
  const audioVersion = useRef(0);
  const requestedAudioCard = useRef<string | null>(null);
  const readController = useRef<AbortController | null>(null);
  const version = useRef(0);
  const mutationInFlight = useRef(false);
  const temporaryRef = useRef(false);
  const refreshFailed = useRef(false);

  const stopAudio = useCallback(() => {
    ++audioVersion.current;
    requestedAudioCard.current = null;
    if (audio.current) {
      audio.current.element.pause();
      URL.revokeObjectURL(audio.current.url);
      audio.current = null;
    }
    setSpeaking(null);
  }, []);
  const applySnapshot = useCallback(
    (next: Snapshot) => {
      if (
        requestedAudioCard.current &&
        !next.cards.some((c) => c.id === requestedAudioCard.current)
      )
        stopAudio();
      setData(next);
      setAuthenticated(true);
      setReady(true);
    },
    [stopAudio],
  );
  const refresh = useCallback(async () => {
    if (mutationInFlight.current || temporaryRef.current) return;
    const sequence = ++version.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    try {
      const next: Snapshot = await request(
        "/api/demo",
        "GET",
        undefined,
        controller.signal,
      );
      if (sequence === version.current) {
        applySnapshot(next);
        if (refreshFailed.current) setError("");
        refreshFailed.current = false;
      }
    } catch (err) {
      if (controller.signal.aborted || sequence !== version.current) return;
      setData(null);
      stopAudio();
      setReady(true);
      refreshFailed.current = true;
      if (err instanceof ApiError && err.status === 401) {
        setAuthenticated(false);
        setTemporary(false);
        setTemporaryDone([]);
        setInvite(null);
      } else
        setError(
          err instanceof Error
            ? err.message
            : "Could not refresh your information. Please try again.",
        );
    }
  }, [applySnapshot, stopAudio]);
  useEffect(() => {
    function readFragment() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const invitation = fragment.get("invite");
      if (invitation) {
        setToken(invitation);
        setTab("home");
        window.history.replaceState(null, "", window.location.pathname);
      } else if (window.location.hash === "#privacy") setTab("privacy");
    }
    async function start() {
      readFragment();
      await refresh();
    }
    void start();
    window.addEventListener("hashchange", readFragment);
    return () => {
      window.removeEventListener("hashchange", readFragment);
      readController.current?.abort();
      if (audio.current) {
        audio.current.element.pause();
        URL.revokeObjectURL(audio.current.url);
      }
    };
  }, [refresh]);
  useEffect(() => {
    if (!authenticated || temporary) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 2000);
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [authenticated, temporary, refresh]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, authenticated]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    mutationInFlight.current = true;
    ++version.current;
    readController.current?.abort();
    try {
      await request("/api/session", "POST", { personaId: persona, password });
      setPassword("");
      applySnapshot(await request("/api/demo"));
      setNotice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
      mutationInFlight.current = false;
    }
  }
  async function signOut() {
    setBusy(true);
    mutationInFlight.current = true;
    ++version.current;
    readController.current?.abort();
    stopAudio();
    setTemporary(false);
    temporaryRef.current = false;
    setTemporaryDone([]);
    setModal(null);
    try {
      await request("/api/session", "DELETE");
      setData(null);
      setAuthenticated(false);
      setPassword("");
      setInvite(null);
      setToken("");
      setNotice("");
      setError("");
      setTab("today");
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
      mutationInFlight.current = false;
    }
  }
  async function mutate(payload: Record<string, unknown>, success: string) {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    ++version.current;
    readController.current?.abort();
    try {
      const result = await request("/api/demo", "POST", payload);
      applySnapshot(result.snapshot);
      if (result.invitation)
        setInvite({
          url: `${window.location.origin}/#invite=${result.invitation.token}`,
          expiresAt: result.invitation.expiresAt,
        });
      setNotice(success);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this change.",
      );
      try {
        applySnapshot(await request("/api/demo"));
      } catch {
        setData(null);
      }
      return false;
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  function navigate(next: Tab) {
    setTab(next);
    setNotice("");
    setError("");
    stopAudio();
    window.history.replaceState(
      null,
      "",
      next === "privacy" ? "#privacy" : window.location.pathname,
    );
    void refresh();
  }
  function beginTemporary() {
    ++version.current;
    readController.current?.abort();
    temporaryRef.current = true;
    setTemporary(true);
    setTemporaryDone([]);
    setModal(null);
    setNotice("");
    setError("");
    stopAudio();
  }
  function endTemporary() {
    temporaryRef.current = false;
    setTemporary(false);
    setTemporaryDone([]);
    setTab("me");
    void refresh();
  }
  async function speak(cardId: string) {
    if (speaking === cardId) {
      stopAudio();
      return;
    }
    stopAudio();
    setSpeaking(cardId);
    setError("");
    requestedAudioCard.current = cardId;
    const sequence = audioVersion.current;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
        cache: "no-store",
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error);
      }
      const blob = await res.blob();
      // A fresh access check also covers revocation while narration was generated.
      await request(`/api/demo?cardId=${encodeURIComponent(cardId)}`);
      if (sequence !== audioVersion.current || temporaryRef.current) return;
      const url = URL.createObjectURL(blob);
      const element = new Audio(url);
      audio.current = { element, url, cardId };
      element.onended = stopAudio;
      element.onerror = () => {
        stopAudio();
        setError("Audio could not play. You can read the checklist below.");
      };
      await element.play();
    } catch (err) {
      if (sequence === audioVersion.current) {
        stopAudio();
        setError(
          err instanceof Error
            ? err.message
            : "Voice is unavailable. You can read the checklist below.",
        );
      }
    }
  }

  if (!ready)
    return (
      <div className="loading-screen">
        <Brand />
        <span className="spinner" />
        <p>Opening your home…</p>
      </div>
    );
  if (!authenticated)
    return (
      <div className="login-page">
        <header className="topbar">
          <Brand />
          <span className="demo-badge">Fictitious data · Demo</span>
        </header>
        <main className="login-layout">
          <section className="login-story">
            <span className="eyebrow">A LITTLE CLOSER, ON YOUR TERMS</span>
            <h1>
              Your home.
              <br />
              Your people.
              <br />
              <span>Your choices.</span>
            </h1>
            <p>
              Life changes. Make room for what comes next, with guidance that
              starts with you.
            </p>
            <div className="login-art">
              <HouseIllustration />
            </div>
            <div className="promise">
              <Icon name="privacy" />
              <span>The customer shares. KBC guides.</span>
            </div>
          </section>
          <section className="login-panel">
            <span className="eyebrow">WELCOME TO KBC HOME</span>
            <h2>Step into the story</h2>
            <p className="muted">
              Choose a demo persona to explore a different point of view.
            </p>
            {token && (
              <div className="notice">
                An invitation is ready. Sign in as its intended recipient to
                accept it.
              </div>
            )}
            <form onSubmit={signIn}>
              <fieldset>
                <legend>Who would you like to be?</legend>
                <div className="persona-list">
                  {personas.map((p) => (
                    <label
                      key={p.id}
                      className={`persona-option ${persona === p.id ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="persona"
                        value={p.id}
                        checked={persona === p.id}
                        onChange={() => setPersona(p.id)}
                      />
                      <Avatar id={p.id} name={p.name} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.note}</small>
                      </span>
                      <span className="radio-dot" />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field-label" htmlFor="password">
                Demo password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Enter the configured demo password"
              />
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Signing in…"
                  : `Continue as ${personas.find((p) => p.id === persona)?.name}`}
                <Icon name="arrow" size={19} />
              </button>
            </form>
            <div className="login-footnote">
              <Icon name="lock" size={17} />
              <p>
                Persona switching is a demo mechanism, not production
                authentication. All people and balances are fictitious.
              </p>
            </div>
          </section>
        </main>
        <footer className="login-footer">
          Thoughtful guidance. Shared on your terms.
        </footer>
      </div>
    );

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="demo-badge">Fictitious data · Demo</span>
          <button
            className="persona-switch"
            onClick={signOut}
            disabled={busy}
            title="Sign out to switch demo persona"
          >
            {data && (
              <Avatar id={data.customer.id} name={data.customer.name} small />
            )}
            <span>Switch persona</span>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>
      <main className="workspace" id="main-content">
        {error && (
          <div className="error" role="alert">
            <Icon name="info" size={19} />
            <span>{error}</span>
            <button className="text-button" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <Icon name="check" size={19} />
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss confirmation"
              onClick={() => setNotice("")}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        )}
        {temporary ? (
          <section className="temporary panel">
            <span className="tag">JUST FOR THIS VISIT</span>
            <h1>A little preparation goes a long way</h1>
            <p>
              This general checklist stays only in this page’s memory. No
              moment, card, or analytics record is saved. It disappears when you
              exit or sign out.
            </p>
            <div className="checklist">
              {generalChecklist.map((text, i) => (
                <label key={text}>
                  <input
                    type="checkbox"
                    checked={temporaryDone.includes(i)}
                    onChange={(e) =>
                      setTemporaryDone((old) =>
                        e.target.checked
                          ? [...old, i]
                          : old.filter((x) => x !== i),
                      )
                    }
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
            <button className="button primary" onClick={endTemporary}>
              Exit without saving
              <Icon name="arrow" size={18} />
            </button>
          </section>
        ) : !data ? (
          <section className="empty panel">
            <Icon name="privacy" size={36} />
            <h2>Your information could not be refreshed</h2>
            <p>
              We have cleared the previous view. Refresh to check your current
              access.
            </p>
            <button className="button primary" onClick={() => void refresh()}>
              Try again
            </button>
          </section>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {tab === "today"
                    ? `YOUR EVERYDAY, ${data.customer.name.toUpperCase()}`
                    : "YOUR HOME, YOUR CHOICES"}
                </span>
                <h1>
                  {tab === "today"
                    ? `Good to see you, ${data.customer.name}`
                    : tab === "home"
                      ? "Better together. By choice."
                      : tab === "me"
                        ? "It starts with you."
                        : "You decide what’s shared."}
                </h1>
                <p>
                  {tab === "today"
                    ? "A little guidance for the things that matter."
                    : tab === "home"
                      ? "Your people, with room for everyone’s privacy."
                      : tab === "me"
                        ? "Your information. Your moments. Your story to tell."
                        : "A separate choice for each person and each kind of information."}
                </p>
              </div>
              <span className="live-indicator">
                <i />
                Permissions checked live
              </span>
            </div>
            {token && (
              <section className="invite-banner">
                <div className="round-icon">
                  <Icon name="home" />
                </div>
                <div>
                  <h3>You’ve been invited to a household</h3>
                  <p>
                    Joining shares your name and membership. Your balance and
                    life moments stay private until you choose otherwise.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await mutate(
                        { action: "accept", token },
                        "You’re in. Choose what to share with each person below.",
                      )
                    ) {
                      setToken("");
                      setTab("privacy");
                    }
                  }}
                >
                  Accept invitation
                </button>
                <button
                  className="icon-button"
                  aria-label="Close invitation"
                  onClick={() => setToken("")}
                >
                  <Icon name="close" />
                </button>
              </section>
            )}
            {tab === "today" && (
              <>
                <section className="hero">
                  <div className="hero-copy">
                    <span className="hero-label">
                      <span /> HOME IS MORE THAN A PLACE
                    </span>
                    <h2>
                      A new chapter.
                      <br />A little guidance.
                    </h2>
                    <p>
                      Tell us what’s changing. We’ll help you think through the
                      next steps, at your pace.
                    </p>
                    <button
                      className="button white"
                      onClick={() => setModal("report")}
                    >
                      Share a life moment
                      <Icon name="arrow" size={18} />
                    </button>
                  </div>
                  <HouseIllustration />
                </section>
                <div className="content-grid">
                  <section>
                    <div className="section-heading">
                      <h2>
                        Here for your next step{" "}
                        <span className="count">{data.cards.length}</span>
                      </h2>
                      <span className="muted small">
                        Made clear. Made for you.
                      </span>
                    </div>
                    {data.cards.length ? (
                      <div className="cards">
                        {data.cards.map((card) => (
                          <GuidanceCard
                            key={card.id}
                            card={card}
                            busy={busy}
                            speaking={speaking === card.id}
                            speak={() => void speak(card.id)}
                            privacy={() => navigate("privacy")}
                            mutate={mutate}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="panel empty">
                        <span className="round-icon pale">
                          <Icon name="leaf" size={29} />
                        </span>
                        <h3>A little space for what comes next</h3>
                        <p>
                          No guidance cards yet. Report a life moment, or
                          receive one when someone chooses to share theirs with
                          you.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setModal("report")}
                        >
                          Tell us what’s changing{" "}
                          <Icon name="arrow" size={17} />
                        </button>
                      </div>
                    )}
                  </section>
                  <aside>
                    <section className="panel household-preview">
                      <div className="section-heading">
                        <h3>Your household</h3>
                        <Icon name="home" />
                      </div>
                      <div className="avatar-stack">
                        {data.household ? (
                          data.household.members.map((m) => (
                            <Avatar key={m.id} id={m.id} name={m.name} />
                          ))
                        ) : (
                          <span className="round-icon pale">
                            <Icon name="home" />
                          </span>
                        )}
                      </div>
                      <h3>
                        {data.household
                          ? data.household.members.map((m) => m.name).join(", ")
                          : "A place for your people"}
                      </h3>
                      <p>
                        {data.household
                          ? "Together in one household. Each in control of their own information."
                          : "Accept an invitation to form your household. Sharing is always your choice."}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("home")}
                      >
                        Open Home
                        <Icon name="arrow" size={17} />
                      </button>
                    </section>
                    <section className="privacy-note">
                      <Icon name="privacy" size={26} />
                      <h3>
                        Close to each other.
                        <br />
                        In control of your privacy.
                      </h3>
                      <p>
                        Joining a household never automatically shares your
                        balance or life moments.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("privacy")}
                      >
                        Your sharing choices
                        <Icon name="arrow" size={17} />
                      </button>
                    </section>
                  </aside>
                </div>
              </>
            )}
            {tab === "home" && (
              <div className="content-grid">
                <section className="panel">
                  <div className="section-heading">
                    <h2>{data.household?.name || "Your household"}</h2>
                    <span className="tag">
                      {data.household
                        ? `${data.household.members.length} MEMBERS`
                        : "NOT JOINED"}
                    </span>
                  </div>
                  {data.household ? (
                    <>
                      <p className="muted">
                        Only information each person has allowed you to see
                        appears here.
                      </p>
                      <div className="member-list">
                        {data.household.members.map((m) => (
                          <article className="member" key={m.id}>
                            <div className="member-heading">
                              <Avatar id={m.id} name={m.name} />
                              <div>
                                <h3>
                                  {m.name}{" "}
                                  {m.id === data.customer.id && (
                                    <span className="muted small">(you)</span>
                                  )}
                                </h3>
                                <span className="small muted">
                                  {m.role === "founder"
                                    ? "Household founder"
                                    : "Household member"}
                                </span>
                              </div>
                              {m.id !== data.customer.id && (
                                <Icon name="privacy" size={19} />
                              )}
                            </div>
                            {m.balance !== undefined && (
                              <div className="balance">
                                <span>
                                  {m.id === data.customer.id
                                    ? "Your synthetic balance"
                                    : "Shared synthetic balance"}
                                </span>
                                <strong>{money(m.balance)}</strong>
                              </div>
                            )}
                            {m.moments?.map((moment) => (
                              <div className="shared-moment" key={moment.id}>
                                <Icon name="leaf" size={18} />
                                <div>
                                  <strong>{moment.label}</strong>
                                  <small>
                                    Reported by {m.name} ·{" "}
                                    {date(moment.createdAt)}
                                  </small>
                                </div>
                              </div>
                            ))}
                            {m.id !== data.customer.id &&
                              m.balance === undefined &&
                              !m.moments?.length && (
                                <p className="private-label">
                                  <Icon name="lock" size={15} /> No private
                                  information shared with you
                                </p>
                              )}
                          </article>
                        ))}
                      </div>
                      <div className="panel-footer">
                        <p className="small muted">
                          Leaving ends access to shared information in both
                          directions.
                        </p>
                        <button
                          className="text-button danger"
                          onClick={() => setModal("leave")}
                        >
                          Leave household
                          <Icon name="logout" size={17} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <Icon name="home" size={42} />
                      <h3>Every household starts with an invitation</h3>
                      <p>
                        Open an invitation link, or paste it below. Only its
                        intended recipient can accept it.
                      </p>
                      <InvitationInput setToken={setToken} />
                    </div>
                  )}
                </section>
                <aside>
                  <section className="panel">
                    <span className="round-icon pale">
                      <Icon name="plus" />
                    </span>
                    <h3>Make room for someone</h3>
                    <p>
                      Invite a person to join. They decide whether to accept and
                      what to share.
                    </p>
                    {data.household && data.inviteCandidates.length ? (
                      <>
                        <label className="field-label" htmlFor="invitee">
                          Invite a demo customer
                        </label>
                        <select
                          id="invitee"
                          value={
                            data.inviteCandidates.some((c) => c.id === invitee)
                              ? invitee
                              : data.inviteCandidates[0].id
                          }
                          onChange={(e) => setInvitee(e.target.value)}
                        >
                          {data.inviteCandidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="button primary full"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              {
                                action: "invite",
                                householdId: data.household?.id,
                                recipientId: data.inviteCandidates.some(
                                  (c) => c.id === invitee,
                                )
                                  ? invitee
                                  : data.inviteCandidates[0].id,
                              },
                              "Invitation created. Share the link with its intended recipient.",
                            )
                          }
                        >
                          Create invitation link
                          <Icon name="plus" size={17} />
                        </button>
                      </>
                    ) : (
                      <p className="small muted">
                        {data.household
                          ? "All demo customers have joined a household."
                          : "Join a household before inviting someone."}
                      </p>
                    )}
                    {invite && (
                      <div className="invitation-result">
                        <label className="field-label" htmlFor="invite-url">
                          Invitation link
                        </label>
                        <input
                          id="invite-url"
                          readOnly
                          value={invite.url}
                          onFocus={(e) => e.target.select()}
                        />
                        <small>
                          Single use · Expires {date(invite.expiresAt)}
                        </small>
                        <button
                          className="button secondary full"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(invite.url);
                              setNotice("Invitation link copied.");
                            } catch {
                              setError(
                                "Copy is unavailable. Select the invitation link and copy it manually.",
                              );
                            }
                          }}
                        >
                          <Icon name="copy" size={17} />
                          Copy link
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="privacy-note">
                    <Icon name="lock" />
                    <h3>Being a member isn’t permission</h3>
                    <p>
                      A household connects people. Sharing choices control
                      access, one person and one category at a time.
                    </p>
                  </section>
                </aside>
              </div>
            )}
            {tab === "me" && (
              <div className="content-grid">
                <section>
                  <div className="panel profile">
                    <Avatar id={data.customer.id} name={data.customer.name} />
                    <div>
                      <span className="eyebrow">YOUR DEMO PROFILE</span>
                      <h2>{data.customer.name}</h2>
                      <p>
                        {data.customer.profile.occupation} ·{" "}
                        {data.customer.profile.age} years old ·{" "}
                        {data.customer.profile.city}
                      </p>
                    </div>
                  </div>
                  <section className="panel sources">
                    <h2>Where your information comes from</h2>
                    <div className="source-row">
                      <span className="round-icon pale">
                        <Icon name="me" />
                      </span>
                      <div>
                        <h3>Demo profile and balance</h3>
                        <p>
                          Seeded fictitious information. No banking connection.
                        </p>
                        <strong>{money(data.customer.profile.balance)}</strong>
                      </div>
                      <span className="tag">SYNTHETIC</span>
                    </div>
                    <div className="source-row">
                      <span className="round-icon peach">
                        <Icon name="leaf" />
                      </span>
                      <div>
                        <h3>Life moments</h3>
                        <p>
                          Only what you explicitly tell us. Never inferred from
                          your transactions.
                        </p>
                        {data.ownMoments.length ? (
                          data.ownMoments.map((m) => (
                            <p key={m.id}>
                              <strong>{m.label}</strong>
                              <br />
                              <small>
                                Reported by you · {date(m.createdAt)}
                              </small>
                            </p>
                          ))
                        ) : (
                          <small>No life moments reported yet.</small>
                        )}
                      </div>
                    </div>
                    <div className="source-row">
                      <span className="round-icon pale">
                        <Icon name="privacy" />
                      </span>
                      <div>
                        <h3>Your sharing choices</h3>
                        <p>
                          Explicit permission, recorded separately for each
                          recipient and category.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => navigate("privacy")}
                        >
                          View consent history
                          <Icon name="arrow" size={17} />
                        </button>
                      </div>
                    </div>
                  </section>
                </section>
                <aside>
                  <section className="panel moment-prompt">
                    <span className="round-icon peach">
                      <Icon name="leaf" />
                    </span>
                    <span className="eyebrow">SOMETHING CHANGING?</span>
                    <h2>A new chapter starts with you.</h2>
                    <p>
                      Tell us about a parent moving in. Get a practical
                      checklist to help with the conversation.
                    </p>
                    <button
                      className="button primary full"
                      onClick={() => setModal("report")}
                    >
                      Report a life moment
                      <Icon name="plus" size={18} />
                    </button>
                  </section>
                  <section className="panel demo-controls">
                    <h3>Demo controls</h3>
                    <p className="small muted">
                      Restart the shared story for all demo sessions. Sofie and
                      Tom remain the initial household.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setModal("reset")}
                    >
                      Reset demo data
                    </button>
                    <button
                      className="text-button"
                      onClick={signOut}
                      disabled={busy}
                    >
                      Sign out
                      <Icon name="logout" size={17} />
                    </button>
                  </section>
                </aside>
              </div>
            )}
            {tab === "privacy" && (
              <div className="content-grid">
                <section>
                  <div className="privacy-intro">
                    <Icon name="privacy" size={27} />
                    <p>
                      Share a little, or a little more. You can change your mind
                      at any time. All switches start off.
                    </p>
                  </div>
                  {data.sharing.length ? (
                    data.sharing.map((peer) => (
                      <section
                        className="panel sharing-panel"
                        key={peer.recipientId}
                      >
                        <div className="member-heading">
                          <Avatar
                            id={peer.recipientId}
                            name={peer.recipientName}
                          />
                          <div>
                            <h2>What {peer.recipientName} can see</h2>
                            <p className="small muted">
                              Your information, shared with {peer.recipientName}{" "}
                              only
                            </p>
                          </div>
                        </div>
                        {(["balance", "moments"] as Category[]).map(
                          (category) => (
                            <div className="sharing-row" key={category}>
                              <div>
                                <h3>
                                  {category === "balance"
                                    ? "Balance"
                                    : "Life moments"}
                                </h3>
                                <p>
                                  {category === "balance"
                                    ? "Your current synthetic account balance."
                                    : "Your reported moments and the guidance they enable."}
                                </p>
                              </div>
                              <button
                                className="switch"
                                role="switch"
                                aria-checked={peer[category]}
                                aria-label={`Share ${category === "moments" ? "life moments" : "balance"} with ${peer.recipientName}`}
                                disabled={busy}
                                onClick={() =>
                                  void mutate(
                                    {
                                      action: "consent",
                                      subjectId: data.customer.id,
                                      recipientId: peer.recipientId,
                                      category,
                                      granted: !peer[category],
                                    },
                                    `${category === "balance" ? "Balance" : "Life moments"} sharing with ${peer.recipientName} is now ${peer[category] ? "off" : "on"}.`,
                                  )
                                }
                              >
                                <span />
                              </button>
                            </div>
                          ),
                        )}
                      </section>
                    ))
                  ) : (
                    <section className="panel empty">
                      <Icon name="lock" size={34} />
                      <h3>Your information stays with you</h3>
                      <p>
                        Join a household to choose sharing permissions for each
                        person.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("home")}
                      >
                        Open Home
                        <Icon name="arrow" size={17} />
                      </button>
                    </section>
                  )}
                  <p className="small muted privacy-disclaimer">
                    Turning sharing off prevents future reads immediately. Open
                    screens update on their next refresh, roughly every two
                    seconds. Information already seen cannot be recalled. No
                    notification is sent when you switch sharing off.
                  </p>
                </section>
                <aside>
                  <section className="panel history">
                    <div className="section-heading">
                      <h3>Your consent history</h3>
                      <Icon name="today" size={20} />
                    </div>
                    <p className="small muted">
                      A record of your choices, newest first.
                    </p>
                    {data.consentHistory.length ? (
                      <ol>
                        {data.consentHistory.map((event) => (
                          <li key={event.id}>
                            <span
                              className={`history-dot ${event.granted ? "granted" : ""}`}
                            />
                            <strong>
                              {event.category === "balance"
                                ? "Balance"
                                : "Life moments"}{" "}
                              · {event.granted ? "Allowed" : "Stopped"}
                            </strong>
                            <p>
                              With {event.recipientName}
                              {event.reason === "household departure"
                                ? " · Household departure"
                                : ""}
                            </p>
                            <time dateTime={event.timestamp}>
                              {date(event.timestamp)} · #{event.sequence}
                            </time>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="history-empty">
                        <Icon name="privacy" size={26} />
                        <p>
                          No sharing choices yet.
                          <br />
                          Nothing is shared by default.
                        </p>
                      </div>
                    )}
                  </section>
                  <section className="privacy-note">
                    <h3>Two independent choices</h3>
                    <p>
                      Sharing a life moment does not share your balance.
                      Switching off your balance does not remove permitted
                      moment guidance.
                    </p>
                  </section>
                </aside>
              </div>
            )}
          </>
        )}
        <footer className="app-footer">
          <Icon name="privacy" size={16} />
          <span>
            A demonstration with fictitious data. General checklists, not
            financial advice.
          </span>
          <span className="footer-brand">The customer shares. KBC guides.</span>
        </footer>
      </main>
      {!temporary && (
        <nav className="bottom-nav" aria-label="Main navigation">
          {(["today", "home", "me", "privacy"] as Tab[]).map((item) => (
            <button
              key={item}
              aria-current={tab === item ? "page" : undefined}
              className={tab === item ? "active" : ""}
              onClick={() => navigate(item)}
            >
              <Icon name={item} />
              <span>{item.charAt(0).toUpperCase() + item.slice(1)}</span>
              {item === "today" && !!data?.cards.length && <i />}
            </button>
          ))}
        </nav>
      )}
      {modal === "report" && (
        <Modal title="Tell us what’s changing" close={() => setModal(null)}>
          <span className="round-icon peach">
            <Icon name="leaf" size={28} />
          </span>
          <h3 className="moment-statement">“I am moving in with my son.”</h3>
          <p>
            Save this moment to receive a practical checklist. It will be
            visible only to you and household members you have explicitly
            allowed to see your life moments.
          </p>
          <div className="save-recipients">
            <Icon name="privacy" size={18} />
            <span>
              {data?.sharing.some((p) => p.moments)
                ? `Currently shared with: ${data.sharing
                    .filter((p) => p.moments)
                    .map((p) => p.recipientName)
                    .join(", ")}.`
                : "Currently only you can see this moment."}
            </span>
          </div>
          <button
            className="button primary full"
            disabled={busy}
            onClick={async () => {
              if (
                await mutate(
                  { action: "report" },
                  "Your moment is saved. Your guidance is ready.",
                )
              ) {
                setModal(null);
                setTab("today");
              }
            }}
          >
            {busy ? "Saving…" : "Save moment and see guidance"}
            <Icon name="arrow" size={17} />
          </button>
          <button
            className="button secondary full"
            onClick={beginTemporary}
            disabled={busy}
          >
            Continue without saving
          </button>
          <p className="small muted">
            Without saving, you get a general checklist in temporary page
            memory. It is never shared and clears when you exit.
          </p>
        </Modal>
      )}
      {modal === "leave" && (
        <Modal title="Leave this household?" close={() => setModal(null)}>
          <p>
            Your balance and moments will no longer be available to household
            members. You will lose access to their shared information too. Your
            own data and consent history remain available to you.
          </p>
          <p className="small muted">
            Joining again requires a new invitation and fresh sharing choices.
          </p>
          <button
            className="button danger-button full"
            disabled={busy}
            onClick={async () => {
              if (
                await mutate(
                  { action: "leave", householdId: data?.household?.id },
                  "You have left the household. Household sharing has ended.",
                )
              ) {
                setModal(null);
                setInvite(null);
              }
            }}
          >
            Leave household
          </button>
          <button
            className="button secondary full"
            onClick={() => setModal(null)}
          >
            Stay in household
          </button>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="Restart the demo story?" close={() => setModal(null)}>
          <p>
            This resets all synthetic households, invitations, sharing choices,
            moments and cards in every open demo session. It restores Sofie and
            Tom’s initial household.
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={async () => {
              if (
                await mutate(
                  { action: "reset" },
                  "The demo story is ready to start again.",
                )
              ) {
                setModal(null);
                setInvite(null);
                setToken("");
                setTab("today");
              }
            }}
          >
            Reset demo data
          </button>
          <button
            className="button secondary full"
            onClick={() => setModal(null)}
          >
            Cancel
          </button>
        </Modal>
      )}
    </div>
  );
}

function InvitationInput({ setToken }: { setToken: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="invitation-input"
      onSubmit={(e) => {
        e.preventDefault();
        const match = value.match(/[#&]invite=([^&]+)/);
        setToken(match ? match[1] : value.trim());
        setValue("");
      }}
    >
      <label className="field-label" htmlFor="paste-invite">
        Invitation link or token
      </label>
      <input
        id="paste-invite"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        placeholder="Paste your invitation here"
      />
      <button className="button secondary full" disabled={!value.trim()}>
        Open invitation
        <Icon name="arrow" size={17} />
      </button>
    </form>
  );
}

function GuidanceCard({
  card,
  busy,
  speaking,
  speak,
  privacy,
  mutate,
}: {
  card: CardView;
  busy: boolean;
  speaking: boolean;
  speak: () => void;
  privacy: () => void;
  mutate: (
    payload: Record<string, unknown>,
    success: string,
  ) => Promise<boolean>;
}) {
  return (
    <article className="panel guidance-card">
      <div className="card-top">
        <span className={`tag ${card.kind === "personal" ? "tag-peach" : ""}`}>
          {card.kind === "personal" ? "YOUR LIFE MOMENT" : "SHARED WITH YOU"}
        </span>
        <button
          className="icon-button"
          aria-label="Dismiss guidance card"
          disabled={busy}
          onClick={() =>
            void mutate(
              { action: "dismiss", cardId: card.id },
              "Guidance card dismissed for you.",
            )
          }
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <h2>{card.title}</h2>
      <p>{card.body}</p>
      <div className="checklist">
        {card.checklist.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={item.done}
              disabled={busy}
              onChange={(e) =>
                void mutate(
                  {
                    action: "check",
                    cardId: card.id,
                    itemId: item.id,
                    done: e.target.checked,
                  },
                  "Checklist updated.",
                )
              }
            />
            <span>{item.text}</span>
          </label>
        ))}
      </div>
      <div className="card-bottom">
        <span className="small muted">
          {card.checklist.filter((c) => c.done).length} of{" "}
          {card.checklist.length} steps checked
        </span>
        <button className="text-button" onClick={speak}>
          <Icon name="voice" size={17} />
          {speaking ? "Stop audio" : "Listen"}
        </button>
      </div>
      <details className="explanation">
        <summary>
          <Icon name="info" size={17} />
          Why am I seeing this?<span>+</span>
        </summary>
        <div>
          <strong>{card.explanation.source}</strong>
          <p>{card.explanation.rule}</p>
          <span className="rule-id">Rule: {card.explanation.ruleId}</span>
          <p>{card.explanation.permission}</p>
          <a
            href={card.explanation.privacyHref}
            onClick={(e) => {
              e.preventDefault();
              privacy();
            }}
          >
            Open privacy settings <Icon name="arrow" size={16} />
          </a>
        </div>
      </details>
    </article>
  );
}
