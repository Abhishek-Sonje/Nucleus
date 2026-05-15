# Nucleus

> Capture full AI chat context locally. Inject it into any AI platform. Zero servers. Zero data leaving your browser.

**v0.1.0** — Claude.ai, ChatGPT, Gemini support.

---

## What it does

Nucleus is a Chrome extension that solves the "re-explain yourself" problem. Every time you start a new AI chat, you lose the context from your previous one. Nucleus captures it losslessly, stores it locally, and lets you inject it back into any AI platform with one click.

**No summaries-only. No servers. No trust required.**

---

## Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Extension type | Chrome MV3 | Standard, required |
| Popup UI | Vanilla JS + CSS | No framework overhead — popup opens instantly |
| Content scripts | Vanilla TypeScript | Minimal bundle, per-platform scrapers |
| Background | Service Worker | MV3 required |
| Build tool | Vite + CRXJS | Fast HMR, clean MV3 bundling |
| Language | TypeScript | Type-safe message passing and storage schema |
| Storage | `chrome.storage.local` | Private, offline, persistent |
| Remote config | CDN JSON (GitHub Pages) | Fix broken scrapers without Chrome Store review lag |
| Summarization | Extractive only | Zero latency, zero API calls |
| Backend | None | Intentional. Zero infrastructure, zero attack surface |

---

## Project structure

```
nucleus/
├── src/
│   ├── types/           # Shared TypeScript types
│   │   └── index.ts
│   ├── utils/
│   │   ├── storage.ts       # chrome.storage.local operations
│   │   ├── summarizer.ts    # Extractive summary + injection block builder
│   │   ├── platform.ts      # Platform detection + display helpers
│   │   └── selectorConfig.ts # Remote CDN selector config with local fallback
│   ├── background/
│   │   └── index.ts         # Service worker — orchestrates capture + keyboard shortcut
│   ├── content/
│   │   └── index.ts         # DOM scraper + text injector (per-platform)
│   └── popup/
│       ├── index.html       # Popup shell
│       ├── popup.css        # Dark industrial UI
│       └── popup.ts         # Popup logic — pill list, capture, inject modal
├── public/
│   └── icons/               # Extension icons (16, 48, 128px)
├── manifest.json            # MV3 manifest
├── vite.config.ts
└── tsconfig.json
```

---

## Development

```bash
# Install dependencies
npm install

# Build in watch mode (for development)
npm run dev

# Production build
npm run build

# Type check only
npm run type-check
```

Then load `dist/` as an unpacked extension in Chrome:
1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the `dist/` folder

---

## How to use

1. Open Claude.ai, ChatGPT, or Gemini with an existing chat
2. Click the Nucleus icon (or press `Alt+Shift+C`)
3. Click **Capture Chat** — pill appears in the list
4. Open a new chat on any supported platform
5. Click **Inject** on any pill → choose mode:
   - **Summary** — compressed key points (default)
   - **Recent** — last 6 messages
   - **Full** — complete transcript
6. The AI receives full context. No re-explaining.

---

## Injection modes

| Mode | When to use |
|---|---|
| Summary | Quick context refresh — saves tokens |
| Recent | Continue a conversation mid-thread |
| Full | Complex technical work, long context needed |

---

## Non-negotiables (from the product doc)

- ✅ No data leaves the browser
- ✅ Capture completes under 1 second (no network round trips in the path)
- ✅ Full raw transcript always stored — summary is additive, never instead
- ✅ Broken scraper detection — explicit error, not silent empty state
- ✅ Injection triggers React state update so send button activates

---

## Known limitations (v0.1)

- **DOM scrapers will break** — platforms update their HTML. When they do, the scraper shows an explicit error with the last-known-working date. Fix selectors in `selectorConfig.ts` or push a CDN update.
- **`execCommand` is deprecated** — still works in all current browsers. Monitor for removal; the `InputEvent` fallback is already in place.
- **10MB storage quota** — storage usage shown in popup footer. ~50–200 pills before hitting the limit. Apply for `unlimitedStorage` in v1.0.
- **Service worker sleeps** — MV3 service workers terminate after ~30s of inactivity. Capture path is kept synchronous and fast to avoid this.

---

## Versioning

| Version | Status | Scope |
|---|---|---|
| v0.1 | ✅ Built | Claude.ai only, proof of life |
| v0.5 | Next | ChatGPT + Gemini scrapers, all 3 injection modes, remote config |
| v1.0 | Planned | Public Chrome Store release, inline title editing, keyboard shortcut, export, color tagging |
| v2.0 | Future | Partial capture, full-text search, pill versioning, browser-native AI summaries |

---

Built with zero dependencies at runtime. Every external asset (fonts) is display-only in the popup.
