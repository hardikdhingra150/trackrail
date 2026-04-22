import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
import random
import time
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable

firebase_admin.initialize_app(credentials.Certificate("serviceAccountKey.json"))
db = firestore.client()

df = pd.read_csv("data/train_delays.csv")

# Use dataset-provided names and a primary station per train
trains = (
    df.groupby("train_number")
      .agg(
          train_name=("train_name", "first"),
          primary_station=("station_code", "first"),
          avg_delay=("average_delay_minutes", "mean"),
      )
      .reset_index()
)

BLOCKS = [f"B{i}" for i in range(1, 13)]
PRIORITIES = [1, 1, 1, 2, 2, 3]

print(f"Seeding {len(trains)} trains...")
print("♻️ Using lightweight upsert mode to avoid full-collection deletes")

def write_with_retry(ref, payload, retries=5):
    delay_sec = 1.0
    for attempt in range(retries):
        try:
            ref.set(payload, merge=True)
            return True
        except (ResourceExhausted, ServiceUnavailable) as exc:
            if attempt == retries - 1:
                print(f"❌ Failed after retries for {payload['trainNumber']}: {exc}")
                return False
            print(f"⏳ Backing off for {payload['trainNumber']} ({attempt + 1}/{retries}) due to quota/service limits...")
            time.sleep(delay_sec)
            delay_sec *= 2
    return False

written = 0
failed = 0

for _, row in trains.iterrows():
    train_num = str(int(row["train_number"]))
    avg_delay = float(row["avg_delay"]) if pd.notna(row["avg_delay"]) else 0.0

    if avg_delay > 20:
        status = "critical"
    elif avg_delay > 8:
        status = "delayed"
    else:
        status = "on_time"

    current_idx = random.randint(0, len(BLOCKS) - 1)
    current_block = BLOCKS[current_idx]
    next_idx = min(current_idx + 1, len(BLOCKS) - 1)

    doc = {
        "trainNumber":  train_num,
        "name":         row["train_name"],        # ✅ from dataset
        "stationCode":  row["primary_station"],   # ✅ real station code
        "currentBlock": current_block,
        "nextBlock":    BLOCKS[next_idx],
        "speed":        random.randint(40, 110),
        "delayMinutes": round(avg_delay),
        "priority":     random.choice(PRIORITIES),
        "status":       status,
    }

    ref = db.collection("trains").document(train_num)
    if write_with_retry(ref, doc):
        written += 1
        print(f"✅ {train_num} | {row['train_name']} | {row['primary_station']} | {current_block} | {status}")
    else:
        failed += 1

print(f"\n🚂 Done! {written} trains upserted, {failed} failed")
