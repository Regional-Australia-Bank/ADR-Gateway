import { DataholderOidcResponse } from "../Types";
import { validate } from "class-validator";

export const DataHolderOidcResponse = async (dhOidcResponse:DataholderOidcResponse) => {
  let errors = await validate(dhOidcResponse)
  if (errors.length > 0) throw errors; // TODO standardize Validate errors
  return true;
}