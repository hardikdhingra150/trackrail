import { collection, addDoc, getDocs, query, limit, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Train, Station } from '../types';

// ── Real Indian Railway stations ────────────────────────────
export const STATIONS: Station[] = [
  { code: 'NDLS', name: 'New Delhi', city: 'New Delhi', state: 'Delhi' },
  { code: 'NZM', name: 'Hazrat Nizamuddin', city: 'New Delhi', state: 'Delhi' },
  { code: 'DLI', name: 'Old Delhi Junction', city: 'New Delhi', state: 'Delhi' },
  { code: 'BCT', name: 'Mumbai Central', city: 'Mumbai', state: 'Maharashtra' },
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', city: 'Mumbai', state: 'Maharashtra' },
  { code: 'LTT', name: 'Lokmanya Tilak Terminus', city: 'Mumbai', state: 'Maharashtra' },
  { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai', state: 'Tamil Nadu' },
  { code: 'MS', name: 'Chennai Egmore', city: 'Chennai', state: 'Tamil Nadu' },
  { code: 'HWH', name: 'Howrah Junction', city: 'Kolkata', state: 'West Bengal' },
  { code: 'SDAH', name: 'Sealdah', city: 'Kolkata', state: 'West Bengal' },
  { code: 'SBC', name: 'KSR Bengaluru', city: 'Bengaluru', state: 'Karnataka' },
  { code: 'YPR', name: 'Yesvantpur Junction', city: 'Bengaluru', state: 'Karnataka' },
  { code: 'SC', name: 'Secunderabad Junction', city: 'Hyderabad', state: 'Telangana' },
  { code: 'HYB', name: 'Hyderabad Deccan', city: 'Hyderabad', state: 'Telangana' },
  { code: 'PUNE', name: 'Pune Junction', city: 'Pune', state: 'Maharashtra' },
  { code: 'ADI', name: 'Ahmedabad Junction', city: 'Ahmedabad', state: 'Gujarat' },
  { code: 'JP', name: 'Jaipur Junction', city: 'Jaipur', state: 'Rajasthan' },
  { code: 'LKO', name: 'Lucknow NR', city: 'Lucknow', state: 'Uttar Pradesh' },
  { code: 'KANPUR', name: 'Kanpur Central', city: 'Kanpur', state: 'Uttar Pradesh' },
  { code: 'PRYJ', name: 'Prayagraj Junction', city: 'Prayagraj', state: 'Uttar Pradesh' },
  { code: 'DDU', name: 'Deen Dayal Upadhyaya Junction', city: 'Mughalsarai', state: 'Uttar Pradesh' },
  { code: 'GAYA', name: 'Gaya Junction', city: 'Gaya', state: 'Bihar' },
  { code: 'ASN', name: 'Asansol Junction', city: 'Asansol', state: 'West Bengal' },
  { code: 'KOTA', name: 'Kota Junction', city: 'Kota', state: 'Rajasthan' },
  { code: 'RATLAM', name: 'Ratlam Junction', city: 'Ratlam', state: 'Madhya Pradesh' },
  { code: 'VAPI', name: 'Vapi', city: 'Vapi', state: 'Gujarat' },
  { code: 'AGC', name: 'Agra Cantt', city: 'Agra', state: 'Uttar Pradesh' },
  { code: 'NGP', name: 'Nagpur Junction', city: 'Nagpur', state: 'Maharashtra' },
  { code: 'VJA', name: 'Vijayawada Junction', city: 'Vijayawada', state: 'Andhra Pradesh' },
  { code: 'GWL', name: 'Gwalior Junction', city: 'Gwalior', state: 'Madhya Pradesh' },
  { code: 'KCG', name: 'Kacheguda', city: 'Hyderabad', state: 'Telangana' },
  { code: 'DMM', name: 'Dharmavaram Junction', city: 'Dharmavaram', state: 'Andhra Pradesh' },
  { code: 'BALHARSHAH', name: 'Balharshah Junction', city: 'Balharshah', state: 'Maharashtra' },
  { code: 'VADODARA', name: 'Vadodara Junction', city: 'Vadodara', state: 'Gujarat' },
  { code: 'MADGAON', name: 'Madgaon Junction', city: 'Goa', state: 'Goa' },
  { code: 'DHN', name: 'Dhanbad Junction', city: 'Dhanbad', state: 'Jharkhand' },
  { code: 'MB', name: 'Moradabad Junction', city: 'Moradabad', state: 'Uttar Pradesh' },
  { code: 'BE', name: 'Bareilly Junction', city: 'Bareilly', state: 'Uttar Pradesh' },
  { code: 'ANAND', name: 'Anand Junction', city: 'Anand', state: 'Gujarat' },
  { code: 'ALWAR', name: 'Alwar Junction', city: 'Alwar', state: 'Rajasthan' },
  { code: 'VGLB', name: 'Virangana Lakshmibai Jhansi', city: 'Jhansi', state: 'Uttar Pradesh' },
  { code: 'PNBE', name: 'Patna Junction', city: 'Patna', state: 'Bihar' },
  { code: 'BPL', name: 'Bhopal Junction', city: 'Bhopal', state: 'Madhya Pradesh' },
  { code: 'CDG', name: 'Chandigarh Junction', city: 'Chandigarh', state: 'Chandigarh' },
  { code: 'GHY', name: 'Guwahati', city: 'Guwahati', state: 'Assam' },
  { code: 'ERS', name: 'Ernakulam Junction', city: 'Kochi', state: 'Kerala' },
  { code: 'TVC', name: 'Thiruvananthapuram Central', city: 'Thiruvananthapuram', state: 'Kerala' },
  { code: 'BBS', name: 'Bhubaneswar', city: 'Bhubaneswar', state: 'Odisha' },
  { code: 'RNC', name: 'Ranchi Junction', city: 'Ranchi', state: 'Jharkhand' },
  { code: 'VSKP', name: 'Visakhapatnam Junction', city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  { code: 'NJP', name: 'New Jalpaiguri', city: 'Siliguri', state: 'West Bengal' },
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
  {
    trainNumber: '12724',
    trainName: 'Telangana Express',
    fromStation: 'NDLS',
    toStation: 'SC',
    departureTime: '16:25',
    arrivalTime: '15:00',
    durationMinutes: 1355,
    classes: {
      '2A': { fare: 2890, seatsAvailable: 42 },
      '3A': { fare: 1985, seatsAvailable: 96 },
      'SL': { fare: 760, seatsAvailable: 328 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '12432',
    trainName: 'Thiruvananthapuram Rajdhani',
    fromStation: 'NZM',
    toStation: 'TVC',
    departureTime: '06:16',
    arrivalTime: '05:20',
    durationMinutes: 2824,
    classes: {
      '2A': { fare: 3690, seatsAvailable: 38 },
      '3A': { fare: 2510, seatsAvailable: 72 },
    },
    daysOfOperation: ['Tue', 'Thu', 'Sun'],
  },
  {
    trainNumber: '12802',
    trainName: 'Purushottam Express',
    fromStation: 'NDLS',
    toStation: 'BBS',
    departureTime: '22:40',
    arrivalTime: '06:50',
    durationMinutes: 1930,
    classes: {
      '2A': { fare: 2510, seatsAvailable: 44 },
      '3A': { fare: 1710, seatsAvailable: 92 },
      'SL': { fare: 645, seatsAvailable: 356 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '12382',
    trainName: 'Poorva Express',
    fromStation: 'NDLS',
    toStation: 'HWH',
    departureTime: '17:15',
    arrivalTime: '15:20',
    durationMinutes: 1325,
    classes: {
      '1A': { fare: 3980, seatsAvailable: 12 },
      '2A': { fare: 2280, seatsAvailable: 50 },
      '3A': { fare: 1595, seatsAvailable: 84 },
      'SL': { fare: 610, seatsAvailable: 290 },
    },
    daysOfOperation: ['Mon', 'Wed', 'Fri', 'Sun'],
  },
  {
    trainNumber: '12230',
    trainName: 'Lucknow Mail',
    fromStation: 'NDLS',
    toStation: 'LKO',
    departureTime: '22:05',
    arrivalTime: '06:45',
    durationMinutes: 520,
    classes: {
      '1A': { fare: 2925, seatsAvailable: 10 },
      '2A': { fare: 1740, seatsAvailable: 28 },
      '3A': { fare: 1225, seatsAvailable: 60 },
      'SL': { fare: 455, seatsAvailable: 180 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '12958',
    trainName: 'Swarna Jayanti Rajdhani',
    fromStation: 'NZM',
    toStation: 'ADI',
    departureTime: '19:55',
    arrivalTime: '09:30',
    durationMinutes: 815,
    classes: {
      '1A': { fare: 4380, seatsAvailable: 14 },
      '2A': { fare: 2550, seatsAvailable: 42 },
      '3A': { fare: 1780, seatsAvailable: 68 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
  {
    trainNumber: '12976',
    trainName: 'Jaipur Superfast',
    fromStation: 'NDLS',
    toStation: 'JP',
    departureTime: '17:45',
    arrivalTime: '22:35',
    durationMinutes: 290,
    classes: {
      'CC': { fare: 825, seatsAvailable: 110 },
      '2S': { fare: 265, seatsAvailable: 240 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    trainNumber: '22692',
    trainName: 'Bengaluru Rajdhani',
    fromStation: 'SBC',
    toStation: 'NZM',
    departureTime: '20:20',
    arrivalTime: '05:50',
    durationMinutes: 2010,
    classes: {
      '1A': { fare: 5520, seatsAvailable: 10 },
      '2A': { fare: 3220, seatsAvailable: 34 },
      '3A': { fare: 2210, seatsAvailable: 78 },
    },
    daysOfOperation: ['Tue', 'Thu', 'Sat'],
  },
  {
    trainNumber: '12002',
    trainName: 'Bhopal Shatabdi',
    fromStation: 'NDLS',
    toStation: 'BPL',
    departureTime: '06:00',
    arrivalTime: '14:25',
    durationMinutes: 505,
    classes: {
      'EC': { fare: 1845, seatsAvailable: 24 },
      'CC': { fare: 1085, seatsAvailable: 120 },
    },
    daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
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

export const formatStationLabel = (station: Station): string =>
  `${station.city} (${station.code})`;

export const formatStationDetail = (station: Station): string =>
  `${station.name}, ${station.state}`;

export const searchStations = (query: string): Station[] => {
  const q = query.trim().toLowerCase();
  const scored = STATIONS.map((station) => {
    const code = station.code.toLowerCase();
    const name = station.name.toLowerCase();
    const city = station.city.toLowerCase();
    const state = station.state.toLowerCase();
    const haystack = `${code} ${name} ${city} ${state}`;

    let score = 0;
    if (!q) score = 1;
    else if (code === q || name === q || city === q) score = 100;
    else if (code.startsWith(q)) score = 90;
    else if (city.startsWith(q)) score = 80;
    else if (name.startsWith(q)) score = 70;
    else if (haystack.includes(q)) score = 50;

    return { station, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.station.city.localeCompare(b.station.city));

  return scored.map((item) => item.station);
};

export const resolveStationQuery = (query: string): Station | undefined => {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  return searchStations(q).find((station) => {
    const code = station.code.toLowerCase();
    const name = station.name.toLowerCase();
    const city = station.city.toLowerCase();
    const label = formatStationLabel(station).toLowerCase();
    return code === q || name === q || city === q || label === q;
  }) ?? searchStations(q)[0];
};

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

export const getFareForClass = (train: Train, cls: string): number =>
  train.classes[cls]?.fare ?? 0;
