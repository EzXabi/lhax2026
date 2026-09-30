import "server-only";
import type { CardView, Snapshot } from "../contracts";
import { activeMembership, canAccess } from "./permissions";
import { audit, customer, DomainError, id, store } from "./store";

const RULE_ID = "PARENT_MOVES_IN_V1";
const checklist = [
  {
    id: "home-insurance",
    text: "Review your home insurance information together.",
  },
  {
    id: "household-arrangements",
    text: "Discuss household arrangements and everyday responsibilities.",
  },
  {
    id: "sharing-choices",
    text: "Choose which information to share, and with whom.",
  },
];
export const momentLabel = "I am moving in with my son.";

export function syncCards() {
  for (const moment of store().moments) {
    for (const recipient of store().customers) {
      if (!canAccess(recipient.id, moment.ownerId, "moments")) continue;
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
        ruleId: RULE_ID,
        checklistIds: checklist.map((c) => c.id),
        completedIds: [],
        dismissed: false,
      });
    }
  }
}
export function reportMoment(actorId: string) {
  customer(actorId);
  // Only one supported event per persona in this compact demo; retries are safe.
  if (
    !store().moments.some(
      (m) => m.ownerId === actorId && m.type === "parent_moves_in",
    )
  ) {
    const moment = {
      id: id("moment"),
      ownerId: actorId,
      type: "parent_moves_in" as const,
      createdAt: new Date().toISOString(),
    };
    store().moments.push(moment);
    audit(actorId, "moment.report", moment.id);
  }
  syncCards();
  // Explicitly reporting again reopens the owner's checklist without duplicating
  // the event or undoing another recipient's dismissal.
  const ownMoment = store().moments.find((m) => m.ownerId === actorId);
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
  if (!card || !moment || !canAccess(actorId, moment.ownerId, "moments")) {
    throw new DomainError("This guidance is no longer available to you.", 404);
  }
  return { card, moment };
}
export function cardView(actorId: string, cardId: string): CardView {
  const { card, moment } = authorizedCard(actorId, cardId);
  const owner = customer(moment.ownerId);
  const own = actorId === moment.ownerId;
  return {
    id: card.id,
    kind: own ? "personal" : "household",
    createdAt: moment.createdAt,
    title: own
      ? "A new chapter, under one roof"
      : `Make room for a new chapter with ${owner.name}`,
    body: own
      ? "Moving in with your son is a big step. A few conversations today can help everyone feel at home."
      : `${owner.name} reported: “I am moving in with my son.” Here are a few things you can discuss together.`,
    checklist: checklist
      .filter((c) => card.checklistIds.includes(c.id))
      .map((c) => ({ ...c, done: card.completedIds.includes(c.id) })),
    explanation: {
      source: `Reported by ${owner.name}`,
      ruleId: card.ruleId,
      rule: "When a customer reports ‘I am moving in with my son’, offer a practical household checklist. This is based on the reported moment, never on transactions.",
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
                      .moments.filter((m) => m.ownerId === person.id)
                      .map((m) => ({
                        id: m.id,
                        label: momentLabel,
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
      .map((m) => ({ id: m.id, label: momentLabel, createdAt: m.createdAt })),
  };
}
