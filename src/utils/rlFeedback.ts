import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface FeedbackEntry {
  recommendationId:   string;
  conflictId:         string;
  actionType:         string;
  aiSuggestedDelay:   number;
  controllerApproved: boolean;
  actualDelaySaved?:  number;
  trainCount:         number;
  blockId:            string;
  controllerId:       string;
  severity?:          string; 
}

export async function saveFeedback(entry: FeedbackEntry) {
  // ✅ Guard: don't write if controllerId is missing
  if (!entry.controllerId || entry.controllerId === "anonymous") {
    console.warn("⚠️ saveFeedback blocked — user not authenticated");
    throw new Error("User must be authenticated to save feedback");
  }

  try {
    await addDoc(collection(db, "rl_feedback"), {
      ...entry,
      timestamp: serverTimestamp(),
    });
    console.log(`📊 RL feedback saved: ${entry.actionType} — approved: ${entry.controllerApproved}`);
  } catch (err: any) {
    console.error("❌ saveFeedback failed:", err?.message);
    throw err; // re-throw so RecommendationPanel can show toast
  }
}

export async function getRLStats() {
  try {
    const snap = await getDocs(
      query(collection(db, "rl_feedback"), orderBy("timestamp", "desc"), limit(100))
    );
    const entries = snap.docs.map((d) => d.data() as FeedbackEntry);

    const total    = entries.length;
    const approved = entries.filter((e) => e.controllerApproved).length;
    const byAction = {
      hold:    entries.filter((e) => e.actionType === "hold").length,
      slow:    entries.filter((e) => e.actionType === "slow").length,
      reroute: entries.filter((e) => e.actionType === "reroute").length,
    };
    const avgDelaySaved =
      total > 0
        ? entries.reduce((s, e) => s + (e.actualDelaySaved ?? e.aiSuggestedDelay), 0) / total
        : 0;

    return {
      total,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      byAction,
      avgDelaySaved: avgDelaySaved.toFixed(1),
    };
  } catch (err: any) {
    console.error("❌ getRLStats failed:", err?.message);
    // Return empty stats instead of crashing
    return {
      total: 0,
      approvalRate: 0,
      byAction: { hold: 0, slow: 0, reroute: 0 },
      avgDelaySaved: "0.0",
    };
  }
}