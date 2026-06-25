# Carrier — Project Reference

Single-file offline HTML app. Converts images to plain text for sending through text-only chats (e.g. in-flight Wi-Fi messaging that blocks photos). No build step, no dependencies, no server.

---

## Project Structure

```
carrier/
├── index.html      # Entire app — HTML + CSS + JS, self-contained
├── README.md       # Project documentation
├── LICENSE         # MIT
├── .gitignore      # Ignores .DS_Store, Thumbs.db, *.log
└── .claude/        # Local Claude config — NOT committed to git
```

**GitHub:** https://github.com/saibighnesh/Carrier  
**Branch:** `main`  
**License:** MIT

---

## How It Works — Full Flow

### Send Flow

```
User drops image
      │
      ▼
loadImage() — FileReader → Image element
      │
      ▼
drawScaled() — canvas resize to maxDim (default 768px)
      │
      ▼
encodeCanvas() — WebP (falls back to JPEG) at quality q
      │
      ▼
pack() — buildPlain(mime, imgBytes) → optional AES-256-GCM encrypt → prepend MAGIC + flags
      │
      ▼
bytesToB64() — binary → Base64 string
      │
      ▼
chunkify() — split into MSG_LIMIT chunks with PXT/<sid>/<n>/<total>/ prefix
      │
      ▼
Render chunks in UI → user copies and pastes into chat
```

### Receive Flow

```
User pastes text
      │
      ▼
reassemble() — regex extract PXT chunks, sort by index, join Base64
      │
      ▼
unpack() — b64ToBytes() → verify MAGIC → decrypt if flags=1 → parsePlain()
      │
      ▼
Blob → createObjectURL → display image → download button
```

---

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MSG_LIMIT` | `60000` | Max chars per message (safe for WhatsApp ~65k) |
| `TARGET_1MSG` | `44000` | Target bytes to fit in one message (pre-Base64 inflation) |
| `MAGIC` | `[0x50,0x58,0x54,0x31]` | "PXT1" header bytes — identifies Carrier payloads |
| PBKDF2 iterations | `250000` | SHA-256, 250k rounds for key derivation |
| AES key length | `256` | AES-256-GCM |
| IV size | `12 bytes` | GCM nonce |
| Salt size | `16 bytes` | PBKDF2 salt, random per pack |

---

## Encryption Details

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key derivation:** PBKDF2 (SHA-256, 250,000 iterations)
- **Payload layout when encrypted (flags=1):**
  ```
  MAGIC(4) | flags(1) | salt(16) | iv(12) | ciphertext(n)
  ```
- **Payload layout when plain (flags=0):**
  ```
  MAGIC(4) | flags(1) | mimeLen(1) | mime(n) | imageBytes(...)
  ```
- Wrong password or tampered data fails loudly (GCM authentication tag mismatch)

---

## Chunk Format

```
PXT/<4-char-hex-session-id>/<index>/<total>/<base64-data>
```

Example:
```
PXT/a3f2/1/3/iVBORw0KGgo...
PXT/a3f2/2/3/AAABBBCCC...
PXT/a3f2/3/3/xyz123==
```

- Chunks reassemble in any order (Map keyed by index)
- Missing parts detected and reported to user
- Session ID is `Math.random().toString(16).slice(2,6)` — 4 hex chars

---

## Compression Strategy

### Manual controls
- **Quality slider:** 20–92 (default 70)
- **Max dimension:** 1280 / 1024 / 768 (default) / 512 / 384 px

### Auto-fit algorithm
Binary search across dimension ladder `[1280, 1024, 768, 512, 384, 256]`:
- For each dimension, binary search quality between 0.25–0.92 (7 iterations)
- Target: `blob.size <= TARGET_1MSG` (44,000 bytes)
- Falls back to `{ q:25, d:256 }` if nothing fits

### Image encoding
1. Try WebP at given quality
2. If WebP not supported (rare), fall back to JPEG

---

## UI Architecture

### Mode toggle
Two tabs: **Send →** and **← Receive**  
- `aria-selected` on buttons
- Sections `#send` / `#recv` toggled with `.hidden` class
- `.recv` class on receive section scopes focus colors to teal

### Send panels (progressive reveal)
1. `#drop` — file picker / drag-drop (always visible)
2. `#tunePanel` — quality + size controls (shown after image loaded)
3. `#lockPanel` — password field (shown after image loaded)
4. `#outPanel` — chunk output + copy buttons (shown after image loaded)

### Receive panels
1. Paste textarea `#inbox` with live progress indicator `#prog`
2. Password field `#rpass` + Reveal button
3. `#result` — recovered image + download button (hidden until revealed)

---

## CSS Design Tokens

```css
--bg: #0d1420       /* page background, darkest */
--panel: #151f30    /* card background */
--panel2: #1b2740   /* unused / reserved */
--line: #26344c     /* borders */
--ink: #e7edf6      /* primary text */
--muted: #8b9bb4    /* secondary text */
--faint: #5d6e8a    /* labels, tertiary */
--send: #e6a92e     /* amber — send mode accent */
--send-dim: #3a3013 /* amber dim — send button bg */
--recv: #3fc0a0     /* teal — receive mode accent */
--recv-dim: #10342c /* teal dim — receive button bg */
--danger: #e5614c   /* red — errors */
--ok: #3fc0a0       /* same as recv — success */
--mono: ui-monospace, "SF Mono", Menlo, Consolas, ...
--sans: system-ui, -apple-system, "Segoe UI", ...
--r: 10px           /* border-radius base */
```

---

## Git History

| Commit | Message |
|--------|---------|
| `8f15657` | add copyright year to footer |
| `b66839c` | update page title to plural 'images' for clarity |
| `2bde064` | extend copy-all feedback display from 1.4s to 2s |
| `286c536` | add GIF to accepted formats hint in drop zone |
| `4004c1f` | add existing project files |
| `be1f779` | first commit |

---

## Key Functions Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `bytesToB64(bytes)` | JS | Uint8Array → Base64 string (chunked to avoid stack overflow) |
| `b64ToBytes(b64)` | JS | Base64 string → Uint8Array |
| `buildPlain(mime, img)` | JS | Pack mime type + image bytes into single buffer |
| `parsePlain(bytes)` | JS | Unpack mime + image from buffer |
| `deriveKey(password, salt)` | JS | PBKDF2 → AES-GCM CryptoKey |
| `pack(img, mime, password)` | JS | Full encode: build → optional encrypt → Base64 |
| `unpack(b64, password)` | JS | Full decode: Base64 → verify MAGIC → optional decrypt → parse |
| `chunkify(b64)` | JS | Split Base64 into PXT-prefixed message chunks |
| `reassemble(text)` | JS | Parse pasted text, extract + sort PXT chunks |
| `loadImage(file)` | JS | FileReader → HTMLImageElement promise |
| `drawScaled(img, maxDim)` | JS | Canvas resize with aspect ratio preserved |
| `encodeCanvas(cv, q)` | JS | Canvas → WebP/JPEG Blob at quality q |
| `compressOnce(maxDim, quality)` | JS | drawScaled + encodeCanvas → Uint8Array |
| `autoFit()` | JS | Binary search quality/dimension to hit TARGET_1MSG |
| `refresh()` | JS | Recompress + repack + update UI stats + re-render chunks |
| `renderChunks()` | JS | Build chunk card UI with individual copy buttons |
| `queueRefresh()` | JS | Debounced refresh (180ms) on control changes |
| `handleFile(file)` | JS | Validate + load image file, trigger UI reveal |
| `updateProgress()` | JS | Live parse inbox textarea, show missing chunks |

---

## Behavior Notes

- Debounce on quality/dimension/password changes: **180ms**
- Copy-one button feedback revert: **1200ms**
- Copy-all button feedback revert: **2000ms**
- Auto-fit button shows "Fitting…" during async search
- `@media (prefers-reduced-motion: reduce)` disables all CSS transitions
- Drop zone accepts `image/*` (browser handles GIF, JPG, PNG, WebP, etc.)
- File input hidden, triggered by drop zone click/keyboard (Enter/Space)

---

## Security Notes

- Send password through a **different channel** than the Carrier text
- `MSG_LIMIT = 60000` safe for WhatsApp; tune for other platforms (Telegram ~4096, SMS ~160)
- PBKDF2 at 250k iterations is intentionally slow — resistance to brute-force
- This is convenience privacy, not a substitute for audited secure-messaging tools
- No data leaves the device — Web Crypto + Canvas only, zero network calls
