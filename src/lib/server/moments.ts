import "server-only";
import type { CardView, Snapshot } from "../contracts";
import { isMomentType, momentCatalog, type MomentType } from "../moment-catalog";
import { activeMembership, canAccess } from "./permissions";
import { audit, customer, DomainError, id, store } from "./store";
import { ownMoney } from "./services";

const steps = (type: MomentType) => momentCatalog[type].steps.map((text, index) => ({ id: type === "parent_moves_in" ? ["home-insurance", "household-arrangements", "sharing-choices"][index] : `step-${index}`, text }));
export const momentLabel = "I am moving in with my son.";

export function syncCards() {
  for (const moment of store().moments) {
    for (const recipient of store().customers) {
      if (!canAccess(recipient.id, moment.ownerId, "moments")) continue;
      if (recipient.id !== moment.ownerId && momentCatalog[moment.type].sensitive) continue;
      if (
        store().cards.some(
          (c) =>
            c.sourceMomentId === moment.id && c.recipientId === recipient.id,
        )
      )
        continue;
      store().cards.push({
        id: id("card"),
        recipientId: recipient.id,
        sourceMomentId: moment.id,
        ruleId: `${moment.type.toUpperCase()}_V1`,
        checklistIds: steps(moment.type).map((c) => c.id),
        completedIds: [],
        dismissed: false,
      });
    }
  }
}
export function reportMoment(actorId: string, type: MomentType = "parent_moves_in") {
  customer(actorId);
  if (!isMomentType(type)) throw new DomainError("Choose a supported life moment.");
  // Only one supported event per persona in this compact demo; retries are safe.
  if (
    !store().moments.some(
      (m) => m.ownerId === actorId && m.type === type,
    )
  ) {
    const moment = {
      id: id("moment"),
      ownerId: actorId,
      type,
      createdAt: new Date().toISOString(),
    };
    store().moments.push(moment);
    audit(actorId, "moment.report", moment.id);
  }
  syncCards();
  // Explicitly reporting again reopens the owner's checklist without duplicating
  // the event or undoing another recipient's dismissal.
  const ownMoment = store().moments.find((m) => m.ownerId === actorId && m.type === type);
  const ownCard = store().cards.find(
    (c) => c.recipientId === actorId && c.sourceMomentId === ownMoment?.id,
  );
  if (ownCard) ownCard.dismissed = false;
}
function authorizedCard(actorId: string, cardId: string) {
  const card = store().cards.find(
    (c) => c.id === cardId && c.recipientId === actorId,
  );
  const moment =
    card && store().moments.find((m) => m.id === card.sourceMomentId);
  if (!card || !moment || !canAccess(actorId, moment.ownerId, "moments") || (actorId !== moment.ownerId && momentCatalog[moment.type].sensitive)) {
    throw new DomainError("This guidance is no longer available to you.", 404);
  }
  return { card, moment };
}
export function cardView(actorId: string, cardId: string): CardView {
  const { card, moment } = authorizedCard(actorId, cardId);
  const owner = customer(moment.ownerId);
  const own = actorId === moment.ownerId;
  const definition = momentCatalog[moment.type];
  return {
    id: card.id,
    kind: own ? "personal" : "household",
    createdAt: moment.createdAt,
    title: own ? definition.label : `${owner.name} shared a life moment`,
    body: own
      ? "You told KBC about this change. Here are practical steps you can consider at your own pace."
      : `${owner.name} reported: “${definition.label}” Here are a few things you can discuss together.`,
    checklist: steps(moment.type)
      .filter((c) => card.checklistIds.includes(c.id))
      .map((c) => ({ ...c, done: card.completedIds.includes(c.id) })),
    explanation: {
      source: `Reported by ${owner.name}`,
      ruleId: card.ruleId,
      rule: `When a customer reports “${definition.label}”, offer a fixed practical checklist. This is based on the reported moment, never on transactions.`,
      permission: own
        ? "This is your own reported moment. No sharing permission is needed to see your own guidance."
        : `${owner.name} explicitly allowed life moments sharing with ${customer(actorId).name}. You are both active members of the same household. Balance sharing is separate.`,
      privacyHref: "#privacy",
    },
  };
}
export function changeCard(
  actorId: string,
  cardId: string,
  action: "dismiss" | "check",
  itemId?: string,
  done?: boolean,
) {
  const { card } = authorizedCard(actorId, cardId);
  if (action === "dismiss") card.dismissed = true;
  else {
    if (
      !itemId ||
      !card.checklistIds.includes(itemId) ||
      typeof done !== "boolean"
    )
      throw new DomainError("Choose a valid checklist item.");
    card.completedIds = card.completedIds.filter((i) => i !== itemId);
    if (done) card.completedIds.push(itemId);
  }
  audit(actorId, `card.${action}`, card.id);
}
export function snapshot(actorId: string): Snapshot {
  const own = customer(actorId);
  const membership = activeMembership(actorId);
  const home =
    membership &&
    store().households.find((h) => h.id === membership.householdId);
  const members = home
    ? store().memberships.filter(
        (m) => m.householdId === home.id && m.status === "active",
      )
    : [];
  const peers = members.filter((m) => m.customerId !== actorId);
  return {
    customer: { id: own.id, name: own.name, profile: { ...own.profile } },
    household: home
      ? {
          id: home.id,
          name: home.name,
          members: members.map((m) => {
            const person = customer(m.customerId);
            return {
              id: person.id,
              name: person.name,
              role: m.role,
              ...(canAccess(actorId, person.id, "balance")
                ? { balance: person.profile.balance }
                : {}),
              ...(canAccess(actorId, person.id, "moments")
                ? {
                    moments: store()
                      .moments.filter((m) => m.ownerId === person.id && (actorId === person.id || !momentCatalog[m.type].sensitive))
                      .map((m) => ({
                        id: m.id,
                        label: momentCatalog[m.type].label,
                        createdAt: m.createdAt,
                      })),
                  }
                : {}),
            };
          }),
        }
      : null,
    inviteCandidates: home
      ? store()
          .customers.filter((c) => !activeMembership(c.id))
          .map((c) => ({ id: c.id, name: c.name }))
      : [],
    sharing: peers.map((m) => ({
      recipientId: m.customerId,
      recipientName: customer(m.customerId).name,
      balance: canAccess(m.customerId, actorId, "balance"),
      moments: canAccess(m.customerId, actorId, "moments"),
    })),
    consentHistory: store()
      .consents.filter((c) => c.subjectId === actorId)
      .sort((a, b) => b.sequence - a.sequence)
      .map((c) => ({
        id: c.id,
        recipientName: customer(c.recipientId).name,
        category: c.category,
        granted: c.granted,
        timestamp: c.timestamp,
        sequence: c.sequence,
        reason: c.reason,
      })),
    cards: store()
      .cards.filter((c) => c.recipientId === actorId && !c.dismissed)
      .flatMap((c) => {
        const moment = store().moments.find((m) => m.id === c.sourceMomentId);
        return moment && canAccess(actorId, moment.ownerId, "moments")
          ? [cardView(actorId, c.id)]
          : [];
      }),
    ownMoments: store()
      .moments.filter((m) => m.ownerId === actorId)
      .map((m) => ({ id: m.id, label: momentCatalog[m.type].label, createdAt: m.createdAt })),
    money: ownMoney(actorId),
    appointments: store().appointments.filter((a) => a.ownerId === actorId).map(({ id, topic, date, channel }) => ({ id, topic, date, channel })),
    settings: (() => { const settings = store().settings.find((s) => s.ownerId === actorId); return { largeText: settings?.largeText ?? false, quietMode: settings?.quietMode ?? false }; })(),
  };
}
