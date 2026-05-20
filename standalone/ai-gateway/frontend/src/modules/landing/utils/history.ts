// ─── localStorage helpers ─────────────────────────────────────────────────
import { MAX_HISTORY, STORAGE_HISTORY_KEY } from "../configs/try-image-data";
import type { HistoryItem } from "../models/try-image";

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch { /* quota / disabled — silently ignore */ }
}
