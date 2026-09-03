export const HISTORY_BATCH_SIZE = 200;

export function initialVisibleStart(totalMessages: number, batchSize = HISTORY_BATCH_SIZE): number {
  return Math.max(0, totalMessages - Math.max(1, batchSize));
}

export function previousVisibleStart(currentStart: number, batchSize = HISTORY_BATCH_SIZE): number {
  return Math.max(0, currentStart - Math.max(1, batchSize));
}

export function earlierMessageCount(currentStart: number): number {
  return Math.max(0, currentStart);
}
