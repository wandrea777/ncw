import { HTTPException } from "hono/http-exception";

/** Fouten met een vaste, veilige code. Interne details gaan nooit naar de client. */
export class ApiError extends HTTPException {
  readonly code: string;
  constructor(status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 503, code: string, message: string) {
    super(status, { message });
    this.code = code;
  }
}

export const unauthorized = () => new ApiError(401, "unauthorized", "Niet ingelogd of sessie verlopen.");
export const forbidden = () => new ApiError(403, "forbidden", "Geen toegang.");
// 404 in plaats van 403 voor resources van andere organisaties: verbergt het bestaan ervan.
export const notFound = () => new ApiError(404, "not_found", "Niet gevonden.");
export const conflict = (msg: string) => new ApiError(409, "conflict", msg);
export const badRequest = (msg: string) => new ApiError(400, "bad_request", msg);

/** PostgreSQL unique-violation (23505), bijv. een passkey of lidmaatschap dat al bestaat. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
