import { body, failure, json, string } from "@/lib/server/http";
import { login, logout, sameOrigin, sessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const data = await body(request);
    const token = login(string(data.personaId), string(data.password));
    logout(request);
    return json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie(request, token),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    logout(request);
    return json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie(request, "", true),
    });
  } catch (error) {
    return failure(error);
  }
}
