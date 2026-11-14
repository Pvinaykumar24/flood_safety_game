# STORMWATCH: The Last 24 Hours

STORMWATCH is a local, interactive 2D flood-simulation learning game. As Novara's Flood Intelligence Engineer, the player studies Eastbank weather observations, experiments with statistics and forecasting, deploys emergency resources on the city map, and sees the consequences during a seeded 24-hour rainfall event.

## Game objectives

Players explore a 32×24 coastal city map, inspect weather stations and infrastructure, summarize six-hour rainfall, smooth changing trends, fit and evaluate rainfall-to-water-depth models, identify vulnerable cells, and protect the hospital, school, roads and residences with a 100-credit response budget. The five campaign missions are **The First Drop**, **The Hidden Flood Pattern**, **Predict the Flood**, **The Prediction Failure**, and **Save Novara**. The final report uses actual simulation metrics to select an ending.

## Technology stack

- Frontend: TypeScript, Phaser 3.90, Vite, HTML/CSS and Chart.js.
- Backend: Python 3.11+, FastAPI, NumPy, Pydantic and Uvicorn.
- Tests: pytest.
- Data: authored JSON Eastbank grid and deterministic synthetic weather. No database, cloud service, authentication or paid API.

Python is the source of truth for flood calculations, analytics, forecasts, resources and scoring. The Phaser game renders backend snapshots. The frontend contains no independent flood physics. The Vite development server proxies `/api` to FastAPI on port 8000.

## Prerequisites

- Windows 10/11, PowerShell 5.1 or PowerShell 7.
- Python 3.11 or newer available as `python`.
- Node.js 20 or newer with npm.

First setup downloads packages from PyPI and the npm registry. Once installed, gameplay runs locally with bundled assets and synthetic data, without cloud access or external API calls.

## First-time setup

From the project root in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
```

The setup script creates `backend/.venv`, installs `backend/requirements.txt`, and installs the locked frontend dependencies with `npm ci` when the lockfile is present. It can be run again safely.

## Environment configuration

The game does not require API keys, cloud credentials, or a database. Vite proxies requests to the local FastAPI server at `http://127.0.0.1:8000` by default. To use a different local backend address, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_PROXY_TARGET`. Local `.env` files are ignored by Git; never put passwords or tokens in the example file.

## Run the game

From the project root:

```powershell
.\scripts\run.ps1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API is at [http://127.0.0.1:8000](http://127.0.0.1:8000), with health check [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health). Press Ctrl+C in the launcher terminal to stop both local services. Logs are written to `%TEMP%\stormwatch-logs`.

For separate terminals, run:

```powershell
cd .\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
cd .\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

## How to play

Drag the map to pan; use the mouse wheel and zoom controls to inspect Eastbank. Hover over cells and click buildings, monitoring stations, roads and drainage features to see their details. Toggle map overlays for elevation, rainfall, water depth, drainage and flood risk. Follow the mission checklist and contextual METEO AI hints. Experiment in the data tools, then prepare the storm, place response resources on valid map cells/edges, and advance or pause the simulation. After the 144 ten-minute steps, review the city outcome and score. A new run uses the backend; backend restart clears live sessions. Campaign progress is saved in browser local storage.

The 100-credit resource set contains a drainage pump (40), flood barrier (25) and rescue boat (35). Resource placement, water response, access, evacuations, scoring and ending are computed from the Python session state.

## Data Science concepts

- Descriptive statistics: mean, median, minimum, maximum and population standard deviation.
- Trailing moving averages and the effect of window size on noisy trends.
- Simple least-squares regression of rainfall intensity against water depth.
- Manual regression line experiments, residuals, slope, intercept and predictions.
- Chronological training/holdout separation; MAE and RMSE on shared held-out observations.
- Pearson correlation, with the reminder that correlation does not establish causation.

All weather is synthetic and seeded. Forecasts are educational, not operational predictions. See [docs/LEARNING_OBJECTIVES.md](docs/LEARNING_OBJECTIVES.md) and [docs/MATHEMATICAL_MODELS.md](docs/MATHEMATICAL_MODELS.md).

## API structure

The FastAPI backend exposes `GET /api/health`; game session routes under `/api/game/{session_id}` for state, rainfall, advance, resource placement, scenario, objectives, risks and reset; analysis routes under `/api/analytics` for statistics, moving average, regression, correlation, evaluation and forecasts; plus `/api/analytics/weather`, `/api/analytics/lab` and `/api/map/eastbank`. Interactive requests use the typed client in `frontend/src/api.ts`, not ad hoc fetch calls in each game component. API docs are available at `http://127.0.0.1:8000/docs` while running.

## Project structure

```text
STORMWATCH/
├── backend/app/analytics/       # NumPy weather and data-science models
├── backend/app/simulation/      # Authoritative flood engine and resources
├── backend/tests/               # pytest unit and API/session tests
├── docs/                         # Design, learning, model, architecture, playtest docs
├── frontend/src/                 # Phaser game, UI, typed API, charts and styles
├── frontend/public/assets/       # Locally bundled map atlas and media
├── scripts/                      # Windows setup and run scripts
├── shared/eastbank_grid.json    # Shared map and simulation metadata
├── ASSET_CREDITS.md              # Asset provenance and licenses
├── ANALYTICS_MODEL.md            # Detailed analytics assumptions
└── SIMULATION_MODEL.md           # Detailed flood-model assumptions
```

## QA commands

```powershell
cd .\backend
..\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
npm run build
```

Additional details: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md), [docs/PLAYTEST_REPORT_TEMPLATE.md](docs/PLAYTEST_REPORT_TEMPLATE.md), [SIMULATION_MODEL.md](SIMULATION_MODEL.md), [ANALYTICS_MODEL.md](ANALYTICS_MODEL.md), and [ASSET_CREDITS.md](ASSET_CREDITS.md).
