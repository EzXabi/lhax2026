import assert from "node:assert/strict";
import { test } from "node:test";

// Runs against a local server, with three independent cookie jars. Resets demo data.
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
const password = process.env.DEMO_PASSWORD;
async function api(
  path,
  { cookie, data, method = data ? "POST" : "GET", requestOrigin = origin } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== "GET" ? { Origin: requestOrigin } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  assert.equal(
    response.headers.get("cache-control"),
    "no-store",
    `${path} must not cache private responses`,
  );
  const result = await response.json();
  return {
    status: response.status,
    body: result,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
async function signIn(personaId) {
  const result = await api("/api/session", { data: { personaId, password } });
  assert.equal(result.status, 200, result.body.error);
  assert.match(result.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.ok(result.cookie);
  return result.cookie;
}

test("complete household journey with independent sessions and API-level privacy assertions", async () => {
  assert.ok(
    password,
    "Set DEMO_PASSWORD in .env.local before running integration tests.",
  );
  assert.equal((await api("/api/demo")).status, 401);
  assert.equal(
    (await api("/api/tts", { data: { text: "Arbitrary text must not work." } }))
      .status,
    401,
  );
  const sofie = await signIn("sofie");
  const tom = await signIn("tom");
  const maria = await signIn("maria");
  const change = (cookie, data) => api("/api/demo", { cookie, data });
  const read = (cookie) => api("/api/demo", { cookie });
  await change(sofie, { action: "reset" });
  try {
    const initial = (await read(sofie)).body;
    assert.deepEqual(
      initial.household.members.map((m) => m.id),
      ["sofie", "tom"],
    );
    assert.equal(Object.hasOwn(initial.household.members[1], "balance"), false);
    assert.equal(Object.hasOwn(initial.household.members[1], "moments"), false);
    assert.equal(
      (
        await api("/api/demo", {
          cookie: maria,
          requestOrigin: "https://untrusted.example",
          data: { action: "report" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await change(maria, {
          action: "invite",
          householdId: "home",
          recipientId: "maria",
        })
      ).status,
      403,
    );
    const invitation = await change(sofie, {
      action: "invite",
      householdId: "home",
      recipientId: "maria",
    });
    assert.equal(invitation.status, 200);
    const token = invitation.body.invitation.token;
    assert.equal((await change(tom, { action: "accept", token })).status, 403);
    assert.equal(
      (await change(maria, { action: "accept", token })).status,
      200,
    );
    assert.equal(
      (await change(maria, { action: "accept", token })).status,
      403,
    );
    assert.equal(
      (
        await change(tom, {
          action: "consent",
          subjectId: "maria",
          recipientId: "tom",
          category: "balance",
          granted: true,
        })
      ).status,
      403,
    );
    // Browser-supplied viewer IDs never replace the cookie actor.
    assert.equal(
      (
        await change(sofie, {
          action: "consent",
          viewerId: "maria",
          subjectId: "maria",
          recipientId: "tom",
          category: "balance",
          granted: true,
        })
      ).status,
      403,
    );
    for (const category of ["balance", "moments"]) {
      assert.equal(
        (
          await change(maria, {
            action: "consent",
            subjectId: "maria",
            recipientId: "tom",
            category,
            granted: true,
          })
        ).status,
        200,
      );
    }
    const before = (await read(maria)).body;
    assert.equal(before.ownMoments.length, 0);
    assert.equal(before.cards.length, 0);
    const reported = await change(maria, {
      action: "report",
      viewerId: "sofie",
    });
    assert.equal(reported.status, 200);
    const ownCard = reported.body.snapshot.cards[0];
    assert.equal(ownCard.explanation.source, "Reported by Maria");
    assert.equal((await read(sofie)).body.cards.length, 0);
    const tomState = (await read(tom)).body;
    const tomCard = tomState.cards[0];
    assert.equal(tomCard.explanation.source, "Reported by Maria");
    assert.equal(tomCard.explanation.ruleId, "PARENT_MOVES_IN_V1");
    assert.match(
      tomCard.explanation.permission,
      /life moments sharing with Tom/,
    );
    assert.equal(
      tomState.household.members.find((m) => m.id === "maria").balance,
      12450.75,
    );
    assert.equal(
      (await api(`/api/demo?cardId=${ownCard.id}`, { cookie: tom })).status,
      404,
    );
    assert.equal(
      (await change(tom, { action: "dismiss", cardId: ownCard.id })).status,
      404,
    );
    assert.equal(
      (await api("/api/tts", { cookie: sofie, data: { cardId: ownCard.id } }))
        .status,
      404,
    );
    assert.equal(
      (
        await api("/api/tts", {
          cookie: maria,
          data: { text: "Arbitrary narration" },
        })
      ).status,
      400,
    );
    if (!process.env.ELEVENLABS_API_KEY) {
      const voice = await api("/api/tts", {
        cookie: maria,
        data: { cardId: ownCard.id },
      });
      assert.equal(voice.status, 503);
      assert.match(voice.body.error, /Voice is not set up/);
    }
    await change(maria, {
      action: "consent",
      subjectId: "maria",
      recipientId: "tom",
      category: "balance",
      granted: false,
    });
    const revoked = (await read(tom)).body;
    assert.equal(
      Object.hasOwn(
        revoked.household.members.find((m) => m.id === "maria"),
        "balance",
      ),
      false,
    );
    assert.equal(JSON.stringify(revoked).includes("12450.75"), false);
    assert.equal(revoked.cards.length, 1);
    assert.equal(
      (await api(`/api/demo?cardId=${tomCard.id}`, { cookie: tom })).status,
      200,
    );
    await change(maria, { action: "leave", householdId: "home" });
    const departed = (await read(tom)).body;
    assert.equal(
      departed.household.members.some((m) => m.id === "maria"),
      false,
    );
    assert.equal(departed.cards.length, 0);
    assert.equal(
      (await api(`/api/demo?cardId=${tomCard.id}`, { cookie: tom })).status,
      404,
    );
    assert.equal(
      (await api("/api/tts", { cookie: tom, data: { cardId: tomCard.id } }))
        .status,
      404,
    );
    assert.equal((await read(maria)).body.cards.length, 1);
    const reInvitation = await change(sofie, {
      action: "invite",
      householdId: "home",
      recipientId: "maria",
    });
    await change(maria, {
      action: "accept",
      token: reInvitation.body.invitation.token,
    });
    const rejoined = (await read(tom)).body;
    assert.equal(
      Object.hasOwn(
        rejoined.household.members.find((m) => m.id === "maria"),
        "balance",
      ),
      false,
    );
    assert.equal(
      Object.hasOwn(
        rejoined.household.members.find((m) => m.id === "maria"),
        "moments",
      ),
      false,
    );
    assert.equal(rejoined.cards.length, 0);
    await api("/api/session", { cookie: maria, method: "DELETE" });
    assert.equal((await read(maria)).status, 401);
    assert.equal((await read(`${tom}tampered`)).status, 401);
  } finally {
    await change(sofie, { action: "reset" });
    await api("/api/session", { cookie: sofie, method: "DELETE" });
    await api("/api/session", { cookie: tom, method: "DELETE" });
  }
});
