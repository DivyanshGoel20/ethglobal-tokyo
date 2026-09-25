interface CachedTelemetry {
  timestamp: number;
  data: any;
}

const telemetryCache = new Map<string, CachedTelemetry>();
// Two components poll this endpoint and every mutating route invalidates the
// key on write, so freshness comes from invalidation rather than from a short
// window. 3.5s meant a full head-state re-read roughly twice a minute per
// viewer for data that had not changed.
export const TELEMETRY_CACHE_TTL_MS = 12_000;

export function getCachedTelemetry(key: string): any | null {
  const cached = telemetryCache.get(key.toLowerCase());
  if (cached && Date.now() - cached.timestamp < TELEMETRY_CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

export function setCachedTelemetry(key: string, data: any) {
  telemetryCache.set(key.toLowerCase(), { timestamp: Date.now(), data });
}

export function invalidateTelemetryCache(humanOwner?: string) {
  if (humanOwner) {
    telemetryCache.delete(humanOwner.toLowerCase());
  } else {
    telemetryCache.clear();
  }
}
