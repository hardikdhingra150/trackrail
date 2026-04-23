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

export interface OptimizationTrainInput {
  train_number: string;
  current_block: string;
  priority: number;
  delay_minutes: number;
  speed_kmph: number;
  status: string;
  direction: 'up' | 'down';
  requested_platform?: string;
}

export interface OptimizationConstraints {
  headway_seconds: number;
  line_capacity: number;
  platform_capacity: number;
  maintenance_blocks: string[];
  weather_factor: number;
  gradient_penalty: number;
  signal_spacing_penalty: number;
  loop_availability: Record<string, number>;
}

export interface PrecedencePlanItem {
  rank: number;
  train_number: string;
  current_block: string;
  action: string;
  hold_minutes: number;
  precedence_score: number;
  reason: string;
}

export interface CrossingPlanItem {
  block_id: string;
  winner_train: string;
  held_trains: string[];
  loop_used: boolean;
  expected_spacing_minutes: number;
  explanation: string;
}

export interface PlatformPlanItem {
  train_number: string;
  assigned_platform: string;
  reason: string;
  occupancy_load: number;
}

export interface OptimizationRecommendation {
  train_number: string;
  current_block: string;
  action_type: string;
  hold_minutes: number;
  assigned_platform: string;
  estimated_delay_reduction_min: number;
  confidence: number;
  explanation: string;
}

export interface SectionOptimizationResult {
  section_id: string;
  objective_score: number;
  throughput_trains_per_hour: number;
  average_travel_time_reduction_min: number;
  precedence_plan: PrecedencePlanItem[];
  crossing_plan: CrossingPlanItem[];
  platform_plan: PlatformPlanItem[];
  recommendations: OptimizationRecommendation[];
  constraint_snapshot: OptimizationConstraints;
  conflict_free: boolean;
  kpis: {
    active_conflicts: number;
    maintenance_hits: number;
    headway_pressure: number;
    platform_utilization_pct: number;
  };
  latency_ms: number;
}

export interface ScenarioSimulationResult {
  baseline: Omit<SectionOptimizationResult, 'latency_ms'>;
  scenario: Omit<SectionOptimizationResult, 'latency_ms'>;
  delta: {
    throughput_delta: number;
    travel_time_reduction_delta: number;
    objective_delta: number;
    conflict_delta: number;
  };
  latency_ms: number;
}

export interface IntegrationSourceStatus {
  name: string;
  type: string;
  status: string;
  latency_ms: number;
  security: string;
  payloads: string[];
}

export interface IntegrationBlueprint {
  sources: IntegrationSourceStatus[];
  api_contracts: string[];
}

export interface ControllerOverrideEntry {
  recommendation_id: string;
  train_number: string;
  block_id: string;
  ai_action: string;
  controller_action: string;
  reason: string;
  approved: boolean;
  expected_delay_delta: number;
  timestamp: number;
}
