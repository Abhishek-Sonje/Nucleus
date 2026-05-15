import type { Pill, InjectionMode, Platform } from "../types";
import { getAllPills, deletePill, updatePill, getStorageQuota } from "../utils/storage";
import { detectPlatform, platformDisplayName, platformColor } from "../utils/platform";
import { buildInjectionBlock } from "../utils/summarizer";

// ─── State ────────────────────────────────────────────────────────────────────

let pills: Pill[] = [];
let filteredPills: Pill[] = [];
let activePill: Pill | null = null;
let currentPlatform: Platform = "unknown";
let currentTabId: number | null = null;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const captureBtn    = document.getElementById("capture-btn") as HTMLButtonElement;
const captureBtnLbl = document.getElementById("capture-btn-label")!;
const searchInput   = document.getElementById("search-input") as HTMLInputElement;
const pillsList     = document.getElementById("pills-list")!;
const emptyState    = document.getElementById("empty-state")!;
const platformBadge = document.getElementById("platform-badge")!;
const storageText   = document.getElementById("storage-text")!;
const storageFill   = document.getElementById("storage-fill") as HTMLDivElement;
const injectModal   = document.getElementById("inject-modal")!;
const modalTitle    = document.getElementById("modal-title")!;
const modalClose    = document.getElementById("modal-close")!;
const injectStatus  = document.getElementById("inject-status")!;

// Progress panel
const progressPanel = document.getElementById("progress-panel")!;
const progressFill  = document.getElementById("progress-fill") as HTMLDivElement;
const captureStatus = document.getElementById("capture-status")!;
const step1 = document.getElementById("step-1")!;
const step2 = document.getElementById("step-2")!;
const step3 = document.getElementById("step-3")!;

// ─── Progress helpers ─────────────────────────────────────────────────────────

type StepState = "idle" | "active" | "done" | "error";

function setStep(el: HTMLElement, state: StepState) {
  el.classList.remove("active", "done", "error");
  if (state !== "idle") el.classList.add(state);
}

function showProgress(pct: number, msg: string, isError = false) {
  progressPanel.classList.remove("hidden");
  progressFill.style.width = `${pct}%`;
  progressFill.classList.toggle("error", isError);
  captureStatus.textContent = msg;
  captureStatus.className = `capture-status${isError ? " error" : ""}`;
}

function hideProgress() {
  setTimeout(() => {
    progressPanel.classList.add("hidden");
    progressFill.style.width = "0%";
    progressFill.classList.remove("error");
    captureStatus.textContent = "";
    setStep(step1, "idle");
    setStep(step2, "idle");
    setStep(step3, "idle");
  }, 2000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadCurrentTab();
  await loadPills();
  await loadStorageQuota();
  renderPlatformBadge();
  setupEventListeners();
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    currentPlatform = detectPlatform(tab.url);
    currentTabId = tab.id ?? null;
  }
}

async function loadPills() {
  pills = await getAllPills();
  filteredPills = pills;
  renderPillsList();
}

async function loadStorageQuota() {
  const quota = await getStorageQuota();
  const used = quota.used < 1024 ? `${quota.used}B`
    : quota.used < 1024 * 1024 ? `${(quota.used / 1024).toFixed(1)}KB`
    : `${(quota.used / (1024 * 1024)).toFixed(1)}MB`;
  storageText.textContent = `${used} / 10MB`;
  storageFill.style.width = `${quota.percentUsed}%`;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderPlatformBadge() {
  if (currentPlatform === "unknown") {
    platformBadge.style.display = "none";
    captureBtn.disabled = true;
    return;
  }
  platformBadge.textContent = platformDisplayName(currentPlatform);
  const color = platformColor(currentPlatform);
  platformBadge.style.cssText = `color:${color};border-color:${color}40;background:${color}15`;
}

function renderPillsList() {
  pillsList.innerHTML = "";
  if (filteredPills.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  filteredPills.forEach(pill => pillsList.appendChild(createPillEl(pill)));
}

function createPillEl(pill: Pill): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "pill-item";
  li.dataset.id = pill.id;

  const date = new Date(pill.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const color = platformColor(pill.platform);

  li.innerHTML = `
    <div class="pill-main">
      <div class="pill-color-dot ${pill.color ?? "default"}"></div>
      <div class="pill-info">
        <div class="pill-title" title="${esc(pill.title)}">${esc(pill.title)}</div>
        <div class="pill-meta">
          <span class="pill-platform-tag" style="color:${color};background:${color}18;border:1px solid ${color}30">
            ${platformDisplayName(pill.platform)}
          </span>
          <span class="pill-count">${pill.messageCount} msgs</span>
          <span class="pill-date">${date}</span>
        </div>
      </div>
      <div class="pill-actions">
        <button class="pill-action-btn inject-btn" data-id="${pill.id}">Inject</button>
        <button class="pill-action-btn delete delete-btn" data-id="${pill.id}">✕</button>
      </div>
    </div>`;

  li.querySelector(".pill-title")!.addEventListener("dblclick", (e) =>
    startTitleEdit(e.currentTarget as HTMLElement, pill)
  );

  return li;
}

function startTitleEdit(el: HTMLElement, pill: Pill) {
  el.contentEditable = "true";
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);

  const finish = async () => {
    el.contentEditable = "false";
    const newTitle = el.textContent?.trim() || pill.title;
    el.textContent = newTitle;
    if (newTitle !== pill.title) {
      pill.title = newTitle;
      await updatePill(pill.id, { title: newTitle });
      const i = pills.findIndex(p => p.id === pill.id);
      if (i !== -1) pills[i].title = newTitle;
    }
  };
  el.addEventListener("blur", finish, { once: true });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    if (e.key === "Escape") { el.textContent = pill.title; el.blur(); }
  });
}

// ─── Events ───────────────────────────────────────────────────────────────────

function setupEventListeners() {
  captureBtn.addEventListener("click", handleCapture);

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    filteredPills = q ? pills.filter(p => p.title.toLowerCase().includes(q)) : pills;
    renderPillsList();
  });

  pillsList.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains("inject-btn")) {
      const pill = pills.find(p => p.id === t.dataset.id);
      if (pill) openInjectModal(pill);
    }
    if (t.classList.contains("delete-btn")) {
      await handleDelete(t.dataset.id!);
    }
  });

  modalClose.addEventListener("click", closeInjectModal);
  injectModal.addEventListener("click", e => { if (e.target === injectModal) closeInjectModal(); });
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => handleInject((btn as HTMLElement).dataset.mode as InjectionMode));
  });
}

// ─── Capture with progress ────────────────────────────────────────────────────

async function handleCapture() {
  if (currentPlatform === "unknown") {
    progressPanel.classList.remove("hidden");
    showProgress(100, "Open Claude, ChatGPT, or Gemini first.", true);
    setStep(step1, "error");
    hideProgress();
    return;
  }

  captureBtn.disabled = true;
  captureBtnLbl.textContent = "Capturing...";

  // Step 1 — reaching page
  setStep(step1, "active");
  setStep(step2, "idle");
  setStep(step3, "idle");
  showProgress(15, "Connecting to page...");

  await sleep(120); // small delay so user sees step 1

  let result: any;
  try {
    // Step 2 — scraping
    setStep(step1, "done");
    setStep(step2, "active");
    showProgress(45, "Scraping messages...");

    result = await chrome.runtime.sendMessage({ type: "CAPTURE_REQUEST" });

    if (!result?.success) {
      // Failed at scrape
      setStep(step2, "error");
      showProgress(45, result?.error ?? "Scrape failed.", true);
      hideProgress();
      captureBtn.disabled = false;
      captureBtnLbl.textContent = "Capture Chat";
      return;
    }

    // Step 3 — saving
    setStep(step2, "done");
    setStep(step3, "active");
    showProgress(80, "Saving pill...");

    await sleep(80);

    setStep(step3, "done");
    showProgress(100, `✓ "${trunc(result.pill.title, 30)}" saved — ${result.pill.messageCount} messages`);

    pills.unshift(result.pill);
    filteredPills = pills;
    renderPillsList();
    await loadStorageQuota();

  } catch (err) {
    setStep(step1, "error");
    showProgress(15, "Could not reach page. Refresh the tab and try again.", true);
  }

  hideProgress();
  captureBtn.disabled = false;
  captureBtnLbl.textContent = "Capture Chat";
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function handleDelete(id: string) {
  await deletePill(id);
  pills = pills.filter(p => p.id !== id);
  filteredPills = filteredPills.filter(p => p.id !== id);
  renderPillsList();
  await loadStorageQuota();
}

// ─── Inject Modal ─────────────────────────────────────────────────────────────

function openInjectModal(pill: Pill) {
  activePill = pill;
  modalTitle.textContent = pill.title;
  injectStatus.textContent = "";
  injectStatus.className = "inject-status";
  injectModal.classList.remove("hidden");
}

function closeInjectModal() {
  injectModal.classList.add("hidden");
  activePill = null;
}

async function handleInject(mode: InjectionMode) {
  if (!activePill || !currentTabId) {
    injectStatus.textContent = "No active tab.";
    injectStatus.className = "inject-status error";
    return;
  }

  injectStatus.textContent = "Injecting...";
  injectStatus.className = "inject-status pulse";

  try {
    const text = buildInjectionBlock(activePill.messages, mode, {
      title: activePill.title,
      platform: activePill.platform,
      capturedAt: activePill.capturedAt,
    });

    const result = await chrome.tabs.sendMessage(currentTabId, {
      type: "INJECT_PILL",
      pill: activePill,
      mode,
    });

    if (result?.success) {
      injectStatus.textContent = "✓ Injected! Check the chat input.";
      injectStatus.className = "inject-status success";
      setTimeout(closeInjectModal, 1200);
    } else {
      injectStatus.textContent = result?.error ?? "Injection failed.";
      injectStatus.className = "inject-status error";
    }
  } catch {
    injectStatus.textContent = "Could not reach the page.";
    injectStatus.className = "inject-status error";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

init();
