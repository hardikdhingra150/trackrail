# TrackMind AI

TrackMind AI is a railway operations dashboard for monitoring live train movement, detecting block conflicts, predicting delays, and recommending controller actions in real time.

It combines a React + Vite frontend, Firebase Authentication + Firestore, and a FastAPI backend with Random Forest prediction, SHAP-based explanations, and MILP/RL-inspired conflict handling.

## What It Does

- Live train block map across `B1` to `B12`
- Delay prediction for active trains
- AI conflict detection and recommendation ranking
- Conflict resolution history and analytics views
- Controller feedback capture for recommendation quality
- Firebase-backed auth and operational data

## Stack

- Frontend: React, TypeScript, Vite, Tailwind, Recharts
- Backend: FastAPI, scikit-learn, SHAP, PuLP, pandas
- Data/Auth: Firebase Auth, Firestore

## Project Structure

```text
trackmind-ai/
├── backend/                 # FastAPI backend, ML models, training scripts
├── public/                  # Static assets
├── src/components/          # Dashboard and UI components
├── src/pages/               # Landing, login, dashboard, analytics
├── src/lib/                 # Firebase and API helpers
├── src/utils/               # Prediction, conflict, feedback, seed helpers
├── firebase.json
├── firestore.rules
└── package.json
```

## Main Features

### Dashboard

- Live train status cards
- Parallel train detail viewing
- Block occupancy map
- Conflict alerts
- AI recommendations panel

### Analytics

- Delay trend chart
- Conflict history
- RL/controller approval summary
- Block heatmap and severity breakdowns

### Backend APIs

- `POST /predict-delay`
- `POST /predict-delay/batch`
- `POST /predict-delay/live-batch`
- `POST /resolve-conflict`
- `GET /health`
- `GET /model-info`
- `GET /stats`
- `GET /top-delayed`
- `GET /station-stats/{station_code}`
- `GET /train-route/{train_number}`

## Local Setup

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Create frontend environment file

Create `.env` in the repo root with your Firebase values:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_API_URL=http://localhost:8000
```

### 3. Install backend dependencies

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Start the backend

From `backend/`:

```bash
uvicorn main:app --reload
```

The API will run at [http://localhost:8000](http://localhost:8000).

### 5. Start the frontend

From the repo root:

```bash
npm run dev
```

The app will run at [http://localhost:5173](http://localhost:5173).

## Model and Data Notes

- The backend ships with trained Random Forest artifacts in `backend/models/`
- Training and preparation utilities live in:
  - `backend/prepare_data.py`
  - `backend/train_rf.py`
  - `backend/train_rl.py`
- Explanation logic is in `backend/xai_explainer.py`

## Firebase Notes

- Firestore is used for trains, conflicts, recommendations, RL feedback, and booking data
- Firebase Auth is used for login
- Some UI views include local fallbacks when Firestore quota or seed data is incomplete

## Known Operational Notes

- If Firestore quota is exceeded, some live reseeding flows may fail temporarily
- The UI includes fallback corridor spreading so the map remains usable while backend train seeding is incomplete
- Large production assets may increase bundle size warnings during build

## Scripts

Frontend:

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

Backend:

```bash
cd backend
uvicorn main:app --reload
python3 train_rf.py
python3 seed_station_codes.py
```

## Build Check

Frontend production build:

```bash
npm run build
```

Backend syntax check:

```bash
python3 -m py_compile backend/main.py
```

## Repository

GitHub: [https://github.com/hardikdhingra150/trackrail](https://github.com/hardikdhingra150/trackrail)
