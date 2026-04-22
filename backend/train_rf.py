import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, GroupShuffleSplit
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import joblib, json

# ── Load cleaned data ────────────────────────────────────────────
df = pd.read_csv('data/cleaned_data.csv')

# Keep route/station context, but avoid the strongest leakage feature.
FEATURES = [
    'pct_right_time',
    'pct_slight_delay',
    'pct_significant_delay',
    'pct_cancelled_unknown',
    'station_code_enc',
]
TARGET = 'delay_class'

X = df[FEATURES]
y = df[TARGET]

# ✅ Group split by train_number so the same train doesn't appear
# in both train and test sets (prevents indirect leakage)
groups = df['train_number']
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
train_idx, test_idx = next(gss.split(X, y, groups))

X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
print(f"🔀 Train: {len(X_train)} | Test: {len(X_test)}")
print(f"   Train trains: {df.iloc[train_idx]['train_number'].nunique()} unique")
print(f"   Test  trains: {df.iloc[test_idx]['train_number'].nunique()} unique")

# ── Train Random Forest ──────────────────────────────────────────
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=8,
    min_samples_split=12,
    min_samples_leaf=5,
    class_weight='balanced',
    random_state=42,
    n_jobs=1
)
model.fit(X_train, y_train)
print("✅ Model trained!")

# ── Evaluate ─────────────────────────────────────────────────────
preds = model.predict(X_test)
acc   = accuracy_score(y_test, preds)
print(f"\n🎯 Test Accuracy: {acc * 100:.2f}%")
print("\n📊 Classification Report:")
print(classification_report(y_test, preds))
print("🔢 Confusion Matrix:")
print(confusion_matrix(y_test, preds, labels=['LOW', 'MEDIUM', 'HIGH']))

# ── Cross-validation (group-aware) ───────────────────────────────
cv_scores = cross_val_score(
    model, X, y,
    cv=GroupShuffleSplit(n_splits=5, test_size=0.2, random_state=42),
    groups=groups,
    scoring='accuracy',
    n_jobs=1
)
print(f"\n🔁 5-Fold Group CV Accuracy: {cv_scores.mean()*100:.2f}% ± {cv_scores.std()*100:.2f}%")

# ── Feature importances ──────────────────────────────────────────
importances = dict(zip(FEATURES, model.feature_importances_.tolist()))
print("\n📌 Feature Importances:")
for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
    print(f"   {feat:<35} {imp:.4f}")

# ── Save model + metadata ────────────────────────────────────────
joblib.dump(model, 'models/rf_model.pkl')

meta = {
    "features": FEATURES,
    "target": TARGET,
    "classes": model.classes_.tolist(),
    "accuracy": round(acc, 4),
    "cv_mean": round(cv_scores.mean(), 4),
    "feature_importances": importances,
    "n_estimators": 300,
    "model_type": "RandomForestClassifier"
}
with open('models/rf_meta.json', 'w') as f:
    json.dump(meta, f, indent=2)

print("\n💾 Model saved → models/rf_model.pkl")
print("💾 Metadata saved → models/rf_meta.json")
