import { apiFailureSchema, currentResponseSchema } from "@/lib/api/schemas";
import { proxyToGo } from "@/lib/bff/proxy";
import { validateNoQuery } from "@/lib/bff/query";

export { DELETE, HEAD, OPTIONS, PATCH, POST, PUT } from "@/lib/bff/methods";

export async function GET(request: Request): Promise<Response> {
  const query = validateNoQuery(request);
  if (!query.ok) return query.response;

  return proxyToGo(request, {
    path: "/api/v1/current",
    cachePolicy: "current",
    successSchema: currentResponseSchema,
    failureSchema: apiFailureSchema,
  });
}
