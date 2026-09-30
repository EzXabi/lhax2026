import {
  acceptInvitation,
  createInvitation,
  leaveHousehold,
} from "@/lib/server/household";
import { body, failure, json, string } from "@/lib/server/http";
import {
  cardView,
  changeCard,
  reportMoment,
  snapshot,
  syncCards,
} from "@/lib/server/moments";
import { setConsent } from "@/lib/server/permissions";
import { requireSession, sameOrigin } from "@/lib/server/session";
import { audit, DomainError, resetStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { sub } = requireSession(request);
    const cardId = new URL(request.url).searchParams.get("cardId");
    return json(cardId ? { card: cardView(sub, cardId) } : snapshot(sub));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { sub } = requireSession(request);
    const data = await body(request);
    let invitation;
    switch (data.action) {
      case "invite":
        invitation = createInvitation(
          sub,
          string(data.householdId),
          string(data.recipientId),
        );
        break;
      case "accept":
        acceptInvitation(sub, string(data.token));
        break;
      case "leave":
        leaveHousehold(sub, string(data.householdId));
        break;
      case "consent": {
        if (data.category !== "balance" && data.category !== "moments")
          throw new DomainError("Choose a supported sharing category.");
        if (typeof data.granted !== "boolean")
          throw new DomainError("Choose whether to allow sharing.");
        setConsent(
          sub,
          string(data.subjectId),
          string(data.recipientId),
          data.category,
          data.granted,
        );
        syncCards();
        break;
      }
      case "report":
        reportMoment(sub);
        break;
      case "dismiss":
        changeCard(sub, string(data.cardId), "dismiss");
        break;
      case "check": {
        if (typeof data.done !== "boolean")
          throw new DomainError("Choose a checklist status.");
        changeCard(
          sub,
          string(data.cardId),
          "check",
          string(data.itemId),
          data.done,
        );
        break;
      }
      case "reset":
        resetStore();
        audit(sub, "demo.reset", "demo");
        break;
      default:
        throw new DomainError("This action is not supported.");
    }
    return json({
      snapshot: snapshot(sub),
      ...(invitation ? { invitation } : {}),
    });
  } catch (error) {
    return failure(error);
  }
}
