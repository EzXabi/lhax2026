import "server-only";
import type { Category } from "../contracts";
import {
  audit,
  customer,
  DomainError,
  id,
  store,
  type ConsentEvent,
} from "./store";

export function activeMembership(customerId: string) {
  return store().memberships.find(
    (m) => m.customerId === customerId && m.status === "active",
  );
}
export function sameHousehold(a: string, b: string) {
  const first = activeMembership(a);
  return !!first && first.householdId === activeMembership(b)?.householdId;
}
export function latestConsent(
  subjectId: string,
  recipientId: string,
  category: Category,
) {
  return store()
    .consents.filter(
      (c) =>
        c.subjectId === subjectId &&
        c.recipientId === recipientId &&
        c.category === category,
    )
    .reduce<ConsentEvent | undefined>(
      (latest, c) => (!latest || c.sequence > latest.sequence ? c : latest),
      undefined,
    );
}
// The only policy for supported private data, including derived cards and speech.
// Callers supply an authenticated actor, never a browser-supplied viewer ID.
export function canAccess(
  viewerId: string,
  subjectId: string,
  category: Category,
): boolean {
  if (category !== "balance" && category !== "moments") return false;
  if (
    !store().customers.some((c) => c.id === viewerId) ||
    !store().customers.some((c) => c.id === subjectId)
  )
    return false;
  if (viewerId === subjectId) return true;
  return (
    sameHousehold(viewerId, subjectId) &&
    latestConsent(subjectId, viewerId, category)?.granted === true
  );
}
export function appendConsent(
  subjectId: string,
  recipientId: string,
  category: Category,
  granted: boolean,
  reason: "preference" | "household departure" = "preference",
) {
  store().consents.push({
    id: id("consent"),
    subjectId,
    recipientId,
    category,
    granted,
    reason,
    timestamp: new Date().toISOString(),
    sequence: ++store().sequence,
  });
}
export function setConsent(
  actorId: string,
  subjectId: string,
  recipientId: string,
  category: Category,
  granted: boolean,
) {
  customer(actorId);
  if (actorId !== subjectId) {
    audit(actorId, "consent.change", subjectId, "denied");
    throw new DomainError(
      "You can only change your own sharing preferences.",
      403,
    );
  }
  if (actorId === recipientId || !sameHousehold(actorId, recipientId))
    throw new DomainError(
      "Sharing requires another active member of your household.",
      403,
    );
  if (category !== "balance" && category !== "moments")
    throw new DomainError("Choose a supported sharing category.");
  if (typeof granted !== "boolean")
    throw new DomainError("Choose whether to allow sharing.");
  appendConsent(actorId, recipientId, category, granted);
  audit(
    actorId,
    granted ? "consent.grant" : "consent.revoke",
    `${recipientId}:${category}`,
  );
}
