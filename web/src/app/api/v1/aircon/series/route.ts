import {
  airconSeriesResponseSchema,
  apiFailureSchema,
} from "@/lib/api/schemas";
import { proxyToGo } from "@/lib/bff/proxy";
import { validateRangeQuery } from "@/lib/bff/query";

export { DELETE, HEAD, OPTIONS, PATCH, POST, PUT } from "@/lib/bff/methods";

export async function GET(request: Request): Promise<Response> {
  const query = validateRangeQuery(request);
  if (!query.ok) return query.response;

  return proxyToGo(request, {
    path: "/api/v1/aircon/series",
    search: query.search,
    cachePolicy: "history",
    successSchema: airconSeriesResponseSchema,
    failureSchema: apiFailureSchema,
  });
}
