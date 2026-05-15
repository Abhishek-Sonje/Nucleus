import type { Platform } from "../types";

// Remote selector config — hosted on GitHub Pages
// Lets us fix broken scrapers same-day without a Chrome Web Store review cycle
const CDN_URL = "https://nucleus-ext.github.io/config/selectors.json";

export interface SelectorConfig {
  version: number;
  lastUpdated: string;
  platforms: Record<string, PlatformMeta>;
}

export interface PlatformMeta {
  lastWorkingDate: string;
  broken?: boolean;
  brokenSince?: string;
}

const DEFAULT_CONFIG: SelectorConfig = {
  version: 1,
  lastUpdated: "2026-05-15",
  platforms: {
    claude:  { lastWorkingDate: "2026-05-15" },
    chatgpt: { lastWorkingDate: "2026-05-15" },
    gemini:  { lastWorkingDate: "2026-05-15" },
  },
};

let cached: SelectorConfig | null = null;
let cacheTime = 0;
const TTL = 60 * 60 * 1000; // 1 hour

export async function getSelectorConfig(): Promise<SelectorConfig> {
  if (cached && Date.now() - cacheTime < TTL) return cached;
  try {
    const res = await fetch(CDN_URL, { cache: "default" });
    if (res.ok) {
      cached = await res.json() as SelectorConfig;
      cacheTime = Date.now();
      return cached;
    }
  } catch { /* offline — use defaults */ }
  return DEFAULT_CONFIG;
}

export function getLastWorkingDate(platform: Platform): string {
  return cached?.platforms[platform]?.lastWorkingDate
    ?? DEFAULT_CONFIG.platforms[platform]?.lastWorkingDate
    ?? "unknown";
}

export function isPlatformBroken(platform: Platform): boolean {
  return cached?.platforms[platform]?.broken ?? false;
}
