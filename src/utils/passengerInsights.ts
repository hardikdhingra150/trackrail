import type {
  JourneyLeg,
  JourneyPlan,
  LiveRunningStatus,
  PlatformAlertPreference,
  Train,
} from "../types";
import {
  TRAINS,
  formatDuration,
  getStationName,
  resolveStationQuery,
} from "./seedData";

const ROUTE_LOOKUP: Record<string, string[]> = {
  "12301": ["NDLS", "KANPUR", "PRYJ", "DDU", "ASN", "HWH"],
  "12951": ["NDLS", "KOTA", "RATLAM", "VAPI", "BCT"],
  "12621": ["NDLS", "AGC", "BPL", "NGP", "VSKP", "VJA", "MAS"],
  "12259": ["NDLS", "DDU", "GAYA", "ASN", "SDAH", "HWH"],
  "22691": ["NDLS", "GWL", "BPL", "NGP", "KCG", "DMM", "SBC"],
  "12724": ["NDLS", "AGC", "BPL", "NGP", "BALHARSHAH", "SC"],
  "12432": ["NZM", "KOTA", "VADODARA", "MADGAON", "ERS", "TVC"],
  "12802": ["NDLS", "KANPUR", "PRYJ", "GAYA", "DHN", "BBS"],
  "12382": ["NDLS", "DDU", "GAYA", "DHN", "HWH"],
  "12230": ["NDLS", "MB", "BE", "LKO"],
  "12958": ["NZM", "KOTA", "RATLAM", "ANAND", "ADI"],
  "12976": ["NDLS", "ALWAR", "JP"],
  "22692": ["SBC", "DMM", "KCG", "NGP", "BPL", "NZM"],
  "12002": ["NDLS", "AGC", "GWL", "VGLB", "BPL"],
};

const LOCAL_ALERTS_KEY = "trackmind.platform.alerts";

function enrichTrain(train: Omit<Train, "delayClass" | "avgDelayMinutes">): Train {
  const seed = Number(train.trainNumber.slice(-2)) || 1;
  const delayClass: Train["delayClass"] = seed % 5 === 0 ? "HIGH" : seed % 2 === 0 ? "MEDIUM" : "LOW";
  const avgDelayMinutes = delayClass === "HIGH" ? 38 : delayClass === "MEDIUM" ? 14 : 4;
  return { ...train, delayClass, avgDelayMinutes };
}

export function getPassengerTrains(): Train[] {
  return TRAINS.map(enrichTrain);
}

export function getTrainRoute(trainNumber: string): string[] {
  const train = TRAINS.find((item) => item.trainNumber === trainNumber);
  if (!train) return [];
  return ROUTE_LOOKUP[trainNumber] ?? [train.fromStation, train.toStation];
}

function addMinutesToTime(time: string, minutesToAdd: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = (hours * 60) + mins + minutesToAdd;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function delayTone(delayClass: Train["delayClass"]): JourneyPlan["confidenceLabel"] {
  if (delayClass === "HIGH") return "RISKY";
  if (delayClass === "MEDIUM") return "WATCH";
  return "STEADY";
}

function legFromTrain(train: Train): JourneyLeg {
  return {
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    fromStation: train.fromStation,
    toStation: train.toStation,
    departureTime: train.departureTime,
    arrivalTime: train.arrivalTime,
    durationMinutes: train.durationMinutes,
    delayClass: train.delayClass,
    avgDelayMinutes: train.avgDelayMinutes,
  };
}

export function buildJourneyPlans(fromQuery: string, toQuery: string): JourneyPlan[] {
  const from = resolveStationQuery(fromQuery)?.code;
  const to = resolveStationQuery(toQuery)?.code;
  if (!from || !to || from === to) return [];

  const trains = getPassengerTrains();

  const direct = trains
    .filter((train) => train.fromStation === from && train.toStation === to)
    .map((train) => ({
      id: `direct-${train.trainNumber}`,
      type: "DIRECT" as const,
      totalDurationMinutes: train.durationMinutes,
      averageDelayMinutes: train.avgDelayMinutes,
      confidenceLabel: delayTone(train.delayClass),
      legs: [legFromTrain(train)],
    }));

  const oneStop: JourneyPlan[] = [];
  const firstLegs = trains.filter((train) => train.fromStation === from && train.toStation !== to);
  const secondLegs = trains.filter((train) => train.toStation === to && train.fromStation !== from);

  firstLegs.forEach((first) => {
    secondLegs.forEach((second) => {
      if (first.toStation !== second.fromStation) return;

      const firstArrival = Number(first.arrivalTime.split(":")[0]) * 60 + Number(first.arrivalTime.split(":")[1]);
      const secondDeparture = Number(second.departureTime.split(":")[0]) * 60 + Number(second.departureTime.split(":")[1]);
      const layoverMinutes = secondDeparture >= firstArrival ? secondDeparture - firstArrival : (1440 - firstArrival) + secondDeparture;
      if (layoverMinutes < 45 || layoverMinutes > 360) return;

      const averageDelayMinutes = Math.round((first.avgDelayMinutes + second.avgDelayMinutes) / 2);
      const totalDurationMinutes = first.durationMinutes + second.durationMinutes + layoverMinutes;
      const label =
        first.delayClass === "HIGH" || second.delayClass === "HIGH"
          ? "RISKY"
          : first.delayClass === "MEDIUM" || second.delayClass === "MEDIUM"
            ? "WATCH"
            : "STEADY";

      oneStop.push({
        id: `one-stop-${first.trainNumber}-${second.trainNumber}`,
        type: "ONE_STOP",
        transferStation: first.toStation,
        layoverMinutes,
        totalDurationMinutes,
        averageDelayMinutes,
        confidenceLabel: label,
        legs: [legFromTrain(first), legFromTrain(second)],
      });
    });
  });

  return [...direct, ...oneStop]
    .sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes || a.averageDelayMinutes - b.averageDelayMinutes)
    .slice(0, 8);
}

export function searchPassengerTrains(query: string): Train[] {
  const q = query.trim().toLowerCase();
  if (!q) return getPassengerTrains();
  return getPassengerTrains().filter((train) =>
    train.trainNumber.toLowerCase().includes(q) ||
    train.trainName.toLowerCase().includes(q) ||
    getStationName(train.fromStation).toLowerCase().includes(q) ||
    getStationName(train.toStation).toLowerCase().includes(q)
  );
}

export function getLiveStatus(query: string): LiveRunningStatus[] {
  return searchPassengerTrains(query).map((train) => {
    const route = getTrainRoute(train.trainNumber);
    const seed = Number(train.trainNumber.slice(-2)) || 1;
    const routeIndex = Math.min(Math.max(seed % Math.max(route.length - 1, 1), 0), Math.max(route.length - 2, 0));
    const currentStation = route[routeIndex] ?? train.fromStation;
    const nextStation = route[routeIndex + 1] ?? train.toStation;
    const delayMinutes = train.delayClass === "HIGH" ? 44 : train.delayClass === "MEDIUM" ? 16 : 5;
    const speedKmph = 58 + (seed % 7) * 8;
    const progress = Math.min(92, Math.max(8, Math.round(((routeIndex + 1) / route.length) * 100)));
    const platformBase = (seed % 8) + 1;
    const status = train.delayClass === "HIGH" ? "CRITICAL" : train.delayClass === "MEDIUM" ? "DELAYED" : "ON_TIME";
    const estimatedArrival = addMinutesToTime(train.arrivalTime, delayMinutes);
    const crowdLevel: LiveRunningStatus["crowdLevel"] =
      seed % 5 === 0 ? "HIGH" : seed % 2 === 0 ? "MODERATE" : "LOW";

    return {
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      fromStation: train.fromStation,
      toStation: train.toStation,
      currentStation,
      nextStation,
      currentPlatform: `PF ${platformBase}`,
      estimatedPlatform: `PF ${platformBase + (seed % 2)}`,
      status,
      delayMinutes,
      speedKmph,
      progress,
      scheduledArrival: train.arrivalTime,
      estimatedArrival,
      route,
      crowdLevel,
    };
  });
}

export function getPlatformForecast(trainNumber: string) {
  const status = getLiveStatus(trainNumber)[0];
  if (!status) return null;

  return {
    ...status,
    coachZone: ["A", "B", "C", "D"][Number(status.trainNumber.slice(-1)) % 4],
    boardingWindow: `${Math.max(5, 18 - Math.round(status.delayMinutes / 4))} min`,
    recommendation:
      status.crowdLevel === "HIGH"
        ? "Reach the platform 20 minutes early and use the far coach entry."
        : status.delayMinutes > 15
          ? "Watch for last-minute platform adjustment before boarding."
          : "Boarding conditions are stable right now.",
  };
}

export function readPlatformAlertPreference(trainNumber: string): PlatformAlertPreference {
  if (typeof window === "undefined") {
    return {
      trainNumber,
      platformAlerts: true,
      delayAlerts: true,
      boardingReminder: true,
      crowdAlerts: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_ALERTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PlatformAlertPreference[]) : [];
    return parsed.find((item) => item.trainNumber === trainNumber) ?? {
      trainNumber,
      platformAlerts: true,
      delayAlerts: true,
      boardingReminder: true,
      crowdAlerts: false,
    };
  } catch {
    return {
      trainNumber,
      platformAlerts: true,
      delayAlerts: true,
      boardingReminder: true,
      crowdAlerts: false,
    };
  }
}

export function writePlatformAlertPreference(preference: PlatformAlertPreference) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LOCAL_ALERTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PlatformAlertPreference[]) : [];
    const next = [
      preference,
      ...parsed.filter((item) => item.trainNumber !== preference.trainNumber),
    ];
    window.localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(next));
  } catch {
    window.localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify([preference]));
  }
}

export function formatJourneyDuration(minutes: number) {
  return formatDuration(minutes);
}

