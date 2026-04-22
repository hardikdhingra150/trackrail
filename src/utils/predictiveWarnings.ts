import { predictDelay } from '../lib/api';
import type { DelayPrediction } from '../types';

export interface PredictiveWarning {
  id: string;
  trainNumber: string;
  stationCode: string;
  delayClass: 'HIGH' | 'MEDIUM' | 'LOW';
  avgDelayMinutes: number;
  confidence: number;
  topFactor: string;
  reason: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
}

// ── Map RF prediction → warning object ───────────────────────
export const toWarning = (p: DelayPrediction): PredictiveWarning => ({
  id:               `${p.train_number}-${p.station_code}-${Date.now()}`,
  trainNumber:      p.train_number,
  stationCode:      p.station_code,
  delayClass:       p.delay_class as 'HIGH' | 'MEDIUM' | 'LOW',
  avgDelayMinutes:  p.average_delay_minutes,
  confidence:       p.confidence,
  topFactor:        p.explanation?.top_factor ?? 'unknown',
  reason:           p.explanation?.reason ?? '',
  severity:
    p.delay_class === 'HIGH'   ? 'critical' :
    p.delay_class === 'MEDIUM' ? 'warning'  : 'info',
  timestamp: new Date().toISOString(),
});

// ── Get warnings for a list of train+station pairs ───────────
export const getPredictiveWarnings = async (
  pairs: { trainNumber: string; stationCode: string }[]
): Promise<PredictiveWarning[]> => {
  const results = await Promise.allSettled(
    pairs.map(p => predictDelay(p.trainNumber, p.stationCode))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<DelayPrediction> =>
      r.status === 'fulfilled' && r.value.delay_class !== 'UNKNOWN'
    )
    .map(r => toWarning(r.value))
    .filter(w => w.severity !== 'info')   // only show warnings + critical
    .sort((a, b) => b.avgDelayMinutes - a.avgDelayMinutes);
};

// ── Get warning for a single train ───────────────────────────
export const getWarningForTrain = async (
  trainNumber: string,
  stationCode: string
): Promise<PredictiveWarning | null> => {
  try {
    const p = await predictDelay(trainNumber, stationCode);
    if (p.delay_class === 'UNKNOWN') return null;
    return toWarning(p);
  } catch {
    return null;
  }
  
};
export const detectPredictiveWarnings = getPredictiveWarnings;
