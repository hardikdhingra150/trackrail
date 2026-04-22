export interface Recommendation {
    id:          string;
    action:      string;       // "HOLD" | "SLOW" | "REROUTE"
    trainNumber: string;
    blockId:     string;
    description: string;
    delaySaved:  number;
    status:      string;       // "pending" | "applied" | "dismissed"
    trainCount:  number;
    createdAt:   number;
    [key: string]: unknown;
  }
  
  /**
   * Returns deduplicated recommendations.
   * Keeps the most recent entry per (action + trainNumber + blockId) group.
   * Always preserves "applied" and "dismissed" entries (never dedup those out).
   */
  export function dedupeRecs(recs: Recommendation[]): Recommendation[] {
    // Sort newest first so we keep the latest per group
    const sorted = [...recs].sort((a, b) => b.createdAt - a.createdAt);
  
    const seen  = new Set<string>();
    const result: Recommendation[] = [];
  
    for (const rec of sorted) {
      // Never deduplicate already-actioned cards
      if (rec.status === "applied" || rec.status === "dismissed") {
        result.push(rec);
        continue;
      }
  
      const key = `${rec.action}|${rec.trainNumber}|${rec.blockId}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(rec);
      }
    }
  
    // Re-sort: applied first, then by delaySaved desc
    return result.sort((a, b) => {
      if (a.status === "applied" && b.status !== "applied") return -1;
      if (b.status === "applied" && a.status !== "applied") return  1;
      return b.delaySaved - a.delaySaved;
    });
  }