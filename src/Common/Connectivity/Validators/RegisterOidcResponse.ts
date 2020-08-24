import { validate } from "class-validator";

export const RegisterOidc = async (o) => {
  if (typeof o.registerOidcResponse == 'undefined') {
      throw 'Unexpected undefined value from cache'
  }
  const errors = await validate(o.registerOidcResponse)
  if (errors.length > 0) throw errors;
  return true;
}