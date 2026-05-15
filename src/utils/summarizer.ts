import type { ChatMessage } from "../types";

const KEY_PHRASES = [
  "please",
  "can you",
  "could you",
  "i need",
  "help me",
  "how do",
  "what is",
  "explain",
  "create",
  "build",
  "write",
  "fix",
  "debug",
  "generate",
  "make",
  "show me",
  "implement",
];

/**
 * Extractive summary: first user message + key asks + last assistant response.
 * Zero API calls. Zero latency. Pure heuristic.
 */
export function extractiveSummary(messages: ChatMessage[]): string {
  if (messages.length === 0) return "Empty conversation.";

  const parts: string[] = [];

  // 1. First user message (always included — sets the topic)
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser) {
    parts.push(`Topic: ${truncate(firstUser.content, 200)}`);
  }

  // 2. Key asks from user messages (look for imperative/question sentences)
  const keyAsks = messages
    .filter((m) => m.role === "user")
    .slice(1) // skip first (already included)
    .filter((m) => isKeyAsk(m.content))
    .slice(0, 3) // max 3 additional asks
    .map((m) => truncate(m.content, 150));

  if (keyAsks.length > 0) {
    parts.push(`Key asks:\n${keyAsks.map((a) => `- ${a}`).join("\n")}`);
  }

  // 3. Last assistant response (conclusion / final state)
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  if (lastAssistant && messages.length > 2) {
    parts.push(`Last response: ${truncate(lastAssistant.content, 300)}`);
  }

  return parts.join("\n\n");
}

function isKeyAsk(content: string): boolean {
  const lower = content.toLowerCase();
  return KEY_PHRASES.some((phrase) => lower.includes(phrase));
}

function truncate(text: string, maxLen: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + "...";
}

/**
 * Generate a pill title from the first user message.
 */
export function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Untitled Chat";

  const cleaned = firstUser.content.replace(/\s+/g, " ").trim();
  // Take first sentence or first 60 chars
  const firstSentence = cleaned.split(/[.!?]/)[0].trim();
  return truncate(firstSentence || cleaned, 60);
}

/**
 * Build the [CONTEXTPILL] injection block from a pill.
 */
export function buildInjectionBlock(
  messages: ChatMessage[],
  mode: "summary" | "recent" | "full",
  meta: { title: string; platform: string; capturedAt: number }
): string {
  const date = new Date(meta.capturedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  let content: string;

  switch (mode) {
    case "summary":
      content = extractiveSummary(messages);
      break;

    case "recent": {
      const recent = messages.slice(-6);
      content = recent
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      break;
    }

    case "full":
      content = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      break;
  }

  return `[NUCLEUS CONTEXT]
Title: ${meta.title}
Platform: ${meta.platform}
Captured: ${date}
Mode: ${mode} (${messages.length} messages total)
---
${content}
[/NUCLEUS CONTEXT]

Please use the above context from a previous conversation to inform your response.`;
}
