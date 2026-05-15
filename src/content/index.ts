import type { ChatMessage, ExtensionMessage, Platform } from "../types";
import { detectPlatform } from "../utils/platform";
import { buildInjectionBlock } from "../utils/summarizer";

const platform: Platform = detectPlatform(window.location.href);

// ─── Scraping ─────────────────────────────────────────────────────────────────

function scrapeMessages(): { messages: ChatMessage[]; error?: string } {
  switch (platform) {
    case "claude":  return scrapeClaude();
    case "chatgpt": return scrapeChatGPT();
    case "gemini":  return scrapeGemini();
    default:
      return { messages: [], error: "Not on a supported AI platform." };
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────
// Confirmed DOM structure (May 2026):
//
// div.flex-1.flex.flex-col.px-4.max-w-3xl  ← conversation container (24 children)
//   └─ div[class*="content-visibility:auto"]  ← one per turn (user + assistant alternate)
//        ├─ [data-testid="user-message"]       ← present on user turns only
//        └─ (no testid on assistant turns)
//
// Text content is prefixed with "You said: " / "Claude responded: " — strip them.
// Input: [data-testid="chat-input"]  (contenteditable ProseMirror div)

function scrapeClaude(): { messages: ChatMessage[]; error?: string } {
  const messages: ChatMessage[] = [];

  // Find the conversation container — the flex-col div with many children
  const container = findConversationContainer();
  if (!container) {
    return {
      messages: [],
      error: `Could not find conversation container. data-testid hits: ${document.querySelectorAll('[data-testid]').length}`,
    };
  }

  const turns = Array.from(container.children);
  // Last few children are spacers/footer — filter to only content turns
  const contentTurns = turns.filter(el => {
    const text = el.textContent?.trim() ?? "";
    return text.length > 0 &&
      !el.classList.contains("h-px") &&
      !el.classList.contains("h-12") &&
      !el.classList.contains("print:hidden");
  });

  for (const turn of contentTurns) {
    const isUser = !!turn.querySelector('[data-testid="user-message"]');

    // Get text content and strip the "You said: " / "Claude responded: " prefix
    // that Claude adds as accessibility text
    const rawText = turn.textContent?.trim() ?? "";
    const content = stripPrefix(rawText, isUser);

    if (content.length > 0) {
      messages.push({ role: isUser ? "user" : "assistant", content });
    }
  }

  if (messages.length === 0) {
    return {
      messages: [],
      error: `Container found (${contentTurns.length} turns) but extracted 0 messages. Text may be structured differently.`,
    };
  }

  return { messages };
}

function findConversationContainer(): Element | null {
  // Primary: the confirmed selector from DOM analysis
  const primary = document.querySelector(
    "div.flex-1.flex.flex-col.px-4"
  );
  if (primary && primary.children.length > 2) return primary;

  // Fallback: find a div with many alternating user/non-user children
  const candidates = document.querySelectorAll("div.flex-1.flex.flex-col");
  for (const el of candidates) {
    if (el.children.length >= 4) return el;
  }

  // Last resort: find via user message and walk up
  const userMsg = document.querySelector('[data-testid="user-message"]');
  if (!userMsg) return null;

  let node: Element | null = userMsg;
  for (let i = 0; i < 10; i++) {
    node = node?.parentElement ?? null;
    if (!node) break;
    if (node.children.length >= 4) return node;
  }

  return null;
}

function stripPrefix(text: string, isUser: boolean): string {
  // Claude injects "You said: " and "Claude responded: " as screen-reader prefixes
  const prefixes = isUser
    ? ["You said: ", "You said:", "User: "]
    : ["Claude responded: ", "Claude responded:", "Assistant: ", "Claude: "];

  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }
  return text.trim();
}

// ── ChatGPT ───────────────────────────────────────────────────────────────────

function scrapeChatGPT(): { messages: ChatMessage[]; error?: string } {
  const messages: ChatMessage[] = [];
  const turns = document.querySelectorAll("[data-message-author-role]");

  turns.forEach((turn) => {
    const role = turn.getAttribute("data-message-author-role");
    if (role !== "user" && role !== "assistant") return;
    const textEl =
      turn.querySelector(".whitespace-pre-wrap") ??
      turn.querySelector(".markdown") ??
      turn.querySelector("p") ??
      turn;
    const content = textEl.textContent?.trim() ?? "";
    if (content.length > 0) messages.push({ role: role as "user" | "assistant", content });
  });

  if (messages.length === 0) {
    return { messages: [], error: "Scraper found 0 messages on ChatGPT. DOM may have changed." };
  }
  return { messages };
}

// ── Gemini ────────────────────────────────────────────────────────────────────

function scrapeGemini(): { messages: ChatMessage[]; error?: string } {
  const messages: ChatMessage[] = [];
  const allMsgs = document.querySelectorAll(
    "user-query, model-response, .user-turn, .model-turn, [class*='user-query'], [class*='model-response']"
  );
  allMsgs.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.className?.toString() ?? "").toLowerCase();
    const isUser = tag === "user-query" || cls.includes("user");
    const content = el.textContent?.trim() ?? "";
    if (content.length > 0) messages.push({ role: isUser ? "user" : "assistant", content });
  });

  if (messages.length === 0) {
    return { messages: [], error: "Scraper found 0 messages on Gemini. DOM may have changed." };
  }
  return { messages };
}

// ─── Quill-specific injection (Gemini) ───────────────────────────────────────
// Quill manages its own internal Delta model. Setting innerHTML or using
// execCommand("insertText") with newlines only inserts the first line.
// The correct approach: build <p> tags for each line, set innerHTML,
// then fire Quill's own 'text-change' event so it syncs its Delta model.

function injectIntoQuill(editor: HTMLElement, text: string): { success: boolean; error?: string } {
  try {
    // Convert plain text lines → Quill <p> tags
    // Empty lines become <p><br></p> which is Quill's empty paragraph format
    const html = text
      .split("\n")
      .map(line => line.trim() === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`)
      .join("");

    // Clear and set content
    editor.innerHTML = html;

    // Fire events Quill listens to so it syncs its internal Delta
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

    // Also try to trigger Quill's text-change via MutationObserver path
    // by dispatching on the ql-container parent
    const container = editor.closest(".ql-container");
    if (container) {
      container.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: `Quill injection failed: ${(err as Error).message}` };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Injection ────────────────────────────────────────────────────────────────

async function injectText(text: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Use confirmed [data-testid="chat-input"] for Claude — it's a ProseMirror contenteditable div
    const inputSelectors: Record<Platform, string[]> = {
      claude:  [
        '[data-testid="chat-input"]',          // confirmed May 2026
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"]',
      ],
      chatgpt: ["#prompt-textarea", 'div[contenteditable="true"]', "textarea"],
      gemini:  ['.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]'],
      unknown: ['div[contenteditable="true"]', "textarea"],
    };

    let inputEl: Element | null = null;
    for (const sel of (inputSelectors[platform] ?? inputSelectors.unknown)) {
      inputEl = document.querySelector(sel);
      if (inputEl) break;
    }

    if (!inputEl) {
      return {
        success: false,
        error: `Could not find input. Tried: ${inputSelectors[platform].join(", ")}`,
      };
    }

    (inputEl as HTMLElement).focus();

    if (inputEl.getAttribute("contenteditable") === "true") {

      // Quill editor (Gemini) — must inject as <p> tags, execCommand mangles newlines
      const isQuill = inputEl.classList.contains("ql-editor");
      if (isQuill) {
        return injectIntoQuill(inputEl as HTMLElement, text);
      }

      // ProseMirror / React controlled inputs (Claude, ChatGPT)
      document.execCommand("selectAll");
      document.execCommand("delete");

      const ok = document.execCommand("insertText", false, text);

      if (!ok) {
        // Fallback: native InputEvent
        (inputEl as HTMLElement).innerText = text;
        inputEl.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text,
        }));
      }

      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    }

    if (inputEl.tagName === "TEXTAREA") {
      const ta = inputEl as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;
      setter?.call(ta, text);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return { success: true };
    }

    return { success: false, error: `Unsupported input type: ${inputEl.tagName}` };
  } catch (err) {
    return { success: false, error: `Injection failed: ${(err as Error).message}` };
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "GET_PLATFORM") {
    sendResponse({ type: "PLATFORM_RESULT", platform });
    return false;
  }

  if (message.type === "CAPTURE_CHAT") {
    const result = scrapeMessages(); // fully sync — no await, no race
    sendResponse({ type: "SCRAPE_RESULT", messages: result.messages, error: result.error });
    return false;
  }

  if (message.type === "INJECT_PILL") {
    const { pill, mode } = message;
    const text = buildInjectionBlock(pill.messages, mode, {
      title: pill.title,
      platform: pill.platform,
      capturedAt: pill.capturedAt,
    });
    injectText(text).then((result) => {
      sendResponse({ type: "INJECT_RESULT", success: result.success, error: result.error });
    });
    return true; // async
  }

  return false;
});

// ─── Debug helper ─────────────────────────────────────────────────────────────

(window as any).__nucleusDebug = () => {
  console.group("🔵 Nucleus Debug");
  console.log("Platform:", platform);

  const container = findConversationContainer();
  console.log("Container found:", !!container, "| children:", container?.children?.length);

  const result = scrapeMessages();
  console.log("Messages scraped:", result.messages.length);
  if (result.error) console.warn("Error:", result.error);
  console.table(result.messages.map(m => ({
    role: m.role,
    preview: m.content.slice(0, 100),
  })));

  const input = document.querySelector('[data-testid="chat-input"]');
  console.log("Input found:", !!input, "| tag:", input?.tagName, "| contenteditable:", input?.getAttribute("contenteditable"));

  console.groupEnd();
  return result;
};
