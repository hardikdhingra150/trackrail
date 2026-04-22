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

// ── Firestore Booking helpers ────────────────────────────────
import {
  collection, addDoc, getDocs, doc,
  updateDoc, query, where, orderBy, Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { Booking, Passenger } from '../types';

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
  const ref = await addDoc(collection(db, 'bookings'), newBooking);
  return { ...newBooking, id: ref.id };
};

// Get all bookings for a user
export const getUserBookings = async (userId: string): Promise<Booking[]> => {
  const q = query(
    collection(db, 'bookings'),
    where('userId', '==', userId),
    orderBy('bookedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
};

// Cancel a booking
export const cancelBooking = async (
  bookingId: string,
  refundAmount: number
): Promise<void> => {
  await updateDoc(doc(db, 'bookings', bookingId), {
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString(),
    refundAmount,
  });
};

// Get booking by PNR
export const getBookingByPNR = async (pnr: string): Promise<Booking | null> => {
  const q = query(collection(db, 'bookings'), where('pnr', '==', pnr.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Booking;
};
