"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CardView, Category, Snapshot } from "@/lib/contracts";
import { momentCatalog, momentTypes, type MomentType } from "@/lib/moment-catalog";
import { Icon } from "./icons";

type View = "today" | "money" | "moments" | "household" | "mykbc";
type ModalName = "report" | "leave" | "reset" | null;
const personas = [
  { id: "sofie", name: "Sofie" },
  { id: "tom", name: "Tom" },
  { id: "maria", name: "Maria" },
];
const generalChecklist = [
  "Review your home insurance information together.",
  "Discuss household arrangements and everyday responsibilities.",
  "Choose which information to share, and with whom.",
];
const money = (value: number) => new Intl.NumberFormat("en-BE", { style: "currency", currency: "EUR" }).format(value);
const date = (value: string) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request(path: string, method = "GET", data?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method, cache: "no-store", credentials: "same-origin", signal,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || "Something went wrong. Please try again.", response.status);
  return result;
}
function Avatar({ id, name }: { id: string; name: string }) {
  return <span className={`avatar avatar-${id}`} aria-hidden="true">{name.charAt(0)}</span>;
}
function Brand() {
  return <div className="brand"><span className="brand-ring" aria-hidden="true"/><span>KBC Circle</span></div>;
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={close}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><Icon name="close" size={20}/></button></div>
    {children}
  </dialog>;
}

export function HomeApp() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [view, setView] = useState<View>("today");
  const [persona, setPersona] = useState("sofie");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [invitee, setInvitee] = useState("maria");
  const [modal, setModal] = useState<ModalName>(null);
  const [temporary, setTemporary] = useState(false);
  const [temporaryDone, setTemporaryDone] = useState<number[]>([]);
  const readController = useRef<AbortController | null>(null);
  const version = useRef(0);
  const mutationInFlight = useRef(false);
  const temporaryRef = useRef(false);
  const refreshFailed = useRef(false);

  const applySnapshot = useCallback((next: Snapshot) => {
    setData(next);
    setAuthenticated(true);
    setReady(true);
  }, []);
  const refresh = useCallback(async () => {
    if (mutationInFlight.current || temporaryRef.current) return;
    const sequence = ++version.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    try {
      const next: Snapshot = await request("/api/demo", "GET", undefined, controller.signal);
      if (sequence === version.current) {
        applySnapshot(next);
        if (refreshFailed.current) setError("");
        refreshFailed.current = false;
      }
    } catch (err) {
      if (controller.signal.aborted || sequence !== version.current) return;
      setData(null);
      setReady(true);
      refreshFailed.current = true;
      if (err instanceof ApiError && err.status === 401) {
        setAuthenticated(false);
        setTemporary(false);
        setTemporaryDone([]);
        setInvite(null);
      } else setError(err instanceof Error ? err.message : "Could not refresh your information. Please try again.");
    }
  }, [applySnapshot]);

  useEffect(() => {
    function readFragment() {
      const invitation = new URLSearchParams(window.location.hash.slice(1)).get("invite");
      if (invitation) {
        setToken(invitation);
        setView("household");
        window.history.replaceState(null, "", window.location.pathname);
      } else if (["#privacy", "#sharing"].includes(window.location.hash)) setView("mykbc");
      else if (window.location.hash === "#household") setView("household");
    }
    async function start() {
      readFragment();
      await refresh();
    }
    void start();
    window.addEventListener("hashchange", readFragment);
    return () => { window.removeEventListener("hashchange", readFragment); readController.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!authenticated || temporary) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 2000);
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [authenticated, temporary, refresh]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); mutationInFlight.current = true; ++version.current; readController.current?.abort();
    try {
      await request("/api/session", "POST", { personaId: persona, password });
      setPassword("");
      applySnapshot(await request("/api/demo"));
      setNotice("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not sign in."); }
    finally { setBusy(false); mutationInFlight.current = false; }
  }
  async function signOut() {
    setBusy(true); mutationInFlight.current = true; ++version.current; readController.current?.abort();
    setTemporary(false); temporaryRef.current = false; setTemporaryDone([]); setModal(null);
    try {
      await request("/api/session", "DELETE");
      setData(null); setAuthenticated(false); setPassword(""); setInvite(null); setNotice(""); setError("");
      setView(token ? "household" : "today");
    } catch { setError("Could not sign out. Please try again."); }
    finally { setBusy(false); mutationInFlight.current = false; }
  }
  async function mutate(payload: Record<string, unknown>, success: string) {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true; setBusy(true); setError(""); setNotice(""); ++version.current; readController.current?.abort();
    try {
      const result = await request("/api/demo", "POST", payload);
      applySnapshot(result.snapshot);
      if (result.invitation) setInvite({ url: `${window.location.origin}/#invite=${result.invitation.token}`, expiresAt: result.invitation.expiresAt });
      setNotice(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this change.");
      try { applySnapshot(await request("/api/demo")); } catch { setData(null); }
      return false;
    } finally { mutationInFlight.current = false; setBusy(false); }
  }
  function navigate(next: View, target?: string, keepNotice = false) {
    setView(next); if (!keepNotice) setNotice(""); setError("");
    window.history.replaceState(null, "", target ? `#${target}` : window.location.pathname);
    if (target) window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth" }));
    else window.scrollTo(0, 0);
    void refresh();
  }
  function beginTemporary() {
    ++version.current; readController.current?.abort(); temporaryRef.current = true;
    setTemporary(true); setTemporaryDone([]); setModal(null); setNotice(""); setError("");
  }
  function endTemporary() {
    temporaryRef.current = false; setTemporary(false); setTemporaryDone([]); setView("today"); void refresh();
  }

  if (!ready) return <div className="loading-screen"><Brand/><span className="spinner"/><p>Opening your home…</p></div>;
  if (!authenticated) return <div className="login-page">
    <header className="topbar"><Brand/><span className="demo-badge">Demo · Fictitious data</span></header>
    <main className="login-main"><div className="login-card">
      <div className="welcome-icon"><Icon name="home" size={30}/></div>
      <h1>Welcome to KBC Circle</h1>
      <p>Choose a demo person to get started.</p>
      {token && <div className="notice" role="status">An invitation is ready. Sign in as its intended recipient.</div>}
      <form onSubmit={signIn}>
        <fieldset><legend>Continue as</legend><div className="persona-list">{personas.map(p => <label key={p.id} className={`persona-option ${persona === p.id ? "selected" : ""}`}>
          <input type="radio" name="persona" value={p.id} checked={persona === p.id} onChange={() => setPersona(p.id)}/>
          <Avatar id={p.id} name={p.name}/><strong>{p.name}</strong><span className="radio-dot"/>
        </label>)}</div></fieldset>
        <label className="field-label" htmlFor="password">Demo password</label>
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required placeholder="Enter the demo password"/>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Continue"}<Icon name="arrow" size={18}/></button>
      </form>
      <p className="login-note">A demonstration with fictitious people and balances. Persona switching is a demo mechanism.</p>
    </div></main>
  </div>;

  const inviteCandidate = data?.inviteCandidates.find(c => c.id === invitee) || data?.inviteCandidates[0];
  return <div className={`app ${data?.settings.largeText ? "large-text" : ""}`}>
    <header className="topbar"><Brand/><div className="topbar-actions"><span className="demo-badge">Demo · Fictitious data</span><button className="account-button" onClick={signOut} disabled={busy} aria-label={`Sign out as ${data?.customer.name || "demo customer"}`}>
      {data && <Avatar id={data.customer.id} name={data.customer.name}/>}<span>{data?.customer.name}<small>Switch person</small></span>
    </button></div></header>
    <div className="app-shell"><aside className="side"><div className="side-person">{data && <Avatar id={data.customer.id} name={data.customer.name}/>}<span><strong>{data?.customer.name}</strong><small>Demo customer</small></span></div><nav aria-label="Main menu">{([ ["today", "Overview", "today"], ["money", "Money", "card"], ["moments", "Moments", "leaf"], ["household", "Circle", "home"], ["mykbc", "My KBC", "me"] ] as const).map(([name,label,icon]) => <button key={name} className={view === name ? "active" : ""} onClick={() => navigate(name)}><Icon name={icon} size={19}/>{label}</button>)}</nav></aside><main className="workspace" id="main-content">
      {error && <div className="error" role="alert"><Icon name="info" size={18}/><span>{error}</span><button className="text-button" onClick={() => { setError(""); void refresh(); }}>Retry</button></div>}
      {notice && <div className="notice" role="status"><Icon name="check" size={18}/><span>{notice}</span><button className="icon-button" aria-label="Dismiss confirmation" onClick={() => setNotice("")}><Icon name="close" size={16}/></button></div>}
      {temporary ? <section className="panel temporary"><span className="eyebrow">PRIVATE PREVIEW</span><h1>A checklist for you</h1><p>This stays only on this page. Nothing is saved or shared.</p><div className="checklist">{generalChecklist.map((item, index) => <label key={item}><input type="checkbox" checked={temporaryDone.includes(index)} onChange={e => setTemporaryDone(old => e.target.checked ? [...old, index] : old.filter(i => i !== index))}/><span>{item}</span></label>)}</div><button className="button primary" onClick={endTemporary}>Done without saving</button></section> : !data ? <section className="panel empty"><Icon name="privacy" size={34}/><h2>Your information could not be refreshed</h2><p>We cleared the previous view. Try again to check your current access.</p><button className="button primary" onClick={() => void refresh()}>Try again</button></section> : <>
        <nav className="bottomnav" aria-label="Main navigation">{([ ["today", "Overview", "today"], ["money", "Money", "card"], ["moments", "Moments", "leaf"], ["household", "Circle", "home"], ["mykbc", "My KBC", "me"] ] as const).map(([name,label,icon]) => <button key={name} className={view === name ? "active" : ""} onClick={() => navigate(name)}><Icon name={icon} size={19}/>{label}</button>)}</nav>
        {view === "today" ? <>
          <div className="page-heading"><h1>Good day, {data.customer.name}</h1><p>Your overview of what needs attention.</p></div>
          <div className="top-stats"><button className="stat" onClick={() => navigate("money")}><span>In your accounts</span><b>{money(data.money.accounts.reduce((sum, account) => sum + account.balance, 0))}</b></button><button className="stat" onClick={() => navigate("moments")}><span>Active moments</span><b>{data.ownMoments.length}</b></button></div>
          <div className="quick-actions"><button className="button primary" onClick={() => navigate("moments")}>Report a moment</button><button className="button secondary" onClick={() => navigate("mykbc")}>Plan a conversation</button></div>
          <section className="guidance-list"><div className="section-heading"><h2>Needs your attention</h2>{data.cards.length > 0 && <span className="count">{data.cards.length}</span>}</div>
            {data.settings.quietMode ? <p className="muted">Quiet mode is on. Guidance is available in Moments.</p> : data.cards.length ? data.cards.map(card => <GuidanceCard key={card.id} card={card} busy={busy} sharing={() => navigate("mykbc", "privacy")} mutate={mutate}/>) : <div className="panel empty"><Icon name="leaf" size={30}/><h3>Nothing to do right now</h3><p>Report a life moment, or wait for someone in your Circle to choose to share one with you.</p></div>}
          </section>
        </> : view === "money" ? <MoneyScreen data={data} busy={busy} mutate={mutate}/> : view === "moments" ? <MomentsScreen data={data} busy={busy} mutate={mutate} beginTemporary={beginTemporary}/> : view === "mykbc" ? <MyKbcScreen data={data} busy={busy} mutate={mutate} setModal={setModal}/> : <>
          <div className="page-heading"><h1>Circle</h1><p>{data.household ? `${data.household.name}. You choose what each member can see.` : "Join a Circle by accepting an invitation."}</p></div>
          {token && <section className="panel invitation-banner"><div><h2>You’ve been invited</h2><p>Joining shares your name. Your balance and life moments stay private until you choose otherwise.</p></div><button className="button primary" disabled={busy} onClick={async () => { if (await mutate({ action: "accept", token }, "You’ve joined. Choose what to share below.")) { setToken(""); navigate("household", "sharing", true); } }}>Join household</button><button className="icon-button" aria-label="Dismiss invitation" onClick={() => setToken("")}><Icon name="close" size={18}/></button></section>}
          {!data.household ? <section className="panel empty"><Icon name="home" size={34}/><h2>No Circle yet</h2><p>Open the invitation sent to you, or paste it here.</p><InvitationInput setToken={setToken}/></section> : <>
            <CircleMap data={data}/>
            <section className="panel members-panel"><div className="section-heading"><h2>Members</h2><span className="count">{data.household.members.length}</span></div><div className="member-list">{data.household.members.map(member => <div className="member" key={member.id}><Avatar id={member.id} name={member.name}/><div className="member-main"><strong>{member.name}{member.id === data.customer.id ? " (you)" : ""}</strong>{member.balance !== undefined && <p><span>{member.id === data.customer.id ? "Your balance" : "Shared balance"}</span><b>{money(member.balance)}</b></p>}{member.moments?.map(moment => <p key={moment.id}><Icon name="leaf" size={15}/><span>{moment.label}</span></p>)}{member.id !== data.customer.id && member.balance === undefined && !member.moments?.length && <small>Nothing private shared with you</small>}</div></div>)}</div></section>
            {data.inviteCandidates.length > 0 && <section className="panel invite-panel"><div className="section-heading"><div><h2>Invite someone</h2><p>They decide whether to join and what to share.</p></div></div>{data.inviteCandidates.length > 1 && <><label className="field-label" htmlFor="invitee">Who would you like to invite?</label><select id="invitee" value={inviteCandidate?.id} onChange={e => setInvitee(e.target.value)}>{data.inviteCandidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>}<button className="button secondary" disabled={busy} onClick={() => void mutate({ action: "invite", householdId: data.household?.id, recipientId: inviteCandidate?.id }, `Invitation for ${inviteCandidate?.name} is ready.`)}>Invite {inviteCandidate?.name}<Icon name="plus" size={17}/></button>{invite && <div className="invitation-result"><label className="field-label" htmlFor="invite-url">Invitation link · expires {date(invite.expiresAt)}</label><input id="invite-url" readOnly value={invite.url} onFocus={e => e.target.select()}/><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(invite.url); setNotice("Invitation link copied."); } catch { setError("Copy is unavailable. Select the link and copy it manually."); } }}><Icon name="copy" size={17}/>Copy link</button></div>}</section>}
            <div className="quick-actions"><button className="button secondary" onClick={() => navigate("mykbc", "privacy")}>What I share</button><button className="text-button danger" onClick={() => setModal("leave")}>Leave Circle</button></div>
          </>}
        </>}
      </>}
      <footer className="app-footer">A demonstration with fictitious data. General checklists, not financial advice.</footer>
    </main></div>
    {modal === "report" && <Modal title="Tell us what’s changing" close={() => setModal(null)}><h3>“I am moving in with my son.”</h3><p>Save this moment to get a checklist. It stays private unless you’ve allowed someone in your household to see life moments.</p><p className="permission-note">{data?.sharing.some(peer => peer.moments) ? `Currently shared with ${data.sharing.filter(peer => peer.moments).map(peer => peer.recipientName).join(", ")}.` : "Currently only you can see this moment."}</p><button className="button primary full" disabled={busy} onClick={async () => { if (await mutate({ action: "report" }, "Your guidance is ready.")) { setModal(null); navigate("today", undefined, true); } }}>Save and see guidance</button><button className="button secondary full" onClick={beginTemporary} disabled={busy}>Continue without saving</button></Modal>}
    {modal === "leave" && <Modal title="Leave this household?" close={() => setModal(null)}><p>You and the other members will lose access to each other’s shared information. Your own data remains yours.</p><button className="button danger-button full" disabled={busy} onClick={async () => { if (await mutate({ action: "leave", householdId: data?.household?.id }, "You’ve left the household.")) { setModal(null); setInvite(null); } }}>Leave household</button><button className="button secondary full" onClick={() => setModal(null)}>Stay</button></Modal>}
    {modal === "reset" && <Modal title="Reset the demo?" close={() => setModal(null)}><p>This starts the synthetic story again for every open demo session. Sofie and Tom will be in the household.</p><button className="button danger-button full" disabled={busy} onClick={async () => { if (await mutate({ action: "reset" }, "The demo is ready to start again.")) { setModal(null); setInvite(null); setToken(""); navigate("today", undefined, true); } }}>Reset demo data</button><button className="button secondary full" onClick={() => setModal(null)}>Cancel</button></Modal>}
  </div>;
}

function InvitationInput({ setToken }: { setToken: (token: string) => void }) {
  const [value, setValue] = useState("");
  return <form className="invitation-input" onSubmit={event => { event.preventDefault(); const match = value.match(/[#&]invite=([^&]+)/); setToken(match ? match[1] : value.trim()); setValue(""); }}><label className="field-label" htmlFor="paste-invite">Invitation link or token</label><input id="paste-invite" value={value} onChange={event => setValue(event.target.value)} required placeholder="Paste your invitation"/><button className="button primary" disabled={!value.trim()}>Open invitation</button></form>;
}

function CircleMap({ data }: { data: Snapshot }) {
  const peers = data.household?.members.filter((person) => person.id !== data.customer.id) ?? [];
  return <div className="panel circle-map" aria-label="Your Circle and your sharing choices"><div className="circle-ring"/><div className="circle-self"><Avatar id={data.customer.id} name={data.customer.name}/><strong>You</strong></div>{peers.map((person, index) => { const choice = data.sharing.find((item) => item.recipientId === person.id); const count = Number(choice?.balance) + Number(choice?.moments); return <div className={`circle-peer circle-peer-${index % 4}`} key={person.id}><Avatar id={person.id} name={person.name}/><strong>{person.name}</strong><small>{count} shared</small></div>; })}<p>Your choices are shown per person.</p></div>;
}

function GuidanceCard({ card, busy, sharing, mutate }: { card: CardView; busy: boolean; sharing: () => void; mutate: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  return <article className="panel guidance-card"><div className="card-top"><span className="eyebrow">{card.kind === "personal" ? "YOUR MOMENT" : "SHARED WITH YOU"}</span><button className="icon-button" aria-label="Dismiss guidance card" disabled={busy} onClick={() => void mutate({ action: "dismiss", cardId: card.id }, "Guidance card dismissed.")}><Icon name="close" size={18}/></button></div><h3>{card.title}</h3><p>{card.body}</p><div className="checklist">{card.checklist.map(item => <label key={item.id}><input type="checkbox" checked={item.done} disabled={busy} onChange={event => void mutate({ action: "check", cardId: card.id, itemId: item.id, done: event.target.checked }, "Checklist updated.")}/><span>{item.text}</span></label>)}</div><details className="explanation"><summary>Why am I seeing this?<Icon name="plus" size={18}/></summary><div><strong>{card.explanation.source}</strong><p>{card.explanation.rule}</p><span className="rule-id">Rule: {card.explanation.ruleId}</span><p>{card.explanation.permission}</p><a href={card.explanation.privacyHref} onClick={event => { event.preventDefault(); sharing(); }}>View sharing settings <Icon name="arrow" size={16}/></a></div></details></article>;
}

function MoneyScreen({ data, busy, mutate }: { data: Snapshot; busy: boolean; mutate: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const [section, setSection] = useState<"accounts" | "budget" | "goals" | "simulate">("accounts");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [category, setCategory] = useState("Groceries");
  const [limit, setLimit] = useState("450");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [monthly, setMonthly] = useState("100");
  const [years, setYears] = useState("5");
  const account = data.money.accounts.find((item) => item.id === accountId);
  return <><div className="page-heading"><h1>Money</h1></div><nav className="subnav" aria-label="Money sections">{([ ["accounts", "Accounts"], ["budget", "Budget"], ["goals", "Goals"], ["simulate", "Simulate"] ] as const).map(([id,label]) => <button key={id} className={section === id ? "on" : ""} onClick={() => { setSection(id); setAccountId(null); }}>{label}</button>)}</nav>
    {section === "accounts" && (account ? <><button className="back" onClick={() => setAccountId(null)}>‹ Back to accounts</button><h2>{account.name}</h2><p className="muted">{account.iban}</p><p className="big-amount">{money(account.balance)}</p><h2>Activity</h2><div className="panel list-panel">{account.transactions.length ? account.transactions.map((tx) => <div className="data-row" key={tx.id}><span><strong>{tx.label}</strong><small>{tx.date} · {tx.category}</small></span><b>{money(tx.amount)}</b></div>) : <p>No demo activity yet.</p>}</div></> : <><p className="muted">Total {money(data.money.accounts.reduce((sum, item) => sum + item.balance, 0))}</p><div className="panel list-panel">{data.money.accounts.map((item) => <button className="data-row" key={item.id} onClick={() => setAccountId(item.id)}><span><strong>{item.name}</strong><small>{item.iban}</small></span><b>{money(item.balance)}</b></button>)}</div><p className="small muted">Synthetic accounts only. No transfers or real banking connection.</p></>)}
    {section === "budget" && <><p className="muted">You set the limits for your synthetic spending.</p><div className="panel">{data.money.budgets.length ? data.money.budgets.map((item) => <div className="budget-item" key={item.category}><div className="data-row"><strong>{item.category}</strong><span>{money(item.spent)} of {money(item.limit)}</span></div><div className="progress"><span style={{ width: `${Math.min(100, item.limit ? item.spent / item.limit * 100 : 0)}%` }}/></div></div>) : <p>No budgets yet.</p>}</div><form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); void mutate({ action: "budget", category, limit: Number(limit) }, "Budget saved."); }}><h3>Set a demo budget</h3><label htmlFor="budget-cat">Category</label><input id="budget-cat" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={30} required/><label htmlFor="budget-limit">Monthly limit (€)</label><input id="budget-limit" type="number" min="0" max="100000" step="0.01" value={limit} onChange={(event) => setLimit(event.target.value)} required/><button className="button primary" disabled={busy}>Save budget</button></form></>}
    {section === "goals" && <><p className="muted">Personal ideas with fictitious amounts.</p>{data.money.goals.map((goal) => <div className="panel" key={goal.id}><h3>{goal.name}</h3><p>{money(goal.saved)} of {money(goal.target)}</p><div className="progress"><span style={{ width: `${Math.min(100, goal.saved / goal.target * 100)}%` }}/></div></div>)}<form className="panel form-panel" onSubmit={async (event) => { event.preventDefault(); if (await mutate({ action: "goal", name: goalName, target: Number(goalTarget) }, "Goal created.")) { setGoalName(""); setGoalTarget(""); } }}><h3>New demo goal</h3><label htmlFor="goal-name">Name</label><input id="goal-name" value={goalName} onChange={(event) => setGoalName(event.target.value)} maxLength={40} required/><label htmlFor="goal-target">Target (€)</label><input id="goal-target" type="number" min="1" max="1000000" step="0.01" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} required/><button className="button primary" disabled={busy}>Create goal</button></form></>}
    {section === "simulate" && <><p className="muted">Illustrative arithmetic. No result is saved, and this is not financial advice.</p><div className="panel form-panel"><h3>Simple savings illustration</h3><label htmlFor="sim-monthly">Monthly amount (€)</label><input id="sim-monthly" type="number" min="0" max="100000" value={monthly} onChange={(event) => setMonthly(event.target.value)}/><label htmlFor="sim-years">Years</label><input id="sim-years" type="number" min="1" max="50" value={years} onChange={(event) => setYears(event.target.value)}/><p className="big-amount">{money(Math.max(0, Number(monthly) || 0) * 12 * Math.max(0, Number(years) || 0))}</p><p className="small muted">Total contributions only: amount × 12 × years. No return is assumed.</p></div></>}
  </>;
}

function MomentsScreen({ data, busy, mutate, beginTemporary }: { data: Snapshot; busy: boolean; mutate: (payload: Record<string, unknown>, success: string) => Promise<boolean>; beginTemporary: () => void }) {
  const [mode, setMode] = useState<"list" | "catalog" | "preview">("list");
  const [selected, setSelected] = useState<MomentType>("parent_moves_in");
  const groups = [...new Set(momentTypes.map((type) => momentCatalog[type].group))];
  const active = momentCatalog[selected];
  if (mode === "catalog") return <><button className="back" onClick={() => setMode("list")}>‹ Back to Moments</button><h1>What is changing?</h1><p className="muted">KBC never guesses these moments. You decide what to tell us.</p>{groups.map((group) => <section key={group}><h2>{group}</h2><div className="options-grid">{momentTypes.filter((type) => momentCatalog[type].group === group).map((type) => <button className="option" key={type} onClick={() => { setSelected(type); setMode("preview"); }}>{momentCatalog[type].label}{momentCatalog[type].sensitive && <span className="chip">Private</span>}</button>)}</div></section>)}</>;
  if (mode === "preview") return <><button className="back" onClick={() => setMode("catalog")}>‹ Back to moments</button><h1>{active.label}</h1><p className="muted">A fixed, general checklist based only on what you report.</p><div className="panel"><h3>Your steps</h3><ol className="preview-steps">{active.steps.map((step) => <li key={step}>{step}</li>)}</ol><p className="small muted">{active.sensitive ? "This sensitive moment always stays private in the demo." : data.sharing.some((person) => person.moments) ? `Life moments are currently shared with ${data.sharing.filter((person) => person.moments).map((person) => person.recipientName).join(", ")}.` : "Only you can see this moment unless you grant sharing."}</p><div className="actions"><button className="button primary" disabled={busy} onClick={async () => { if (await mutate({ action: "report", type: selected }, "Your guidance is ready.")) setMode("list"); }}>Save and see steps</button><button className="button secondary" onClick={beginTemporary}>Continue without saving</button></div></div></>;
  return <><h1>Moments</h1><p className="muted page-intro">Tell us what changes in your life. KBC puts practical steps in one place and never infers a moment from transactions.</p><button className="button primary" onClick={() => setMode("catalog")}>New moment</button><h2>Ongoing</h2>{data.cards.length ? data.cards.map((card) => <GuidanceCard key={card.id} card={card} busy={busy} sharing={() => { window.location.hash = "privacy"; }} mutate={mutate}/>) : <p className="muted">No ongoing moments.</p>}{data.household?.members.some((person) => person.id !== data.customer.id && person.moments?.length) && <><h2>Shared in your Circle</h2><div className="panel list-panel">{data.household.members.filter((person) => person.id !== data.customer.id).flatMap((person) => person.moments?.map((moment) => <div className="data-row" key={moment.id}><strong>{person.name}</strong><span>{moment.label}</span></div>) ?? [])}</div></>}</>;
}

function MyKbcScreen({ data, busy, mutate, setModal }: { data: Snapshot; busy: boolean; mutate: (payload: Record<string, unknown>, success: string) => Promise<boolean>; setModal: (value: ModalName) => void }) {
  const [section, setSection] = useState<"hub" | "profile" | "privacy" | "products" | "appointments" | "settings" | "log">(() => typeof window !== "undefined" && window.location.hash === "#privacy" ? "privacy" : "hub");
  const [booking, setBooking] = useState(false);
  const [topic, setTopic] = useState("General question");
  const [channel, setChannel] = useState("In branch");
  const [when, setWhen] = useState("");
  const nav = [ ["profile", "Profile", "What KBC knows about you and where it comes from"], ["privacy", "Privacy and sharing", "What you share, and with whom"], ["products", "Products", "Your synthetic accounts"], ["appointments", "Appointments", `${data.appointments.length} planned`], ["settings", "Settings", "Large text and quiet mode"], ["log", "Consent history", "Every change to your sharing choices"] ] as const;
  return <><h1>My KBC</h1>{section === "hub" ? <><div className="panel list-panel">{nav.map(([id, title, subtitle]) => <button className="data-row nav-row" key={id} onClick={() => setSection(id)}><span><strong>{title}</strong><small>{subtitle}</small></span><b>›</b></button>)}</div><button className="text-button" onClick={() => setModal("reset")}>Reset demo data</button></> : <><nav className="subnav" aria-label="My KBC sections">{nav.map(([id, title]) => <button key={id} className={section === id ? "on" : ""} onClick={() => { setSection(id); setBooking(false); }}>{title === "Privacy and sharing" ? "Privacy" : title === "Consent history" ? "Log" : title}</button>)}</nav>
    {section === "profile" && <><h2>Your profile</h2><div className="panel list-panel">{[ ["Name", data.customer.name], ["Age", String(data.customer.profile.age)], ["City", data.customer.profile.city], ["Occupation", data.customer.profile.occupation], ["Synthetic balance", money(data.customer.profile.balance)] ].map(([label,value]) => <div className="data-row" key={label}><strong>{label}</strong><span>{value}</span></div>)}</div><h2>Information sources</h2><div className="panel"><p>Profiles and balances are fictitious seed data. Life moments come only from what you report. Shared information comes only from explicit per-person permission.</p></div></>}
    {section === "privacy" && <><h2>Privacy and sharing</h2><p className="muted">Membership never shares private information automatically. Choose separately for each person and category.</p>{data.sharing.length ? data.sharing.map((peer) => <div className="panel privacy-card" key={peer.recipientId}><h3>{peer.recipientName}</h3>{(["balance", "moments"] as Category[]).map((category) => <div className="privacy-row" key={category}><span><strong>{category === "balance" ? "Balance" : "Life moments"}</strong><small>{category === "balance" ? "Your synthetic total" : "Non-sensitive moments you report"}</small></span><button className="switch" role="switch" aria-checked={peer[category]} aria-label={`Share ${category} with ${peer.recipientName}`} disabled={busy} onClick={() => void mutate({ action: "consent", subjectId: data.customer.id, recipientId: peer.recipientId, category, granted: !peer[category] }, `${category === "balance" ? "Balance" : "Life moments"} sharing with ${peer.recipientName} is now ${peer[category] ? "off" : "on"}.`)}><span/></button></div>)}</div>) : <div className="panel">Join a Circle to choose what you share.</div>}<p className="small muted">Turning sharing off blocks future reads. Other members see the change on their next refresh. Previously seen information cannot be recalled.</p><button className="text-button" onClick={() => setSection("log")}>View consent history →</button></>}
    {section === "products" && <><h2>Your demo products</h2><div className="panel list-panel">{data.money.accounts.map((account) => <div className="data-row" key={account.id}><span><strong>{account.name}</strong><small>{account.iban}</small></span><b>{money(account.balance)}</b></div>)}</div><p className="small muted">Fictitious accounts. No account opening, transfers, or real banking activity.</p></>}
    {section === "appointments" && (booking ? <><button className="back" onClick={() => setBooking(false)}>‹ Back to appointments</button><h2>Plan a demo conversation</h2><p className="muted">This creates a local demo record only. No one is contacted.</p><form className="panel form-panel" onSubmit={async (event) => { event.preventDefault(); if (await mutate({ action: "appointment", topic, channel, date: when }, "Demo appointment saved. No one was contacted.")) setBooking(false); }}><label htmlFor="topic">Topic</label><select id="topic" value={topic} onChange={(event) => setTopic(event.target.value)}>{["General question", "Home and family", "Budget conversation", "Care for a parent"].map((value) => <option key={value}>{value}</option>)}</select><label htmlFor="channel">How</label><select id="channel" value={channel} onChange={(event) => setChannel(event.target.value)}>{["In branch", "Video call", "Phone call"].map((value) => <option key={value}>{value}</option>)}</select><label htmlFor="when">Date and time</label><input id="when" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required/><button className="button primary" disabled={busy}>Save demo appointment</button></form></> : <><h2>Appointments</h2>{data.appointments.length ? <div className="panel list-panel">{data.appointments.map((item) => <div className="data-row" key={item.id}><span><strong>{item.topic}</strong><small>{item.channel}</small></span><b>{new Date(item.date).toLocaleString("en-GB")}</b></div>)}</div> : <p className="muted">No demo appointments planned.</p>}<button className="button primary" onClick={() => setBooking(true)}>Plan a conversation</button></>)}
    {section === "settings" && <><h2>Settings</h2><div className="panel privacy-card"><div className="privacy-row"><span><strong>Large text</strong><small>Increase interface text size</small></span><button className="switch" role="switch" aria-label="Large text" aria-checked={data.settings.largeText} disabled={busy} onClick={() => void mutate({ action: "setting", key: "largeText", value: !data.settings.largeText }, "Text size updated.")}><span/></button></div><div className="privacy-row"><span><strong>Quiet mode</strong><small>Keep guidance on Moments; reduce Overview prompts</small></span><button className="switch" role="switch" aria-label="Quiet mode" aria-checked={data.settings.quietMode} disabled={busy} onClick={() => void mutate({ action: "setting", key: "quietMode", value: !data.settings.quietMode }, "Quiet mode updated.")}><span/></button></div></div></>}
    {section === "log" && <><h2>Consent history</h2><div className="panel list-panel">{data.consentHistory.length ? data.consentHistory.map((event) => <div className="data-row" key={event.id}><span><strong>{event.category === "balance" ? "Balance" : "Life moments"} {event.granted ? "shared" : "stopped"} with {event.recipientName}</strong><small>{new Date(event.timestamp).toLocaleString("en-GB")} · #{event.sequence}{event.reason === "household departure" ? " · Circle departure" : ""}</small></span></div>) : <p>No sharing choices yet. Everything is private by default.</p>}</div></>}
    </>}</>;
}
