# Conformance Test Suite

This package can be used to test conformance of a Data Holder against the standards.

_Note_: this feature is likely to be moved to another package or removed in the future to keep this package lean.

## Configuration

The system under test needs to be configured. This includes:
- Your live DR JWKS URLs available to the ecosystem
- DR identifiers at the register
- MTLS key, cert, and CA
- Register endpoints
- Identifier for the data holder under test
- Database for storing consents
- Optionally you can adjust the test boundaries for transaction tests

The test suite looks for live environment configurations in `e2e.test.environments.json` under `TEST_CONFIG_BASE` (a directory defined in the environment variable), or `<HOME_DIR>/cdr-testing/`.

See [example.test.environments.json](./example.test.environments.json) for an example.

Note that with the bundled Puppetter based OAuth flow automation, there is known issue causing strange errors on linux. It is also limited to OTP identification only. Therefore, the recommended approach is to point `Automation.OAuthModule` to a module of your own construction for completing the OAuth Flows.

## Execution

The easiest mode is to use the Mocha Test Explorer in VS Code. When you have completed the configuration file, you will need to add the `TEST_CONFIG_BASE` environment variable (if used) to the VS Code launch task. Refreshing the test case list will bring the new system under test into the "E2E Scenarios" test group.

If you are using the inbuilt Puppeteer adapter (not recommended), you will need to install the following, since they are no longer dependencies of this project.

```
"puppeteer": "^>=2.1 <3",
"puppeteer-har": "^1.1.2",
```

## Evidence capture

Verbose HTTP traffic and test result summaries are captured and reported in `EvidenceDir`.