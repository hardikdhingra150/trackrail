// ── RF Prediction types ──────────────────────────────────────
export interface DelayPrediction {
  train_number: string;
  station_code: string;
  station_name?: string;
  current_block?: string;
  delay_class: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  confidence: number;
  class_probabilities: { HIGH: number; LOW: number; MEDIUM: number };
  average_delay_minutes: number;
  pct_right_time: number;
  pct_significant_delay: number;
  matched_on?: string;
  explanation: {
    predicted_class: string;
    top_factor: string;
    shap_values: Record<string, number>;
    reason: string;
  };
  latency_ms: number;
  cached: boolean;
}

export type TrainStatus = "on_time" | "delayed" | "critical";

export interface FirestoreTrain {
  id: string;
  trainNumber: string;
  name: string;
  trainName?: string;
  currentBlock: string;
  nextBlock: string;
  speed: number;
  delayMinutes: number;
  priority: number;
  stationCode?: string;
  fromStation?: string;
  toStation?: string;
  departureTime?: string;
  arrivalTime?: string;
  status: TrainStatus;
}

// ── Train search types ───────────────────────────────────────
export interface Train {
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  classes: {
    [className: string]: {
      fare: number;
      seatsAvailable: number;
    };
  };
  delayClass: 'HIGH' | 'MEDIUM' | 'LOW';
  avgDelayMinutes: number;
  daysOfOperation: string[];
}

// ── Booking types ────────────────────────────────────────────
export interface Passenger {
  name: string;
  age: number;
  gender: 'M' | 'F' | 'Other';
  idType: 'Aadhaar' | 'PAN' | 'Passport' | 'Voter ID';
  idNumber: string;
  seatNumber?: string;
  berthPreference?: 'Lower' | 'Middle' | 'Upper' | 'Side Lower' | 'Side Upper' | 'No Preference';
}

export interface Booking {
  id: string;
  pnr: string;
  userId: string;
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  travelDate: string;
  seatClass: string;
  passengers: Passenger[];
  totalFare: number;
  status: 'CONFIRMED' | 'WAITLIST' | 'CANCELLED';
  bookedAt: string;
  cancelledAt?: string;
  refundAmount?: number;
}

// ── Station types ────────────────────────────────────────────
export interface Station {
  code: string;
  name: string;
  city: string;
  state: string;
}

export interface StationStats {
  station_code: string;
  avg_delay_minutes: number;
  pct_right_time: number;
  pct_significant_delay: number;
  total_trains: number;
}

export interface TopDelayedTrain {
  train_number: string;
  average_delay_minutes: number;
}

export interface JourneyLeg {
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  delayClass: 'HIGH' | 'MEDIUM' | 'LOW';
  avgDelayMinutes: number;
}

export interface JourneyPlan {
  id: string;
  type: 'DIRECT' | 'ONE_STOP';
  totalDurationMinutes: number;
  averageDelayMinutes: number;
  confidenceLabel: 'STEADY' | 'WATCH' | 'RISKY';
  transferStation?: string;
  layoverMinutes?: number;
  legs: JourneyLeg[];
}

export interface LiveRunningStatus {
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  currentStation: string;
  nextStation: string;
  currentPlatform: string;
  estimatedPlatform: string;
  status: 'ON_TIME' | 'DELAYED' | 'CRITICAL';
  delayMinutes: number;
  speedKmph: number;
  progress: number;
  scheduledArrival: string;
  estimatedArrival: string;
  route: string[];
  crowdLevel: 'LOW' | 'MODERATE' | 'HIGH';
}

export interface PlatformAlertPreference {
  trainNumber: string;
  platformAlerts: boolean;
  delayAlerts: boolean;
  boardingReminder: boolean;
  crowdAlerts: boolean;
}
