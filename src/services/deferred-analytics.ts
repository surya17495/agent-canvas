const PENDING_EVENTS_KEY = "openhands-pending-consented-analytics";
const PROCESSED_EVENTS_KEY = "openhands-processed-analytics-events";

export interface DeferredAnalyticsEvent {
  event: string;
  properties: Record<string, unknown>;
  dedupeKey?: string;
}

function getSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readJsonArray<T>(key: string): T[] {
  const storage = getSessionStorage();
  if (!storage) return [];

  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    storage.removeItem(key);
    return [];
  }
}

function writeJsonArray<T>(key: string, values: T[]): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(values));
  } catch {
    // Analytics must never interfere with the product flow. If storage is
    // unavailable or full, the deferred event is intentionally dropped.
  }
}

export function deferAnalyticsEvent(event: DeferredAnalyticsEvent): void {
  const pending = readJsonArray<DeferredAnalyticsEvent>(PENDING_EVENTS_KEY);
  if (
    event.dedupeKey &&
    pending.some((item) => item.dedupeKey === event.dedupeKey)
  ) {
    return;
  }
  writeJsonArray(PENDING_EVENTS_KEY, [...pending, event]);
}

export function drainDeferredAnalyticsEvents(): DeferredAnalyticsEvent[] {
  const pending = readJsonArray<DeferredAnalyticsEvent>(PENDING_EVENTS_KEY);
  getSessionStorage()?.removeItem(PENDING_EVENTS_KEY);
  return pending;
}

export function clearDeferredAnalyticsEvents(): void {
  getSessionStorage()?.removeItem(PENDING_EVENTS_KEY);
}

export function wasAnalyticsEventProcessed(dedupeKey: string): boolean {
  return readJsonArray<string>(PROCESSED_EVENTS_KEY).includes(dedupeKey);
}

export function markAnalyticsEventProcessed(dedupeKey: string): void {
  const processed = readJsonArray<string>(PROCESSED_EVENTS_KEY);
  if (processed.includes(dedupeKey)) return;
  writeJsonArray(PROCESSED_EVENTS_KEY, [...processed, dedupeKey]);
}
