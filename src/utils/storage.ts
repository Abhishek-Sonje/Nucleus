import type { Pill, PillIndex, StorageQuota } from "../types";

const PILL_INDEX_KEY = "pill_index";
const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;

function pillKey(id: string): string {
  return `pill:${id}`;
}

export async function getPillIndex(): Promise<PillIndex> {
  const result = await chrome.storage.local.get(PILL_INDEX_KEY);
  const val = result[PILL_INDEX_KEY];
  if (val && typeof val === "object" && "ids" in val) return val as PillIndex;
  return { ids: [], lastUpdated: Date.now() };
}

export async function savePill(pill: Pill): Promise<void> {
  const index = await getPillIndex();
  if (!index.ids.includes(pill.id)) {
    index.ids.unshift(pill.id);
    index.lastUpdated = Date.now();
  }
  await chrome.storage.local.set({
    [pillKey(pill.id)]: pill,
    [PILL_INDEX_KEY]: index,
  });
}

export async function getPill(id: string): Promise<Pill | null> {
  const result = await chrome.storage.local.get(pillKey(id));
  const val = result[pillKey(id)];
  if (val && typeof val === "object" && "id" in val) return val as Pill;
  return null;
}

export async function getAllPills(): Promise<Pill[]> {
  const index = await getPillIndex();
  if (index.ids.length === 0) return [];
  const keys = index.ids.map(pillKey);
  const result = await chrome.storage.local.get(keys);
  return index.ids
    .map((id) => result[pillKey(id)] as Pill | undefined)
    .filter((p): p is Pill => p !== undefined);
}

export async function deletePill(id: string): Promise<void> {
  const index = await getPillIndex();
  index.ids = index.ids.filter((i) => i !== id);
  index.lastUpdated = Date.now();
  await chrome.storage.local.remove(pillKey(id));
  await chrome.storage.local.set({ [PILL_INDEX_KEY]: index });
}

export async function updatePill(id: string, updates: Partial<Pill>): Promise<void> {
  const pill = await getPill(id);
  if (!pill) return;
  const updated = { ...pill, ...updates };
  await chrome.storage.local.set({ [pillKey(id)]: updated });
}

export async function getStorageQuota(): Promise<StorageQuota> {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  return {
    used: bytesInUse,
    total: STORAGE_QUOTA_BYTES,
    percentUsed: Math.round((bytesInUse / STORAGE_QUOTA_BYTES) * 100),
  };
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
