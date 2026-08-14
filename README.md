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
- **Compact encoding** — optionally packs 12 bits into each character instead of Base64's 6, roughly halving the message count on apps that count characters. Off by default; both sides need a Carrier that understands it
- **Smart compression** — auto-resizes and re-encodes (WebP → JPEG fallback) to hit a target size
- **Auto-fit** — one click finds the best quality/dimension combo to land in a single message
- **Multi-part chunking** — if the image is still too big, splits into numbered parts (`PXT/id/1/3`, `2/3`, `3/3`) that reassemble in any order
- **Send-tracking** — a multi-part send marks off each part as it goes out (copied, or saved into a `.txt`). **Copy next message** hands you the one you haven't sent yet, **Copy remaining** dumps everything still outstanding in one paste, and progress shows in the tab title so you can check it from the chat app. If a setting changes mid-send, Carrier says so — the earlier parts belong to a different version and the recipient can't combine the two
- **AES-256-GCM encryption** — optional password lock using browser-native Web Crypto (PBKDF2, 250k iterations)
- **Damage detection** — unlocked messages carry a CRC-32, so a part mangled in transit is reported as damaged instead of showing up as a broken image (encrypted messages get this from GCM's authentication tag)
- **Loss recovery (Reed-Solomon)** — optionally add parity parts so the recipient can *rebuild* parts that never arrived, instead of asking you to resend them. Off by default. **Auto** computes how much redundancy you actually need from the loss rate this device has measured; Light and Strong are fixed ~10% / ~25%
- **Fully offline** — no network calls at all; works without internet after first load
- **Reassembly progress** — the receive side counts parts as they land (`3/7 parts` in the tab title), names exactly what's missing, and **Copy what's missing** writes the sender a ready-to-send list
- **Accessible** — keyboard navigable throughout, controls named by their visible labels, atomic screen-reader announcements for both progress lines, and `Esc` to start over or clear from anywhere in the panel
- **Degrades honestly** — where the browser blocks a capability (clipboard, pop-ups, Web Crypto on a non-secure page) Carrier names it and points at the way through, instead of failing mutely or blaming the image

---

## How to Use

### Send
1. Open `index.html` in any modern browser
2. Drop or click to choose an image (JPG, PNG, WebP, GIF)
3. Adjust **Quality** and **Max size**, or click **⚡ Auto-fit to 1 message**. If the pipe is unreliable, set **Recovery** so the recipient can rebuild lost parts
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

### Compact encoding — the character problem

Every chat limit is counted in **characters**, and Base64 spends a character on 6 bits. That's a 33% tax on every image, paid in the one currency Carrier is short of.

Density is `log₂(N)` bits per character, so the only lever is the alphabet size *N*. Every ASCII scheme is stuck near the bottom:

| scheme | symbols | bits/char | vs Base64 |
|---|---|---|---|
| Base64 | 64 | 6.000 | — |
| Ascii85 | 85 | 6.409 | +6.8% |
| basE91 | 91 | 6.508 | +8.5% |
| all printable ASCII | 95 | 6.570 | +9.5% |
| **Compact (2¹² CJK)** | **4096** | **12.000** | **+100%** |

None of the ASCII options change a message count. 4096 symbols gives exactly 12 bits each, and being a power of two makes it pure bit-packing rather than big-integer base conversion across the payload. The arithmetic lands evenly:

```
Base64 :  3 bytes → 4 characters
Compact:  3 bytes → 2 characters      (exactly half)
```

The symbols are CJK Unified Ideographs `U+4E00..U+5DFF`, chosen for what that block **cannot** do: no case, no combining marks, no canonical or compatibility decomposition (so normalisation can neither rewrite a symbol nor merge two), no whitespace, no markdown-active punctuation, one UTF-16 code unit each, and disjoint from Base64 so the two encodings can never be confused. All of those are asserted in the test suite, not assumed.

A leading symbol carries `byteLength mod 3` — the one fact the character count can't supply, since a 2-byte and a 3-byte tail occupy the same number of characters.

**The cost, plainly.** A CJK character is 3 UTF-8 bytes against Base64's 1. Where a limit is counted in characters this halves the message count; where it's counted in **bytes** it is 1.5× *worse*. And any non-Latin character drops SMS from GSM-7 (160 per segment) to UCS-2 (70) — so Compact makes SMS worse, and Carrier says so when you pick that combination.

**Compatibility.** Compact sends use a `PXC/` prefix. A Carrier that predates this matches only `[A-Za-z0-9+/=]` and so finds *no* chunks at all — a clean "no Carrier message found" rather than a corrupt image. Both sides need a build that understands it.

**Recovery is unavailable while Compact is on.** The erasure code works over GF(2⁶), a field sized so parity symbols *are* Base64 characters; 12-bit symbols need GF(2¹²), which is a real change rather than a tweak. Shipping a half-working interaction would be worse than the limitation.

### Loss recovery

A lost part normally costs a round trip: the recipient works out what's missing, tells you, and you resend. Over a lossy pipe that round trip is the slowest part of the job.

Turning **Recovery** on adds parity parts computed with a Reed–Solomon erasure code. If some parts go missing, the recipient rebuilds them locally — no reply needed.

```
Recovery: Strong          24 data parts + 6 parity parts
Parts 2, 6, 13, 21 lost in transit
      │
      ▼
Receiver has 20 of 24 data parts + 6 parity
      │
      ▼  solve the erasure code
"Rebuilt 4 missing parts from the recovery data"  →  image, byte-for-byte
```

The code works over **GF(2⁶)** rather than the usual GF(2⁸), and that choice is the whole trick: 64 field elements map exactly onto the 64 Base64 characters, so a parity symbol *is* a Base64 character. Parity parts ride in the ordinary chunk format at ordinary chunk size. GF(2⁸) would have forced parity back through Base64 at +33%.

Coding uses a Cauchy matrix, every square submatrix of which is invertible — so **any** k surviving parts decode, not some privileged subset. It runs per block of 32 parts, because loss is bursty and a local code keeps recovery bounded.

### How much redundancy? (Auto)

"Light or Strong?" has a real answer, so **Auto** computes it instead of asking you to guess.

A send of *n* data parts plus *k* parity survives when at most *k* of the *n+k* parts are lost. If the loss rate *p* were known, that's a binomial tail. It isn't known — it's estimated from a handful of past sends — and treating a noisy estimate as exact systematically under-provisions. So *p* carries a **Beta posterior**, and reliability is the **posterior predictive**, integrating over everything *p* might be. That has a closed form:

```
P(lose i of m parts)  =  C(m,i) · B(a+i, b+m−i) / B(a,b)         (Beta-Binomial)

P(survive)            =  Σ P(lose i)  for i = 0..k
```

With little evidence the posterior is wide, the predictive has fatter tails, and Auto asks for more parity on its own — the correct response to uncertainty rather than a safety factor bolted on afterwards. Everything runs in log space through a Lanczos log-gamma, so binomial coefficients that would overflow a double are routine.

Coding is per block and **every** block must survive, so a *B*-block send requires each block at `target^(1/B)`. Asking each block for the whole-image target would silently under-provision long sends — exactly where loss hurts most.

Carrier learns the rate from what actually arrives: each successful reveal records how many parts had to be rebuilt out of how many were sent, updating the posterior conjugately. Only sends that carried recovery count — without parity you'd chase missing parts by hand and reveal at zero, teaching the model that the pipe never loses anything.

The panel shows its reasoning, and the numbers reconcile:

> Auto chose 5 recovery parts per block (+5 messages): about 99.6% chance this arrives complete, at an estimated 6.6% loss rate (4 of 26 parts lost so far).

Fixed levels get the same honest figure, and are told when Auto would do better.

**Cost.** Each parity part is one more message, and every part gets 6 characters shorter to carry the parity header — so Strong on a 24-part send is 30 messages instead of 23. That's why it's off by default: turn it on when the pipe is unreliable, leave it off when it isn't.

**Compatibility.** Parity parts are ordinary chunks whose index runs past `<total>`, and Carrier has always discarded indices outside `[1, total]`. A build that predates this ignores them completely and sees exactly the send it understands.

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
