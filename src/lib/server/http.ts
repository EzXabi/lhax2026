import "server-only";
import { DomainError } from "./store";
export const privateHeaders = {
  "Cache-Control": "no-store",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
};
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: { ...privateHeaders, ...headers },
  });
}
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof DomainError
          ? error.message
          : "Something went wrong. Please try again.",
    },
    error instanceof DomainError ? error.status : 500,
  );
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError("Send a JSON request.", 415);
  const text = await request.text();
  if (text.length > 8192)
    throw new DomainError("This request is too large.", 413);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new DomainError("The request could not be read. Please try again.");
  }
}
export function string(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 2048)
    throw new DomainError("A required value is missing or invalid.");
  return value;
}
