import { JWKS, JSONWebKeySet } from "jose";

const oidcSpec = {
    // ... see the available options in Configuration options section
    issuer: <string><any>undefined,
    claims: {
      sub: null
    },
    tokenEndpointAuthMethods: ['private_key_jwt'],
    formats: {
      AccessToken: 'jwt',
      ClientCredentials: 'jwt',
    },
    jwks: <JWKS.KeyStore><any>undefined,
    scopes: ["cdr-register:bank:read"],
    features: {
      clientCredentials: {
        enabled: true
      }
    },
    clients: [{
      client_id: 'client-id-placeholder',
      jwks_uri: 'https://localhost/jwks-placeholder',
      // + other client properties
    }],
    clientDefaults: {
      client_secret: "whatever",
      token_endpoint_auth_method: 'private_key_jwt',
      redirect_uris: [],
      response_types: [],
      grant_types:['client_credentials'],
      id_token_signed_response_alg: 'PS256'
    },
    responseTypes:[]
    // ...
  };

  export const GenerateOidcSpec = (jwks: JWKS.KeyStore) => {
    let x = oidcSpec;
    x.jwks = jwks
    return x;
  }