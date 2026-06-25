# Carrier

**Send a picture through a text-only chat.**

Carrier turns an image into plain text you can paste into any messenger — even one that blocks photos, like in-flight messaging. The recipient pastes the text back into their copy of Carrier and the picture reappears. Optionally lock it with a password.

Everything runs in the browser on your device. No servers, no uploads, no tracking. Save the single HTML file and it works offline — on a plane, on a train, anywhere.

## Why

Many networks let text flow freely but block or throttle images — airline Wi-Fi messaging being the classic case. Carrier smuggles an image through the text channel by compressing it, encoding it as text, and (optionally) encrypting it.

## How it works

The size problem is the whole challenge: a messaging app caps a single message at roughly 65,000 characters, and turning bytes into text inflates them. Carrier solves this with three stacked techniques:

1. **Compression** — the image is downscaled and re-encoded (WebP, falling back to JPEG) until it fits a target byte budget. This is the heavy lifting: multi-megabyte photos routinely shrink to tens of kilobytes while staying recognizable.
2. **Encoding** — the compressed bytes are turned into Base64 text, which is safe to paste into any messaging app.
3. **Chunking** — if the result still exceeds one message, Carrier splits it into numbered parts (`PXT/<id>/1/3`, `2/3`, `3/3`) that reassemble in any order on the receiving side, with missing-part detection.

Privacy is optional and layered on top: when a password is set, the payload is encrypted with **AES-256-GCM**, using a key derived from the password via **PBKDF2** (SHA-256, 250k iterations). Authenticated encryption means a wrong password or any tampering fails loudly instead of producing garbage.

## Usage

1. Open `index.html` in any modern browser (or visit the GitHub Pages link if enabled).
2. **Send:** drop an image, adjust quality or hit *Auto-fit to 1 message*, optionally set a password, then copy the text into your chat.
3. **Receive:** paste the text, enter the password if it's locked, and reveal/download the image.

No build step, no dependencies. It's one self-contained file.

## Tech

- Browser-native [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) for encryption and key derivation
- `<canvas>` for resizing and re-encoding images
- Vanilla HTML/CSS/JS — zero external libraries, fully offline

## Security notes

- Send the password through a *different* channel than the text itself — otherwise the lock adds nothing.
- The character limit defaults to WhatsApp's ~65k; tune the `MSG_LIMIT` constant for other platforms.
- This is a personal project for everyday privacy and convenience, not a substitute for an audited secure-messaging tool.

## License

MIT — see [LICENSE](LICENSE).
# Carrier
