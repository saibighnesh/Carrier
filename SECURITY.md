# Security Policy

Carrier is a single-file, offline-first app: no servers, no uploads, no network calls. Its security model rests on the browser's own Web Crypto (AES-256-GCM, PBKDF2) and Canvas APIs — see the [Security Notes](README.md#security-notes) section of the README for what it does and does not protect against.

## Reporting a Vulnerability

If you find a security issue — anything from a cryptographic weakness in the wire format to an XSS vector in how a revealed image is rendered — please report it privately rather than opening a public issue:

1. Go to the [Security tab](https://github.com/saibighnesh/Carrier/security) of this repository.
2. Click **Report a vulnerability** to open a private advisory.

Please include:
- A description of the issue and its impact
- Steps to reproduce (a crafted Carrier message, if relevant)
- The browser/version you tested against

You'll get an acknowledgment as soon as possible, and credit in the advisory once a fix ships, unless you'd prefer to stay anonymous.

## Scope

In scope: `index.html` and the wire format it implements (chunking, encryption, CRC-32, Reed-Solomon recovery, Compact encoding).

Out of scope: the security of the chat app or transport Carrier's output is pasted into — Carrier only controls what happens on-device before and after that step.
