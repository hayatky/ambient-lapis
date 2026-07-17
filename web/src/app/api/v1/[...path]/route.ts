import { notFoundResponse } from "@/lib/bff/error";

export function notFound(): Response {
  return notFoundResponse();
}

export {
  notFound as DELETE,
  notFound as GET,
  notFound as HEAD,
  notFound as OPTIONS,
  notFound as PATCH,
  notFound as POST,
  notFound as PUT,
};
