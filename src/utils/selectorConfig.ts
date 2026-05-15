import type { PlatformSelectorConfig } from "../types";

// Default selectors hardcoded as fallback (updated as of May 2026)
export const DEFAULT_CONFIG: PlatformSelectorConfig = {
  version: 1,
  platforms: {
    claude: {
      messageContainer: '[data-testid="conversation-turn"]',
      userMessage:
        '[data-testid="conversation-turn"][data-is-human="true"] .whitespace-pre-wrap, [data-testid="conversation-turn"] .font-user-message',
      assistantMessage:
        '[data-testid="conversation-turn"][data-is-human="false"] .whitespace-pre-wrap, [data-testid="conversation-turn"] .font-claude-message',
      inputField: '[contenteditable="true"][data-testid="chat-input"], div[contenteditable="true"].ProseMirror',
      lastWorkingDate: "2026-05-13",
    },
    chatgpt: {
      messageContainer: '[data-message-author-role]',
      userMessage: '[data-message-author-role="user"] .whitespace-pre-wrap',
      assistantMessage:
        '[data-message-author-role="assistant"] .markdown',
      inputField: '#prompt-textarea',
      lastWorkingDate: "2026-05-13",
    },
    gemini: {
      messageContainer: ".conversation-container .query-content, .model-response-text",
      userMessage: ".query-content .query-text",
      assistantMessage: ".model-response-text p",
      inputField: '.ql-editor[contenteditable="true"]',
      lastWorkingDate: "2026-05-13",
    },
  },
};

const CDN_URL =
  "https://raw.githubusercontent.com/nucleus-ext/config/main/selectors.json";

let cachedConfig: PlatformSelectorConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getSelectorConfig(): Promise<PlatformSelectorConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const resp = await fetch(CDN_URL, { cache: "default" });
    if (resp.ok) {
      const remote = (await resp.json()) as PlatformSelectorConfig;
      cachedConfig = remote;
      cacheTimestamp = now;
      return remote;
    }
  } catch {
    // Network unavailable — fall through to default
  }

  return DEFAULT_CONFIG;
}
