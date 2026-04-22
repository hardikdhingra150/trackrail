import { collection, addDoc, getDocs, query, limit, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Train, Station } from '../types';

// ── Real Indian Railway stations ────────────────────────────
export const STATIONS: Station[] = [
  { code: 'NDLS', name: 'New Delhi',        city: 'New Delhi', state: 'Delhi' },
  { code: 'BCT',  name: 'Mumbai Central',   city: 'Mumbai',    state: 'Maharashtra' },
  { code: 'MAS',  name: 'Chennai Central',  city: 'Chennai',   state: 'Tamil Nadu' },
  { code: 'HWH',  name: 'Howrah Junction',  city: 'Kolkata',   state: 'West Bengal' },
  { code: 'SBC',  name: 'KSR Bengaluru',    city: 'Bengaluru', state: 'Karnataka' },
  { code: 'PUNE', name: 'Pune Junction',    city: 'Pune',      state: 'Maharashtra' },
  { code: 'ADI',  name: 'Ahmedabad Jn',     city: 'Ahmedabad', state: 'Gujarat' },
  { code: 'JP',   name: 'Jaipur Junction',  city: 'Jaipur',    state: 'Rajasthan' },
  { code: 'LKO',  name: 'Lucknow NR',       city: 'Lucknow',   state: 'Uttar Pradesh' },
  { code: 'HYB',  name: 'Hyderabad Deccan', city: 'Hyderabad', state: 'Telangana' },
  { code: 'PNBE', name: 'Patna Junction',   city: 'Patna',     state: 'Bihar' },
  { code: 'BPL',  name: 'Bhopal Junction',  city: 'Bhopal',    state: 'Madhya Pradesh' },
  { code: 'CDG',  name: 'Chandigarh',       city: 'Chandigarh',state: 'Punjab' },
  { code: 'GHY',  name: 'Guwahati',         city: 'Guwahati',  state: 'Assam' },
  { code: 'ERS',  name: 'Ernakulam Jn',     city: 'Kochi',     state: 'Kerala' },
];

// ── Seed train catalog into Firestore (run once) ─────────────
export const TRAINS: Omit<Train, 'delayClass' | 'avgDelayMinutes'>[] = [
  {
    trainNumber: '12301',
    trainName: 'Howrah Rajdhani Express',
    fromStation: 'NDLS',
    toStation: 'HWH',
    departureTime: '16:55',
    arrivalTime: '09:55',
    durationMinutes: 1020,
    classes: {
      '1A': { fare: 4200, seatsAvailable: 18 },
      '2A': { fare: 2490, seatsAvailable: 46 },
      '3A': { fare: 1745, seatsAvailable: 64 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '12951',
    trainName: 'Mumbai Rajdhani Express',
    fromStation: 'NDLS',
    toStation: 'BCT',
    departureTime: '16:00',
    arrivalTime: '08:35',
    durationMinutes: 985,
    classes: {
      '1A': { fare: 4730, seatsAvailable: 18 },
      '2A': { fare: 2755, seatsAvailable: 52 },
      '3A': { fare: 1920, seatsAvailable: 64 },
    },
    daysOfOperation: ['Mon', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '12621',
    trainName: 'Tamil Nadu Express',
    fromStation: 'NDLS',
    toStation: 'MAS',
    departureTime: '22:30',
    arrivalTime: '07:40',
    durationMinutes: 1750,
    classes: {
      '2A': { fare: 3100, seatsAvailable: 46 },
      '3A': { fare: 2105, seatsAvailable: 128 },
      'SL': { fare: 735,  seatsAvailable: 432 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '12259',
    trainName: 'Sealdah Duronto Express',
    fromStation: 'NDLS',
    toStation: 'HWH',
    departureTime: '20:05',
    arrivalTime: '11:30',
    durationMinutes: 925,
    classes: {
      '1A': { fare: 4100, seatsAvailable: 18 },
      '2A': { fare: 2400, seatsAvailable: 46 },
      '3A': { fare: 1680, seatsAvailable: 128 },
    },
    daysOfOperation: ['Tue', 'Fri', 'Sun'],
  },
  {
    trainNumber: '22691',
    trainName: 'Rajdhani Express (Bengaluru)',
    fromStation: 'NDLS',
    toStation: 'SBC',
    departureTime: '20:00',
    arrivalTime: '06:15',
    durationMinutes: 1815,
    classes: {
      '1A': { fare: 5500, seatsAvailable: 18 },
      '2A': { fare: 3200, seatsAvailable: 46 },
      '3A': { fare: 2200, seatsAvailable: 64 },
    },
    daysOfOperation: ['Mon', 'Wed', 'Fri'],
  },
];

// ── Seed Firestore once ───────────────────────────────────────
export const seedFirestoreTrains = async (): Promise<void> => {
  const snap = await getDocs(query(collection(db, 'trains'), limit(1)));
  if (!snap.empty) {
    console.log('✅ Firestore trains already seeded — skipping');
    return;
  }

  const batch = writeBatch(db);
  TRAINS.forEach(train => {
    const ref = doc(collection(db, 'trains'));
    batch.set(ref, {
      ...train,
      delayClass: 'LOW',       // will be updated by RF API at runtime
      avgDelayMinutes: 0,
    });
  });
  await batch.commit();
  console.log(`✅ Seeded ${TRAINS.length} trains to Firestore`);
};

// ── Helpers ───────────────────────────────────────────────────
export const getStationByCode = (code: string): Station | undefined =>
  STATIONS.find(s => s.code === code);

export const getStationName = (code: string): string =>
  STATIONS.find(s => s.code === code)?.name ?? code;

export const searchStations = (query: string): Station[] => {
  const q = query.toLowerCase();
  return STATIONS.filter(
    s =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q)
  );
};

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

export const getFareForClass = (train: Train, cls: string): number =>
  train.classes[cls]?.fare ?? 0;