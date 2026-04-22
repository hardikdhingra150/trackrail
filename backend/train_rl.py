"""
RL Training Script — Q-Learning on conflict resolution feedback
Reads rl_feedback from Firestore and trains a simple Q-table agent.
"""

import numpy as np
import json
import os
import firebase_admin
from firebase_admin import credentials, firestore
from collections import defaultdict

# ── Firebase init ──────────────────────────────────────────────
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# ── State / Action space ───────────────────────────────────────
# State:  (severity_bin, priority_bin, block_idx, hour_bin)
# Action: 0=hold  1=slow  2=reroute
ACTIONS       = ["hold", "slow", "reroute"]
ACTION_IDX    = {a: i for i, a in enumerate(ACTIONS)}
SEVERITY_MAP  = {"low": 0, "medium": 1, "high": 2}
BLOCK_MAP     = {"B1": 0, "B2": 1, "B3": 2, "B4": 3, "B5": 4, "B6": 5}

def discretise_state(severity, priority, block, delay):
    s  = SEVERITY_MAP.get(severity, 1)
    p  = min(int(priority) - 1, 2)          # 0,1,2
    b  = BLOCK_MAP.get(block, 0)
    d  = min(int(delay) // 5, 3)            # 0-3 (0-4, 5-9, 10-14, 15+)
    return (s, p, b, d)

# ── Fetch feedback ─────────────────────────────────────────────
def fetch_feedback():
    docs = db.collection("rl_feedback").stream()
    records = []
    for doc in docs:
        d = doc.to_dict()
        records.append(d)
    print(f"Fetched {len(records)} feedback records")
    return records

# ── Q-Learning ─────────────────────────────────────────────────
def train_q_table(records, episodes=500, alpha=0.1, gamma=0.9, epsilon=0.1):
    # Q-table: dict of state → [q_hold, q_slow, q_reroute]
    Q = defaultdict(lambda: np.zeros(len(ACTIONS)))

    for episode in range(episodes):
        if not records:
            break

        # Sample a random feedback record as the "experience"
        r = records[np.random.randint(len(records))]

        severity  = r.get("severity", "medium")
        priority  = r.get("priority", 2)
        block     = r.get("blockId", "B1")
        delay     = r.get("delayMinutes", 0)
        action    = r.get("actionType", "hold")
        approved  = r.get("controllerApproved", False)
        delay_saved = r.get("actualDelaySaved", 0)

        state  = discretise_state(severity, priority, block, delay)
        a_idx  = ACTION_IDX.get(action, 0)

        # Reward: positive if approved + delay saved, negative if dismissed
        reward = (delay_saved * 0.5 + (5 if approved else -3))

        # Greedy next state (no explicit transition model — bandit-style)
        next_state = state
        best_next  = np.max(Q[next_state])

        # Q-update
        Q[state][a_idx] += alpha * (reward + gamma * best_next - Q[state][a_idx])

    return Q

# ── Evaluate ──────────────────────────────────────────────────
def evaluate(Q, records):
    correct = 0
    for r in records:
        severity = r.get("severity", "medium")
        priority = r.get("priority", 2)
        block    = r.get("blockId", "B1")
        delay    = r.get("delayMinutes", 0)
        approved = r.get("controllerApproved", False)
        action   = r.get("actionType", "hold")

        state     = discretise_state(severity, priority, block, delay)
        predicted = ACTIONS[np.argmax(Q[state])]

        if predicted == action and approved:
            correct += 1

    acc = correct / max(len(records), 1)
    return acc

# ── Save Q-table ──────────────────────────────────────────────
def save_q_table(Q):
    serialisable = {str(k): v.tolist() for k, v in Q.items()}
    with open("q_table.json", "w") as f:
        json.dump(serialisable, f, indent=2)
    print("Q-table saved → q_table.json")

# ── Stats ──────────────────────────────────────────────────────
def print_stats(records):
    total      = len(records)
    approved   = sum(1 for r in records if r.get("controllerApproved"))
    by_action  = defaultdict(int)
    delay_saved = sum(r.get("actualDelaySaved", 0) for r in records if r.get("controllerApproved"))

    for r in records:
        by_action[r.get("actionType", "unknown")] += 1

    print(f"\n{'─'*40}")
    print(f"  Total feedback records : {total}")
    print(f"  Controller approval    : {approved}/{total} ({approved/max(total,1):.0%})")
    print(f"  Total delay saved      : {delay_saved:.1f} min")
    print(f"  Actions breakdown:")
    for a, count in by_action.items():
        print(f"    {a:10s} → {count} times")
    print(f"{'─'*40}\n")

# ── Main ──────────────────────────────────────────────────────
if __name__ == "__main__":
    records = fetch_feedback()

    if len(records) < 10:
        print("⚠️  Less than 10 feedback records — generating synthetic data for demo")
        synthetic = []
        for _ in range(200):
            sev = np.random.choice(["low", "medium", "high"])
            act = np.random.choice(ACTIONS)
            synthetic.append({
                "severity":           sev,
                "priority":           np.random.randint(1, 4),
                "blockId":            np.random.choice(list(BLOCK_MAP.keys())),
                "delayMinutes":       float(np.random.randint(0, 20)),
                "actionType":         act,
                "controllerApproved": np.random.random() > 0.3,
                "actualDelaySaved":   float(np.random.randint(0, 15)),
            })
        records = synthetic

    print_stats(records)

    print("Training Q-table (500 episodes)…")
    Q = train_q_table(records, episodes=500)

    acc = evaluate(Q, records)
    print(f"✅ Q-table training complete — Accuracy: {acc:.1%}")

    save_q_table(Q)

    # Print best action per high-severity scenario
    print("\nBest actions for HIGH severity conflicts:")
    for p in [1, 2, 3]:
        for b in ["B1", "B3", "B6"]:
            state  = discretise_state("high", p, b, 10)
            best   = ACTIONS[np.argmax(Q[state])]
            q_vals = Q[state]
            print(f"  Priority {p}, Block {b} → {best:8s}  Q={q_vals.round(2)}")