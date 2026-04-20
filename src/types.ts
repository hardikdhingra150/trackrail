// src/types.ts

export type TrainStatus = "on_time" | "delayed" | "critical";

export interface Train {
  id:              string;
  trainNumber:     string;
  name:            string;
  trainName?:      string;
  priority:        number;
  status?:         TrainStatus;        // ← optional, not string
  delayMinutes:    number;
  speed:           number;
  currentBlock:    string;
  nextBlock:       string;
  origin?:         string;
  destination?:    string;
  platform?:       string;
  currentSection?: string;
  scheduledTime?:  string;
  eta?:            string;
  etaToNextBlock?: number;
  sectionId?:      string;
}