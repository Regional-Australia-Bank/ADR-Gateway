// Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/

const env = {
  /** Common config */
  NODE_ENV: 'development',
  MOCK_TLS_PKI:"1",
  ADR_DATABASE_OPTIONS: '{"database":"examples/deployment/pm2/adr.sqlite"}',
  DH_DATABASE_OPTIONS: '{"database":"examples/deployment/pm2/mock-dh.sqlite"}',
  // HTTP_PROXY: 'http://...',
  // HTTPS_PROXY: 'http://...',
  // NO_PROXY: "localhost",
  
  //LOG_FILE: "debug.log.txt",
  LOG_LEVEL: "debug",

  /** JWKS service (optional). Provides a single source of truth JWKS in a microservice. Any URL could be used instead */
  /** JWKS can also be supplied in the ADR_JWKS var as a JSON string or URL */
  // ADR_JWKS_SERVICE_PORT: 8402,
  // ADR_JWKS_SERVICE_JWKS: {"keys":[...]}

  /** ADR Software Product Service */
  // ADR_PRODUCT_PORT: 8401

  /** ADR Gateway Service (Backend) */
  // ADR_BACKEND_PORT: 8101
  // ADR_BACKEND_BASE: 'https://localhost:9101/'

  /** ADR Server (Frontend) */
  // ADR_FRONTEND_PORT: 8102
  // ADR_JOSE_APPLICATION_BASE_URL: "https://localhost:9102"
  // ADR_JOSE_AUDIENCE_MAP: "{'/revoke':'/revoke'}"

  /** Common Connectivity options */
  ADR_JWKS: 'http://localhost:8402/private.jwks',
  // ADR_REGISTER_OIDC_URI: 'https://localhost:9301/oidc',
  // ADR_REGISTER_RESOURCE_URI: 'https://localhost:9301/',
  // ADR_REGISTER_SECURE_RESOURCE_URI: 'https://localhost:9301/',
  // ADR_SOFTWARE_PRODUCT_CONFIG_URIS: '{"sandbox": "http://localhost:8401/software.product.config"}'
  ADR_SOFTWARE_PRODUCT_CONFIG_URIS: '{"mycdrdata":"http://localhost:8701/software.product.config", "affordability":"http://localhost:8702/software.product.config"}'
  // DATAHOLDER_META_EXPIRY_SECONDS: "3600", // TODO place this in the schema in Config.ts

  /** Mock Register options */
  // REGISTER_PORT: 8301
  // REGISTER_FRONT_END_URI: "http://localhost:8301"
  // REGISTER_FRONT_END_MTLS_URI: "http://localhost:8301"
  // REGISTER_MOCK_DHS: '{"test-data-holder-1":"http://localhost:8201/mock.register.config"}'
  // PROXY_REGISTER_OIDC_URI: "https://api.int.cdr.gov.au/idp"
  // PROXY_REGISTER_RESOURCE_URI: "https://api.int.cdr.gov.au/cdr-register"
  // PROXY_REGISTER_SECURE_RESOURCE_URI: "https://secure.api.int.cdr.gov.au/cdr-register"
  // PROXY_ADR_SOFTWARE_PRODUCT_CONFIG_URIS: "{}"
  // REGISTER_TEST_DR_JWKS_URI: "http://localhost:8101/jwks"

  /** Mock Dataholder options */
  // DH_PORT: 8201
  // DH_JOSE_APPLICATION_BASE_URL: "https://localhost:10202"
  // DH_JOSE_AUDIENCE_MAP: "{'/revoke':'/revoke'}"
  // DH_FRONTEND_URL: "https://localhost:10201"
  // DH_FRONTEND_MTLS_URL: "https://localhost:10202"
  // DH_OIDC_AUTHORIZATION_ENDPOINT: "https://localhost:10201/authorize"
  // DH_REGISTER_JWKS_URI: "http://localhost:8301/oidc/jwks"
  // DH_OIDC_AUTHORIZATION_ENDPOINT: 'https://localhost:10201/authorize',
  // DH_OIDC_TOKEN_ENDPOINT: 'https://localhost:10202/idp/token',
  // DH_OIDC_INTROSPECTION_ENDPOINT: 'https://localhost:10202/idp/token/introspect',
  // DH_OIDC_REVOKE_ENDPOINT: 'https://localhost:10202/idp/token/revoke',
  // DH_OIDC_USERINFO_ENDPOINT: 'https://localhost:10202/userinfo',
  // DH_OIDC_DCR_ENDPOINT: 'https://localhost:10202/idp/register',
  // DH_OIDC_JWKS_ENDPOINT: 'http://localhost:8201/jwks',

  //APPINSIGHTS_INSTRUMENTATIONKEY: ""
}

const env_production = {
  NODE_ENV: 'production',
  LOG_LEVEL: "warn",
}

module.exports = {
  apps : [{
    name: 'AdrJwks',
    script: 'dist/AdrJwks/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production
  },
  {
    name: 'AdrDbMigrate',
    script: 'dist/Common/Entities/Migrations/Migrate.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production
  },
  {
    name: 'MockSoftwareProduct',
    script: 'dist/MockServices/SoftwareProduct/Server/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production
  },{
    name: 'AdrGateway',
    script: 'dist/AdrGateway/Server/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production,
    node_args: "--inspect --inspect-port 9290"
  },{
    name: 'AdrHousekeeper',
    script: 'dist/AdrGateway/Housekeeper/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production
  },{
    name: 'AdrServer',
    script: 'dist/AdrServer/Server/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production
  },{
    name: 'DhServer',
    script: 'dist/MockServices/DhServer/Server/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production,
    node_args: "--inspect --inspect-port 9291"
  },{
    name: 'MockRegister',
    script: 'dist/MockServices/Register/Server/start.js',
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production,
    node_args: "--inspect --inspect-port 9293"
  },{
    name: 'HttpsProxy',
    script: 'dist/HttpsProxy/start.js',
    autorestart: true,
    exp_backoff_restart_delay: 3000,
    watch: false,
    max_memory_restart: '1G',
    env,
    env_production,
    node_args: "--inspect --inspect-port 9292"
  }]
};
