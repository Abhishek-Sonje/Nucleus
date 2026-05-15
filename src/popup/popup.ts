import type { Pill, InjectionMode, Platform, PillColor } from "../types";
import { getAllPills, deletePill, updatePill, getStorageQuota } from "../utils/storage";
import { detectPlatform, platformDisplayName, platformColor } from "../utils/platform";
import { buildInjectionBlock } from "../utils/summarizer";
import { getLastWorkingDate, isPlatformBroken } from "../utils/selectorConfig";

// ─── State ────────────────────────────────────────────────────────────────────

let pills: Pill[] = [];
let filteredPills: Pill[] = [];
let activePill: Pill | null = null;
let currentPlatform: Platform = "unknown";
let currentTabId: number | null = null;
let sortOrder: "newest" | "oldest" = "newest";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const captureBtn     = document.getElementById("capture-btn") as HTMLButtonElement;
const captureBtnLbl  = document.getElementById("capture-btn-label")!;
const sortBtn        = document.getElementById("sort-btn")!;
const searchInput    = document.getElementById("search-input") as HTMLInputElement;
const pillsList      = document.getElementById("pills-list")!;
const emptyState     = document.getElementById("empty-state")!;
const platformBadge  = document.getElementById("platform-badge")!;
const storageText    = document.getElementById("storage-text")!;
const storageFill    = document.getElementById("storage-fill") as HTMLDivElement;
const pillCountLabel = document.getElementById("pill-count-label")!;
const storageWarning = document.getElementById("storage-warning")!;
const progressPanel  = document.getElementById("progress-panel")!;
const progressFill   = document.getElementById("progress-fill") as HTMLDivElement;
const captureStatus  = document.getElementById("capture-status")!;
const step1 = document.getElementById("step-1")!;
const step2 = document.getElementById("step-2")!;
const step3 = document.getElementById("step-3")!;
const injectModal    = document.getElementById("inject-modal")!;
const modalTitle     = document.getElementById("modal-title")!;
const modalClose     = document.getElementById("modal-close")!;
const injectStatus   = document.getElementById("inject-status")!;
const colorSwatches  = document.getElementById("color-swatches")!;
const exportBtn      = document.getElementById("export-btn")!;

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
  applySort();
  renderPillsList();
}

async function loadStorageQuota() {
  const quota = await getStorageQuota();

  const fmt = (b: number) =>
    b < 1024 ? `${b}B`
    : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB`
    : `${(b / (1024 * 1024)).toFixed(1)}MB`;

  storageText.textContent = `${fmt(quota.used)} / 10MB`;
  pillCountLabel.textContent = `${pills.length} pill${pills.length !== 1 ? "s" : ""}`;

  storageFill.style.width = `${quota.percentUsed}%`;
  storageFill.classList.remove("warn", "danger");

  // Storage warning banner
  storageWarning.classList.add("hidden");
  storageWarning.className = "storage-warning hidden";

  if (quota.percentUsed >= 90) {
    storageFill.classList.add("danger");
    storageWarning.textContent = `⚠ Storage ${quota.percentUsed}% full — delete old pills to free space.`;
    storageWarning.classList.remove("hidden");
    storageWarning.classList.add("danger");
  } else if (quota.percentUsed >= 70) {
    storageFill.classList.add("warn");
    storageWarning.textContent = `Storage ${quota.percentUsed}% full.`;
    storageWarning.classList.remove("hidden");
    storageWarning.classList.add("warn");
  }
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

function applySort() {
  filteredPills = [...pills];
  if (sortOrder === "oldest") filteredPills.reverse();
  const q = searchInput.value.trim().toLowerCase();
  if (q) filteredPills = filteredPills.filter(p => p.title.toLowerCase().includes(q));
}

// ─── Platform badge ───────────────────────────────────────────────────────────

function renderPlatformBadge() {
  if (currentPlatform === "unknown") {
    platformBadge.style.display = "none";
    captureBtn.disabled = true;
    captureStatus.textContent = "";
    return;
  }

  const broken = isPlatformBroken(currentPlatform);
  platformBadge.textContent = platformDisplayName(currentPlatform) + (broken ? " ⚠" : "");
  const color = broken ? "var(--warn)" : platformColor(currentPlatform);
  platformBadge.style.cssText = `color:${color};border-color:${color}40;background:${color}15`;

  if (broken) {
    captureBtn.disabled = true;
    captureStatus.textContent = `Scraper needs update. Last working: ${getLastWorkingDate(currentPlatform)}`;
    captureStatus.className = "capture-status error";
    progressPanel.classList.remove("hidden");
  }
}

// ─── Pills rendering ──────────────────────────────────────────────────────────

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
  const pColor = platformColor(pill.platform);

  li.innerHTML = `
    <div class="pill-main">
      <div class="pill-color-bar ${pill.color ?? "default"}"></div>
      <div class="pill-info">
        <div class="pill-title-row">
          <span class="pill-title" title="${esc(pill.title)}">${esc(pill.title)}</span>
          <button class="pencil-btn" data-id="${pill.id}" title="Rename">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="pill-meta">
          <span class="pill-platform-tag" style="color:${pColor};background:${pColor}18;border:1px solid ${pColor}30">
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

  return li;
}

// ─── Inline title editing ─────────────────────────────────────────────────────

function startTitleEdit(pillId: string) {
  const li = pillsList.querySelector(`[data-id="${pillId}"]`);
  if (!li) return;
  const pill = pills.find(p => p.id === pillId);
  if (!pill) return;

  const titleEl = li.querySelector(".pill-title") as HTMLElement;
  const pencilBtn = li.querySelector(".pencil-btn") as HTMLElement;
  const titleRow = li.querySelector(".pill-title-row") as HTMLElement;

  // Replace span with input
  const input = document.createElement("input");
  input.className = "pill-title-input";
  input.value = pill.title;
  input.maxLength = 80;

  titleEl.replaceWith(input);
  pencilBtn.style.opacity = "0";
  input.focus();
  input.select();

  const finish = async (save: boolean) => {
    const newTitle = input.value.trim() || pill.title;
    // Restore span
    const span = document.createElement("span");
    span.className = "pill-title";
    span.title = newTitle;
    span.textContent = newTitle;
    input.replaceWith(span);
    pencilBtn.style.opacity = "";

    if (save && newTitle !== pill.title) {
      pill.title = newTitle;
      await updatePill(pill.id, { title: newTitle });
      const idx = pills.findIndex(p => p.id === pill.id);
      if (idx !== -1) pills[idx].title = newTitle;
    }
  };

  input.addEventListener("blur", () => finish(true), { once: true });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") { input.value = pill.title; finish(false); }
  });
}

// ─── Events ───────────────────────────────────────────────────────────────────

function setupEventListeners() {
  captureBtn.addEventListener("click", handleCapture);

  sortBtn.addEventListener("click", () => {
    sortOrder = sortOrder === "newest" ? "oldest" : "newest";
    sortBtn.title = sortOrder === "newest" ? "Sort: newest first" : "Sort: oldest first";
    applySort();
    renderPillsList();
  });

  searchInput.addEventListener("input", () => {
    applySort();
    renderPillsList();
  });

  // Delegated pill list clicks
  pillsList.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest("button") as HTMLButtonElement | null;
    if (!btn) return;

    if (btn.classList.contains("inject-btn")) {
      const pill = pills.find(p => p.id === btn.dataset.id);
      if (pill) openInjectModal(pill);
    }
    if (btn.classList.contains("delete-btn")) {
      await handleDelete(btn.dataset.id!);
    }
    if (btn.classList.contains("pencil-btn")) {
      startTitleEdit(btn.dataset.id!);
    }
  });

  // Modal
  modalClose.addEventListener("click", closeInjectModal);
  injectModal.addEventListener("click", e => { if (e.target === injectModal) closeInjectModal(); });
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => handleInject((btn as HTMLElement).dataset.mode as InjectionMode));
  });

  // Color swatches
  colorSwatches.addEventListener("click", async (e) => {
    const swatch = (e.target as HTMLElement).closest(".swatch") as HTMLElement | null;
    if (!swatch || !activePill) return;

    const color = swatch.dataset.color as PillColor;
    activePill.color = color;
    await updatePill(activePill.id, { color });

    // Update active swatch UI
    colorSwatches.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
    swatch.classList.add("active");

    // Update color bar in list
    const li = pillsList.querySelector(`[data-id="${activePill.id}"]`);
    if (li) {
      const bar = li.querySelector(".pill-color-bar");
      if (bar) {
        bar.className = `pill-color-bar ${color}`;
      }
    }

    // Update local state
    const idx = pills.findIndex(p => p.id === activePill!.id);
    if (idx !== -1) pills[idx].color = color;
  });

  // Export button
  exportBtn.addEventListener("click", () => handleExport());
}

// ─── Capture with progress ────────────────────────────────────────────────────

type StepState = "idle" | "active" | "done" | "error";

function setStep(el: HTMLElement, state: StepState) {
  el.classList.remove("active", "done", "error");
  if (state !== "idle") el.classList.add(state);
}

function showProgress(pct: number, msg: string, type: ""|"error"|"success" = "") {
  progressPanel.classList.remove("hidden");
  progressFill.style.width = `${pct}%`;
  progressFill.classList.toggle("error", type === "error");
  captureStatus.textContent = msg;
  captureStatus.className = `capture-status${type ? " " + type : ""}`;
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
  }, 2200);
}

async function handleCapture() {
  if (currentPlatform === "unknown") {
    showProgress(100, "Open Claude, ChatGPT, or Gemini first.", "error");
    setStep(step1, "error");
    hideProgress();
    return;
  }

  captureBtn.disabled = true;
  captureBtnLbl.textContent = "Capturing...";
  setStep(step1, "active"); setStep(step2, "idle"); setStep(step3, "idle");
  showProgress(15, "Connecting to page...");
  await sleep(100);

  try {
    setStep(step1, "done"); setStep(step2, "active");
    showProgress(45, "Scraping messages...");

    const result = await chrome.runtime.sendMessage({ type: "CAPTURE_REQUEST" });

    if (!result?.success) {
      setStep(step2, "error");
      showProgress(45, result?.error ?? "Scrape failed.", "error");
      hideProgress();
      return;
    }

    setStep(step2, "done"); setStep(step3, "active");
    showProgress(80, "Saving pill...");
    await sleep(80);

    setStep(step3, "done");
    showProgress(100, `✓ "${trunc(result.pill.title, 28)}" — ${result.pill.messageCount} msgs`, "success");

    pills.unshift(result.pill);
    applySort();
    renderPillsList();
    await loadStorageQuota();

  } catch {
    setStep(step1, "error");
    showProgress(15, "Could not reach page. Refresh the tab and try again.", "error");
  } finally {
    captureBtn.disabled = false;
    captureBtnLbl.textContent = "Capture Chat";
    hideProgress();
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function handleDelete(id: string) {
  await deletePill(id);
  pills = pills.filter(p => p.id !== id);
  applySort();
  renderPillsList();
  await loadStorageQuota();
}

// ─── Inject Modal ─────────────────────────────────────────────────────────────

function openInjectModal(pill: Pill) {
  activePill = pill;
  modalTitle.textContent = pill.title;
  injectStatus.textContent = "";
  injectStatus.className = "inject-status";

  // Set active color swatch
  colorSwatches.querySelectorAll(".swatch").forEach(s => {
    s.classList.toggle("active", (s as HTMLElement).dataset.color === (pill.color ?? "default"));
  });

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
    const result = await chrome.tabs.sendMessage(currentTabId, {
      type: "INJECT_PILL",
      pill: activePill,
      mode,
    });

    if (result?.success) {
      injectStatus.textContent = "✓ Injected! Check the chat input.";
      injectStatus.className = "inject-status success";
      setTimeout(closeInjectModal, 1100);
    } else {
      injectStatus.textContent = result?.error ?? "Injection failed.";
      injectStatus.className = "inject-status error";
    }
  } catch {
    injectStatus.textContent = "Could not reach the page.";
    injectStatus.className = "inject-status error";
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function handleExport() {
  if (!activePill) return;

  const text = buildInjectionBlock(activePill.messages, "full", {
    title: activePill.title,
    platform: activePill.platform,
    capturedAt: activePill.capturedAt,
  });

  try {
    await navigator.clipboard.writeText(text);
    exportBtn.textContent = "✓ Copied!";
    exportBtn.classList.add("copied");
    setTimeout(() => {
      exportBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.3"/>
      </svg> Export`;
      exportBtn.classList.remove("copied");
    }, 1500);
  } catch {
    exportBtn.textContent = "Failed";
    setTimeout(() => { exportBtn.textContent = "Export"; }, 1500);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

init();
