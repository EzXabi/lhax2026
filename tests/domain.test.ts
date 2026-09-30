import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  acceptInvitation,
  createInvitation,
  hashToken,
  leaveHousehold,
} from "../src/lib/server/household";
import {
  cardView,
  changeCard,
  reportMoment,
  snapshot,
  syncCards,
} from "../src/lib/server/moments";
import { canAccess, setConsent } from "../src/lib/server/permissions";
import {
  login,
  logout,
  requireSession,
  sameOrigin,
  sessionCookie,
  verifyToken,
} from "../src/lib/server/session";
import { DomainError, resetStore, store } from "../src/lib/server/store";
import { addGoal, bookAppointment, ownMoney, setBudget, setSetting } from "../src/lib/server/services";

beforeEach(() => {
  resetStore();
});
function joinMaria() {
  const invitation = createInvitation("sofie", "home", "maria");
  acceptInvitation("maria", invitation.token);
  return invitation;
}
const denied = (fn: () => unknown) => assert.throws(fn, DomainError);

test("cross-person access is denied by default, including founder access; own data remains accessible", () => {
  assert.equal(canAccess("sofie", "tom", "balance"), false);
  assert.equal(canAccess("sofie", "tom", "moments"), false);
  assert.equal(canAccess("tom", "sofie", "balance"), false);
  assert.equal(canAccess("sofie", "sofie", "balance"), true);
  assert.equal(canAccess("unknown", "unknown", "balance"), false);
  const tom = snapshot("sofie").household!.members.find((m) => m.id === "tom")!;
  assert.equal(Object.hasOwn(tom, "balance"), false);
  assert.equal(Object.hasOwn(tom, "moments"), false);
});
test("explicit grants are recipient-specific and category-independent", () => {
  joinMaria();
  setConsent("maria", "maria", "tom", "balance", true);
  assert.equal(canAccess("tom", "maria", "balance"), true);
  assert.equal(canAccess("tom", "maria", "moments"), false);
  assert.equal(canAccess("sofie", "maria", "balance"), false);
  setConsent("maria", "maria", "tom", "moments", true);
  setConsent("maria", "maria", "tom", "balance", false);
  assert.equal(canAccess("tom", "maria", "balance"), false);
  assert.equal(canAccess("tom", "maria", "moments"), true);
  assert.deepEqual(
    store().consents.map((c) => c.sequence),
    [1, 2, 3],
  );
});
test("only the subject can modify consent, even when the actor is a founder", () => {
  joinMaria();
  denied(() => setConsent("sofie", "maria", "tom", "balance", true));
  denied(() => setConsent("tom", "maria", "tom", "moments", true));
  assert.equal(store().consents.length, 0);
  assert.equal(store().audit.at(-1)?.result, "denied");
});
test("sharing requires active membership and valid recipients", () => {
  denied(() => setConsent("maria", "maria", "tom", "balance", true));
  denied(() => setConsent("tom", "tom", "tom", "balance", true));
  denied(() => setConsent("tom", "tom", "unknown", "balance", true));
});
test("invitation stores only a hash, expires in seven days, and acceptance is single use", () => {
  const before = Date.now();
  const invitation = createInvitation("sofie", "home", "maria");
  const saved = store().invitations[0];
  assert.equal(saved.tokenHash, hashToken(invitation.token));
  assert.equal(JSON.stringify(saved).includes(invitation.token), false);
  assert.ok(saved.expiresAt >= before + 7 * 86400_000);
  acceptInvitation("maria", invitation.token);
  denied(() => acceptInvitation("maria", invitation.token));
  assert.equal(
    store().memberships.filter(
      (m) => m.customerId === "maria" && m.status === "active",
    ).length,
    1,
  );
  assert.ok(saved.consumedAt);
  assert.equal(canAccess("tom", "maria", "balance"), false);
});
test("wrong recipient and expired invitations cannot be consumed", () => {
  const invitation = createInvitation("sofie", "home", "maria");
  denied(() => acceptInvitation("tom", invitation.token));
  assert.equal(store().invitations[0].consumedAt, null);
  store().invitations[0].expiresAt = Date.now() - 1;
  denied(() => acceptInvitation("maria", invitation.token));
  assert.equal(store().invitations[0].consumedAt, null);
  denied(() => acceptInvitation("maria", "fabricated-token"));
});
test("an invitation cannot be created for another household or accepted after inviter leaves", () => {
  denied(() => createInvitation("maria", "home", "maria"));
  denied(() => createInvitation("sofie", "other-home", "maria"));
  const invitation = createInvitation("sofie", "home", "maria");
  leaveHousehold("sofie", "home");
  denied(() => acceptInvitation("maria", invitation.token));
});
test("departure expires unused old invitations so they cannot be used to rejoin", () => {
  const unused = createInvitation("sofie", "home", "maria");
  joinMaria();
  leaveHousehold("maria", "home");
  denied(() => acceptInvitation("maria", unused.token));
  joinMaria();
  assert.equal(canAccess("tom", "maria", "moments"), false);
});
test("balance revocation removes the API field but preserves separately permitted moment guidance", () => {
  joinMaria();
  setConsent("maria", "maria", "tom", "balance", true);
  setConsent("maria", "maria", "tom", "moments", true);
  reportMoment("maria");
  assert.equal(snapshot("maria").cards.length, 1);
  assert.equal(snapshot("tom").cards.length, 1);
  assert.equal(snapshot("sofie").cards.length, 0);
  assert.equal(
    snapshot("tom").household!.members.find((m) => m.id === "maria")!.balance,
    12450.75,
  );
  const tomCard = snapshot("tom").cards[0];
  assert.equal(tomCard.explanation.source, "Reported by Maria");
  assert.equal(tomCard.explanation.ruleId, "PARENT_MOVES_IN_V1");
  assert.match(tomCard.explanation.permission, /life moments sharing with Tom/);
  setConsent("maria", "maria", "tom", "balance", false);
  const after = snapshot("tom");
  assert.equal(
    Object.hasOwn(
      after.household!.members.find((m) => m.id === "maria")!,
      "balance",
    ),
    false,
  );
  assert.equal(JSON.stringify(after).includes("12450.75"), false);
  assert.equal(after.cards.length, 1);
  setConsent("maria", "maria", "tom", "moments", false);
  assert.equal(snapshot("tom").cards.length, 0);
  denied(() => cardView("tom", tomCard.id));
  denied(() => changeCard("tom", tomCard.id, "check", "home-insurance", true));
});
test("leaving invalidates grants in both directions; rejoining does not restore them", () => {
  joinMaria();
  setConsent("maria", "maria", "tom", "balance", true);
  setConsent("maria", "maria", "tom", "moments", true);
  setConsent("tom", "tom", "maria", "balance", true);
  reportMoment("maria");
  leaveHousehold("maria", "home");
  assert.equal(canAccess("tom", "maria", "balance"), false);
  assert.equal(canAccess("maria", "tom", "balance"), false);
  assert.equal(snapshot("tom").cards.length, 0);
  assert.equal(
    snapshot("tom").household!.members.some((m) => m.id === "maria"),
    false,
  );
  assert.equal(snapshot("maria").cards.length, 1);
  assert.equal(snapshot("maria").household, null);
  joinMaria();
  assert.equal(canAccess("tom", "maria", "balance"), false);
  assert.equal(canAccess("tom", "maria", "moments"), false);
  assert.equal(canAccess("maria", "tom", "balance"), false);
  assert.ok(store().consents.some((c) => c.reason === "household departure"));
});
test("cards are not readable or mutable by another recipient; checklist progress is independent", () => {
  joinMaria();
  setConsent("maria", "maria", "tom", "moments", true);
  reportMoment("maria");
  const ownCard = snapshot("maria").cards[0];
  denied(() => cardView("tom", ownCard.id));
  denied(() => changeCard("tom", ownCard.id, "dismiss"));
  changeCard("maria", ownCard.id, "check", "home-insurance", true);
  assert.equal(snapshot("maria").cards[0].checklist[0].done, true);
  assert.equal(snapshot("tom").cards[0].checklist[0].done, false);
  changeCard("maria", ownCard.id, "dismiss");
  assert.equal(snapshot("maria").cards.length, 0);
  assert.equal(snapshot("tom").cards.length, 1);
});
test("repeated reporting and card generation are idempotent, and reads create no records", () => {
  reportMoment("maria");
  reportMoment("maria");
  syncCards();
  assert.equal(store().moments.length, 1);
  assert.equal(store().cards.length, 1);
  const before = JSON.stringify(store());
  snapshot("maria");
  snapshot("sofie");
  assert.equal(JSON.stringify(store()), before);
});
test("sessions reject tampered and expired cookies, logout invalidates replay, HTTPS sets Secure", () => {
  process.env.DEMO_PASSWORD = "test-password-only";
  process.env.SESSION_SECRET =
    "test-secret-with-more-than-thirty-two-characters";
  const token = login("sofie", "test-password-only");
  assert.equal(verifyToken(token)?.sub, "sofie");
  assert.equal(verifyToken(`${token}x`), null);
  const payload = JSON.parse(
    Buffer.from(token.split(".")[0], "base64url").toString(),
  );
  payload.sub = "maria";
  assert.equal(
    verifyToken(
      `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${token.split(".")[1]}`,
    ),
    null,
  );
  const request = new Request("https://example.test/api/demo", {
    headers: {
      cookie: `kbc_home_session=${token}`,
      origin: "https://example.test",
    },
  });
  assert.match(sessionCookie(request, token), /HttpOnly; SameSite=Strict/);
  assert.match(sessionCookie(request, token), /; Secure$/);
  assert.equal(requireSession(request).sub, "sofie");
  sameOrigin(request);
  denied(() =>
    sameOrigin(
      new Request("https://example.test/api/demo", {
        headers: { origin: "https://evil.test" },
      }),
    ),
  );
  denied(() => sameOrigin(new Request("https://example.test/api/demo")));
  sameOrigin(
    new Request("http://localhost:3000/api/demo", {
      headers: {
        host: "tom.localhost:3000",
        origin: "http://tom.localhost:3000",
      },
    }),
  );
  denied(() =>
    sameOrigin(
      new Request("http://localhost:3000/api/demo", {
        headers: {
          host: "tom.localhost:3000",
          origin: "http://localhost:3000",
        },
      }),
    ),
  );
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 5 * 60 * 60_000;
    assert.equal(verifyToken(token), null);
  } finally {
    Date.now = realNow;
  }
  logout(request);
  assert.equal(verifyToken(token), null);
});
test("login throttles repeated wrong-password attempts", () => {
  process.env.DEMO_PASSWORD = "test-password-only";
  process.env.SESSION_SECRET =
    "test-secret-with-more-than-thirty-two-characters";
  for (let i = 0; i < 12; i++)
    assert.throws(
      () => login("maria", "wrong-password"),
      (error: unknown) => error instanceof DomainError && error.status === 401,
    );
  assert.throws(
    () => login("maria", "wrong-password"),
    (error: unknown) => error instanceof DomainError && error.status === 429,
  );
});

test("new synthetic money features remain in the signed-in person's snapshot", () => {
  setBudget("maria", "Groceries", 250);
  addGoal("maria", "Garden", 700);
  setSetting("maria", "largeText", true);
  const maria = snapshot("maria");
  const tom = snapshot("tom");
  assert.equal(maria.money.budgets.find((b) => b.category === "Groceries")?.limit, 250);
  assert.equal(maria.money.goals.find((g) => g.name === "Garden")?.target, 700);
  assert.equal(maria.settings.largeText, true);
  assert.equal(tom.money.goals.some((g) => g.name === "Garden"), false);
  assert.equal(tom.money.accounts.some((a) => a.id === "maria-current"), false);
  assert.equal(ownMoney("tom").accounts.some((a) => a.id === "maria-current"), false);
});

test("sensitive reported moments stay private even with a moments grant", () => {
  joinMaria();
  setConsent("maria", "maria", "tom", "moments", true);
  reportMoment("maria", "illness");
  assert.equal(snapshot("maria").ownMoments.some((m) => m.label.includes("illness")), true);
  assert.equal(snapshot("tom").cards.length, 0);
  assert.equal(snapshot("tom").household!.members.find((m) => m.id === "maria")!.moments?.length, 0);
});

test("demo appointments are own records and invalid dates are rejected", () => {
  const future = new Date(Date.now() + 2 * 86400000).toISOString();
  bookAppointment("sofie", "General question", future, "Phone call");
  assert.equal(snapshot("sofie").appointments.length, 1);
  assert.equal(snapshot("tom").appointments.length, 0);
  denied(() => bookAppointment("sofie", "General question", "2020-01-01", "Phone call"));
});
