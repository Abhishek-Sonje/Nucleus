import type { Platform } from "../types";

export function detectPlatform(url: string): Platform {
  if (url.includes("claude.ai")) return "claude";
  if (url.includes("chatgpt.com") || url.includes("chat.openai.com"))
    return "chatgpt";
  if (url.includes("gemini.google.com")) return "gemini";
  return "unknown";
}

export function platformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    claude: "Claude.ai",
    chatgpt: "ChatGPT",
    gemini: "Gemini",
    unknown: "Unknown",
  };
  return names[platform];
}

export function platformColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    claude: "#d97706",
    chatgpt: "#10a37f",
    gemini: "#4285f4",
    unknown: "#6b7280",
  };
  return colors[platform];
}
