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

## Privacy and Data Isolation

Carrier operates entirely client-side within the local browser sandbox. No image data, passwords, or encoded chunks are ever transmitted across the network (`connect-src 'none'` CSP directive enforced). All file handling and blob URLs are strictly isolated to browser memory and destroyed upon session reset or teardown.

## Input Validation and Bounding

All inputs — including drag-and-drop files, clipboard pastes, and custom character limits — undergo strict client-side validation and numeric bounding before processing. Custom message limits are strictly bounded between 20 and 200,000 characters, passphrases cap at 128 characters, and incoming chunk payloads are defensively parsed against corrupt or malformed headers.

## Client-Side Password Security & Memory Hygiene

Passphrases entered into Carrier are processed exclusively in-memory via the Web Crypto API (`deriveKey` / PBKDF2). Passwords are never persisted to `localStorage`, `sessionStorage`, or IndexedDB. When a user clicks **Start over** or **Clear**, password input fields are explicitly overwritten, masked states are reset, and associated key buffers are discarded from active browser memory.

## Air-Gap Integrity and Offline Verification

Carrier contains zero external dependencies, zero CDN scripts, zero third-party font imports, and zero remote analytics or tracking beacons. It can be verified completely offline:
- Saving `index.html` locally and opening it via `file://` or in an air-gapped network environment functions identically with zero network requests.
- All Web Crypto operations (`PBKDF2`, `AES-GCM-256`) and Reed-Solomon codec computations run strictly on local CPU within the browser sandbox thread.

## Content Security Policy and Sandboxing

Carrier enforces a restrictive Content-Security-Policy (CSP) via `<meta http-equiv="Content-Security-Policy">`:
- `default-src 'none'`: Blocks all resource loading by default.
- `connect-src 'none'`: Prohibits all `fetch()`, `XMLHttpRequest`, `WebSocket`, and EventSource network traffic.
- `form-action 'none'` & `base-uri 'none'`: Prevents form submission and base URL hijacking.
- `img-src data: blob:`: Restricts image sources solely to inline SVG and local in-memory object URLs.

## Acknowledgements

Security researchers who report valid vulnerabilities will be credited in the commit message and release notes, unless they prefer to remain anonymous.

## Related Documents

- [README.md](README.md) — Project documentation and architecture details
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contributing guidelines and development workflow
