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
- **AES-256-GCM encryption** — optional password lock using browser-native Web Crypto (PBKDF2, 250k iterations)
- **Fully offline** — no network calls at all; works without internet after first load
- **Accessible** — keyboard navigable, screen reader announcements for chunk progress

---

## How to Use

### Send
1. Open `index.html` in any modern browser
2. Drop or click to choose an image (JPG, PNG, WebP, GIF)
3. Adjust **Quality** and **Max size**, or click **⚡ Auto-fit to 1 message**
4. Optionally set a password under **Lock it**
5. Copy the text and paste into your chat

### Receive
1. Switch to the **← Receive** tab
2. Paste the Carrier message(s) — any order, all parts in one box
3. Enter the password if it was locked
4. Click **Reveal image** → download

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
- `flags = 0` → plain: `mimeLen(1) | mime | imageBytes`
- `flags = 1` → encrypted: `salt(16) | iv(12) | ciphertext`

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
- **Message limit** — default is 60,000 chars (safe for WhatsApp); tune `MSG_LIMIT` in the source for other platforms (Telegram: ~4,096, SMS: ~160)
- **Scope** — this is convenience privacy for everyday use, not a substitute for audited secure-messaging tools like Signal

---

## License

MIT — see [LICENSE](LICENSE).
