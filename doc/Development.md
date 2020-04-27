# Visual code extensions

- [Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter) for running and debugging tests

# VS code settings
Include the following settings for Mocha Test Explorer

```
"mochaExplorer.files":"**/*.spec.js",
"mochaExplorer.require": ["source-map-support/register"],
```

# Getting a test server up and running

## Install and build

```
npm i 
npm i -g pm2
npm run build
```

## Create a server configuration.

```
npm run env-gen
```

This creates testing keystores and an SQLite database for public versions of the client keystores, and some tokens which can be revoked.

## Start a server against that environment

```
pm2 ecosystem.config.js
```