export interface BffErrorBody {
  code: string;
  message: string;
  field?: string;
}

export interface BffErrorEnvelope {
  error: BffErrorBody;
  meta: {
    requestId: string;
    generatedAt: string;
  };
}

export function errorResponse(status: number, error: BffErrorBody): Response {
  const body: BffErrorEnvelope = {
    error,
    meta: {
      requestId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
    },
  };

  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function badGatewayResponse(): Response {
  return errorResponse(502, {
    code: "bad_gateway",
    message: "upstream service is unavailable",
  });
}

export function methodNotAllowedResponse(): Response {
  const response = errorResponse(405, {
    code: "method_not_allowed",
    message: "method not allowed",
  });
  response.headers.set("Allow", "GET");
  return response;
}

export function notFoundResponse(): Response {
  return errorResponse(404, {
    code: "not_found",
    message: "resource not found",
  });
}
