import pandas as pd
from sklearn.preprocessing import LabelEncoder
import joblib, os

# ── Load raw Kaggle CSV ──────────────────────────────────────────
df = pd.read_csv('data/train_delays.csv')

print("📦 Raw shape:", df.shape)
print("📋 Columns:", df.columns.tolist())

# ── Drop non-feature columns ─────────────────────────────────────
drop_cols = ['source_url', 'train_name', 'station_name', 'scraped_at']
df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True)

# ── Drop rows with any nulls ─────────────────────────────────────
df.dropna(inplace=True)
print("✅ After dropna:", df.shape)

# ── Clamp percentage columns to 0–100 ───────────────────────────
pct_cols = ['pct_right_time', 'pct_slight_delay',
            'pct_significant_delay', 'pct_cancelled_unknown']
for col in pct_cols:
    if col in df.columns:
        df[col] = df[col].clip(0, 100)

# ── Create delay severity target label ──────────────────────────
def classify_delay(row):
    if row.get('pct_significant_delay', 0) > 40 or row.get('average_delay_minutes', 0) > 30:
        return 'HIGH'
    elif row.get('pct_slight_delay', 0) > 40 or row.get('average_delay_minutes', 0) > 10:
        return 'MEDIUM'
    else:
        return 'LOW'

df['delay_class'] = df.apply(classify_delay, axis=1)
print("📊 Class distribution:\n", df['delay_class'].value_counts())

# ── Label encode train_number and station_code ───────────────────
le_train   = LabelEncoder()
le_station = LabelEncoder()

df['train_number_enc']  = le_train.fit_transform(df['train_number'].astype(str))
df['station_code_enc']  = le_station.fit_transform(df['station_code'].astype(str))

# ── Save encoders ────────────────────────────────────────────────
os.makedirs('models', exist_ok=True)
joblib.dump(le_train,   'models/le_train.pkl')
joblib.dump(le_station, 'models/le_station.pkl')
print("💾 Encoders saved to models/")

# ── Save cleaned CSV ─────────────────────────────────────────────
os.makedirs('data', exist_ok=True)
df.to_csv('data/cleaned_data.csv', index=False)
print("💾 Cleaned data saved to data/cleaned_data.csv")
print("✅ Done. Final shape:", df.shape)