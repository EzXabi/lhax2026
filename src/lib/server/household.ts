import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { activeMembership, appendConsent } from "./permissions";
import { audit, customer, DomainError, id, store } from "./store";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function createInvitation(
  actorId: string,
  householdId: string,
  recipientId: string,
) {
  if (activeMembership(actorId)?.householdId !== householdId)
    throw new DomainError(
      "You must be an active member to invite someone.",
      403,
    );
  customer(recipientId);
  if (activeMembership(recipientId))
    throw new DomainError("This person already belongs to a household.", 409);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  store().invitations.push({
    id: id("invitation"),
    tokenHash: hashToken(token),
    householdId,
    intendedRecipientId: recipientId,
    createdBy: actorId,
    expiresAt,
    consumedAt: null,
  });
  audit(actorId, "invitation.create", `${householdId}:${recipientId}`);
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}
export function acceptInvitation(actorId: string, token: string) {
  customer(actorId);
  const invitation = store().invitations.find(
    (i) => i.tokenHash === hashToken(token),
  );
  if (
    !invitation ||
    invitation.intendedRecipientId !== actorId ||
    invitation.consumedAt ||
    invitation.expiresAt <= Date.now()
  ) {
    audit(actorId, "invitation.accept", "invitation", "denied");
    throw new DomainError(
      "This invitation is invalid, expired, already used, or intended for another person.",
      403,
    );
  }
  if (activeMembership(actorId))
    throw new DomainError(
      "Leave your current household before accepting an invitation.",
      409,
    );
  if (
    activeMembership(invitation.createdBy)?.householdId !==
    invitation.householdId
  )
    throw new DomainError(
      "The person who invited you is no longer in this household.",
      403,
    );
  // Deliberately synchronous: validation, consumption and membership activation are
  // one uninterrupted operation in the supported single Node process.
  invitation.consumedAt = new Date().toISOString();
  store().memberships.push({
    id: id("membership"),
    householdId: invitation.householdId,
    customerId: actorId,
    role: "member",
    status: "active",
  });
  audit(actorId, "invitation.accept", invitation.id);
}
export function leaveHousehold(actorId: string, householdId: string) {
  const membership = activeMembership(actorId);
  if (!membership || membership.householdId !== householdId)
    throw new DomainError(
      "You are not an active member of this household.",
      403,
    );
  // Revoke both directions, retaining the history. Rejoining cannot resurrect grants.
  const related = store().consents.filter(
    (c) => c.subjectId === actorId || c.recipientId === actorId,
  );
  const pairs = new Map(
    related.map((c) => [`${c.subjectId}:${c.recipientId}:${c.category}`, c]),
  );
  for (const c of pairs.values())
    appendConsent(
      c.subjectId,
      c.recipientId,
      c.category,
      false,
      "household departure",
    );
  membership.status = "left";
  for (const invitation of store().invitations) {
    if (
      invitation.householdId === householdId &&
      !invitation.consumedAt &&
      (invitation.createdBy === actorId ||
        invitation.intendedRecipientId === actorId)
    )
      invitation.expiresAt = Date.now();
  }
  audit(actorId, "household.leave", householdId);
}
