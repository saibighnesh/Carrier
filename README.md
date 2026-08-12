# 📨 Carrier

> Send a picture through a text-only chat.

Carrier compresses an image, encodes it as plain text, and lets you paste it into any messenger — even one that blocks photos entirely (like in-flight Wi-Fi chat). The recipient pastes it back and the image reappears. Optionally encrypt it with a password.

**Everything runs in your browser. No servers. No uploads. No tracking.**  
Save the single `index.html` file and it works offline — on a plane, on a train, anywhere.

---

## Demo

| Step | What happens |
|------|-------------|
| Drop an image | Carrier compresses it to fit a chat message |
| Copy the text | Paste it into any messenger as plain text |
| Recipient pastes | Carrier reassembles and decodes it back into the image |

---

## Features

- **Single file** — one `index.html`, zero dependencies, no build step
- **Smart compression** — auto-resizes and re-encodes (WebP → JPEG fallback) to hit a target size
- **Auto-fit** — one click finds the best quality/dimension combo to land in a single message
- **Multi-part chunking** — if the image is still too big, splits into numbered parts (`PXT/id/1/3`, `2/3`, `3/3`) that reassemble in any order
- **Send-tracking** — a multi-part send marks off each part as it goes out (copied, or saved into a `.txt`). **Copy next message** hands you the one you haven't sent yet, **Copy remaining** dumps everything still outstanding in one paste, and progress shows in the tab title so you can check it from the chat app. If a setting changes mid-send, Carrier says so — the earlier parts belong to a different version and the recipient can't combine the two
- **AES-256-GCM encryption** — optional password lock using browser-native Web Crypto (PBKDF2, 250k iterations)
- **Damage detection** — unlocked messages carry a CRC-32, so a part mangled in transit is reported as damaged instead of showing up as a broken image (encrypted messages get this from GCM's authentication tag)
- **Fully offline** — no network calls at all; works without internet after first load
- **Reassembly progress** — the receive side counts parts as they land (`3/7 parts` in the tab title), names exactly what's missing, and **Copy what's missing** writes the sender a ready-to-send list
- **Accessible** — keyboard navigable throughout, controls named by their visible labels, atomic screen-reader announcements for both progress lines, and `Esc` to start over or clear from anywhere in the panel
- **Degrades honestly** — where the browser blocks a capability (clipboard, pop-ups, Web Crypto on a non-secure page) Carrier names it and points at the way through, instead of failing mutely or blaming the image

---

## How to Use

### Send
1. Open `index.html` in any modern browser
2. Drop or click to choose an image (JPG, PNG, WebP, GIF)
3. Adjust **Quality** and **Max size**, or click **⚡ Auto-fit to 1 message**
4. Optionally set a password under **Lock it**
5. Copy the text and paste into your chat — if it split into parts, **Copy next message** walks you through them one at a time and marks off what you've already sent (`Ctrl/Cmd+Enter` does the same from the keyboard)

### Receive
1. Switch to the **← Receive** tab
2. Paste the Carrier message(s) — any order, all parts in one box
3. Enter the password if it was locked — Carrier puts the caret there for you when a locked message completes
4. Click **Reveal image** → **Download received image**, or **Receive another** to go straight into the next one

---

## How It Works

The core challenge: most messaging apps cap a single message at ~60,000–65,000 characters, and raw image bytes converted to text are too large to fit. Carrier solves this with three stacked techniques:

```
Image file
    │
    ▼  1. COMPRESS
    │  Canvas resize + WebP/JPEG re-encode until it fits target bytes
    │
    ▼  2. ENCODE
    │  Binary → Base64 (safe to paste anywhere)
    │
    ▼  3. CHUNK  (if still > 1 message)
       Split into PXT/<id>/<n>/<total>/<data> parts
```

### Encryption (optional)
When a password is set:
- Salt (16 bytes) + IV (12 bytes) generated randomly per send
- Key derived via **PBKDF2** (SHA-256, 250,000 iterations)
- Payload encrypted with **AES-256-GCM** (authenticated — wrong password fails loudly)

### Payload format
```
Magic "PXT1" (4 bytes) | flags (1 byte) | body
```

| `flags` | Body |
|---|---|
| `0` | `mimeLen(1) │ mime │ imageBytes` — written by Carrier builds predating the checksum |
| `1` | `salt(16) │ iv(12) │ AES-256-GCM ciphertext` |
| `2` | `mimeLen(1) │ mime │ imageBytes │ CRC-32(4, big-endian)` |

The CRC-32 is **appended**, not prepended, so an older Carrier build reads `flags & 1 == 0`, parses the mime exactly as before, and hands the decoder four extra trailing bytes — which WebP (RIFF is length-delimited) and JPEG (data ends at the EOI marker) both ignore. Messages stay readable in both directions across versions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Encryption | [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) — AES-256-GCM, PBKDF2 |
| Compression | `<canvas>` — resize + WebP/JPEG encode |
| Language | Vanilla HTML / CSS / JS |
| Dependencies | None |
| Runtime | Any modern browser (Chrome, Firefox, Safari, Edge) |

---

## Security Notes

- **Password channel** — send the password through a *different* channel than the Carrier text, otherwise the lock adds nothing
- **Message limit** — pick your chat app from the **Chat app** dropdown (WhatsApp 60,000 · Telegram 4,096 · Slack 4,000 · Discord 2,000 · SMS 160); the choice is remembered and drives both the fit meter and the chunk size
- **Integrity, not authenticity** — the CRC-32 on unlocked messages detects accidental damage. It is not a signature: anyone who can rewrite the text can recompute it. Use a password if you need to know the bytes came from the sender
- **Passphrase length** — both password fields cap at 128 characters and Carrier tells you when you hit it. The cap is deliberately fixed: raising it would mean a newer sender and an older receiver deriving different keys from the same passphrase
- **Secure context** — password locking needs `crypto.subtle`, so open the file directly or serve it over `https://`. On a plain `http://` page the password fields are disabled and say why; unencrypted send and receive still work
- **Scope** — this is convenience privacy for everyday use, not a substitute for audited secure-messaging tools like Signal

---

## License

MIT — see [LICENSE](LICENSE).
