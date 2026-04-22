import type { DelayPrediction } from "../types";

export interface LiveConflict {
  id: string;
  trainA: string;
  trainB: string;
  block: string;
  severity: "high" | "medium" | "low";
  status: "open";
  createdAt: number;
  reason: string;
  affectedTrains: string[];
}

type TrainLike = {
  id: string;
  trainNumber: string;
  name?: string;
  currentBlock: string;
  nextBlock?: string;
  delayMinutes?: number;
  speed?: number;
  status?: string;
};

export const BLOCKS = Array.from({ length: 12 }, (_, index) => `B${index + 1}`);

export function dedupeTrainsByNumber<T extends TrainLike>(trains: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const train of trains) {
    if (seen.has(train.trainNumber)) continue;
    seen.add(train.trainNumber);
    unique.push(train);
  }
  return unique;
}

export function normalizeBlock(raw: unknown): string {
  const value = String(raw ?? "").trim().toUpperCase().replace(/^BLOCK[_\s]?/, "");
  if (!value) return "B1";
  return value.startsWith("B") ? value : `B${value}`;
}

export function isCompressedCorridor(trains: TrainLike[]): boolean {
  if (trains.length === 0) return false;
  const blockNumbers = trains
    .map((train) => Number.parseInt(normalizeBlock(train.currentBlock).replace("B", ""), 10))
    .filter((value) => Number.isFinite(value));
  if (blockNumbers.length === 0) return false;
  const maxBlock = Math.max(...blockNumbers);
  const activeBlocks = new Set(blockNumbers).size;
  return maxBlock <= 6 && activeBlocks <= 6;
}

export function spreadTrainsAcrossCorridor<T extends TrainLike>(trains: T[]): T[] {
  const unique = dedupeTrainsByNumber(trains);
  if (!isCompressedCorridor(unique)) return unique;

  const sorted = [...unique].sort((a, b) => a.trainNumber.localeCompare(b.trainNumber, undefined, { numeric: true }));

  return sorted.map((train, index) => {
    const blockIndex = Math.min(11, Math.floor((index * BLOCKS.length) / Math.max(sorted.length, 1)));
    const currentBlock = BLOCKS[blockIndex];
    const nextBlock = BLOCKS[Math.min(blockIndex + 1, BLOCKS.length - 1)];
    return {
      ...train,
      currentBlock,
      nextBlock,
    };
  });
}

function getDelayWeight(trainNumber: string, delayLookup: Map<string, DelayPrediction>) {
  const prediction = delayLookup.get(trainNumber);
  return Math.max(0, prediction?.average_delay_minutes ?? 0);
}

function inferSeverity(trainGroup: TrainLike[], delayLookup: Map<string, DelayPrediction>): LiveConflict["severity"] {
  const maxDelay = Math.max(
    0,
    ...trainGroup.map((train) => Math.max(train.delayMinutes ?? 0, getDelayWeight(train.trainNumber, delayLookup)))
  );
  const hasCritical = trainGroup.some((train) => String(train.status).toLowerCase() === "critical");

  if (trainGroup.length >= 3 || hasCritical || maxDelay >= 30) return "high";
  if (trainGroup.length === 2 && maxDelay >= 12) return "medium";
  return "low";
}

export function deriveLiveConflicts(
  trains: TrainLike[],
  delays: DelayPrediction[] = []
): LiveConflict[] {
  const preparedTrains = spreadTrainsAcrossCorridor(trains);
  const delaysByTrain = new Map(delays.map((delay) => [delay.train_number, delay]));
  const groups = new Map<string, TrainLike[]>();

  for (const train of preparedTrains) {
    const block = normalizeBlock(train.currentBlock);
    if (!BLOCKS.includes(block)) continue;
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block)?.push(train);
  }

  const conflicts: LiveConflict[] = [];

  for (const [block, trainsInBlock] of groups.entries()) {
    if (trainsInBlock.length < 2) continue;

    const sorted = [...trainsInBlock].sort((a, b) => {
      const delayGap = (b.delayMinutes ?? 0) - (a.delayMinutes ?? 0);
      if (delayGap !== 0) return delayGap;
      return a.trainNumber.localeCompare(b.trainNumber);
    });
    const leadTrain = sorted[0];
    const trailingTrain = sorted[1];
    const severity = inferSeverity(sorted, delaysByTrain);
    const avgDelay = Math.round(
      sorted.reduce((sum, train) => sum + Math.max(train.delayMinutes ?? 0, getDelayWeight(train.trainNumber, delaysByTrain)), 0) /
      sorted.length
    );

    conflicts.push({
      id: `live-${block}-${sorted.map((train) => train.trainNumber).join("-")}`,
      trainA: leadTrain.trainNumber,
      trainB: trailingTrain.trainNumber,
      block,
      severity,
      status: "open",
      createdAt: Date.now(),
      reason:
        sorted.length > 2
          ? `${sorted.length} trains are stacked in ${block}; reduce spacing before the section bottlenecks.`
          : `${leadTrain.trainNumber} and ${trailingTrain.trainNumber} are occupying ${block} together with ~${avgDelay} min average delay.`,
      affectedTrains: sorted.map((train) => train.trainNumber),
    });
  }

  return conflicts.sort((a, b) => {
    const severityRank = { high: 3, medium: 2, low: 1 };
    const bySeverity = severityRank[b.severity] - severityRank[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.block.localeCompare(b.block, undefined, { numeric: true });
  });
}
