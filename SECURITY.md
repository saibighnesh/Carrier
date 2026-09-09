# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` | ✅ |
| Older saved copies | ⚠️ Best-effort |

Carrier is a single-file web app. There are no versioned releases — the latest `main` branch is always the current version. If you're using a saved copy of `index.html`, check the version shown in the footer against the one on GitHub to see if you're behind.

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, email **saibighneshprusty@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce it
- The impact (what an attacker could achieve)
- Any suggested fix, if you have one

You can expect an initial response within **72 hours**. If the issue is confirmed, a fix will be committed to `main` as soon as possible, typically within a week.

## Scope

The following are considered security issues for Carrier:

- **Encryption bypass** — recovering the image without the password
- **Key derivation weakness** — PBKDF2 misconfiguration, weak salt, IV reuse
- **XSS or code injection** — through crafted chunk data, filenames, or clipboard content
- **Blob URL misuse** — leaking image data outside the page's origin
- **CSP bypass** — circumventing the Content-Security-Policy header

The following are **not** in scope:

- Social engineering (e.g., tricking someone into sharing their password)
- Denial of service against the user's own browser tab
- Issues that require physical access to the user's device
- The CRC-32 on unlocked messages — this is integrity detection, not authentication (documented in README)

## Acknowledgements

Security researchers who report valid vulnerabilities will be credited in the commit message and release notes, unless they prefer to remain anonymous.
