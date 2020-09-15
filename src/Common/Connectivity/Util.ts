import { GetRegisterOIDC } from "./Evaluators/RegisterOidc";
import { GetSoftwareProductConfig, GetSoftwareProductConfigs } from "./Evaluators/SoftwareProductConfig";
import { AssertSoftwareProductActive, SoftwareProductStatus } from "./Evaluators/SoftwareProductStatus";
import { GetRegisterAccessToken } from "./Evaluators/RegisterAccessToken";
import { GetDataholders, GetDataholderMetadata, AssertDataHolderActiveAtRegister, AssertDataHolderIsUp, DataHolderStatus } from "./Evaluators/DataHolderMetadata";
import { GetDataHolderOidc } from "./Evaluators/DataHolderOidc";
import { DataHolderOidcResponse } from "./Validators/DataHolderOidcResponse"
import { GetDataHolderJwks, GetDataHolderRevocationJwks } from "./Evaluators/DataHolderJwks";
import { JWKS } from "jose";
import { RegisterGetSSA } from "./Evaluators/RegisterGetSSA";
import { ValidAndCurrentSSA } from "./Validators/ValidAndCurrentSSA"
import { GetCurrentClientRegistration } from "./Evaluators/GetCurrentClientRegistration";
import { NewClientRegistration, CheckAndUpdateClientRegistration, GetDataHolderRegistrationAccessToken } from "./Evaluators/DynamicClientRegistration";
import { GetAuthorizationRequest } from "./Evaluators/AuthorizationRequest";
import { FetchTokens, SyncRefreshTokenStatus } from "./Evaluators/FetchTokens";
import { GetUserInfo } from "./Evaluators/UserInfo";
import { UpdateClaims } from "./Evaluators/UpdateClaims";
import { PropagateRevokedConsent } from "./Evaluators/PropagateRevokedConsent";
import { ValidateAuthorizeResponse, ValidateIdToken } from "./Evaluators/ValidateIdToken";
import { AssertDataRecipientActive, DataRecipientStatus } from "./Evaluators/DataRecipientStatus";
import { GetJwks } from "../Init/Jwks";

const JwksWithPS256 = (jwks:JWKS.KeyStore) => {
  jwks.get({use:'sig',alg:'PS256'});
  return true;
}

export const Validation = {
  DataRecipientJwks: JwksWithPS256,
  DataHolderJwks: JwksWithPS256,
  DataHolderRevocationJwks: JwksWithPS256,
  DataHolderOidcResponse,
  ValidAndCurrentSSA
}

export {
  GetJwks,
  GetRegisterOIDC,
  GetSoftwareProductConfig,
  GetSoftwareProductConfigs,
  DataRecipientStatus,
  AssertDataRecipientActive,
  SoftwareProductStatus,
  AssertSoftwareProductActive,
  GetRegisterAccessToken,
  GetDataholders,
  GetDataholderMetadata,
  AssertDataHolderActiveAtRegister,
  DataHolderStatus,
  AssertDataHolderIsUp,
  GetDataHolderOidc,
  GetDataHolderJwks,
  GetDataHolderRevocationJwks,
  RegisterGetSSA,
  GetCurrentClientRegistration,
  NewClientRegistration,
  GetDataHolderRegistrationAccessToken,
  CheckAndUpdateClientRegistration,
  GetAuthorizationRequest,
  ValidateAuthorizeResponse,
  ValidateIdToken,
  SyncRefreshTokenStatus,
  FetchTokens,
  UpdateClaims,
  GetUserInfo,
  PropagateRevokedConsent
}