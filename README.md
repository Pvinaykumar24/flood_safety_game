# 🌧️ STORMWATCH: The Last 24 Hours

### Read the rain. Predict the flood. Protect Eastbank.

STORMWATCH is an interactive city-simulation game where you become Novara’s Flood Intelligence Engineer. Explore Eastbank, investigate synthetic weather data, try real data-science tools, and deploy emergency resources while the Python flood model calculates how the city responds.

<p align="center">
  <a href="https://stormwatch-eastbank.onrender.com"><strong>▶ PLAY THE LIVE GAME</strong></a>
  &nbsp; · &nbsp;
  <a href="https://stormwatch-eastbank.onrender.com/api/health">Service health</a>
  &nbsp; · &nbsp;
  <a href="https://github.com/Pvinaykumar24/flood_safety_game">Source code</a>
</p>

> **Live demo:** [stormwatch-eastbank.onrender.com](https://stormwatch-eastbank.onrender.com) · **Health:** [API status](https://stormwatch-eastbank.onrender.com/api/health) · **Hosting:** Render free web service
>
> The live service was checked on **November 15, 2026** and returned `status: ok`. Free hosting may sleep when idle; the first visit after a quiet period can take about a minute to wake. This is a deployed educational demo, not an operational flood-warning service. Active Python sessions are temporary and can end when the service restarts. Browser campaign progress is saved locally.

---

## 🎮 Your mission

Eastbank is facing a severe rainfall event. As the Flood Intelligence Engineer, you will:

- Inspect a 32 × 24 coastal city, its hospital, school, roads, river, drainage and weather stations.
- Investigate hourly observations and use statistics to summarize rainfall.
- Smooth noisy measurements with a moving average.
- Explore rainfall and water depth with regression, predictions and residuals.
- Compare forecasts against unseen observations using MAE and RMSE.
- Spend a 100-credit emergency budget on pumps, barriers and rescue boats.
- Advance the flood simulation and see how your decisions affect access, residents and the final city report.

The city is the play space: select locations, inspect conditions, change map overlays, and place resources directly on the map.

## 🕹️ How to play

### Guided Campaign

Choose **Guided Campaign** for the Eastbank story. Follow the mission objective and compact METEO AI prompts. Each mission unlocks the next as you complete its activities; completed missions can be replayed.

1. **The First Drop** — inspect the southern weather station, reveal its six-hour rainfall record, then calculate the average.
2. **The Hidden Flood Pattern** — compare rainfall with moving averages and experiment with the smoothing window.
3. **Predict the Flood** — explore the rainfall/water-depth scatter plot, adjust a line, and fit the regression model.
4. **The Prediction Failure** — compare forecasts with actual held-out observations and inspect model errors.
5. **Save Novara** — prepare the storm, allocate response resources, run the flood, and review the final report.

### Free Play

Choose **Free Play** to explore without mission locks. Open Weather Lab and other tools when you want them, inspect city cells, toggle overlays, and set rainfall yourself.

**To run a Free Play simulation:**

1. Open **Weather Lab** and set the rainfall intensity.
2. Select **10 MIN** to advance one ten-minute step, or press **Resume** to let the simulation advance in batches. **Pause** stops the clock.
3. Turn on the **Water Depth** overlay to see the backend’s water grid on the map. Try higher rainfall and advance several steps to observe accumulation.
4. Place pumps, barriers or boats using the response controls, then advance again to compare the result.

Free Play uses the rainfall intensity you choose. The scripted Eastbank storm sequence belongs to the **Save Novara** campaign mission and starts when you prepare that storm. If you only change rainfall without advancing time, the flood simulation has not progressed yet.

### City controls

- **Pan:** click and drag the map.
- **Zoom:** use the mouse wheel or the on-screen zoom controls; reset the camera to return to the district view.
- **Inspect:** hover to highlight a cell, then click buildings, roads, monitoring stations or drainage features for details.
- **Overlays:** use the map controls to explore elevation, rainfall, water depth, drainage and flood risk.
- **Reset:** use **New Run** to create a fresh backend session. A backend restart also clears live sessions.

## 🧠 What you learn by experimenting

STORMWATCH connects data-science ideas to visible city outcomes:

| Experiment | Concept | What to look for |
|---|---|---|
| Summarize the six-hour rainfall record | Mean and descriptive statistics | One number summarizes several changing observations. |
| Change the smoothing window | Moving average | Larger windows smooth more, but can hide short rainfall bursts. |
| Adjust and fit a prediction line | Least-squares linear regression | Slope, intercept, fitted values and residual distances. |
| Compare model predictions with later observations | Chronological validation, MAE and RMSE | A model can miss; a more complex model is not guaranteed to win. |
| Inspect weather variables together | Pearson correlation | Association is not proof of causation. |
| Place resources and run the flood | Applied modeling and decision-making | Forecasts and interventions have consequences in the simulated city. |

Weather observations are synthetic and reproducible with a configured seed. Forecasts are educational estimates, not operational predictions.

## ✨ Project status

- **Playable online demo:** deployed at the link above; `/api/health` was responding when this README was updated.
- **Frontend and backend:** served together by FastAPI in the Render deployment; local development uses Vite’s `/api` proxy.
- **Simulation and analytics:** Python is authoritative for flood calculations and data-science results. Phaser renders returned state; it does not implement separate flood physics.
- **Local verification:** the latest reported backend suite passed **59 tests**, and the frontend production build succeeded. Those checks were run during the Free Play simulation fix; rerun them against your checkout before making a new release.
- **Hosting limits:** the free Render service may sleep, has temporary storage, and keeps active game sessions in memory. It is suitable for a presentation/demo, not persistent production workloads.

The flood model is intentionally simplified for learning. Read [SIMULATION_MODEL.md](SIMULATION_MODEL.md) and [ANALYTICS_MODEL.md](ANALYTICS_MODEL.md) for assumptions and limits.

## 🧰 Technology

- **Game:** TypeScript, Phaser 3.90, Vite, HTML/CSS and Chart.js.
- **Simulation API:** Python 3.11+, FastAPI, NumPy, Pydantic and Uvicorn.
- **Automated checks:** pytest and the Vite production build.
- **Map/data:** bundled local artwork and `shared/eastbank_grid.json`.

No authentication, database, paid API or cloud account is required to play locally. The live demo is hosted on Render; the game uses synthetic weather and does not call external data services during play.

## 🚀 Run locally on Windows

### Requirements

- Windows 10/11 with PowerShell 5.1 or PowerShell 7.
- Python 3.11 or newer available as `python`.
- Node.js 20 or newer with npm.

Initial setup downloads Python and JavaScript packages from their package registries. After setup, the game runs locally with its bundled assets and synthetic data.

From the project root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
.\scripts\run.ps1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API health endpoint is [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health). The launcher starts the local backend and frontend; use **Ctrl+C** in its terminal to stop them. Logs are written to `%TEMP%\stormwatch-logs`.

The setup script creates `backend/.venv` and installs dependencies. You can safely run it again if setup needs repair. The game requires no API keys or `.env` secrets. To change the local backend proxy address, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_PROXY_TARGET`.

### Run services separately

Backend terminal:

```powershell
cd .\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend terminal:

```powershell
cd .\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

## 🌐 Deployment

The repository contains `render.yaml` and a multi-stage `Dockerfile` for the current Render demo. To create your own deployment, connect the repository to Render using **New → Blueprint**, select the `main` branch, and apply the Blueprint. Render builds the frontend and serves it with FastAPI on the same origin. The configured health check is `/api/health`.

The free plan can sleep after inactivity and has ephemeral storage. Game sessions live in backend memory; a service restart, redeploy or sleep/restart cycle can end an active session. This deployment does not provide durable session storage or production availability guarantees.

## 🔌 API at a glance

- `GET /api/health` — service health.
- `/api/game/{session_id}` — create/read/reset sessions, update rainfall, advance the flood, place resources and inspect mission/scenario state.
- `/api/analytics` — statistics, moving average, regression, correlation, model evaluation, weather observations and forecasts.
- `/api/map/eastbank` — Eastbank map metadata.

The typed frontend client is in `frontend/src/api.ts`. While running locally, interactive API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## 🗂️ Project map

```text
STORMWATCH/
├── backend/app/analytics/       # Synthetic weather and NumPy data-science models
├── backend/app/simulation/      # Authoritative flood engine and emergency resources
├── backend/tests/               # Python unit, API and session tests
├── frontend/src/                # Phaser game, UI, typed API client and charts
├── frontend/public/assets/      # Bundled map artwork and media
├── shared/eastbank_grid.json    # Shared 32 × 24 map and simulation metadata
├── docs/                        # Design, learning, model and playtest documents
├── scripts/                     # Windows setup, run and QA helpers
├── ASSET_CREDITS.md             # Asset sources and license register
├── ANALYTICS_MODEL.md           # Analytics assumptions
└── SIMULATION_MODEL.md          # Flood-model assumptions
```

## ✅ Run checks

```powershell
cd .\backend
..\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
npm run build
```

More detail: [Game design](docs/GAME_DESIGN.md) · [Learning objectives](docs/LEARNING_OBJECTIVES.md) · [Mathematical models](docs/MATHEMATICAL_MODELS.md) · [System architecture](docs/SYSTEM_ARCHITECTURE.md) · [Playtest report template](docs/PLAYTEST_REPORT_TEMPLATE.md) · [Asset credits](ASSET_CREDITS.md).
