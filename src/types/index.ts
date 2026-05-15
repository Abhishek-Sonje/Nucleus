export type Platform = "claude" | "chatgpt" | "gemini" | "unknown";

export type InjectionMode = "summary" | "recent" | "full";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Pill {
  id: string;
  title: string;
  platform: Platform;
  capturedAt: number; // unix ms
  messages: ChatMessage[];
  summary: string;
  messageCount: number;
  color?: PillColor;
  version: number;
}

export type PillColor =
  | "default"
  | "red"
  | "amber"
  | "emerald"
  | "sky"
  | "violet";

export interface PillIndex {
  ids: string[];
  lastUpdated: number;
}

export interface StorageData {
  pill_index: PillIndex;
  [key: `pill:${string}`]: Pill;
}

// Remote selector config (CDN JSON)
export interface PlatformSelectorConfig {
  version: number;
  platforms: {
    claude: SelectorConfig;
    chatgpt: SelectorConfig;
    gemini: SelectorConfig;
  };
}

export interface SelectorConfig {
  messageContainer: string;
  userMessage: string;
  assistantMessage: string;
  inputField: string;
  lastWorkingDate?: string;
}

// Message passing between extension parts
export type ExtensionMessage =
  | { type: "CAPTURE_CHAT"; platform: Platform }
  | { type: "INJECT_PILL"; pill: Pill; mode: InjectionMode }
  | { type: "GET_PLATFORM" }
  | { type: "SCRAPE_RESULT"; messages: ChatMessage[]; error?: string }
  | { type: "INJECT_RESULT"; success: boolean; error?: string }
  | { type: "PLATFORM_RESULT"; platform: Platform };

export interface CaptureResult {
  success: boolean;
  pill?: Pill;
  error?: string;
}

export interface StorageQuota {
  used: number;
  total: number;
  percentUsed: number;
}
