import { methodNotAllowedResponse } from "./error";

export function methodNotAllowed(): Response {
  return methodNotAllowedResponse();
}

export {
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS,
  methodNotAllowed as PATCH,
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
};
