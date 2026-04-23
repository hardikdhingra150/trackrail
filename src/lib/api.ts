const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Generic fetch wrapper ────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Health ───────────────────────────────────────────────────
export const checkHealth = () =>
  apiFetch<{ ok: boolean; model_ready: boolean; uptime_sec: number }>('/health');

export const getModelInfo = () =>
  apiFetch<{
    model_type: string;
    accuracy: number;
    cv_mean: number;
    classes: string[];
    features: string[];
    feature_importances: Record<string, number>;
  }>('/model-info');

// ── RF Delay Prediction ──────────────────────────────────────
export const predictDelay = async (train_number: string, station_code: string) => {
  return apiFetch<import('../types').DelayPrediction>(
    '/predict-delay',
    { method: 'POST', body: JSON.stringify({ train_number, station_code }) }
  );
};

export const predictDelayBatch = (
  requests: { train_number: string; station_code: string }[]
) =>
  apiFetch<{ predictions: import('../types').DelayPrediction[]; count: number; latency_ms: number }>(
    '/predict-delay/batch',
    { method: 'POST', body: JSON.stringify({ requests }) } // ✅ was "trains", must be "requests"
  );

export const predictDelayLiveBatch = (
  requests: { train_number: string; current_block: string }[]
) =>
  apiFetch<{ predictions: import('../types').DelayPrediction[]; count: number; latency_ms: number }>(
    '/predict-delay/live-batch',
    { method: 'POST', body: JSON.stringify({ requests }) }
  );

export const getTrainRoute = (trainNumber: string) =>
  apiFetch<{ train_number: string; route: { station_code: string; station_name: string }[]; count: number }>(
    `/train-route/${trainNumber}`
  );

// ── Analytics ────────────────────────────────────────────────
export const getTopDelayedTrains = (limit = 10) =>
  apiFetch<{ trains: import('../types').TopDelayedTrain[]; count: number }>(
    `/top-delayed?limit=${limit}`
  );

export const getStationStats = (station_code: string) =>
  apiFetch<import('../types').StationStats>(`/station-stats/${station_code}`);

export const getStats = () =>
  apiFetch<{
    uptime_sec: number;
    total_predictions: number;
    total_conflicts: number;
    avg_prediction_ms: number;
    errors: number;
    cache_size: number;
  }>('/stats');

// ── MILP Conflict resolution ─────────────────────────────────
export const resolveConflict = (data: {
  trainA: string;
  trainB: string;
  severity: 'low' | 'medium' | 'high';
  blockId: string;
}) =>
  apiFetch<{
    resolvedAction: string;
    explanation: object;
    latency_ms: number;
  }>('/resolve-conflict', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const optimizeSection = (data: {
  section_id: string;
  trains: import('../types').OptimizationTrainInput[];
  constraints: import('../types').OptimizationConstraints;
}) =>
  apiFetch<import('../types').SectionOptimizationResult>('/optimize-section', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const simulateScenario = (data: {
  section_id: string;
  trains: import('../types').OptimizationTrainInput[];
  constraints: import('../types').OptimizationConstraints;
  scenario: {
    target_train?: string;
    hold_minutes: number;
    reroute_train?: string;
    maintenance_blocks: string[];
    weather_factor?: number;
    platform_override: Record<string, string>;
  };
}) =>
  apiFetch<import('../types').ScenarioSimulationResult>('/simulate-scenario', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getIntegrationSources = () =>
  apiFetch<import('../types').IntegrationBlueprint>('/integration-sources');

export const saveControllerOverride = (data: {
  recommendation_id: string;
  train_number: string;
  block_id: string;
  ai_action: string;
  controller_action: string;
  reason: string;
  approved: boolean;
  expected_delay_delta: number;
}) =>
  apiFetch<{ status: string; entry: import('../types').ControllerOverrideEntry; count: number }>(
    '/controller-override',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );

export const getControllerOverrides = (limit = 20) =>
  apiFetch<{ entries: import('../types').ControllerOverrideEntry[]; count: number }>(
    `/controller-overrides?limit=${limit}`
  );

// ── Firestore Booking helpers ────────────────────────────────
import {
  collection, addDoc, getDocs, doc,
  updateDoc, query, where, orderBy
} from 'firebase/firestore';
import { db } from './firebase';
import type { Booking, Passenger } from '../types';

const LOCAL_BOOKINGS_KEY = 'trackmind.local.bookings';

function readLocalBookings(): Booking[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_BOOKINGS_KEY);
    return raw ? JSON.parse(raw) as Booking[] : [];
  } catch {
    return [];
  }
}

function writeLocalBookings(bookings: Booking[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(bookings));
}

function mergeBookings(primary: Booking[], secondary: Booking[]): Booking[] {
  const map = new Map<string, Booking>();
  [...secondary, ...primary].forEach((booking) => {
    map.set(booking.id, booking);
  });
  return [...map.values()].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
}

// Generate a random PNR
export const generatePNR = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

// Create a new booking
export const createBooking = async (
  booking: Omit<Booking, 'id' | 'pnr' | 'bookedAt'>
): Promise<Booking> => {
  const pnr = generatePNR();
  const newBooking = {
    ...booking,
    pnr,
    bookedAt: new Date().toISOString(),
    status: 'CONFIRMED' as const,
  };
  try {
    const ref = await addDoc(collection(db, 'bookings'), newBooking);
    return { ...newBooking, id: ref.id };
  } catch (error) {
    console.warn('Firestore booking write failed, using local fallback.', error);
    const localBooking: Booking = {
      ...newBooking,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    writeLocalBookings([localBooking, ...readLocalBookings()]);
    return localBooking;
  }
};

// Get all bookings for a user
export const getUserBookings = async (userId: string): Promise<Booking[]> => {
  const local = readLocalBookings().filter((booking) => booking.userId === userId);
  try {
    const q = query(
      collection(db, 'bookings'),
      where('userId', '==', userId),
      orderBy('bookedAt', 'desc')
    );
    const snap = await getDocs(q);
    const remote = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    return mergeBookings(remote, local);
  } catch (error) {
    console.warn('Firestore booking read failed, using local fallback.', error);
    return local.sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
  }
};

// Cancel a booking
export const cancelBooking = async (
  bookingId: string,
  refundAmount: number
): Promise<void> => {
  const update = {
    status: 'CANCELLED' as const,
    cancelledAt: new Date().toISOString(),
    refundAmount,
  };

  try {
    if (!bookingId.startsWith('local-')) {
      await updateDoc(doc(db, 'bookings', bookingId), update);
    }
  } catch (error) {
    console.warn('Firestore cancel failed, updating local booking instead.', error);
  }

  const local = readLocalBookings();
  const next = local.map((booking) => booking.id === bookingId ? { ...booking, ...update } : booking);
  writeLocalBookings(next);
};

// Get booking by PNR
export const getBookingByPNR = async (pnr: string): Promise<Booking | null> => {
  const normalized = pnr.toUpperCase();
  const local = readLocalBookings().find((booking) => booking.pnr === normalized) ?? null;
  try {
    const q = query(collection(db, 'bookings'), where('pnr', '==', normalized));
    const snap = await getDocs(q);
    if (snap.empty) return local;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Booking;
  } catch (error) {
    console.warn('Firestore PNR lookup failed, using local fallback.', error);
    return local;
  }
};
