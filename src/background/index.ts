import type { Pill, CaptureResult } from "../types";
import { savePill, generateId } from "../utils/storage";
import { extractiveSummary, generateTitle } from "../utils/summarizer";
import { detectPlatform } from "../utils/platform";

// ─── Ensure content script is alive ──────────────────────────────────────────
// Fixes "Receiving end does not exist" — content script not injected on tabs
// that were already open when the extension was installed/reloaded.

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    // Ping the content script — if it responds, it's already injected
    await chrome.tabs.sendMessage(tabId, { type: "GET_PLATFORM" });
  } catch {
    // No response — inject it programmatically
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      // Small wait for the script to register its listener
      await sleep(150);
    } catch (err) {
      // scripting.executeScript can fail if tab is a chrome:// page etc.
      console.warn("Could not inject content script:", err);
    }
  }
}

// ─── Capture ──────────────────────────────────────────────────────────────────

async function captureChat(tabId: number, url: string): Promise<CaptureResult> {
  const platform = detectPlatform(url);

  if (platform === "unknown") {
    return {
      success: false,
      error: "Not on a supported AI platform. Open Claude, ChatGPT, or Gemini.",
    };
  }

  // Make sure the content script is alive before messaging it
  await ensureContentScript(tabId);

  let response: any;
  try {
    response = await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_CHAT",
      platform,
    });
  } catch (err) {
    return {
      success: false,
      error: "Could not reach the page. Try refreshing the tab and capturing again.",
    };
  }

  if (!response) {
    return {
      success: false,
      error: "No response from page. Try refreshing and capturing again.",
    };
  }

  if (response.error || !response.messages || response.messages.length === 0) {
    return {
      success: false,
      error: response.error ?? "No messages found in this chat.",
    };
  }

  const messages = response.messages;
  const pill: Pill = {
    id: generateId(),
    title: generateTitle(messages),
    platform,
    capturedAt: Date.now(),
    messages,
    summary: extractiveSummary(messages),
    messageCount: messages.length,
    color: "default",
    version: 1,
  };

  await savePill(pill);
  return { success: true, pill };
}

// ─── Keyboard shortcut ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-chat") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;
  await captureChat(tab.id, tab.url);
});

// ─── Message listener (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.type !== "CAPTURE_REQUEST") return false;

  (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !tab.url) {
        sendResponse({ success: false, error: "No active tab found." });
        return;
      }
      const result = await captureChat(tab.id, tab.url);
      sendResponse(result);
    } catch (err) {
      sendResponse({
        success: false,
        error: `Unexpected error: ${(err as Error).message}`,
      });
    }
  })();

  return true; // keep channel open for async sendResponse
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
