import {
  apiFailureSchema,
  environmentSeriesResponseSchema,
} from "@/lib/api/schemas";
import { proxyToGo } from "@/lib/bff/proxy";
import { validateEnvironmentSeriesQuery } from "@/lib/bff/query";

export { DELETE, HEAD, OPTIONS, PATCH, POST, PUT } from "@/lib/bff/methods";

export async function GET(request: Request): Promise<Response> {
  const query = validateEnvironmentSeriesQuery(request);
  if (!query.ok) return query.response;

  return proxyToGo(request, {
    path: "/api/v1/environment/series",
    search: query.search,
    cachePolicy: "history",
    successSchema: environmentSeriesResponseSchema,
    failureSchema: apiFailureSchema,
  });
}
