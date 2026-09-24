export interface JobRecord {
  id: string;
  name: string;
  copies: number;
  submittedAt: string;
}

const MAX_RECORDS = 200;

/**
 * In-memory metadata for jobs FedPrint submitted. CUPS is the source of truth
 * for job state and timing, but it withholds job titles from listing commands,
 * so the friendly filename is remembered here for the current process.
 */
const records = new Map<string, JobRecord>();

/**
 * CUPS' lpstat cannot filter canceled jobs and reports them as completed, so
 * cancellations performed by this process are remembered to label them right.
 */
const canceledIds = new Set<string>();

export function remember(record: JobRecord): void {
  records.set(record.id, record);
  if (records.size > MAX_RECORDS) {
    const oldest = records.keys().next().value;
    if (oldest !== undefined) records.delete(oldest);
  }
}

export function recall(id: string): JobRecord | undefined {
  return records.get(id);
}

export function markCanceled(id: string): void {
  canceledIds.add(id);
  if (canceledIds.size > MAX_RECORDS) {
    const oldest = canceledIds.values().next().value;
    if (oldest !== undefined) canceledIds.delete(oldest);
  }
}

export function wasCanceled(id: string): boolean {
  return canceledIds.has(id);
}

export function pruneOlderThan(maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, record] of records) {
    if (Date.parse(record.submittedAt) < cutoff) records.delete(id);
  }
}

export function clear(): void {
  records.clear();
  canceledIds.clear();
}
