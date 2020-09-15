[![Build Status](https://img.shields.io/appveyor/build/pcurtisrab/ADR-Gateway)](https://ci.appveyor.com/project/pcurtisrab/adr-gateway)
[![Testing Status](https://img.shields.io/appveyor/tests/pcurtisrab/ADR-Gateway)](https://ci.appveyor.com/project/pcurtisrab/adr-gateway)
[![Coverage Status](https://coveralls.io/repos/github/Regional-Australia-Bank/ADR-Gateway/badge.svg?branch=master)](https://coveralls.io/github/Regional-Australia-Bank/ADR-Gateway?branch=master)
[![MIT License](https://img.shields.io/github/license/Regional-Australia-Bank/ADR-Gateway)](./LICENSE)

# Introduction 
Dr G is being used within the Australian CDR ecosystem today and includes a set of microservices that enable a Data Recipient to interact with the Australian Consumer Data Right ecosystem without needing to develop the complexities of boiler-plate data recipient interactions.  Including a mock Register, mock Data Holder and CTS, Dr G has been built with the [Twelve-Factor App](https://12factor.net/) philosophy in mind, and is expected to be used in a containerised or serverless environment. It can easily be used in a single or multi-application scenario.

# Quick starts

## Docker (recommended)

```
npm run build:docker
npm run start:docker
```

## PM2

You must have Node 14. This s historically not considered as robust as the Docker example, which is much closer to a production deployment.

```
npm i 
npm run start
```

## Exploring with postman

Import [the Postman collection](./examples/deployment/adr-gateway-sandbox.postman_collection.json) into Postman.

Here you can see how the OAuth consent flow works. You can also make calls to all data holder endpoints with mock responses (requests for Accounts and Transactions are provided)

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

Include the following settings for Mocha Test Explorer. These are already configured in the workspace.

```
"mochaExplorer.files":"**/*.spec.js",
"mochaExplorer.require": ["source-map-support/register"],
```

## Conformance testing

See [Conformance Test Suite](./doc/Conformance%20Test%20Suite.md).


# Licence

Copyright (c) 2020 Regional Australia Bank

[MIT License](./LICENSE)
