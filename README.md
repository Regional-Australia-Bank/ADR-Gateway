# Introduction 
ADR-Gateway is a set of microservices that enables a Data Recipient to interact with the Australian Consumer Data Right ecosystem without needing to develop the complexities of boiler-plate data recipient interactions. It has been built with the [Twelve-Factor App](https://12factor.net/) philosophy in mind, and is expected to be used in a containerised or serverless environment. It can easily be used in a single or multi-application scenario.

# Quick starts

## PM2

```
npm i 
npm run start
```

## Docker

```
npm i
npm run docker-build
npm run start-docker
```

## Exploring with postman

Import examples/pm2/adr-gateway-sandbox.pm2.postman_collection.json into Postman. (Note that this will also work with the docker-compose example).

# Components

1. Frontend - provides [standards-compliant endpoints](https://consumerdatastandardsaustralia.github.io/standards/#end-points) for ecosystem interactions, namely JSON Web Key Set End Point and Revocation End Point.
2. Backend - provides a REST interface for the data sharing consent lifecycle (create, retrieve data, revoke).
3. Housekeeper - manages registrations with Data Holders, metadata cache, refresh token maintenance (still to be developed), and retrying failed revocation propagation.

A collection of mock/test components are also provided

1. Mock Register
2. Mock Data Holder
4. Compliance test suite - tests a Data Holder and Register against the standard. Coverage is over interactions with the Data Recipeint (e.g. Security Profile and API interactions).

# What it does not do

1. Identity management
2. Tracking consent for data usage (as opposed to data sharing)
4. Storage or deletion of data
3. UI

# Testing

## Automated testing

Note that it is not needed to start a server before testing (tests create their own execution context).

```
npm run test
```

# Working in VS Code

## Recommended extensions

- [Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter) for running and debugging E2E tests
- [Docker](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker)

## User/workspace settings

Include the following settings for Mocha Test Explorer

```
"mochaExplorer.files":"**/*.spec.js",
"mochaExplorer.require": ["source-map-support/register"],
```

# Licence

Copyright (c) 2020 Regional Australia Bank

[MIT License](./LICENSE)
