# Contributing to Carrier

Carrier is a single-file app on purpose: `index.html` is the entire project — HTML, CSS, and JS in one file, no build step, no dependencies. Keep changes to the app itself inside that file.

## Running the tests

The wire format (chunking, AES-256-GCM, CRC-32, Reed-Solomon recovery, Compact encoding) is covered by a plain-Node test suite:

```
node test/run.mjs
```

This runs every suite in `test/*.mjs` and exits non-zero on failure. CI runs the same command automatically, but only on pushes/PRs that touch `index.html` or `test/**` (see [`.github/workflows/test.yml`](.github/workflows/test.yml)) — a docs-only PR like this one won't trigger a run, so run it locally before opening one regardless.

Add a new `test/<name>.mjs` file for new logic — `run.mjs` picks up any `.mjs` file in the directory automatically, so there's nothing else to wire up.

## Before opening a PR

- Run `node test/run.mjs` and make sure all suites pass.
- If you touch the wire format (chunk header, container layout, dense/Compact encoding, Reed-Solomon), bump `APP_VERSION` in `index.html` — it's the one thing that lets two people on different builds tell them apart.
- Keep the "no dependencies, no build step, no network calls" constraints intact. A PR that adds a package.json, a bundler, or an external request changes what Carrier fundamentally is.

## Reporting bugs vs. security issues

Open a regular issue for a bug. For anything security-sensitive (crypto weaknesses, XSS vectors), see [SECURITY.md](SECURITY.md) instead — report it privately.
