import { predictDelay, predictDelayLiveBatch } from '../lib/api';
import type { DelayPrediction, FirestoreTrain } from '../types';

// ── Fetch live delay for a single train at a station ─────────
export const getLiveDelay = async (
  trainNumber: string,
  stationCode: string
): Promise<DelayPrediction | null> => {
  try {
    return await predictDelay(trainNumber, stationCode);
  } catch (err) {
    console.warn(`[LiveDelay] Failed for ${trainNumber}@${stationCode}:`, err);
    return null;
  }
};

// ── Fetch delays for live trains using their current section block ──────
export const getAllTrainDelays = async (
  trains: Pick<FirestoreTrain, 'trainNumber' | 'currentBlock' | 'fromStation' | 'toStation'>[]
): Promise<DelayPrediction[]> => {
  const requests = trains.map((train) => ({
    train_number: train.trainNumber,
    current_block: train.currentBlock,
    from_station: train.fromStation,
    to_station: train.toStation,
  }));

  try {
    const res = await predictDelayLiveBatch(requests);
    return res.predictions.filter(p => p.delay_class !== 'UNKNOWN');
  } catch {
    const results = await Promise.allSettled(
      trains.map((train) => predictDelay(train.trainNumber, train.currentBlock))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<DelayPrediction> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(p => p.delay_class !== 'UNKNOWN');
  }
};

// ── Delay class helpers ───────────────────────────────────────
export const delayClassColor = (cls: string): string => ({
  HIGH:    'text-red-500',
  MEDIUM:  'text-yellow-500',
  LOW:     'text-green-500',
  UNKNOWN: 'text-gray-400',
}[cls] ?? 'text-gray-400');

export const delayClassBg = (cls: string): string => ({
  HIGH:    'bg-red-500/10 border-red-500/30',
  MEDIUM:  'bg-yellow-500/10 border-yellow-500/30',
  LOW:     'bg-green-500/10 border-green-500/30',
  UNKNOWN: 'bg-gray-500/10 border-gray-500/30',
}[cls] ?? 'bg-gray-500/10');

export const delayClassLabel = (cls: string): string => ({
  HIGH:    '🔴 High Delay Risk',
  MEDIUM:  '🟡 Moderate Delay',
  LOW:     '🟢 On Time',
  UNKNOWN: '⚪ Unknown',
}[cls] ?? '⚪ Unknown');

export const estimatedDelayText = (minutes: number): string => {
  if (minutes <= 0)  return 'On time';
  if (minutes < 10)  return `~${minutes} min late`;
  if (minutes < 60)  return `~${minutes} min late`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `~${h}h ${m}m late`;
};
