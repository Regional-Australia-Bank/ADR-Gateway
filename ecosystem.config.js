module.exports = {
  apps : [{
    name: 'AdrGateway',
    script: 'out/AdrGateway/Server/start.js',

    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    args: '-d .local-env/adr-gateway',
    instances: 1,
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      NODE_TLS_REJECT_UNAUTHORIZED:"0",
      CACHE_FOLDER: "cache",
      DATAHOLDER_META_EXPIRY_SECONDS: "3600"
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },{
    name: 'AdrHousekeeper',
    script: 'out/AdrGateway/Housekeeper/start.js',

    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    args: '-d .local-env/adr-gateway',
    instances: 1,
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      NODE_TLS_REJECT_UNAUTHORIZED:"0",
      CACHE_FOLDER: "cache",
      DATAHOLDER_META_EXPIRY_SECONDS: "3600",
      LOG_FILE: "housekeeper.log.txt"
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },{
    name: 'AdrServer',
    script: 'out/AdrServer/Server/start.js',

    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    args: '-d .local-env/adr-server',
    instances: 1,
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      NODE_TLS_REJECT_UNAUTHORIZED:"0"
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },{
    name: 'DhServer',
    script: 'out/MockServices/DhServer/Server/start.js',
    args: '-d .local-env/dh-server',
    instances: 1,
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      NODE_TLS_REJECT_UNAUTHORIZED:"0"
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },{
    name: 'MockRegister',
    script: 'out/MockServices/Register/Server/start.js',
    args: '-d .local-env/mock-register',
    instances: 1,
    autorestart: false,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      NODE_TLS_REJECT_UNAUTHORIZED:"0"
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },{
    name: 'HttpsProxy',
    script: 'out/HttpsProxy/index.js',
    instances: 1,
    autorestart: true,
    exp_backoff_restart_delay: 100,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
