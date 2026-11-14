import Phaser from 'phaser';
import Chart from 'chart.js/auto';
import { EastbankScene } from './EastbankScene';
import {
  advanceGame,
  ApiError,
  buildPredictionLab,
  evaluateModels,
  forecast as requestForecast,
  newGame,
  placeResource,
  reportMissionObjective,
  resetGame,
  startFloodScenario,
  setRainfall,
  calculateStatistics,
  calculateMovingAverage,
  fitRegression,
  identifyRisk,
} from './api';
import type { FloodOverlay, GameState, MapCell, PredictionLabData, Resource } from './types';
import {
  campaignStages, isStageUnlocked, loadCampaignProgress, markCampaignObjective,
  resetCampaignProgress, saveModelChoice, saveWindowChoice, selectCampaignStage,
  saveTutorialCheckpoint, type CampaignProgress, type CampaignStageId, type TutorialCheckpoint,
} from './scenario';
import './style.css';
import { createUiStateStore, type ActivityMode } from './uiState';
import { GuidedTutorial, type TutorialStep } from './GuidedTutorial';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand"><b>S</b><span>STORMWATCH<small>THE LAST 24 HOURS</small></span></a>
    <div class="top-mission"><small>ACTIVE OPERATION</small><b id="top-mission">THE FIRST DROP</b></div>
    <div class="sim-clock"><small>SIMULATION TIME</small><b id="sim-time">DAY 01 · 00:00</b></div>
    <div id="weather-warning" class="weather-warning"><i></i><span>STORM WATCH <small id="warning-level">COASTAL WARNING</small></span></div>
    <div class="top-metric"><small>RAIN</small><b id="top-rain">—<em> mm/h</em></b></div>
    <div class="budget"><small>BUDGET</small><b id="budget">—</b></div>
    <button id="game-mode-toggle" class="mode-toggle" type="button" title="Switch between the guided campaign and free play">GUIDED</button>
    <button id="new-run" class="top-icon-button" title="Start a fresh Eastbank run and clear saved campaign progress" aria-label="New run">＋</button>
    <button id="reset-game" class="top-icon-button" title="Restart the campaign from Mission 1 and clear saved progress" aria-label="Reset run">↺</button>
    <button id="pause" class="pause" title="Pause or resume simulation advancement">Ⅱ &nbsp;PAUSE</button>
  </header>
  <main class="layout">
    <section class="left-panel panel mission-strip" aria-label="Current mission">
      <div class="mission-title-block"><div class="mission-kicker">MISSION <b id="campaign-count">01 / 05</b></div><h1 id="campaign-title">The First Drop</h1><p class="mission-copy" id="campaign-copy">Read the station record. The storm's first signal is hidden in six hourly measurements.</p></div>
      <div class="mission-progress-block" id="mission-progress-block"><div class="mission-progress-label"><span id="mission-progress-label">0 / 2 OBJECTIVES</span><details class="mission-list" id="mission-list"><summary>MISSION LIST</summary><nav class="campaign-stages" id="campaign-stages" aria-label="Eastbank mission stages"></nav></details></div><progress id="mission-progress" max="100" value="0" aria-label="Mission progress"></progress><div class="objectives" id="campaign-objectives" aria-live="polite"></div></div>
      <aside class="meteo-card" aria-label="METEO AI mission guide"><div class="meteo-head"><span>✳ &nbsp;METEO AI GUIDE</span><i>FIELD TIP</i></div><p class="guide-task" id="guide-task">Current task: inspect a weather station.</p><p id="meteo">Monitoring Eastbank rainfall, river crossings and low-lying access roads.</p><div class="guide-actions"><button id="guide-action" class="guide-action" type="button">OPEN WEATHER LAB</button><button id="next-story" class="text-button" title="Ask METEO AI for a hint">HINT</button><button id="tutorial-replay" class="tutorial-replay" type="button" hidden>REPLAY GUIDE</button></div><span id="story" hidden></span></aside>
    </section>

    <section class="city-view">
      <div class="city-heading"><div><div class="district-line">COASTAL RESPONSE NETWORK &nbsp; / &nbsp; DISTRICT 03</div><h1>EASTBANK <span>·</span> RIVERWARD LOWLANDS</h1></div><div class="grid-readout">32 × 24 <small>TILE GRID</small></div></div>
      <div class="map-frame">
        <div class="map-topline"><span>◈ &nbsp;EASTBANK FIELD MAP</span><span id="map-status">WAITING FOR PYTHON SIMULATION</span><span class="cam-help">DRAG PAN <b>·</b> WHEEL ZOOM <b>·</b> ZOOM 1×–2.8×</span></div>
        <div class="overlay-bar"><span>MAP LAYERS</span>
          <button class="layer-button" data-overlay="elevation" title="Show elevation in metres">⌁ ELEVATION</button>
          <button class="layer-button" data-overlay="rainfall" title="Show local rainfall intensity">▤ RAINFALL</button>
          <button class="layer-button" data-overlay="water" title="Show calculated water depth">≈ WATER DEPTH</button>
          <button class="layer-button" data-overlay="drainage" title="Highlight channels, inlets and drainage capacity">▦ DRAINAGE</button>
          <button class="layer-button" data-overlay="risk" title="Show Python-computed flood risk index">◉ FLOOD RISK</button>
          <button id="advance-step" class="step-button" title="Advance the backend simulation by one ten-minute step">▶ &nbsp;10 MIN</button>
          <button id="zoom-out" class="icon-button" title="Zoom out">−</button><button id="zoom-in" class="icon-button" title="Zoom in">+</button><button id="reset-view" class="icon-button reset" title="Reset city camera">⌖ RESET VIEW</button>
        </div>
        <div id="game"><div id="map-tooltip"></div><div id="map-loading">CONNECTING TO EASTBANK SIMULATION…</div></div>
        <div class="map-footer"><div class="map-key"><span><i class="key-river"></i>RIVER / CANAL</span><span><i class="key-road"></i>ROAD / BRIDGE</span><span><i class="key-hospital">+</i>HOSPITAL</span><span><i class="key-school">S</i>SCHOOL</span><span><i class="key-weather">⌁</i>WEATHER STATION</span><span><i class="key-drain">▦</i>DRAIN INLET</span></div><div id="map-readout">SELECT A CITY TILE TO INSPECT</div></div>
      </div>
      <div class="geography-note"><b>EASTBANK GENERAL</b> sits beside the shallow hospital approach. The blue river hugs the western edge; the drainage canal feeds into it.</div>
      <div class="hover-readout" id="hover-readout">Move over the city to read terrain and coordinates.</div>
    </section>

    <aside id="context-panel" class="right-panel context-panel panel" data-activity="location" hidden aria-label="Contextual information">
      <header class="context-heading"><div><span id="context-eyebrow">LOCATION DETAILS</span><h2 id="context-title">Eastbank</h2></div><button id="close-context" class="close-context" type="button" aria-label="Close information panel" title="Close panel">×</button></header>
      <div id="scenario-actions" class="scenario-actions"></div>
      <section id="context-location" class="context-section">
        <section class="selected-card"><div class="selected-icon" id="selected-icon">⌖</div><div><h3 id="selected-name">Select a location</h3><p id="selected-subtitle">Click the hospital, a building or map feature.</p></div></section>
        <div class="detail-grid"><div><small>GRID COORDINATE</small><b id="selected-coord">—</b></div><div><small>ELEVATION</small><b id="selected-elevation">—</b></div><div><small>WATER DEPTH</small><b id="selected-depth">—</b></div><div><small>PREDICTED DEPTH</small><b id="selected-predicted">—</b></div><div><small>FLOOD RISK</small><b id="selected-risk">—</b></div></div>
        <button id="mark-risk" class="text-button risk-mark" disabled>MARK THIS CELL AS HIGH RISK</button>
        <div class="section-title">GROUND & DRAINAGE</div><div class="drainage-details"><div><span>Drainage capacity</span><b id="selected-drainage">—</b></div><div><span>Infiltration</span><b id="selected-infiltration">—</b></div><div><span>Impervious surface</span><b id="selected-impervious">—</b></div></div>
      </section>
      <section id="context-weather" class="context-section" hidden>
        <p class="context-copy">Live station readings for the selected location.</p>
        <div id="station-current-readings" class="station-current-readings" hidden>
          <div><small>STATION</small><b id="station-current-name">—</b></div>
          <div><small>RAINFALL</small><b id="station-current-rain">—</b></div>
          <div><small>TEMPERATURE</small><b id="station-current-temperature">—</b></div>
          <div><small>WIND SPEED</small><b id="station-current-wind">—</b></div>
        </div>
        <button id="weather-history-button" class="context-primary" type="button">INSPECT HISTORICAL DATA</button>
        <div class="section-title">CURRENT RAINFALL <span>PYTHON SIMULATION</span></div>
        <label class="rainfall-control"><span><b id="rainfall-value">0</b> mm/h</span><input id="rainfall-control" type="range" min="0" max="120" step="1" value="0" title="Set rainfall intensity in the Python simulation" /><small>Changes update the active Python session.</small></label>
        <div class="section-title">WEATHER STATIONS</div><div class="weather-cards" id="weather-cards"><div class="weather-placeholder">Weather station reports load from the simulation service.</div></div>
      </section>
      <section id="context-response" class="context-section" hidden>
        <div class="section-title resources-title">RESPONSE EQUIPMENT <span>SELECT · PLACE · CONFIRM</span></div><div id="resources" class="resources"><div class="weather-placeholder">Resource inventory loading…</div></div>
        <label id="barrier-direction-wrap" class="barrier-direction" hidden>Barrier edge direction<select id="barrier-direction"><option value="N">North edge</option><option value="E">East edge</option><option value="S">South edge</option><option value="W">West edge</option></select></label>
        <div class="placement-actions"><b id="placement-cost">NO EQUIPMENT SELECTED</b><button id="confirm-placement" class="forecast-button" disabled>CONFIRM PLACEMENT</button><button id="cancel-placement" class="text-button" disabled>CANCEL</button></div>
        <p class="response-hint" id="response-hint">Select equipment, preview a map location and confirm deployment.</p><div class="response-outcome" id="response-outcome">City outcome will update from Python simulation results.</div>
      </section>
      <section id="context-workbench" class="context-section" hidden aria-label="Data workbench">
        <section id="prediction-lab" class="prediction-lab" aria-label="Eastbank field workbench" hidden>
          <div class="lab-heading"><div><span id="lab-eyebrow">STAGE 1 · OBSERVE</span><h3 id="lab-title">Six hours before landfall</h3></div><span class="workbench-live">PYTHON DATA</span></div>
          <p class="lab-briefing" id="lab-briefing">Choose a station to inspect its hourly record, then calculate the average rainfall for the six-hour watch.</p>
          <div class="lab-controls"><label>MONITORING STATION<select id="lab-station" title="Choose a weather monitoring station"><option>Loading stations…</option></select></label><label id="window-control" hidden>SMOOTHING WINDOW <span><output id="window-output">6</output> readings</span><input id="lab-window" type="range" min="2" max="12" value="6" title="Adjust the number of rainfall readings in each moving average" /></label></div>
          <div id="lab-chart-wrap" class="lab-chart-wrap"><canvas id="regression-chart" aria-label="Rainfall and water-depth training scatter plot with a fitted regression line"></canvas></div>
          <div id="mission1-trend-action" hidden><button id="reveal-trend" class="context-primary" type="button">REVEAL RAINFALL TREND</button></div>
          <p id="trend-interpretation" class="trend-interpretation" hidden></p>
          <div class="lab-metrics" id="lab-metrics">Choose an experiment to see calculated results.</div><div id="lab-correlations" class="lab-correlations" aria-label="Weather correlation observations"></div>
          <div id="forecast-controls" class="lab-controls forecast-controls" hidden><label>TEST RAINFALL <span><output id="lab-rain-output">35</output> mm/h</span><input id="lab-rainfall" type="range" min="0" max="120" step="1" value="35" title="Set a rainfall intensity to forecast" /></label><label>FORECAST STEPS <span><output id="lab-horizon-output">6</output> × 10 min</span><input id="lab-horizon" type="range" min="1" max="12" step="1" value="6" title="Choose the forecast duration" /></label><button id="run-forecast" class="forecast-button" title="Forecast water depth for the selected rainfall">RUN FORECAST ↗</button></div>
          <div id="lab-forecast-output" class="lab-forecast-output">Choose an analysis tool to begin.</div><p id="lab-note" class="lab-note">Results are calculated by the Python service.</p>
        </section>
        <section id="mission-complete-summary" class="mission-complete-summary" hidden>
          <span class="summary-kicker">EASTBANK FIELD REPORT</span><h3>Mission complete</h3>
          <p id="mission-discovery">You discovered how rainfall changed during the six-hour watch.</p>
          <div class="summary-reward"><span>MISSION POINTS</span><b id="mission-points">100</b></div>
          <button id="next-mission" class="context-primary" type="button">NEXT MISSION · THE HIDDEN FLOOD PATTERN</button>
        </section>
      </section>
    </aside>
  </main>
  <nav class="mode-dock" aria-label="Game navigation">
    <button data-mode="simulation" class="mode-button active"><i>⌖</i><span>EXPLORE CITY</span></button>
    <button data-mode="analysis" class="mode-button"><i>⌁</i><span>WEATHER LAB</span></button>
    <button data-mode="prediction" class="mode-button"><i>◉</i><span>PREDICTION LAB</span></button>
    <button data-mode="response" class="mode-button"><i>✚</i><span>RESCUE OPERATIONS</span></button>
  </nav>`;

// Keep the workbench chart in one Chart.js instance and move its host into a
// large, dismissible dialog while expanded. This preserves its live data and drag handlers.
const graphHost = document.querySelector<HTMLElement>('#lab-chart-wrap')!;
const graphCanvas = document.querySelector<HTMLCanvasElement>('#regression-chart')!;
const graphPlaceholder = document.createComment('graph workbench position');
graphHost.parentElement?.insertBefore(graphPlaceholder, graphHost);
const graphDialog = document.createElement('dialog');
graphDialog.className = 'graph-dialog';
graphDialog.setAttribute('aria-labelledby', 'expanded-graph-title');
graphDialog.setAttribute('aria-describedby', 'expanded-graph-description');
graphDialog.innerHTML = '<header><div><small>STORMWATCH DATA LAB</small><h2 id="expanded-graph-title">Explore the chart</h2></div><button type="button" aria-label="Close expanded graph">CLOSE ×</button></header><p id="expanded-graph-description">Use the axes and legend to compare the observations. The displayed values come from the Python analysis service.</p>';
document.body.append(graphDialog);
graphDialog.querySelector('button')!.addEventListener('click', () => graphDialog.close());
graphDialog.addEventListener('close', () => {
  if (graphPlaceholder.parentNode) graphPlaceholder.parentNode.insertBefore(graphHost, graphPlaceholder);
  graphDialog.appendChild(graphCanvas);
  graphHost.appendChild(graphCanvas);
  syncGraphExpandVisibility();
  requestAnimationFrame(() => predictionChart?.resize());
});
const expandGraph = document.createElement('button');
expandGraph.type = 'button';
expandGraph.className = 'graph-expand-button';
expandGraph.textContent = 'EXPAND GRAPH ⤢';
expandGraph.title = 'Open this chart in a larger view';
graphHost.insertAdjacentElement('afterend', expandGraph);
function syncGraphExpandVisibility() {
  expandGraph.hidden = graphHost.hidden || graphDialog.open;
}
new MutationObserver(syncGraphExpandVisibility).observe(graphHost, { attributes: true, attributeFilter: ['hidden'] });
syncGraphExpandVisibility();
expandGraph.addEventListener('click', () => {
  expandGraph.hidden = true;
  graphDialog.appendChild(graphHost);
  graphDialog.showModal();
  requestAnimationFrame(() => predictionChart?.resize());
});
const briefingDialog = document.createElement('dialog');
briefingDialog.className = 'briefing-dialog';
briefingDialog.innerHTML = '<small class="briefing-kicker"></small><h2></h2><p></p><button type="button">UNDERSTOOD</button>';
document.body.append(briefingDialog);
briefingDialog.querySelector('button')!.addEventListener('click', () => briefingDialog.close());
function showBriefing(title: string, message: string, kind = 'info') {
  briefingDialog.dataset.kind = kind;
  briefingDialog.querySelector('.briefing-kicker')!.textContent = kind === 'warning' ? 'NOVARA EMERGENCY ALERT' : 'EASTBANK FIELD REPORT';
  briefingDialog.querySelector('h2')!.textContent = title;
  briefingDialog.querySelector('p')!.textContent = message;
  if (!briefingDialog.open) briefingDialog.showModal();
}

type Mode = ActivityMode;
const uiState = createUiStateStore();
let mapData: GameState | null = null;
let scene: EastbankScene;
let activeOverlay: FloodOverlay = null;
let paused = false;
let simMinutes = 0;
let budget = 50000;
let inventory: Resource[] = [];
let chosenResource: Resource | null = null;
let pendingPlacement: { cell: MapCell; valid: boolean } | null = null;
let barrierDirection: 'N' | 'E' | 'S' | 'W' = 'N';
let selectedCell: MapCell | null = null;
let historicalDataRevealed = false;
let lastMeteoContextStep = -3;
let sessionId: string | null = null;
let gameState: GameState | null = null;
let predictionLabData: PredictionLabData | null = null;
let predictionChart: Chart<'scatter', { x: number; y: number }[]> | null = null;
let forecastChartPoints: { x: number; y: number }[] = [];
let campaignProgress: CampaignProgress = loadCampaignProgress();
let windowSizesTried = new Set<number>();
let stageChartRequestId = 0;
let manualLine: { x: [number, number]; y: [number, number] } | null = null;
let manualLineResult: Awaited<ReturnType<typeof fitRegression>>['manual_line'] | null = null;
let manualLineDebounce: number | undefined;
let draggingManualEndpoint: 0 | 1 | null = null;
let selectedEvaluationModel: 'moving_average' | 'linear_regression' = campaignProgress.selectedModel ?? 'moving_average';
let scenarioHistory: Array<{ x: number; y: number; rainfall: number }> = [];
let labRequestId = 0;
let stateActionQueue: Promise<unknown> = Promise.resolve();
let advanceInFlight = false;
let rainfallDebounce: number | undefined;
let newGameInFlight = false;
let sessionUnavailable = false;
const completed = new Set<string>();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let guidedTutorial: GuidedTutorial;

function notify(message: string) { $('meteo').textContent = message; }

const guidePrompts: Record<CampaignStageId, { task: string; action: string; mode: Mode }> = {
  'first-drop': { task: 'Inspect a weather station, then compare its six hourly readings.', action: 'OPEN WEATHER LAB', mode: 'analysis' },
  'hidden-pattern': { task: 'Adjust the smoothing window and choose a useful rainfall trend.', action: 'OPEN MOVING AVERAGE', mode: 'analysis' },
  'predict-flood': { task: 'Explore the rainfall and water-depth relationship.', action: 'OPEN PREDICTION LAB', mode: 'prediction' },
  'prediction-failure': { task: 'Compare both models on observations they did not train on.', action: 'COMPARE FORECASTS', mode: 'prediction' },
  'save-novara': { task: 'Protect the hospital road and nearby homes as the storm arrives.', action: 'OPEN RESCUE OPERATIONS', mode: 'response' },
};

const firstDropTutorial: TutorialStep[] = [
  {
    id: 'mission-introduction', title: 'The First Drop',
    explanation: 'Eastbank has received unusual rainfall. We need to understand what the southern gauge has been recording.',
    story: 'Eastbank has received unusual rainfall. Let’s start with the southern monitoring station.',
    target: { type: 'element', selector: '#guide-action' }, targetLabel: 'Start Mission',
    requiredAction: 'start-first-drop', hint: 'Start the mission to focus on the southern station and begin your investigation.',
    feedback: 'Mission started. Find the pulsing station on the southeast side of the map.', unlocksAfter: [],
    validate: (result: unknown) => typeof result === 'object' && result !== null && 'started' in result && result.started === true,
  },
  {
    id: 'inspect-southern-station', title: 'Inspect the southern station',
    explanation: 'Eastbank is receiving unusual rainfall. Select the highlighted station to read its current conditions.',
    story: 'Eastbank is receiving unusual rainfall. Let’s inspect the southern monitoring station.',
    target: { type: 'map-location', locationId: 'weather-south' }, targetLabel: 'Southern weather station',
    requiredAction: 'inspect-southern-station', hint: 'Look near the southeast edge of the city map for the gold weather marker.',
    feedback: 'Good. We have the southern station’s current weather readings.', unlocksAfter: ['mission-introduction'],
    validate: (result: unknown) => typeof result === 'object' && result !== null
      && 'stationId' in result && result.stationId === 'weather-south',
    formatResult: (result: unknown) => `${(result as { stationName: string }).stationName} is now selected.`,
  },
  {
    id: 'inspect-six-hour-record', title: 'Open the six-hour record',
    explanation: 'Use the station panel to open its historical data. The six readings will appear as a rainfall graph.',
    story: 'Good. We have six hours of rainfall observations. Let’s see how the rainfall changed.',
    target: { type: 'element', selector: '#weather-history-button' }, targetLabel: 'Inspect historical data',
    requiredAction: 'inspect-historical-data', unlocksAfter: ['inspect-southern-station'],
    hint: 'The selected station panel has an “Inspect historical data” button.',
    feedback: 'The six hourly observations are displayed from the session data.',
    validate: (result: unknown) => typeof result === 'object' && result !== null
      && 'stationId' in result && 'readingCount' in result && 'chartReady' in result
      && Boolean(result.stationId === 'weather-south' && result.readingCount === 6 && result.chartReady),
    formatResult: (result: unknown) => `${(result as { readingCount: number }).readingCount} readings are ready to compare.`,
  },
  {
    id: 'calculate-six-hour-average', title: 'Calculate the average',
    explanation: 'Calculate the mean using the Python service. Watch how one value summarizes the six hourly readings.',
    story: 'Now summarize the six readings. The average gives us one measure of the rainfall across the watch.',
    target: { type: 'element', selector: '#show-average' }, targetLabel: 'Calculate six-hour average',
    requiredAction: 'calculate-six-hour-average', unlocksAfter: ['inspect-southern-station', 'inspect-six-hour-record'],
    hint: 'The highlighted button sends these six rainfall values to Python for the statistics calculation.',
    feedback: 'Python returned the average. The gold line now marks that result on the graph.',
    validate: (result: unknown) => typeof result === 'object' && result !== null
      && 'stationId' in result && 'count' in result && 'mean' in result && 'apiSucceeded' in result
      && result.stationId === 'weather-south' && result.count === 6
      && typeof result.mean === 'number' && Number.isFinite(result.mean) && result.apiSucceeded === true,
    formatResult: (result: unknown) => `Mean rainfall: ${(result as { mean: number }).mean.toFixed(1)} mm/h.`,
  },
  {
    id: 'discover-rainfall-trend', title: 'Discover the rainfall trend',
    explanation: 'Reveal the trend view and compare the early readings with the final hour.',
    story: 'The mean summarizes the watch. Now look at the sequence to see whether rainfall rose or eased.',
    target: { type: 'element', selector: '#reveal-trend' }, targetLabel: 'Reveal rainfall trend',
    requiredAction: 'reveal-rainfall-trend', unlocksAfter: ['calculate-six-hour-average'],
    hint: 'The trend view keeps all six measured hours visible and highlights how they changed.',
    feedback: 'The rainfall sequence shows the storm’s change over time.',
    validate: (result: unknown) => typeof result === 'object' && result !== null && 'visible' in result && result.visible === true,
  },
  {
    id: 'complete-first-drop', title: 'Mission complete',
    explanation: 'Review what you found, then continue to the rainfall-pattern investigation.',
    story: 'We have a useful rainfall summary and a clear view of the changing storm. Eastbank is ready for the next analysis.',
    target: { type: 'element', selector: '#next-mission' }, targetLabel: 'Next mission',
    requiredAction: 'start-next-mission', unlocksAfter: ['discover-rainfall-trend'],
    hint: 'Your mission report records the average, the observed trend, and your earned points.',
    feedback: 'The First Drop report is ready.',
    validate: (result: unknown) => typeof result === 'object' && result !== null && 'missionUnlocked' in result && result.missionUnlocked === true,
  },
];

const successfulAction = (result: unknown) => typeof result === 'object' && result !== null
  && 'success' in result && result.success === true;
const stageTutorials: Partial<Record<CampaignStageId, TutorialStep[]>> = {
  'first-drop': firstDropTutorial,
  'hidden-pattern': [
    { id: 'mission-introduction', title: 'Find the rainfall pattern', explanation: 'Rainfall pulses up and down. We will look at the record before choosing how much to smooth it.', story: 'The rainfall record is noisy. Let’s open the weather lab and inspect the signal.', target: { type: 'element', selector: '#guide-action' }, targetLabel: 'Open weather lab', requiredAction: 'open-stage-lab', feedback: 'The rainfall experiment is ready.', hint: 'Open the Weather Lab to begin.', validate: successfulAction },
    { id: 'reveal-rainfall-graph', title: 'Read the rainfall record', explanation: 'Start with the measured rainfall. Look for a sharp pulse that is hard to separate from the surrounding changes.', story: 'Here is the measured sequence. Inspect its peaks before smoothing it.', target: { type: 'element', selector: '#reveal-stage-graph' }, targetLabel: 'Show rainfall graph', requiredAction: 'reveal-stage-graph', unlocksAfter: ['mission-introduction'], feedback: 'The original rainfall sequence is visible.', hint: 'Show the measured rainfall first; no smoothing has been applied yet.', validate: successfulAction },
    { id: 'reveal-window-control', title: 'Choose how much to smooth', explanation: 'A window averages nearby observations. Reveal the control, then compare different window sizes.', story: 'Now choose how many nearby readings should be averaged together.', target: { type: 'element', selector: '#reveal-window-control' }, targetLabel: 'Reveal window size', requiredAction: 'reveal-window-control', unlocksAfter: ['reveal-rainfall-graph'], feedback: 'The window-size control is ready.', hint: 'The control changes how many consecutive readings contribute to each smoothed point.', validate: successfulAction },
    { id: 'compare-window-sizes', title: 'Compare two windows', explanation: 'Move the slider to a different window size. Wait for Python to return the smoothed series, then try one more size.', story: 'Try two different windows. A larger window smooths more, but can hide a short burst.', target: { type: 'element', selector: '#lab-window' }, targetLabel: 'Smoothing window', requiredAction: 'moving-average-computed', unlocksAfter: ['reveal-window-control'], feedback: 'The smoothed series is calculated from your selected windows.', hint: 'Use at least two distinct window sizes. Each result comes from the Python moving-average endpoint.', validate: (result: unknown) => typeof result === 'object' && result !== null && 'success' in result && result.success === true && 'windowCount' in result && Number(result.windowCount) >= 2 },
    { id: 'choose-window', title: 'Choose a useful window', explanation: 'Select the window that reveals the broader trend without hiding the storm pulse.', story: 'Commit to the window that gives you the clearest useful signal.', target: { type: 'element', selector: '#choose-window' }, targetLabel: 'Use this window', requiredAction: 'choose-window', unlocksAfter: ['compare-window-sizes'], feedback: 'Your chosen smoothing window is saved to the campaign.', hint: 'Look for a smoother line that still responds to important changes.', validate: successfulAction },
  ],
  'predict-flood': [
    { id: 'mission-introduction', title: 'Estimate the hospital flood', explanation: 'Eastbank General sits in a low basin. First inspect how historical rainfall and water depth relate.', story: 'The hospital approach is vulnerable. Let’s build an estimate from the station record.', target: { type: 'element', selector: '#guide-action' }, targetLabel: 'Open prediction lab', requiredAction: 'open-stage-lab', feedback: 'Historical observations are loaded for the lab.', hint: 'Open the Prediction Lab to begin.', validate: successfulAction },
    { id: 'reveal-regression-scatter', title: 'Inspect historical observations', explanation: 'Each point pairs rainfall with measured water depth. Reveal the scatter plot before drawing a model.', story: 'The historical observations are ready. Put rainfall on the horizontal axis and water depth on the vertical axis.', target: { type: 'element', selector: '#reveal-regression-scatter' }, targetLabel: 'Show scatter plot', requiredAction: 'reveal-regression-scatter', unlocksAfter: ['mission-introduction'], feedback: 'The training observations are shown as a scatter plot.', hint: 'Only the training observations appear at first; held-out data stays out of model fitting.', validate: successfulAction },
    { id: 'enable-manual-line', title: 'Try a prediction line', explanation: 'Enable a line you can adjust by dragging its orange endpoints.', story: 'Make a first estimate yourself. Try to keep the vertical gaps from observations small.', target: { type: 'element', selector: '#enable-manual-line' }, targetLabel: 'Enable manual line', requiredAction: 'enable-manual-line', unlocksAfter: ['reveal-regression-scatter'], feedback: 'The manual line can now be adjusted on the chart.', hint: 'The line is your estimate of water depth at each rainfall intensity.', validate: successfulAction },
    { id: 'adjust-manual-line', title: 'Adjust your line', explanation: 'Drag an orange endpoint. Python will calculate the resulting predictions and residuals.', story: 'Move one endpoint and inspect how far your line misses the training observations.', target: { type: 'element', selector: '#regression-chart' }, targetLabel: 'Manual prediction line', requiredAction: 'manual-line-adjusted', unlocksAfter: ['enable-manual-line'], feedback: 'Your edited line was evaluated by Python.', hint: 'Drag an orange endpoint; the dashed vertical segments show the residual distances.', validate: successfulAction },
    { id: 'calculate-best-fit', title: 'Compare with the best fit', explanation: 'Ask Python to calculate the least-squares line from the training observations.', story: 'Now compare your line with the best-fit line calculated from the training data.', target: { type: 'element', selector: '#fit-best-line' }, targetLabel: 'Calculate best fit', requiredAction: 'calculate-best-fit', unlocksAfter: ['adjust-manual-line'], feedback: 'The slope and intercept come from the actual training observations.', hint: 'The least-squares line minimizes squared residuals on the training set.', validate: successfulAction },
    { id: 'run-rainfall-forecast', title: 'Forecast a rainfall scenario', explanation: 'Choose a rainfall intensity and ask the trained model for a water-level estimate.', story: 'Use the fitted model to estimate water depth for a rainfall level you choose.', target: { type: 'element', selector: '#run-forecast' }, targetLabel: 'Run forecast', requiredAction: 'rainfall-forecast', unlocksAfter: ['calculate-best-fit'], feedback: 'The forecast is returned by the Python service using the selected station model.', hint: 'Set the rainfall slider, then run the forecast.', validate: successfulAction },
  ],
  'prediction-failure': [
    { id: 'mission-introduction', title: 'Can the models generalize?', explanation: 'Two forecasts were prepared for later observations. Compare their predictions before revealing what actually happened.', story: 'A model can fit history and still fail later. Let’s examine two forecasts on unseen observations.', target: { type: 'element', selector: '#guide-action' }, targetLabel: 'Open model lab', requiredAction: 'open-stage-lab', feedback: 'The two model predictions are ready.', hint: 'Open the Prediction Lab to compare the held-out period.', validate: successfulAction },
    { id: 'reveal-predictions', title: 'Compare the forecasts', explanation: 'See the moving-average baseline and regression predictions first. The actual depths remain hidden for now.', story: 'Compare the two forecast traces before checking the outcome.', target: { type: 'element', selector: '#reveal-model-predictions' }, targetLabel: 'Show predictions', requiredAction: 'reveal-model-predictions', unlocksAfter: ['mission-introduction'], feedback: 'Both predictions are visible on the same held-out timeline.', hint: 'The models will be compared on the same unseen observations.', validate: successfulAction },
    { id: 'reveal-actual-observations', title: 'Reveal what happened', explanation: 'Add the measured depths to see where each forecast missed.', story: 'Now reveal the actual observations. Notice which prediction stays closer.', target: { type: 'element', selector: '#reveal-actual-observations' }, targetLabel: 'Reveal actual depths', requiredAction: 'reveal-actual-observations', unlocksAfter: ['reveal-predictions'], feedback: 'Actual held-out water depths are now shown.', hint: 'Look for gaps between each prediction and the measured water depth.', validate: successfulAction },
    { id: 'calculate-model-errors', title: 'Calculate forecast error', explanation: 'Calculate MAE and RMSE against the same unseen observations.', story: 'Let Python score both models on the shared validation data.', target: { type: 'element', selector: '#calculate-model-errors' }, targetLabel: 'Calculate MAE and RMSE', requiredAction: 'calculate-model-errors', unlocksAfter: ['reveal-actual-observations'], feedback: 'Both metrics came from the Python evaluation endpoint.', hint: 'MAE measures typical miss size; RMSE weighs large misses more.', validate: successfulAction },
    { id: 'select-evaluation-model', title: 'Choose a model', explanation: 'Use the shared validation scores to choose which model to trust for the response plan.', story: 'Which model performed better on these unseen observations? Select it for the response plan.', target: { type: 'element', selector: '#scenario-actions' }, targetLabel: 'Select a model', requiredAction: 'select-evaluation-model', unlocksAfter: ['calculate-model-errors'], feedback: 'Your model choice is saved for the final operation.', hint: 'Compare both MAE and RMSE; a lower score means smaller errors on this validation set.', validate: successfulAction },
  ],
  'save-novara': [
    { id: 'mission-introduction', title: 'Prepare Eastbank', explanation: 'The flood-risk map shows where water may threaten roads and buildings. Review it before choosing equipment.', story: 'Landfall is near. Start with the risk map, then plan a response for the hospital and neighbourhoods.', target: { type: 'element', selector: '#review-risk-map' }, targetLabel: 'Review risk map', requiredAction: 'review-risk-map', feedback: 'The Python flood-risk overlay is active.', hint: 'The risk layer is calculated from the current simulation grid.', validate: successfulAction },
    { id: 'reveal-response-resources', title: 'Review available equipment', explanation: 'Compare the pump, barrier and boat costs with your 100-credit budget before deployment.', story: 'Your budget is limited. Review equipment and its cost before placing anything.', target: { type: 'element', selector: '#open-response-resources' }, targetLabel: 'Confirm equipment review', requiredAction: 'open-response-resources', unlocksAfter: ['mission-introduction'], feedback: 'Available resources and costs are displayed.', hint: 'The inventory comes from the active Python session.', validate: successfulAction },
    { id: 'place-response-resource', title: 'Deploy a resource', explanation: 'Select equipment, place it on the map, and confirm. The step completes only after Python accepts it.', story: 'Choose a location where the equipment can operate and confirm the deployment.', target: { type: 'element', selector: '#resources' }, targetLabel: 'Place emergency equipment', requiredAction: 'place-resource', unlocksAfter: ['reveal-response-resources'], feedback: 'The backend confirmed the deployment and charged its cost.', hint: 'Watch the placement preview; invalid locations are rejected before confirmation.', validate: successfulAction },
    { id: 'start-eastbank-storm', title: 'Start the storm', explanation: 'Run the synthetic Eastbank rainfall timeline after placing your first resource.', story: 'Your first response asset is in place. Start the storm when ready.', target: { type: 'element', selector: '#start-scenario' }, targetLabel: 'Start the storm', requiredAction: 'start-eastbank-storm', unlocksAfter: ['place-response-resource'], feedback: 'The 24-hour scenario is active in the backend.', hint: 'Starting the storm begins the configured rainfall sequence.', validate: successfulAction },
    { id: 'advance-eastbank-storm', title: 'Watch the city respond', explanation: 'Advance at least one ten-minute step and observe the water-depth overlay.', story: 'Advance the simulation to see how the city responds to rainfall and your resources.', target: { type: 'element', selector: '#run-response' }, targetLabel: 'Run the response simulation', requiredAction: 'advance-eastbank-storm', unlocksAfter: ['start-eastbank-storm'], feedback: 'Water depths updated from the Python flood engine.', hint: 'Resume the scenario and wait for a backend simulation step.', validate: successfulAction },
    { id: 'evaluate-city-report', title: 'Read the final city report', explanation: 'Finish the rainfall scenario, then evaluate access and protection outcomes.', story: 'When the storm timeline ends, request the final report for the hospital, school and roads.', target: { type: 'element', selector: '#evaluate-access' }, targetLabel: 'Evaluate city access', requiredAction: 'evaluate-city-report', unlocksAfter: ['advance-eastbank-storm'], feedback: 'The final report reflects simulated flooding and resource placements.', hint: 'The evaluation unlocks when the complete synthetic storm has run.', validate: successfulAction },
  ],
};

guidedTutorial = new GuidedTutorial({
  resolveMapTarget: locationId => scene?.getTutorialLocationRect(locationId) ?? null,
  focusMapTarget: locationId => scene?.setTutorialFocus(locationId),
  persist: (missionId, checkpoint) => {
    if (campaignStages.some(stage => stage.id === missionId)) {
      campaignProgress = saveTutorialCheckpoint(campaignProgress, missionId as CampaignStageId, checkpoint);
    }
  },
  onMessage: message => notify(message),
  onStepChanged: step => {
    const skipped = guidedTutorial?.isSkipped() ?? false;
    const guided = uiState.getState().gameMode === 'guided-campaign';
    // The storm can finish while the player is reading the previous step. If
    // they advance the guide afterwards, validate this step against the Python
    // session state instead of requiring another (now impossible) tick.
    if (step?.id === 'advance-eastbank-storm'
      && (gameState?.scenario_progress.step ?? 0) > 0
      && !campaignProgress.tutorialProgress['save-novara']?.completedStepIds.includes(step.id)) {
      queueMicrotask(() => guidedTutorial.completeAction('advance-eastbank-storm', { success: true }));
    }
    $('tutorial-replay').hidden = !guided;
    document.body.dataset.tutorialMission = campaignProgress.stageId;
    document.body.dataset.tutorialStep = step?.id ?? 'complete';
    if (step) $('guide-task').textContent = `STEP · ${step.title} — ${step.explanation}`;
    else $('guide-task').textContent = skipped ? 'GUIDE SKIPPED · Mission objectives remain available.' : 'MISSION GUIDE COMPLETE · Continue exploring Eastbank or replay these instructions.';
    const intro = step?.id === 'mission-introduction' || skipped;
    if (campaignProgress.stageId === 'first-drop' && step?.id === 'mission-introduction' && !$('context-panel').hidden) closeContext();
    const guideButton = $('guide-action') as HTMLButtonElement;
    guideButton.hidden = !intro;
    guideButton.textContent = skipped ? guidePrompts[campaignProgress.stageId].action : campaignProgress.stageId === 'first-drop' ? 'START MISSION' : guidePrompts[campaignProgress.stageId].action;
    $('scenario-actions').hidden = false;
    $('mission1-trend-action').hidden = campaignProgress.stageId !== 'first-drop' || step?.id !== 'discover-rainfall-trend';
    $('mission-complete-summary').hidden = campaignProgress.stageId !== 'first-drop' || step?.id !== 'complete-first-drop';
    if (campaignProgress.stageId === 'first-drop') {
      $('scenario-actions').hidden = !skipped && step?.id !== 'calculate-six-hour-average';
      ($('weather-history-button') as HTMLButtonElement).hidden = step?.id !== 'inspect-six-hour-record';
      if (step?.id === 'complete-first-drop') {
        showContext('weather', true);
        const objectives = campaignProgress.objectives['first-drop'] ?? [];
        $('mission-points').textContent = String(objectives.length * 50);
        $('mission-discovery').textContent = `${$('lab-forecast-output').textContent}. ${$('trend-interpretation').textContent || $('lab-note').textContent}`;
      }
    } else {
      ($('weather-history-button') as HTMLButtonElement).hidden = false;
    }
    updateProgressiveDisclosure(step?.id ?? null);
    document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => {
      const stage = campaignProgress.stageId;
      const relevant = !guided || skipped || button.dataset.mode === 'simulation'
        || (['first-drop', 'hidden-pattern'].includes(stage) && button.dataset.mode === 'analysis')
        || (['predict-flood', 'prediction-failure'].includes(stage) && button.dataset.mode === 'prediction')
        || (stage === 'save-novara' && ['prediction', 'response'].includes(button.dataset.mode ?? ''));
      button.hidden = !relevant;
      button.disabled = !relevant;
    });
    renderStageActions();
  },
});

function showContext(activity: 'location' | 'weather' | 'moving-average' | 'regression' | 'evaluation' | 'response', workbench = false) {
  const panel = $('context-panel');
  panel.hidden = false;
  panel.dataset.activity = activity;
  panel.classList.toggle('workbench-open', workbench);
  document.querySelector('.layout')!.classList.add('has-context');
  uiState.setState({ contextActivity: activity });
  requestAnimationFrame(() => scene.scale.refresh());

  const activityTitles: Record<typeof activity, [string, string]> = {
    location: ['LOCATION DETAILS', selectedCell?.building_id ?? 'Eastbank location'],
    weather: ['WEATHER LAB', 'Rainfall observations'],
    'moving-average': ['WEATHER LAB', 'Moving average'],
    regression: ['PREDICTION LAB', 'Rainfall and water depth'],
    evaluation: ['PREDICTION LAB', 'Model comparison'],
    response: ['RESCUE OPERATIONS', 'Emergency resources'],
  };
  const [eyebrow, title] = activityTitles[activity];
  $('context-eyebrow').textContent = eyebrow;
  $('context-title').textContent = activity === 'location' && $('selected-name').textContent !== 'Select a location'
    ? $('selected-name').textContent : title;
  $('context-location').hidden = activity !== 'location';
  $('context-weather').hidden = activity !== 'weather';
  $('context-response').hidden = activity !== 'response';
  $('context-workbench').hidden = !workbench;
  $('prediction-lab').hidden = !workbench;
  if (workbench) requestAnimationFrame(() => predictionChart?.resize());
}

function updateProgressiveDisclosure(stepId: string | null) {
  const guided = uiState.getState().gameMode === 'guided-campaign' && !guidedTutorial.isSkipped();
  const stage = campaignProgress.stageId;
  const chart = $('lab-chart-wrap');
  const metrics = $('lab-metrics');
  const note = $('lab-note');
  const forecast = $('forecast-controls');
  const forecastOutput = $('lab-forecast-output');
  const windowControl = $('window-control');
  const lab = $('prediction-lab');
  const show = (element: HTMLElement, visible: boolean) => { element.hidden = guided && !visible; };

  if (!guided) {
    chart.hidden = false; metrics.hidden = false; note.hidden = false;
    forecast.hidden = stage !== 'predict-flood'; windowControl.hidden = stage !== 'hidden-pattern';
    forecastOutput.hidden = false;
    return;
  }

  // A completed mission remains explorable. Keep its finished experiment
  // visible when the player reopens the workbench instead of presenting an
  // empty panel after the tutorial has reached its completion state.
  if (campaignProgress.completedStageIds.includes(stage) && stepId === null) {
    chart.hidden = false;
    metrics.hidden = false;
    note.hidden = false;
    forecast.hidden = stage !== 'predict-flood';
    windowControl.hidden = stage !== 'hidden-pattern';
    forecastOutput.hidden = false;
    lab.hidden = false;
    return;
  }

  if (stage === 'first-drop') {
    const historical = stepId === 'discover-rainfall-trend'
      || stepId === 'calculate-six-hour-average'
      || (stepId === 'inspect-six-hour-record' && historicalDataRevealed);
    const calculate = ['calculate-six-hour-average', 'discover-rainfall-trend'].includes(stepId ?? '');
    show(chart, historical);
    show(metrics, historical);
    show(note, calculate);
    show(forecast, false); show(windowControl, false);
    show(forecastOutput, calculate);
    lab.hidden = stepId === 'complete-first-drop';
  } else if (stage === 'hidden-pattern') {
    const graph = ['reveal-rainfall-graph', 'reveal-window-control', 'compare-window-sizes', 'choose-window'].includes(stepId ?? '');
    show(chart, graph); show(metrics, stepId === 'compare-window-sizes' || stepId === 'choose-window');
    show(note, stepId === 'compare-window-sizes' || stepId === 'choose-window');
    show(windowControl, ['compare-window-sizes', 'choose-window'].includes(stepId ?? ''));
    show(forecast, false); show(forecastOutput, false);
  } else if (stage === 'predict-flood') {
    const chartVisible = ['reveal-regression-scatter', 'enable-manual-line', 'adjust-manual-line', 'calculate-best-fit', 'run-rainfall-forecast'].includes(stepId ?? '');
    show(chart, chartVisible); show(metrics, ['adjust-manual-line', 'calculate-best-fit', 'run-rainfall-forecast'].includes(stepId ?? ''));
    show(note, ['calculate-best-fit', 'run-rainfall-forecast'].includes(stepId ?? ''));
    show(forecast, stepId === 'run-rainfall-forecast'); show(windowControl, false);
    show(forecastOutput, ['adjust-manual-line', 'run-rainfall-forecast'].includes(stepId ?? ''));
    $('lab-correlations').hidden = true;
  } else if (stage === 'prediction-failure') {
    const chartVisible = ['reveal-predictions', 'reveal-actual-observations', 'calculate-model-errors', 'select-evaluation-model'].includes(stepId ?? '');
    show(chart, chartVisible); show(metrics, ['calculate-model-errors', 'select-evaluation-model'].includes(stepId ?? ''));
    show(note, ['calculate-model-errors', 'select-evaluation-model'].includes(stepId ?? ''));
    show(forecast, false); show(windowControl, false); show(forecastOutput, false); $('lab-correlations').hidden = true;
  } else {
    show(chart, false); show(metrics, false); show(note, false); show(forecast, false); show(windowControl, false); show(forecastOutput, false);
  }
  if (stage !== 'first-drop' || stepId !== 'complete-first-drop') $('mission-complete-summary').hidden = true;
}

function closeContext() {
  if (chosenResource) {
    chosenResource = null;
    pendingPlacement = null;
    scene.setPlacementMode(false);
    scene.setPlacementPreview(null);
    renderResources();
    renderPlacementState();
    $('response-hint').textContent = 'Placement cancelled because the response panel was closed.';
  }
  $('context-panel').hidden = true;
  document.querySelector('.layout')!.classList.remove('has-context');
  uiState.setState({ contextActivity: 'location' });
  requestAnimationFrame(() => scene.scale.refresh());
}

function openWorkbench(activity: 'weather' | 'moving-average' | 'regression' | 'evaluation') {
  showContext(activity, true);
  void loadStageExperiment();
}

const stageCopy: Record<CampaignStageId, { briefing: string; story: string; overlay: FloodOverlay }> = {
  'first-drop': {
    briefing: 'Choose a station to inspect its hourly record. Then calculate the average rainfall across the six-hour watch.',
    story: '“The first station reports are in. Is the storm strengthening across all six hours, or is one peak distorting the picture?”', overlay: 'rainfall',
  },
  'hidden-pattern': {
    briefing: 'Rain pulses up and down. Change the window size and watch the moving average smooth the measured rainfall.',
    story: '“The gauge is noisy. Smooth it enough to reveal the trend, but keep the sharp coastal pulse visible.”', overlay: 'rainfall',
  },
  'predict-flood': {
    briefing: 'Drag either end of the orange line to estimate water depth from rainfall. Compare its residuals with the Python least-squares fit, then try a new rainfall value.',
    story: '“Eastbank General sits in a low basin. Estimate the water level early enough to protect the approach road.”', overlay: 'risk',
  },
  'prediction-failure': {
    briefing: 'Both models are tested on the same later observations. Compare the error distances and scores, then choose which forecast to trust for this storm.',
    story: '“A good fit on yesterday’s storm can fail on today’s. Judge both models on observations they never saw.”', overlay: 'risk',
  },
  'save-novara': {
    briefing: 'This synthetic storm covers 24 hours in ten-minute steps. Start it, place response assets on the map, and protect Eastbank General and the school through the full rainfall timeline.',
    story: '“Landfall is imminent. Use the risk map and your limited budget to keep the hospital reachable.”', overlay: 'risk',
  },
};

const objectiveLabels: Record<string, string> = {
  station: 'Inspect a monitoring station', average: 'Calculate the six-hour average',
  'window-experiment': 'Try at least two smoothing windows', 'choose-window': 'Commit to a window size',
  'manual-line': 'Drag a line and inspect its residual error', 'best-fit': 'Calculate the best-fit line',
  'rainfall-forecast': 'Forecast a rainfall level', 'compare-errors': 'Compare held-out model errors',
  'select-model': 'Choose a model for the response plan', 'start-storm': 'Start the Eastbank storm',
  'place-resource': 'Place a response resource', 'advance-storm': 'Advance the flood by ten minutes',
  'evaluate-access': 'Evaluate hospital and school access',
};

function currentStage() { return campaignStages.find(stage => stage.id === campaignProgress.stageId)!; }

function renderCampaign() {
  const stage = currentStage();
  const stageIndex = campaignStages.findIndex(item => item.id === stage.id);
  const guided = uiState.getState().gameMode === 'guided-campaign';
  if (stageIndex > 0 && campaignProgress.chosenWindowSize !== null) {
    ($('lab-window') as HTMLInputElement).value = String(campaignProgress.chosenWindowSize);
    $('window-output').textContent = String(campaignProgress.chosenWindowSize);
  }
  $('campaign-count').textContent = guided ? `${String(stageIndex + 1).padStart(2, '0')} / 05` : 'FREE PLAY';
  $('campaign-title').textContent = guided ? stage.title : 'Explore Eastbank';
  $('top-mission').textContent = guided ? stage.title.toUpperCase() : 'FREE PLAY';
  $('campaign-copy').textContent = guided ? stageCopy[stage.id].briefing : 'Explore the city, study weather and forecasts, and shape your own emergency response.';
  $('story').textContent = stageCopy[stage.id].story;
  const guide = guidePrompts[stage.id];
  $('guide-task').textContent = guided ? `CURRENT TASK · ${guide.task}` : 'FREE PLAY · Choose any tool and experiment with Eastbank.';
  const guideButton = $('guide-action') as HTMLButtonElement;
  guideButton.textContent = guided ? guide.action : 'OPEN WEATHER LAB';
  guideButton.dataset.mode = guided ? guide.mode : 'analysis';
  $('mission-list').hidden = !guided;
  $('mission-progress-block').classList.toggle('free-play', !guided);
  document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => {
    const available = !guided || button.dataset.mode === 'simulation'
      || (['first-drop', 'hidden-pattern'].includes(stage.id) && button.dataset.mode === 'analysis')
      || (['predict-flood', 'prediction-failure', 'save-novara'].includes(stage.id) && button.dataset.mode === 'prediction')
      || (stage.id === 'save-novara' && button.dataset.mode === 'response');
    button.hidden = !available;
    button.disabled = !available;
  });
  $('lab-eyebrow').textContent = `STAGE ${stageIndex + 1} · ${stage.short.split('· ')[1]}`;
  $('lab-title').textContent = [
    'Six hours before landfall', 'Find the rainfall pulse', 'Rainfall → water depth',
    'When forecasts fail', 'Eastbank storm response',
  ][stageIndex];
  $('lab-briefing').textContent = stageCopy[stage.id].briefing;

  $('campaign-stages').innerHTML = campaignStages.map((item, index) => {
    const unlocked = isStageUnlocked(campaignProgress, item.id);
    const complete = campaignProgress.completedStageIds.includes(item.id);
    const active = campaignProgress.stageId === item.id;
    return `<button class="campaign-stage ${active ? 'active' : ''} ${complete ? 'complete' : ''}" data-stage="${item.id}" aria-label="${unlocked ? `${complete ? 'Replay' : 'Open'} ${item.title}` : `Locked: ${item.title}. Complete the previous mission first`}" ${unlocked ? '' : 'disabled'} title="${unlocked ? `${complete ? 'Replay' : 'Open'} ${item.title}` : 'Complete the previous stage to unlock'}"><span>${complete ? '✓' : unlocked ? '◈' : '▣'}</span>${item.short}</button>`;
  }).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.stage as CampaignStageId;
    campaignProgress = selectCampaignStage(campaignProgress, id);
    void enterCampaignStage(id);
  }));

  const done = campaignProgress.objectives[stage.id] ?? [];
  const progress = Math.round(done.length / stage.objectiveIds.length * 100);
  ($('mission-progress') as HTMLProgressElement).value = progress;
  $('mission-progress-label').textContent = guided ? `${done.length} / ${stage.objectiveIds.length} OBJECTIVES` : 'OPEN EXPLORATION';
  const nextObjective = stage.objectiveIds.find(id => !done.includes(id));
  $('campaign-objectives').innerHTML = guided
    ? `<div class="objective ${nextObjective ? '' : 'complete'}"><i></i><span>${nextObjective ? objectiveLabels[nextObjective] : 'Mission objectives complete'}</span></div>`
    : '';
  if (guided && campaignProgress.completedStageIds.includes(stage.id)) {
    $('campaign-objectives').insertAdjacentHTML('beforeend', '<div class="stage-complete-banner">MISSION COMPLETE · REPLAY AVAILABLE</div>');
  }
  renderStageActions();
  syncGuidedTutorial(stage.id, guided);
}

function syncGuidedTutorial(stageId: CampaignStageId, guided: boolean) {
  const available = guided && Boolean(sessionId && gameState);
  $('tutorial-replay').hidden = !available;
  if (!available) {
    guidedTutorial.setAvailable(false);
    return;
  }
  guidedTutorial.configure(stageId, stageTutorials[stageId] ?? firstDropTutorial, campaignProgress.tutorialProgress[stageId]);
}

function markCampaignObjectiveId(objectiveId: string, feedback?: string) {
  const before = campaignProgress.completedStageIds.includes(campaignProgress.stageId);
  campaignProgress = markCampaignObjective(campaignProgress, objectiveId);
  renderCampaign();
  if (!before && campaignProgress.completedStageIds.includes(campaignProgress.stageId)) {
    notify(`Stage complete: ${currentStage().title}. The next operation is now unlocked.`);
  } else if (feedback) notify(feedback);
}

async function enterCampaignStage(id: CampaignStageId) {
  if (!isStageUnlocked(campaignProgress, id)) return;
  const replayingFinal = id === 'save-novara' && campaignProgress.completedStageIds.includes(id);
  if (replayingFinal && sessionId) {
    try {
      const state = await serializeStateAction(() => resetGame(sessionId!));
      syncGameState(state, true);
      scenarioHistory = [];
    } catch (error) { showApiError(error); return; }
  }
  paused = id !== 'save-novara' || !gameState?.scenario_progress.active;
  if (id === 'predict-flood') forecastChartPoints = [];
  syncPauseButton();
  if (id === 'save-novara') {
    setOverlay('risk');
  } else if (id === 'predict-flood' || id === 'prediction-failure') {
    setOverlay('risk');
  } else {
    setOverlay('rainfall');
  }
  uiState.setState({ activityMode: 'simulation' });
  document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === uiState.getState().activityMode));
  renderCampaign();
  closeContext();
  scene.resetCamera();
}

function serializeStateAction<T>(action: () => Promise<T>): Promise<T> {
  const queued = stateActionQueue.then(action, action);
  stateActionQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function showApiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown API error';
  $('map-status').textContent = error instanceof ApiError && error.isInvalidSession
    ? 'SESSION LOST · START A NEW RUN'
    : error instanceof ApiError && error.isNetworkFailure ? 'PYTHON SERVICE OFFLINE' : 'API REQUEST FAILED';
  $('map-status').classList.remove('online');
  $('map-status').classList.add('offline');
  $('map-loading').textContent = error instanceof ApiError && error.isInvalidSession
    ? 'SESSION EXPIRED · USE NEW RUN TO RECONNECT'
    : error instanceof ApiError && error.isNetworkFailure ? 'PYTHON BACKEND UNAVAILABLE · START OR RESTART FASTAPI'
      : `BACKEND REQUEST FAILED · ${message}`;
  $('map-loading').style.display = 'block';
  if (error instanceof ApiError && (error.isNetworkFailure || error.isInvalidSession)) sessionUnavailable = true;
  notify(message);
}

const missionObjectiveByGoal: Record<string, string> = {
  hospital: 'inspect_hospital', weather: 'inspect_weather', drainage: 'inspect_drainage', risk: 'review_risk',
};

function completeGoal(goal: string) {
  if (completed.has(goal)) return;
  completed.add(goal);
  document.querySelector(`[data-goal="${goal}"]`)?.classList.add('complete');
  const objectiveId = missionObjectiveByGoal[goal];
  if (sessionId && objectiveId) {
    const activeSessionId = sessionId;
    void serializeStateAction(() => reportMissionObjective(activeSessionId, objectiveId))
      .then(state => syncGameState(state))
      .catch(showApiError);
  }
}

function syncMission(state: GameState) {
  const pairs: Array<[string, string]> = [
    ['hospital', 'inspect_hospital'], ['weather', 'inspect_weather'], ['drainage', 'inspect_drainage'], ['risk', 'review_risk'],
  ];
  for (const [goal, objective] of pairs) {
    const complete = Boolean(state.mission_state?.objectives[objective]);
    document.querySelector(`[data-goal="${goal}"]`)?.classList.toggle('complete', complete);
    if (complete) completed.add(goal); else completed.delete(goal);
  }
}

function updateSimulationClock(minutes: number) {
  simMinutes = minutes;
  const hoursWithinDay = Math.floor(minutes / 60) % 24;
  const hour = hoursWithinDay.toString().padStart(2, '0');
  const minute = (minutes % 60).toString().padStart(2, '0');
  $('sim-time').textContent = `DAY ${Math.floor(minutes / 1440 + 1).toString().padStart(2, '0')} · ${hour}:${minute}`;
}

function syncGameState(incoming: GameState, initial = false) {
  const prior = gameState;
  if (initial || prior?.session_id !== incoming.session_id) lastMeteoContextStep = -3;
  if (prior && prior.session_id !== incoming.session_id && !initial) return;
  if (!initial && prior && prior.session_id === incoming.session_id && incoming.elapsed_minutes < prior.elapsed_minutes) return;
  const state: GameState = {
    ...incoming,
    historical_observations: incoming.historical_observations ?? (prior?.session_id === incoming.session_id ? prior.historical_observations : undefined),
  };
  gameState = state;
  sessionId = state.session_id;
  mapData = state;
  simMinutes = state.elapsed_minutes;
  budget = state.budget_credits;
  inventory = state.available_resources.map(resource => ({ ...resource }));
  updateSimulationClock(state.elapsed_minutes);
  $('top-rain').innerHTML = `${state.rainfall_mm_per_hour.toFixed(1)}<em> mm/h</em>`;
  const warning = $('weather-warning');
  warning.classList.toggle('warning-live', state.rainfall_mm_per_hour >= 8);
  warning.classList.toggle('severe', state.rainfall_mm_per_hour >= 60);
  $('warning-level').textContent = state.rainfall_mm_per_hour >= 60 ? 'SEVERE RAINFALL' : state.rainfall_mm_per_hour >= 8 ? 'RAIN ADVISORY' : 'COASTAL WATCH';
  if (prior?.session_id === state.session_id) {
    if (state.rainfall_mm_per_hour >= 60 && prior.rainfall_mm_per_hour < 60) showBriefing('Severe rainfall warning', `Rainfall has reached ${state.rainfall_mm_per_hour.toFixed(1)} mm/h. Inspect the hospital approach and water-depth overlay before committing resources.`, 'warning');
    else if (state.rainfall_mm_per_hour >= 8 && prior.rainfall_mm_per_hour < 8) showBriefing('Rain advisory', `Rainfall has risen to ${state.rainfall_mm_per_hour.toFixed(1)} mm/h. Watch low roads and compare the rainfall trend with local water depth.`, 'warning');
  }
  $('rainfall-value').textContent = state.rainfall_mm_per_hour.toFixed(0);
  ($('rainfall-control') as HTMLInputElement).value = state.rainfall_mm_per_hour.toFixed(0);
  $('budget').textContent = budget.toLocaleString() + ' CR';
  const outcome = state.response_outcome;
  $('response-outcome').textContent = `${outcome.finalized ? outcome.ending?.toUpperCase() : 'PLAN PREVIEW · OUTCOME PENDING'} · SCORE ${outcome.score}/1000 · ${outcome.total_flooded_cells} flooded cells · ${outcome.flooded_road_count} road cells · ${outcome.residents_evacuated} evacuated · PUMPS ${outcome.pump_water_removed_m3.toFixed(1)} m³ REMOVED · ${outcome.remaining_budget_credits} CR left`;
  $('map-status').textContent = `SESSION ${state.session_id.slice(0, 8).toUpperCase()} · ${state.cells.length} CELLS · PYTHON LIVE`;
  $('map-status').classList.remove('offline');
  $('map-status').classList.add('online');
  $('map-loading').style.display = 'none';
  ($('rainfall-control') as HTMLInputElement).disabled = state.scenario_progress.active;
  const evaluateButton = document.querySelector<HTMLButtonElement>('#evaluate-access');
  if (evaluateButton) evaluateButton.disabled = !state.scenario_progress.complete;
  sessionUnavailable = false;
  if (initial || prior?.session_id !== state.session_id) populateLabStations(state);
  showWeather(state);
  renderResources();
  renderPlacementState();
  syncMission(state);
  scene.setMapData(state, initial);
  updateContextualMeteo(prior, state);
  if (!initial && campaignProgress.stageId === 'save-novara' && prior && state.scenario_progress.started && state.scenario_progress.step > 0 && state.elapsed_minutes > prior.elapsed_minutes) {
    scenarioHistory.push({ x: state.elapsed_minutes / 10, y: state.simulation.maximum_water_depth_mm, rainfall: state.rainfall_mm_per_hour });
    markCampaignObjectiveId('advance-storm', 'The water depth and rainfall are updated from the Python flood engine. Watch which streets flood first.');
  }
  if (campaignProgress.stageId === 'save-novara' && state.scenario_progress.started) renderScenarioProgress();
  if (state.scenario_progress.complete) { paused = true; syncPauseButton(); renderStageActions(); }
}

function updateContextualMeteo(prior: GameState | null, state: GameState) {
  if (!prior || !state.scenario_progress.started || state.scenario_progress.step <= prior.scenario_progress.step) return;
  if (state.scenario_progress.step - lastMeteoContextStep < 3) return;
  lastMeteoContextStep = state.scenario_progress.step;
  const rise = state.simulation.maximum_water_depth_mm - prior.simulation.maximum_water_depth_mm;
  const hospital = state.simulation.location_accessibility['eastbank-hospital'] ?? state.simulation.hospital_access_status;
  if (hospital === 'inaccessible') {
    $('meteo').textContent = 'The hospital approach is cut. The map shows the low road cells; a pump nearby can reduce local water, while a barrier may redirect flow.';
  } else if (rise > 1) {
    $('meteo').textContent = `Water rose ${rise.toFixed(1)} mm this interval. Check the rainfall trend and the hospital road before committing your next response.`;
  } else {
    $('meteo').textContent = `Hospital access is ${hospital}. Compare the drainage overlay with pump coverage as the next rainfall pulse arrives.`;
  }
}

async function startNewGame(freshCampaign = false) {
  if (newGameInFlight) return;
  newGameInFlight = true;
  sessionId = null;
  gameState = null;
  pendingPlacement = null;
  chosenResource = null;
  scenarioHistory = [];
  historicalDataRevealed = false;
  labRequestId += 1;
  if (rainfallDebounce !== undefined) window.clearTimeout(rainfallDebounce);
  const button = $('new-run') as HTMLButtonElement;
  button.disabled = true;
  $('map-loading').textContent = 'CREATING PYTHON GAME SESSION · LOADING EASTBANK GRID…';
  $('map-loading').style.display = 'block';
  try {
    const state = await serializeStateAction(() => newGame());
    if (freshCampaign) {
      campaignProgress = resetCampaignProgress();
      selectedEvaluationModel = 'moving_average';
      windowSizesTried.clear();
      completed.clear();
      manualLine = null;
      manualLineResult = null;
      selectedCell = null;
      uiState.setState({ gameMode: 'guided-campaign', activityMode: 'simulation', contextActivity: 'location' });
      $('game-mode-toggle').textContent = 'GUIDED';
      document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(item => item.classList.toggle('active', item.dataset.mode === 'simulation'));
    }
    chosenResource = null;
    pendingPlacement = null;
    scene?.setPlacementMode(false);
    predictionLabData = null;
    labRequestId += 1;
    forecastChartPoints = [];
    paused = campaignProgress.stageId !== 'save-novara';
    syncPauseButton();
    syncGameState(state, true);
    renderCampaign();
    sessionUnavailable = false;
    scene.resetCamera();
    notify(freshCampaign
      ? 'Fresh campaign started. Saved mission progress has been cleared.'
      : 'Eastbank session restored. Your saved mission progress is ready to continue.');
    await enterCampaignStage(campaignProgress.stageId);
  } catch (error) {
    showApiError(error);
  } finally {
    newGameInFlight = false;
    button.disabled = false;
  }
}

async function resetCurrentGame() {
  if (!sessionId) { await startNewGame(true); return; }
  const activeSessionId = sessionId;
  try {
    const state = await serializeStateAction(() => resetGame(activeSessionId));
    // The backend reset restores simulation state; reset the saved campaign too,
    // otherwise the UI immediately resumes the old mission and objectives.
    campaignProgress = resetCampaignProgress();
    selectedEvaluationModel = 'moving_average';
    windowSizesTried.clear();
    completed.clear();
    historicalDataRevealed = false;
    chosenResource = null;
    pendingPlacement = null;
    scene.setPlacementMode(false);
    predictionLabData = null;
    labRequestId += 1;
    forecastChartPoints = [];
    scenarioHistory = [];
    manualLine = null;
    manualLineResult = null;
    selectedCell = null;
    stageChartRequestId += 1;
    if (manualLineDebounce !== undefined) window.clearTimeout(manualLineDebounce);
    paused = true;
    uiState.setState({ gameMode: 'guided-campaign', activityMode: 'simulation', contextActivity: 'location' });
    $('game-mode-toggle').textContent = 'GUIDED';
    setOverlay('rainfall');
    closeContext();
    renderCampaign();
    document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(item => item.classList.toggle('active', item.dataset.mode === 'simulation'));
    ($('pause') as HTMLButtonElement).innerHTML = '▶ &nbsp;RESUME';
    ($('pause') as HTMLButtonElement).classList.add('paused');
    syncGameState(state, true);
    renderCampaign();
    notify('The backend restored this session to its initial rainfall, water, budget and mission state.');
  } catch (error) {
    showApiError(error);
  }
}

async function advanceOneStep(steps = 1) {
  if (!sessionId || advanceInFlight || sessionUnavailable) return;
  if (campaignProgress.stageId === 'save-novara' && !gameState?.scenario_progress.active) {
    notify('Meteo AI: start the Eastbank storm before advancing its rainfall timeline.');
    return;
  }
  advanceInFlight = true;
  const activeSessionId = sessionId;
  try {
    const state = await serializeStateAction(() => advanceGame(activeSessionId, steps));
    syncGameState(state);
    if (campaignProgress.stageId === 'save-novara' && state.scenario_progress.step > 0) {
      guidedTutorial.completeAction('advance-eastbank-storm', { success: state.scenario_progress.step > 0 });
    }
    if (state.scenario_progress.complete) {
      paused = true;
      syncPauseButton();
      notify('The synthetic storm record has ended. Evaluate access or replay the response with a new resource plan.');
    }
  } catch (error) {
    showApiError(error);
  } finally {
    advanceInFlight = false;
  }
}

function changeRainfall(value: number) {
  if (!sessionId) { notify('Start a Python game session before changing the storm input.'); return; }
  if (rainfallDebounce !== undefined) window.clearTimeout(rainfallDebounce);
  const activeSessionId = sessionId;
  rainfallDebounce = window.setTimeout(() => {
    if (activeSessionId !== sessionId) return;
    void serializeStateAction(() => setRainfall(activeSessionId, value))
      .then(state => syncGameState(state))
      .catch(showApiError);
  }, 180);
}

function setOverlay(next: FloodOverlay) {
  activeOverlay = scene.setOverlay(next);
  document.querySelectorAll<HTMLButtonElement>('.layer-button').forEach(button => {
    button.classList.toggle('active', button.dataset.overlay === activeOverlay);
    button.setAttribute('aria-pressed', String(button.dataset.overlay === activeOverlay));
  });
  const names: Record<Exclude<FloodOverlay, null>, string> = {
    elevation: 'Elevation relief is visible. Darker low ground is closer to the river basin.',
    rainfall: 'Rainfall overlay is showing local synthetic station interpolation from Python.',
    water: 'Water depth overlay is showing Python-computed depth for every flow cell.',
    drainage: 'Drainage network is highlighted. Gold grates mark local inlets.',
    risk: 'Flood risk heatmap is showing the Python risk index. Prioritize high exposure cells.',
  };
  if (activeOverlay) notify(names[activeOverlay]);
}

function populateLabStations(data: GameState) {
  const stationSelect = $('lab-station') as HTMLSelectElement;
  const stations = data.locations.filter(location => location.kind === 'weather_station');
  stationSelect.replaceChildren(...stations.map(station => {
    const option = document.createElement('option');
    option.value = station.id;
    option.textContent = station.name;
    return option;
  }));
  if (stations.some(station => station.id === 'weather-central')) stationSelect.value = 'weather-central';
}

function syncPauseButton() {
  const button = $('pause') as HTMLButtonElement;
  button.innerHTML = paused ? '▶ &nbsp;RESUME' : 'Ⅱ &nbsp;PAUSE';
  button.classList.toggle('paused', paused);
}

function renderStageActions() {
  const stage = campaignProgress.stageId;
  const actions = $('scenario-actions');
  const guided = uiState.getState().gameMode === 'guided-campaign' && !guidedTutorial.isSkipped();
  const stepId = guided ? guidedTutorial?.getCurrentStepId() ?? null : null;
  $('window-control').hidden = stage !== 'hidden-pattern' || (guided && !['compare-window-sizes', 'choose-window'].includes(stepId ?? ''));
  $('forecast-controls').hidden = stage !== 'predict-flood' || (guided && stepId !== 'run-rainfall-forecast');
  $('lab-correlations').hidden = stage !== 'predict-flood' && stage !== 'prediction-failure';
  const buttons: Record<CampaignStageId, string> = guided ? {
    'first-drop': stepId === 'calculate-six-hour-average' ? '<button id="show-average" class="forecast-button">CALCULATE SIX-HOUR AVERAGE</button>' : '',
    'hidden-pattern': stepId === 'reveal-rainfall-graph' ? '<button id="reveal-stage-graph" class="forecast-button">SHOW RAINFALL GRAPH</button>'
      : stepId === 'reveal-window-control' ? '<button id="reveal-window-control" class="forecast-button">REVEAL WINDOW SIZE</button>'
        : stepId === 'choose-window' ? `<button id="choose-window" class="forecast-button">USE ${Number(($('lab-window') as HTMLInputElement).value || campaignProgress.chosenWindowSize || 6)}-READING WINDOW</button>` : '',
    'predict-flood': stepId === 'reveal-regression-scatter' ? '<button id="reveal-regression-scatter" class="forecast-button">SHOW RAINFALL VS WATER DEPTH</button>'
      : stepId === 'enable-manual-line' ? '<button id="enable-manual-line" class="forecast-button">ENABLE MANUAL LINE</button>'
        : stepId === 'calculate-best-fit' ? '<button id="fit-best-line" class="forecast-button">CALCULATE BEST-FIT LINE</button>' : '',
    'prediction-failure': stepId === 'reveal-predictions' ? '<button id="reveal-model-predictions" class="forecast-button">SHOW BOTH PREDICTIONS</button>'
      : stepId === 'reveal-actual-observations' ? '<button id="reveal-actual-observations" class="forecast-button">REVEAL ACTUAL DEPTHS</button>'
        : stepId === 'calculate-model-errors' ? '<button id="calculate-model-errors" class="forecast-button">CALCULATE MAE & RMSE</button>'
          : stepId === 'select-evaluation-model' ? `<div class="model-choice"><button data-model="moving_average" class="forecast-button ${selectedEvaluationModel === 'moving_average' ? 'selected' : ''}">TRUST MOVING AVERAGE</button><button data-model="linear_regression" class="forecast-button ${selectedEvaluationModel === 'linear_regression' ? 'selected' : ''}">TRUST REGRESSION</button></div>` : '',
    'save-novara': stepId === 'mission-introduction' ? '<button id="review-risk-map" class="forecast-button">REVIEW FLOOD-RISK MAP</button>'
      : stepId === 'reveal-response-resources' ? '<button id="open-response-resources" class="forecast-button">CONFIRM EQUIPMENT REVIEW</button>'
        : stepId === 'start-eastbank-storm' ? `<button id="start-scenario" class="forecast-button">${gameState?.scenario_progress.started ? 'RESTART STORM' : 'START EASTBANK STORM'}</button>`
          : stepId === 'advance-eastbank-storm' && gameState?.scenario_progress.started && !gameState.scenario_progress.complete ? `<button id="run-response" class="forecast-button">${paused ? 'RUN RESPONSE' : 'PAUSE RESPONSE'} ▶</button>`
            : stepId === 'evaluate-city-report' && gameState?.scenario_progress.complete ? '<button id="evaluate-access" class="forecast-button">EVALUATE CITY ACCESS</button>' : '',
  } : {
    'first-drop': '<button id="show-average" class="forecast-button">CALCULATE SIX-HOUR AVERAGE ↗</button>',
    'hidden-pattern': `<button id="choose-window" class="forecast-button">USE ${Number(($('lab-window') as HTMLInputElement).value || campaignProgress.chosenWindowSize || 6)}-READING WINDOW</button>`,
    'predict-flood': '<button id="fit-best-line" class="forecast-button">CALCULATE BEST-FIT LINE ↗</button>',
    'prediction-failure': `<div class="model-choice"><button data-model="moving_average" class="forecast-button ${selectedEvaluationModel === 'moving_average' ? 'selected' : ''}">TRUST MOVING AVERAGE</button><button data-model="linear_regression" class="forecast-button ${selectedEvaluationModel === 'linear_regression' ? 'selected' : ''}">TRUST REGRESSION</button></div>`,
    'save-novara': `<button id="start-scenario" class="forecast-button">${gameState?.scenario_progress.started ? 'RESTART STORM' : 'PREPARE EASTBANK STORM'} ↗</button>${gameState?.scenario_progress.started && !gameState.scenario_progress.complete ? `<button id="run-response" class="forecast-button">${paused ? 'RUN RESPONSE' : 'PAUSE RESPONSE'} ▶</button>` : ''}<button id="evaluate-access" class="forecast-button" ${gameState?.scenario_progress.complete ? '' : 'disabled'}>EVALUATE CITY ACCESS ↗</button>`,
  };
  actions.innerHTML = buttons[stage];
  document.querySelector('#show-average')?.addEventListener('click', () => void calculateSixHourAverage());
  document.querySelector('#reveal-stage-graph')?.addEventListener('click', () => {
    const stationId = ($('lab-station') as HTMLSelectElement).value || 'weather-central';
    const readings = stationStormSeries(stationId);
    drawScatter([{ label: 'Measured rainfall', data: readings.map((row, index) => ({ x: index, y: row.rainfall_mm_hr })), showLine: true, borderColor: '#79d2bc', backgroundColor: '#79d2bc', pointRadius: 2, borderWidth: 2 }], 'LATEST STORM · 10-MINUTE OBSERVATIONS', 'RAINFALL · mm/h');
    $('lab-metrics').textContent = `${readings.length} measured rainfall observations`;
    $('lab-note').textContent = 'The spikes show short rainfall pulses. Smoothing will help reveal the broader pattern.';
    guidedTutorial.completeAction('reveal-stage-graph', { success: readings.length > 0 });
  });
  document.querySelector('#reveal-window-control')?.addEventListener('click', () => {
    $('window-control').hidden = false;
    guidedTutorial.completeAction('reveal-window-control', { success: true });
  });
  document.querySelector('#reveal-regression-scatter')?.addEventListener('click', () => {
    if (!predictionLabData) return;
    const train = predictionLabData.training_observations;
    drawScatter([{ label: 'Training observations', data: train.map(row => ({ x: row.rainfall_mm_hr, y: row.water_depth_mm })), backgroundColor: '#79d2bc', borderColor: '#79d2bc', pointRadius: 2.5 }], 'RAINFALL · mm/h', 'WATER DEPTH · mm');
    $('lab-metrics').textContent = `${train.length} historical training observations`;
    $('lab-note').textContent = 'Each point pairs a rainfall measurement with a water depth measured at the station.';
    guidedTutorial.completeAction('reveal-regression-scatter', { success: train.length > 1 });
  });
  document.querySelector('#enable-manual-line')?.addEventListener('click', () => {
    if (!predictionLabData) return;
    paintManualRegressionStage(predictionLabData);
    guidedTutorial.completeAction('enable-manual-line', { success: Boolean(manualLine) });
  });
  document.querySelector('#reveal-model-predictions')?.addEventListener('click', () => {
    if (!predictionLabData) return;
    paintModelPredictions(predictionLabData);
    guidedTutorial.completeAction('reveal-model-predictions', { success: true });
  });
  document.querySelector('#reveal-actual-observations')?.addEventListener('click', () => {
    if (!predictionLabData) return;
    paintEvaluationObservations(predictionLabData, false);
    guidedTutorial.completeAction('reveal-actual-observations', { success: predictionLabData.heldout_observations.length > 0 });
  });
  document.querySelector('#calculate-model-errors')?.addEventListener('click', () => void calculateModelErrors());
  document.querySelector('#review-risk-map')?.addEventListener('click', () => {
    setOverlay('risk');
    guidedTutorial.completeAction('review-risk-map', { success: activeOverlay === 'risk' });
  });
  document.querySelector('#open-response-resources')?.addEventListener('click', () => {
    setMode('response');
    guidedTutorial.completeAction('open-response-resources', { success: !$('context-panel').hidden && !$('context-response').hidden });
  });
  document.querySelector('#choose-window')?.addEventListener('click', () => {
    const windowSize = Number(($('lab-window') as HTMLInputElement).value);
    campaignProgress = saveWindowChoice(campaignProgress, windowSize);
    markCampaignObjectiveId('choose-window', `A ${windowSize}-reading window is now selected. The smoothed series updates as the storm changes.`);
    guidedTutorial.completeAction('choose-window', { success: true, windowSize });
  });
  document.querySelector('#fit-best-line')?.addEventListener('click', () => void calculateBestFitLine());
  document.querySelector('#start-scenario')?.addEventListener('click', () => void beginFloodScenario());
  document.querySelector('#evaluate-access')?.addEventListener('click', evaluateCityAccess);
  document.querySelector('#run-response')?.addEventListener('click', () => {
    paused = !paused; syncPauseButton(); renderStageActions();
    notify(paused ? 'Response simulation paused.' : 'Response simulation running. Watch the hospital approach and neighborhood water levels.');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(button => button.addEventListener('click', () => {
    const model = button.dataset.model as 'moving_average' | 'linear_regression';
    selectedEvaluationModel = model;
    campaignProgress = saveModelChoice(campaignProgress, model);
    const label = model === 'moving_average' ? 'Moving-average baseline' : 'Linear-regression model';
    markCampaignObjectiveId('select-model', `${label} selected. Its unseen-data errors remain visible for review.`);
    if (predictionLabData) paintEvaluationStage(predictionLabData);
    guidedTutorial.completeAction('select-evaluation-model', { success: true, model });
  }));
}

function hourlyRainfallForStation(stationId: string) {
  return (gameState?.historical_observations ?? [])
    .filter(row => row.station_id === stationId && new Date(row.timestamp).getUTCMinutes() === 0)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-6);
}

function stationStormSeries(stationId: string) {
  return (gameState?.historical_observations ?? [])
    .filter(row => row.station_id === stationId)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-36);
}

function stationAllSeries(stationId: string) {
  return (gameState?.historical_observations ?? [])
    .filter(row => row.station_id === stationId)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function drawScatter(
  datasets: Array<Record<string, unknown>>,
  xTitle: string,
  yTitle: string,
  residual?: { points: Array<{ x: number; actual: number; predicted: number }> },
) {
  const chartElement = $('regression-chart') as HTMLCanvasElement;
  predictionChart?.destroy();
  const plugins = residual ? [{
    id: 'residual-distances',
    afterDatasetsDraw(chart: any) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 190, 109, 0.76)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const point of residual.points) {
        const x = chart.scales.x.getPixelForValue(point.x);
        const yActual = chart.scales.y.getPixelForValue(point.actual);
        const yPredicted = chart.scales.y.getPixelForValue(point.predicted);
        ctx.beginPath(); ctx.moveTo(x, yActual); ctx.lineTo(x, yPredicted); ctx.stroke();
      }
      ctx.restore();
    },
  }] : [];
  predictionChart = new Chart<'scatter', { x: number; y: number }[]>(chartElement, {
    type: 'scatter',
    data: { datasets: datasets as never },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 180 },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#b9cbbd', boxWidth: 8, boxHeight: 8, padding: 9, font: { size: 8 } } },
        tooltip: { callbacks: { label: (context: any) => `${context.dataset.label}: ${Number(context.parsed.x).toFixed(1)} · ${Number(context.parsed.y).toFixed(1)}` } },
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: xTitle, color: '#91a79a', font: { size: 8 } }, ticks: { color: '#91a79a', maxTicksLimit: 7, font: { size: 7 } }, grid: { color: '#34443e' } },
        y: { title: { display: true, text: yTitle, color: '#91a79a', font: { size: 8 } }, ticks: { color: '#91a79a', maxTicksLimit: 5, font: { size: 7 } }, grid: { color: '#34443e' } },
      },
    },
    plugins: plugins as never,
  });
}

function paintSixHourRain(stationId: string) {
  const readings = hourlyRainfallForStation(stationId);
  if (!readings.length) { $('lab-metrics').textContent = 'No hourly rainfall records are available for this station.'; return; }
  drawScatter([
    { label: 'Observed hourly rainfall', data: readings.map((row, i) => ({ x: i, y: row.rainfall_mm_hr })), showLine: true, borderColor: '#76c9b3', backgroundColor: '#76c9b3', pointRadius: 3, borderWidth: 2 },
  ], 'SIX-HOUR WATCH · HOURLY OBSERVATION', 'RAINFALL · mm/h');
  const labels = readings.map(row => new Date(row.timestamp).toISOString().slice(11, 16));
  predictionChart!.options.scales!.x!.ticks!.callback = value => labels[Number(value)] ?? '';
  predictionChart!.update();
  $('lab-metrics').textContent = readings.map((row, index) => `${labels[index]}Z  ${row.rainfall_mm_hr.toFixed(1)} mm/h`).join('   ·   ');
  $('lab-note').textContent = 'Read the original six observations first. A mean compresses them into one summary value; it does not show when the peak arrived.';
}

async function calculateSixHourAverage() {
  const stationId = ($('lab-station') as HTMLSelectElement).value;
  const readings = hourlyRainfallForStation(stationId);
  if (readings.length !== 6 || !sessionId) { notify('Meteo AI: six hourly station readings are needed for this calculation.'); return; }
  try {
    const result = await calculateStatistics(readings.map(row => row.rainfall_mm_hr), sessionId);
    const label = `${result.sum.toFixed(1)} ÷ ${result.count} = ${result.mean.toFixed(1)} mm/h`;
    predictionChart!.data.datasets.push({
      label: `Six-hour mean · ${result.mean.toFixed(1)} mm/h`,
      data: [{ x: 0, y: result.mean }, { x: 5, y: result.mean }],
      showLine: true, borderColor: '#f2c96e', backgroundColor: '#f2c96e', pointRadius: 0, borderDash: [5, 4], borderWidth: 2,
    });
    predictionChart!.update();
    $('lab-forecast-output').textContent = `VISUAL MEAN · ${label}`;
    $('lab-metrics').textContent = `${result.sum.toFixed(1)} mm/h across ${result.count} hourly observations`;
    $('lab-note').textContent = `Formula: mean = total rainfall ÷ number of readings. ${result.mean.toFixed(1)} mm/h summarizes this six-hour watch.`;
    if (uiState.getState().gameMode === 'guided-campaign' && campaignProgress.stageId === 'first-drop') {
      guidedTutorial.completeAction('calculate-six-hour-average', {
        stationId, count: result.count, mean: result.mean, apiSucceeded: Number.isFinite(result.mean),
      });
    }
    markCampaignObjectiveId('average', `The mean rainfall is ${result.mean.toFixed(1)} mm/h. Notice how it summarizes all six points.`);
  } catch (error) { showApiError(error); }
}

let smoothingDebounce: number | undefined;
function requestSmoothingForCurrentWindow(fromPlayer = false) {
  const stationId = ($('lab-station') as HTMLSelectElement).value;
  const windowSize = Number(($('lab-window') as HTMLInputElement).value);
  $('window-output').textContent = String(windowSize);
  if (smoothingDebounce !== undefined) window.clearTimeout(smoothingDebounce);
  const requestId = ++stageChartRequestId;
  smoothingDebounce = window.setTimeout(() => void (async () => {
    const readings = stationStormSeries(stationId);
    if (!sessionId || readings.length < windowSize) return;
    try {
      const [average, rawStats] = await Promise.all([
        calculateMovingAverage(readings.map(row => row.rainfall_mm_hr), windowSize, readings.map(row => row.timestamp), sessionId),
        calculateStatistics(readings.map(row => row.rainfall_mm_hr), sessionId),
      ]);
      if (requestId !== stageChartRequestId) return;
      const smoothStats = await calculateStatistics(average.values, sessionId);
      if (requestId !== stageChartRequestId) return;
      if (fromPlayer) windowSizesTried.add(windowSize);
      const startX = windowSize - 1;
      drawScatter([
        { label: 'Measured rainfall', data: readings.map((row, index) => ({ x: index, y: row.rainfall_mm_hr })), showLine: true, borderColor: '#668f80', backgroundColor: '#668f80', pointRadius: 1.5, borderWidth: 1 },
        { label: `${windowSize}-reading moving average`, data: average.values.map((value, index) => ({ x: startX + index, y: value })), showLine: true, borderColor: '#f0c96e', backgroundColor: '#f0c96e', pointRadius: 2, borderWidth: 2.5 },
      ], 'LATEST STORM · 10-MINUTE READINGS', 'RAINFALL · mm/h');
      $('lab-metrics').textContent = `RAW σ ${rawStats.standard_deviation.toFixed(1)} mm/h  ·  SMOOTHED σ ${smoothStats.standard_deviation.toFixed(1)} mm/h  ·  ${readings.length} observations`;
      $('lab-note').textContent = `A ${windowSize}-reading window averages each run of ${windowSize} consecutive values. Here, variability changes from ${rawStats.standard_deviation.toFixed(1)} to ${smoothStats.standard_deviation.toFixed(1)} mm/h; compare the gold trend with the sharpest peak.`;
      if (fromPlayer && uiState.getState().gameMode === 'guided-campaign' && campaignProgress.stageId === 'hidden-pattern') {
        if (windowSizesTried.size >= 2) {
          markCampaignObjectiveId('window-experiment', 'Two window sizes were compared using Python results. A wider window smooths more, but can hide a sudden rain pulse.');
          guidedTutorial.completeAction('moving-average-computed', { success: true, windowCount: windowSizesTried.size });
        }
      }
    } catch (error) { showApiError(error); }
  })(), 120);
}

function renderStageOne() {
  const stationId = ($('lab-station') as HTMLSelectElement).value || 'weather-central';
  const readings = hourlyRainfallForStation(stationId);
  historicalDataRevealed = readings.length === 6;
  paintSixHourRain(stationId);
  if (uiState.getState().gameMode === 'guided-campaign' && campaignProgress.stageId === 'first-drop') {
    guidedTutorial.completeAction('inspect-historical-data', {
      stationId, readingCount: readings.length, chartReady: readings.length === 6 && predictionChart !== null,
    });
  }
}

async function renderRegressionStage(stage: 'predict-flood' | 'prediction-failure') {
  if (!gameState) return;
  const stationId = ($('lab-station') as HTMLSelectElement).value || 'weather-central';
  const requestId = ++stageChartRequestId;
  $('lab-metrics').textContent = 'PYTHON IS PREPARING TRAINING AND UNSEEN STORM OBSERVATIONS…';
  try {
    const data = await buildPredictionLab(gameState, stationId, Number(($('lab-window') as HTMLInputElement).value));
    if (requestId !== stageChartRequestId) return;
    predictionLabData = data;
    if (stage === 'predict-flood') $('lab-metrics').textContent = `${data.split.training_count} training observations are ready.`;
    else $('lab-metrics').textContent = `${data.split.heldout_count} unseen observations are ready for model comparison.`;
  } catch (error) {
    $('lab-metrics').textContent = error instanceof Error ? `ANALYSIS FAILED · ${error.message}` : 'ANALYSIS FAILED · Python analytics error';
    showApiError(error);
  }
}

function paintManualRegressionStage(data: PredictionLabData) {
  const train = data.training_observations;
  const x = train.map(row => row.rainfall_mm_hr);
  const y = train.map(row => row.water_depth_mm);
  const minX = Math.min(...x), maxX = Math.max(...x);
  const middleY = y.reduce((sum, value) => sum + value, 0) / y.length;
  manualLine = { x: [minX, maxX], y: [middleY, middleY] };
  manualLineResult = null;
  drawScatter([
    { label: 'Training observations', data: train.map(row => ({ x: row.rainfall_mm_hr, y: row.water_depth_mm })), backgroundColor: '#79d2bc', borderColor: '#79d2bc', pointRadius: 2.4 },
    { label: 'Unseen observations', data: data.heldout_observations.map(row => ({ x: row.rainfall_mm_hr, y: row.water_depth_mm })), backgroundColor: '#f1c974', borderColor: '#f1c974', pointRadius: 2.7 },
    { label: 'Drag either orange endpoint', data: [{ x: manualLine.x[0], y: manualLine.y[0] }, { x: manualLine.x[1], y: manualLine.y[1] }], showLine: true, backgroundColor: '#f28b72', borderColor: '#f28b72', pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5 },
    { label: 'Forecast output', data: forecastChartPoints, backgroundColor: '#ffe696', borderColor: '#ffe696', pointRadius: 3.5 },
  ], 'RAINFALL · mm/h', 'WATER DEPTH · mm');
  $('lab-metrics').textContent = 'Drag an orange endpoint to adjust your prediction line.';
  $('lab-note').textContent = 'Vertical dashed segments show residual distance after Python evaluates your line.';
  $('lab-forecast-output').textContent = 'Your line is ready. Compare its distances from the training points.';
  bindManualLineDrag();
}

function bindManualLineDrag() {
  const canvas = $('regression-chart') as HTMLCanvasElement;
  canvas.onpointerdown = event => {
    if (campaignProgress.stageId !== 'predict-flood' || !predictionChart || !manualLine) return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * predictionChart.width / rect.width;
    const py = (event.clientY - rect.top) * predictionChart.height / rect.height;
    const xs = [predictionChart.scales.x.getPixelForValue(manualLine.x[0]), predictionChart.scales.x.getPixelForValue(manualLine.x[1])];
    const ys = [predictionChart.scales.y.getPixelForValue(manualLine.y[0]), predictionChart.scales.y.getPixelForValue(manualLine.y[1])];
    const distances = xs.map((x, index) => Math.hypot(px - x, py - ys[index]));
    const nearest = distances[0] < distances[1] ? 0 : 1;
    if (distances[nearest] < 20) { draggingManualEndpoint = nearest as 0 | 1; canvas.setPointerCapture(event.pointerId); }
  };
  canvas.onpointermove = event => {
    if (draggingManualEndpoint === null || !predictionChart || !manualLine) return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * predictionChart.width / rect.width;
    const py = (event.clientY - rect.top) * predictionChart.height / rect.height;
    const endpoint = draggingManualEndpoint;
    manualLine.x[endpoint] = predictionChart.scales.x.getValueForPixel(px) ?? manualLine.x[endpoint];
    manualLine.y[endpoint] = Math.max(0, predictionChart.scales.y.getValueForPixel(py) ?? manualLine.y[endpoint]);
    const line = predictionChart.data.datasets[2].data as { x: number; y: number }[];
    line[endpoint] = { x: manualLine.x[endpoint], y: manualLine.y[endpoint] };
    predictionChart.update('none');
    scheduleManualLineUpdate();
  };
  canvas.onpointerup = () => { if (draggingManualEndpoint !== null) { draggingManualEndpoint = null; void updateManualLineFromPython(true); } };
  canvas.onpointercancel = canvas.onpointerup;
}

function scheduleManualLineUpdate() {
  if (manualLineDebounce !== undefined) window.clearTimeout(manualLineDebounce);
  manualLineDebounce = window.setTimeout(() => void updateManualLineFromPython(true), 180);
}

async function updateManualLineFromPython(playerDragged: boolean) {
  if (!manualLine || !predictionLabData || !sessionId) return;
  try {
    const all = stationAllSeries(predictionLabData.station.station_id);
    const response = await fitRegression(all.map(row => row.rainfall_mm_hr), all.map(row => row.water_depth_mm), sessionId, manualLine);
    manualLineResult = response.manual_line ?? null;
    if (manualLineResult) {
      const residualPoints = predictionLabData.training_observations.map((row, index) => ({
        x: row.rainfall_mm_hr, actual: row.water_depth_mm,
        predicted: manualLineResult!.fitted_predictions[index],
      }));
      const datasets = predictionChart?.data.datasets as unknown as Array<Record<string, unknown>>;
      drawScatter(datasets, 'RAINFALL · mm/h', 'WATER DEPTH · mm', { points: residualPoints });
      bindManualLineDrag();
      $('lab-metrics').textContent = `YOUR LINE · SLOPE ${manualLineResult.slope.toFixed(3)} · INTERCEPT ${manualLineResult.intercept.toFixed(1)} · TRAINING MAE ${manualLineResult.mae.toFixed(1)} mm`;
      $('lab-forecast-output').textContent = `Manual line scored by Python · training MAE ${manualLineResult.mae.toFixed(1)} mm. Set a rainfall value below to run the trained-model forecast.`;
      if (playerDragged) $('meteo').textContent = `Your line misses by ${manualLineResult.mae.toFixed(1)} mm on average. Inspect the dashed residuals, then adjust its slope or intercept.`;
      if (playerDragged) {
        markCampaignObjectiveId('manual-line', 'METEO AI: each dashed segment is a residual—the gap between your estimate and an observed training depth.');
        guidedTutorial.completeAction('manual-line-adjusted', { success: Number.isFinite(manualLineResult.mae) });
      }
    }
  } catch (error) { showApiError(error); }
}

async function calculateBestFitLine() {
  if (!predictionLabData || !sessionId) return;
  try {
    const observations = stationAllSeries(predictionLabData.station.station_id);
    const result = await fitRegression(observations.map(row => row.rainfall_mm_hr), observations.map(row => row.water_depth_mm), sessionId);
    const datasets = predictionChart?.data.datasets as unknown as Array<Record<string, unknown>>;
    const bestFit = {
      label: 'Python least-squares best fit',
      data: result.prediction_line.x.map((value, index) => ({ x: value, y: result.prediction_line.y[index] })),
      showLine: true, backgroundColor: '#a9d28b', borderColor: '#a9d28b', pointRadius: 0, borderWidth: 2,
    };
    const existing = datasets.findIndex(item => item.label === bestFit.label);
    if (existing >= 0) datasets[existing] = bestFit; else datasets.splice(3, 0, bestFit);
    predictionChart?.update();
    $('lab-note').textContent = `Best fit from Python training data: depth = ${result.slope.toFixed(3)} × rainfall ${result.intercept < 0 ? '−' : '+'} ${Math.abs(result.intercept).toFixed(2)}. It minimizes squared training residuals.`;
    markCampaignObjectiveId('best-fit', `Python calculated slope ${result.slope.toFixed(3)} and intercept ${result.intercept.toFixed(2)} from the training observations.`);
    guidedTutorial.completeAction('calculate-best-fit', { success: Number.isFinite(result.slope) && Number.isFinite(result.intercept) });
  } catch (error) { showApiError(error); }
}

function paintModelPredictions(data: PredictionLabData) {
  drawScatter([
    { label: 'Moving-average baseline prediction', data: data.evaluation.moving_average.predictions_mm.map((value, index) => ({ x: index, y: value })), showLine: true, borderColor: '#79d2bc', backgroundColor: '#79d2bc', pointRadius: 1, borderWidth: 2 },
    { label: 'Regression prediction', data: data.evaluation.linear_regression.predictions_mm.map((value, index) => ({ x: index, y: value })), showLine: true, borderColor: '#f28b72', backgroundColor: '#f28b72', pointRadius: 1, borderWidth: 2 },
  ], 'UNSEEN OBSERVATIONS · CHRONOLOGICAL ORDER', 'PREDICTED WATER DEPTH · mm');
  $('lab-metrics').textContent = 'Two forecasts · actual depths still hidden';
  $('lab-note').textContent = 'Both models predict the same later observation period. Compare their shapes before revealing measured depths.';
}

function paintEvaluationObservations(data: PredictionLabData, includeMetrics: boolean) {
  const actual = data.heldout_observations.map(row => row.water_depth_mm);
  const moving = data.evaluation.moving_average.predictions_mm;
  const regression = data.evaluation.linear_regression.predictions_mm;
  drawScatter([
    { label: 'Actual unseen water depth', data: actual.map((value, index) => ({ x: index, y: value })), showLine: true, borderColor: '#f1c974', backgroundColor: '#f1c974', pointRadius: 2, borderWidth: 2 },
    { label: 'Moving-average prediction', data: moving.map((value, index) => ({ x: index, y: value })), showLine: true, borderColor: '#79d2bc', backgroundColor: '#79d2bc', pointRadius: 1, borderWidth: 1.5 },
    { label: 'Regression prediction', data: regression.map((value, index) => ({ x: index, y: value })), showLine: true, borderColor: '#f28b72', backgroundColor: '#f28b72', pointRadius: 1, borderWidth: 1.5 },
  ], 'UNSEEN OBSERVATIONS · CHRONOLOGICAL ORDER', 'WATER DEPTH · mm');
  $('lab-metrics').textContent = includeMetrics ? 'Validation results received from Python.' : `${actual.length} measured depths revealed · calculate errors when ready`;
}

async function calculateModelErrors() {
  const data = predictionLabData;
  if (!data || !sessionId) return;
  try {
    const result = await evaluateModels(
      data.heldout_observations.map(row => row.water_depth_mm),
      data.evaluation.moving_average.predictions_mm,
      data.evaluation.linear_regression.predictions_mm,
      data.heldout_observations.map(row => row.timestamp),
      sessionId,
    );
    data.evaluation = {
      sample_count: result.sample_count,
      moving_average: { metrics: result.moving_average.metrics, predictions_mm: result.moving_average.predictions },
      linear_regression: { metrics: result.linear_regression.metrics, predictions_mm: result.linear_regression.predictions },
    };
    paintEvaluationStage(data);
    const moving = result.moving_average.metrics;
    const regression = result.linear_regression.metrics;
    const better = moving.mae < regression.mae ? 'The moving-average baseline' : moving.mae > regression.mae ? 'The regression model' : 'Both models';
    $('lab-note').textContent = `${better} had the lower MAE on this shared validation period. RMSE also shows whether a few large misses changed the comparison.`;
    markCampaignObjectiveId('compare-errors', `Python evaluated both models on the same ${result.sample_count} unseen observations.`);
    guidedTutorial.completeAction('calculate-model-errors', { success: result.sample_count > 0 && Number.isFinite(moving.mae) && Number.isFinite(regression.rmse) });
  } catch (error) { showApiError(error); }
}

function paintEvaluationStage(data: PredictionLabData) {
  const actual = data.heldout_observations.map(row => row.water_depth_mm);
  const moving = data.evaluation.moving_average.predictions_mm;
  const regression = data.evaluation.linear_regression.predictions_mm;
  const chosen = selectedEvaluationModel === 'moving_average' ? moving : regression;
  paintEvaluationObservations(data, true);
  if (predictionChart) {
    const residualPoints = chosen.map((predicted, index) => ({ x: index, actual: actual[index], predicted }));
    const datasets = predictionChart.data.datasets as unknown as Array<Record<string, unknown>>;
    drawScatter(datasets, 'UNSEEN OBSERVATIONS · CHRONOLOGICAL ORDER', 'WATER DEPTH · mm', { points: residualPoints });
  }
  const ma = data.evaluation.moving_average.metrics, lr = data.evaluation.linear_regression.metrics;
  $('lab-metrics').innerHTML = `<span>SHARED HOLDOUT · ${data.evaluation.sample_count}</span><span>BASELINE MAE ${ma.mae.toFixed(1)} · RMSE ${ma.rmse.toFixed(1)}</span><span>REGRESSION MAE ${lr.mae.toFixed(1)} · RMSE ${lr.rmse.toFixed(1)}</span>`;
  $('lab-note').textContent = `Gold dashed distances show errors for your selected model (${selectedEvaluationModel === 'moving_average' ? 'moving average' : 'regression'}). Lower MAE means smaller average misses; RMSE weighs large misses more. Correlation does not establish causation.`;
  $('lab-correlations').innerHTML = Object.values(data.correlations).map(item => `<span>${item.label}<b>${item.coefficient === null ? '—' : `r ${item.coefficient.toFixed(2)}`}</b></span>`).join('');
}

async function loadStageExperiment() {
  if (!gameState) return;
  const stage = campaignProgress.stageId;
  const completed = campaignProgress.completedStageIds.includes(stage);
  if (stage === 'first-drop') {
    renderStageOne();
    if (completed) await calculateSixHourAverage();
  }
  else if (stage === 'hidden-pattern') {
    windowSizesTried = new Set();
    $('lab-metrics').textContent = 'Measured rainfall is ready. Reveal the graph to begin.';
    $('lab-note').textContent = '';
    if (completed) requestSmoothingForCurrentWindow(false);
  } else if (stage === 'predict-flood' || stage === 'prediction-failure') {
    await renderRegressionStage(stage);
    if (completed && predictionLabData) {
      if (stage === 'predict-flood') {
        paintManualRegressionStage(predictionLabData);
        await updateManualLineFromPython(false);
        await calculateBestFitLine();
      } else paintEvaluationStage(predictionLabData);
    }
  }
  else renderScenarioProgress();
}

function renderScenarioProgress() {
  const rows = scenarioHistory;
  drawScatter([
    { label: 'Actual maximum water depth · mm', data: rows.map(point => ({ x: point.x, y: point.y })), showLine: true, borderColor: '#68c7d3', backgroundColor: '#68c7d3', pointRadius: 2.5, borderWidth: 2 },
    { label: 'Actual rainfall · mm/h', data: rows.map(point => ({ x: point.x, y: point.rainfall })), showLine: true, borderColor: '#f0c96e', backgroundColor: '#f0c96e', pointRadius: 2, borderWidth: 1.5 },
  ], 'STORM STEP · 10 MINUTES EACH', 'DEPTH · mm / RAIN · mm/h');
  $('lab-metrics').hidden = false;
  $('lab-metrics').textContent = gameState?.scenario_progress.active
    ? `STORM ACTIVE · ${gameState.scenario_progress.step} / ${gameState.scenario_progress.total_steps} STEPS · NEXT RAIN ${gameState.scenario_progress.next_rainfall_mm_hr?.toFixed(1) ?? '—'} mm/h`
    : gameState?.scenario_progress.complete ? 'SCENARIO RAINFALL RECORD COMPLETE · EVALUATE ACCESS' : 'Storm time series appears here as you advance the Python simulation.';
  $('lab-note').textContent = 'Both lines update from Python snapshots: rainfall intensity on the gold line, maximum water depth on the blue line. The map shows where that water is accumulating.';
}

async function beginFloodScenario() {
  if (!sessionId) return;
  try {
    const state = await serializeStateAction(() => startFloodScenario(sessionId!));
    scenarioHistory = [{ x: 0, y: state.simulation.maximum_water_depth_mm, rainfall: state.rainfall_mm_per_hour }];
    lastMeteoContextStep = -3;
    syncGameState(state, true);
    paused = true;
    syncPauseButton();
    renderStageActions();
    renderScenarioProgress();
    markCampaignObjectiveId('start-storm', 'The rainfall timeline is live. Watch the low hospital approach as the river basin fills.');
    guidedTutorial.completeAction('start-eastbank-storm', { success: state.scenario_progress.started === true });
    $('rainfall-control').setAttribute('disabled', 'true');
    ($('rainfall-control') as HTMLInputElement).disabled = true;
    $('response-hint').textContent = 'Storm prepared. Choose equipment on the map, then RUN RESPONSE when ready.';
  } catch (error) { showApiError(error); }
}

function evaluateCityAccess() {
  if (!gameState) return;
  if (!gameState.scenario_progress.complete) {
    $('lab-forecast-output').textContent = `INTERIM STATUS · ${gameState.scenario_progress.step} / ${gameState.scenario_progress.total_steps} storm steps. Keep the response running to see the full rainfall and water-level progression.`;
    notify('Meteo AI: the final access review unlocks when the synthetic storm record finishes. Keep watching the map and protecting the hospital route.');
    return;
  }
  const outcome = gameState.response_outcome;
  const ending = (outcome.ending ?? 'Response incomplete').toUpperCase();
  const report = `${ending}. Score ${outcome.score} out of 1000. Hospital access: ${outcome.hospital_access}. School access: ${outcome.school_access}. ${outcome.total_flooded_cells} flooded cells, ${outcome.flooded_road_count} flooded road cells and ${outcome.residents_evacuated} residents evacuated. Pumps removed ${outcome.pump_water_removed_m3.toFixed(1)} m³. Remaining budget: ${outcome.remaining_budget_credits} credits.`;
  $('lab-forecast-output').textContent = report;
  showBriefing(ending, report);
  $('lab-note').textContent = `Risk marking ${outcome.score_breakdown.risk_identification}/150 · Hospital ${outcome.score_breakdown.hospital_protection}/200 · Roads ${outcome.score_breakdown.road_accessibility}/150 · Homes ${outcome.score_breakdown.residential_protection}/150 · Efficiency ${outcome.score_breakdown.resource_efficiency}/150. Outcomes come from the simulated water and deployed resources.`;
  markCampaignObjectiveId('evaluate-access', `${ending}. Score ${outcome.score}/1000; hospital ${outcome.hospital_access}; ${outcome.flooded_road_count} flooded road cells; ${outcome.residents_evacuated} evacuated.`);
  guidedTutorial.completeAction('evaluate-city-report', { success: outcome.finalized === true });
}

function paintPredictionLab(data: PredictionLabData) {
  predictionLabData = data;
  forecastChartPoints = [];
  const chartElement = $('regression-chart') as HTMLCanvasElement;
  predictionChart?.destroy();
  predictionChart = new Chart<'scatter', { x: number; y: number }[]>(chartElement, {
    type: 'scatter',
    data: { datasets: [
      {
        label: 'Training observations',
        data: data.training_observations.map(row => ({ x: row.rainfall_mm_hr, y: row.water_depth_mm })),
        backgroundColor: '#79d2bc', borderColor: '#79d2bc', pointRadius: 2.3, pointHoverRadius: 5,
      },
      {
        label: 'Unseen observations',
        data: data.heldout_observations.map(row => ({ x: row.rainfall_mm_hr, y: row.water_depth_mm })),
        backgroundColor: '#f1c974', borderColor: '#f1c974', pointRadius: 2.7, pointHoverRadius: 5,
      },
      {
        label: 'Least-squares fitted line',
        data: data.regression.prediction_line.x.map((x, index) => ({ x, y: data.regression.prediction_line.y[index] })),
        showLine: true, backgroundColor: '#f28b72', borderColor: '#f28b72', pointRadius: 0,
        pointHoverRadius: 0, borderWidth: 2, order: 0,
      },
      {
        label: 'Forecast at selected rainfall', data: forecastChartPoints,
        backgroundColor: '#ffe696', borderColor: '#ffe696', pointRadius: 3.5, pointHoverRadius: 5,
      },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 230 },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#b9cbbd', boxWidth: 8, boxHeight: 8, padding: 10, font: { size: 8 } } },
        tooltip: { callbacks: { label: context => `${context.dataset.label}: rain ${Number(context.parsed.x).toFixed(1)} mm/h, depth ${Number(context.parsed.y).toFixed(1)} mm` } },
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'RAIN INTENSITY · mm/h', color: '#91a79a', font: { size: 8 } }, ticks: { color: '#91a79a', maxTicksLimit: 6, font: { size: 7 } }, grid: { color: '#34443e' } },
        y: { title: { display: true, text: 'WATER DEPTH · mm', color: '#91a79a', font: { size: 8 } }, ticks: { color: '#91a79a', maxTicksLimit: 5, font: { size: 7 } }, grid: { color: '#34443e' } },
      },
    },
  });

  const baseline = data.evaluation.moving_average.metrics;
  const regression = data.evaluation.linear_regression.metrics;
  const waterCorrelation = data.correlations.rainfall_water_depth.coefficient;
  $('lab-metrics').innerHTML = `
    <span><b>${data.split.training_count}</b> TRAIN · <b>${data.split.heldout_count}</b> UNSEEN</span>
    <span>MA BASELINE&nbsp; MAE ${baseline.mae.toFixed(1)} · RMSE ${baseline.rmse.toFixed(1)}</span>
    <span>REGRESSION&nbsp; MAE ${regression.mae.toFixed(1)} · RMSE ${regression.rmse.toFixed(1)}</span>
    <span>r = ${waterCorrelation === null ? 'undefined' : waterCorrelation.toFixed(2)}</span>`;
  $('lab-correlations').innerHTML = Object.values(data.correlations)
    .map(item => `<span>${item.label}<b>${item.coefficient === null ? '—' : `r ${item.coefficient.toFixed(2)}`}</b></span>`).join('');
  $('lab-note').textContent = `Training-only line: depth = ${data.regression.slope.toFixed(3)} × rain ${data.regression.intercept < 0 ? '−' : '+'} ${Math.abs(data.regression.intercept).toFixed(2)}. Correlation does not establish causation.`;
  $('lab-forecast-output').textContent = 'Adjust rainfall and run a forecast to see the model response.';
}

async function loadPredictionLab() {
  const requestId = ++labRequestId;
  const pane = $('prediction-lab');
  pane.hidden = false;
  $('lab-metrics').textContent = 'FITTING MODEL TO EASTBANK STORM HISTORY…';
  const stationId = ($('lab-station') as HTMLSelectElement).value || 'weather-central';
  const windowSize = Number(($('lab-window') as HTMLSelectElement).value || 6);
  try {
    if (!gameState) throw new ApiError('Start a new Eastbank session before opening the prediction lab.');
    const data = await buildPredictionLab(gameState, stationId, windowSize);
    if (requestId !== labRequestId) return;
    paintPredictionLab(data);
  } catch (error) {
    if (requestId !== labRequestId) return;
    $('lab-metrics').textContent = error instanceof Error ? `ANALYSIS FAILED · ${error.message}` : 'ANALYSIS FAILED · Unknown service error';
    $('lab-note').textContent = 'Check the Python analytics service before trying again.';
    notify('Meteo AI: the prediction lab could not load its Python training observations.');
  }
}

async function runLabForecast() {
  if (!predictionLabData) { await renderRegressionStage('predict-flood'); if (!predictionLabData) return; }
  if (!sessionId || !gameState) { $('lab-forecast-output').textContent = 'Start a backend game session before forecasting.'; return; }
  const button = $('run-forecast') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'CALCULATING…';
  const rainfall = Number(($('lab-rainfall') as HTMLInputElement).value);
  const horizon = Number(($('lab-horizon') as HTMLInputElement).value);
  try {
    const result = await requestForecast(
      sessionId,
      predictionLabData.station.station_id,
      Array.from({ length: horizon }, () => rainfall),
      gameState.seed,
      predictionLabData.window_size,
    );
    forecastChartPoints = result.predictions.map(item => ({ x: item.rainfall_mm_hr, y: item.predicted_value_mm }));
    if (predictionChart) {
      const output = predictionChart.data.datasets.find(dataset => dataset.label === 'Forecast output');
      if (output) output.data = forecastChartPoints;
      predictionChart.update();
    }
    const first = result.predictions[0];
    const last = result.predictions[result.predictions.length - 1];
    $('lab-forecast-output').textContent = `${result.predictions.length} × 10 min · first ${first.predicted_value_mm.toFixed(1)} mm · last ${last.predicted_value_mm.toFixed(1)} mm · MA baseline ${first.moving_average_baseline_mm.toFixed(1)} mm`;
    markCampaignObjectiveId('rainfall-forecast', `At ${rainfall} mm/h, the trained regression forecasts ${first.predicted_value_mm.toFixed(1)} mm for the next ten minutes.`);
    guidedTutorial.completeAction('rainfall-forecast', { success: result.predictions.length > 0 && Number.isFinite(first.predicted_value_mm) });
    notify(`Prediction lab: ${rainfall} mm/h at ${result.station.name} gives ${first.predicted_value_mm.toFixed(1)} mm estimated depth in the first step.`);
  } catch (error) {
    $('lab-forecast-output').textContent = error instanceof Error ? `FORECAST FAILED · ${error.message}` : 'FORECAST FAILED · Unknown service error';
    notify('Meteo AI: forecast request failed; check the Python service and retry.');
  } finally {
    button.disabled = false;
    button.textContent = 'RUN FORECAST ↗';
  }
}

function showWeather(data: GameState) {
  $('weather-cards').innerHTML = data.weather_observations.map(reading => `
    <div class="weather-reading"><b>${reading.name.replace('Weather Station ', '')}</b><span>${reading.rainfall_mm_hr.toFixed(1)} <small>mm/h</small></span><small>${reading.wind_kmh.toFixed(0)} km/h · ${reading.air_pressure_hpa.toFixed(0)} hPa</small></div>`).join('');
}

function validatePlacement(cell: MapCell): boolean {
  if (!chosenResource || !gameState) return false;
  const waterway = cell.terrain_type === 'river' || cell.terrain_type === 'canal';
  const available = chosenResource.cost <= budget && chosenResource.count > 0;
  if (chosenResource.id === 'pump') return available && !cell.building_id && !waterway && cell.can_water_flow;
  if (chosenResource.id === 'rescue-boat') return available && !cell.building_id && (cell.is_road || waterway);
  const delta: Record<typeof barrierDirection, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const [dx, dy] = delta[barrierDirection];
  const x = cell.x + dx, y = cell.y + dy;
  if (!available || x < 0 || x >= gameState.columns || y < 0 || y >= gameState.rows) return false;
  const edge = [[cell.x, cell.y], [x, y]].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([ex, ey]) => `${ex},${ey}`).join(':');
  return !gameState.resources.barriers.some(item => {
    const bx = item.position.x, by = item.position.y;
    const neighbor = { N: [bx, by - 1], E: [bx + 1, by], S: [bx, by + 1], W: [bx - 1, by] }[item.direction];
    return [[bx, by], neighbor].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([ex, ey]) => `${ex},${ey}`).join(':') === edge;
  });
}

function updatePlacementPreview(cell: MapCell | null, commitTarget = false) {
  if (!chosenResource) return;
  if (!cell) { if (!pendingPlacement) scene.setPlacementPreview(null); return; }
  const valid = validatePlacement(cell);
  if (commitTarget) pendingPlacement = { cell, valid };
  scene.setPlacementPreview({ cell, valid, resourceId: chosenResource.id as 'pump' | 'barrier' | 'rescue-boat', direction: barrierDirection });
  if (commitTarget) {
    $('response-hint').textContent = `${valid ? 'VALID PREVIEW' : 'INVALID LOCATION'} · ${chosenResource.name} at ${cell.x}, ${cell.y} · ${chosenResource.cost} CR`;
    ($('confirm-placement') as HTMLButtonElement).disabled = !valid;
  }
}

function renderPlacementState() {
  const active = Boolean(chosenResource);
  $('placement-cost').textContent = active ? `${chosenResource!.cost} CREDITS · ${budget} AVAILABLE` : 'NO EQUIPMENT SELECTED';
  $('barrier-direction-wrap').toggleAttribute('hidden', chosenResource?.id !== 'barrier');
  ($('confirm-placement') as HTMLButtonElement).disabled = !pendingPlacement?.valid;
  ($('cancel-placement') as HTMLButtonElement).disabled = !active;
  if (!active) scene?.setPlacementMode(false);
}

async function confirmPlacement() {
  if (!chosenResource || !pendingPlacement?.valid || !sessionId) return;
  const resource = chosenResource;
  const activeSessionId = sessionId;
  const placement = {
    resource_type: resource.id as 'pump' | 'barrier' | 'rescue-boat',
    x: pendingPlacement.cell.x,
    y: pendingPlacement.cell.y,
    ...(resource.id === 'barrier' ? { direction: barrierDirection } : {}),
  };
  try {
    const state = await serializeStateAction(() => placeResource(activeSessionId, placement));
    chosenResource = null;
    pendingPlacement = null;
    scene.setPlacementMode(false);
    $('response-hint').textContent = `${resource.name} deployed at ${placement.x}, ${placement.y}. Pump contribution and evacuation update from the Python state.`;
    syncGameState(state);
    if (campaignProgress.stageId === 'save-novara') {
      markCampaignObjectiveId('place-resource', `${resource.name} was deployed at grid ${placement.x}, ${placement.y}.`);
      guidedTutorial.completeAction('place-resource', { success: true, resource: resource.id, x: placement.x, y: placement.y });
    }
    notify(`${resource.name} deployed at ${placement.x}, ${placement.y}. Budget and inventory came from the backend.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resource deployment failed.';
    $('map-status').textContent = error instanceof ApiError && error.status === 422 ? 'PLACEMENT REJECTED' : 'DEPLOYMENT FAILED';
    $('map-status').classList.add('offline');
    notify(`Meteo AI: ${message}`);
  }
}

function renderResources() {
  $('resources').innerHTML = inventory.map(resource => `
    <button class="resource-button ${chosenResource?.id === resource.id ? 'selected' : ''}" data-resource="${resource.id}" title="Select ${resource.name} for map deployment">
      <i class="resource-glyph ${resource.id}">${resource.id === 'pump' ? '↯' : resource.id === 'barrier' ? '▤' : '✚'}</i><span>${resource.name}<small>${resource.count} AVAILABLE · ${resource.cost.toLocaleString()} CR</small></span><b>×${resource.count}</b>
    </button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-resource]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.resource!;
    const resource = inventory.find(item => item.id === id);
    if (!resource || resource.count <= 0) { notify('No units of this resource remain in the Eastbank inventory.'); return; }
    if (resource.cost > budget) { notify('Meteo AI: the remaining response budget cannot cover that deployment.'); return; }
    chosenResource = resource;
    pendingPlacement = null;
    setMode('response');
    scene.setPlacementMode(true);
    document.querySelectorAll('.mode-button').forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-mode') === uiState.getState().activityMode));
    renderResources();
    $('response-hint').textContent = `Drag over the city to preview ${resource.name.toLowerCase()}; click a location, then confirm. ESC cancels.`;
    renderPlacementState();
    notify(`${resource.name} selected. Placement costs ${resource.cost} credits; nothing is charged until confirmation.`);
  }));
}

function onSelected(cell: MapCell) {
  selectedCell = cell;
  ($('mark-risk') as HTMLButtonElement).disabled = false;
  if (chosenResource) {
    updatePlacementPreview(cell, true);
    return;
  }
  const location = mapData?.locations.find(place => place.id === cell.building_id || place.id === cell.interactive_object_id);
  const placedPump = gameState?.resources.pumps.find(item => item.grid_position.x === cell.x && item.grid_position.y === cell.y);
  const placedBoat = gameState?.resources.rescue_boats.find(item => item.grid_position.x === cell.x && item.grid_position.y === cell.y);
  const placedBarrier = gameState?.resources.barriers.find(item => item.position.x === cell.x && item.position.y === cell.y);
  const observation = mapData?.weather_observations.find(report => report.station_id === cell.interactive_object_id);
  const objectId = cell.interactive_object_id;
  const title = placedPump ? 'Installed drainage pump' : placedBoat ? 'Rescue boat' : placedBarrier ? 'Flood barrier edge' : location?.name ?? (objectId?.startsWith('drain-') ? 'Storm Drain Inlet' : cell.terrain_type === 'river' ? 'Eastbank River' : cell.terrain_type === 'canal' ? 'Eastbank Drainage Canal' : cell.building_id ? 'Residential Block' : cell.terrain_type === 'road' ? 'Roadway' : cell.terrain_type === 'park' ? 'Green Space' : 'Open Ground');
  const subtitle = placedPump ? `${placedPump.drainage_capacity_mm_hr} MM/H PUMP · ${placedPump.operating_radius_cells} CELL RADIUS` : placedBoat ? `${placedBoat.evacuation_capacity} PERSON CAPACITY · ${placedBoat.operating_radius_cells} CELL RANGE` : placedBarrier ? `${placedBarrier.height_mm} MM CREST · ${placedBarrier.direction} EDGE` : observation ? 'WEATHER MONITORING STATION' : objectId?.startsWith('drain-') ? 'INTERACTIVE DRAINAGE INLET' : location?.kind.toUpperCase().replace('_', ' ') ?? cell.terrain_type.toUpperCase();
  $('selected-name').textContent = title;
  $('selected-subtitle').textContent = subtitle;
  $('selected-icon').textContent = placedPump ? '↯' : placedBoat ? '✚' : placedBarrier ? '▤' : location?.kind === 'hospital' ? '+' : location?.kind === 'school' ? 'S' : observation ? '⌁' : objectId?.startsWith('drain-') ? '▦' : cell.terrain_type === 'river' || cell.terrain_type === 'canal' ? '≈' : '⌖';
  $('selected-icon').className = 'selected-icon ' + (location?.kind ?? (observation ? 'weather' : objectId?.startsWith('drain-') ? 'drain' : 'site'));
  $('selected-coord').textContent = `${cell.x}, ${cell.y}`;
  $('selected-elevation').textContent = `${(cell.elevation_mm / 1000).toFixed(2)} m`;
  $('selected-depth').textContent = `${cell.water_depth_mm.toFixed(0)} mm`;
  $('selected-predicted').textContent = `${cell.predicted_water_depth_mm.toFixed(0)} mm`;
  $('selected-risk').textContent = `${cell.flood_risk_index.toFixed(0)} / 100`;
  $('selected-drainage').textContent = `${cell.drainage_capacity_mm_hr.toFixed(1)} natural + ${cell.pump_capacity_mm_hr.toFixed(1)} pump mm/h`;
  $('selected-infiltration').textContent = `${cell.infiltration_rate_mm_hr.toFixed(1)} mm/h`;
  $('selected-impervious').textContent = `${Math.round(cell.impervious_ratio * 100)}%`;
  $('map-readout').textContent = `CELL ${cell.x.toString().padStart(2, '0')}, ${cell.y.toString().padStart(2, '0')} · ${cell.terrain_type.toUpperCase()} · ${(cell.elevation_mm / 1000).toFixed(2)} M`;
  if (observation) {
    ($('lab-station') as HTMLSelectElement).value = observation.station_id;
    const stationHistory = gameState?.historical_observations?.filter(row => row.station_id === observation.station_id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)) ?? [];
    const latest = stationHistory[stationHistory.length - 1];
    $('station-current-name').textContent = observation.name;
    $('station-current-rain').textContent = `${observation.rainfall_mm_hr.toFixed(1)} mm/h`;
    $('station-current-temperature').textContent = latest ? `${latest.temperature_c.toFixed(1)} °C` : '—';
    $('station-current-wind').textContent = `${observation.wind_kmh.toFixed(0)} km/h`;
    $('station-current-readings').hidden = false;
    $('selected-depth').textContent = `${observation.rainfall_mm_hr.toFixed(1)} mm/h rain`;
    notify(`${observation.name}: ${observation.rainfall_mm_hr.toFixed(1)} mm/h rain, ${observation.wind_kmh.toFixed(0)} km/h wind, pressure ${observation.air_pressure_hpa.toFixed(0)} hPa.`);
    completeGoal('weather');
    if (campaignProgress.stageId === 'first-drop') markCampaignObjectiveId('station', `Inspected ${observation.name}. Its six hourly rainfall values are available in the workbench.`);
  } else if (location?.kind === 'hospital') {
    notify(`Hospital access at tile ${cell.x}, ${cell.y} is low-lying. Road elevation here is ${(cell.elevation_mm / 1000).toFixed(2)} m.`);
    completeGoal('hospital');
  } else if (objectId?.startsWith('drain-') || cell.terrain_type === 'canal') {
    notify(`Drainage capacity is ${cell.drainage_capacity_mm_hr.toFixed(1)} mm/h at this channel cell. Trace nearby inlets with the drainage layer.`);
    completeGoal('drainage');
  } else {
    notify(`${title}: elevation ${(cell.elevation_mm / 1000).toFixed(2)} m · ${cell.water_depth_mm.toFixed(0)} mm depth · ${cell.flood_risk_index.toFixed(0)} risk index.`);
  }
  showContext(observation ? 'weather' : 'location');
  if (observation && uiState.getState().gameMode === 'guided-campaign' && campaignProgress.stageId === 'first-drop') {
    guidedTutorial.completeAction('inspect-southern-station', { stationId: observation.station_id, stationName: observation.name });
  }
}

function onHover(cell: MapCell | null, pointer: Phaser.Input.Pointer | null) {
  const tooltip = $('map-tooltip');
  if (!cell || !pointer) { tooltip.style.display = 'none'; $('hover-readout').textContent = 'Move over the city to read terrain and coordinates.'; return; }
  const canvas = $('game').getBoundingClientRect();
  const x = pointer.x * canvas.width / 1024;
  const y = pointer.y * canvas.height / 768;
  tooltip.style.display = 'block';
  tooltip.style.left = `${Math.min(x + 12, canvas.width - 230)}px`;
  tooltip.style.top = `${Math.max(6, y - 38)}px`;
  tooltip.textContent = `GRID ${cell.x},${cell.y} · ${cell.terrain_type.toUpperCase()} · ${(cell.elevation_mm / 1000).toFixed(2)} M`;
  $('hover-readout').textContent = `CELL ${cell.x.toString().padStart(2, '0')}, ${cell.y.toString().padStart(2, '0')}  ·  ${cell.terrain_type.toUpperCase()}  ·  ${cell.rainfall_intensity_mm_hr.toFixed(1)} MM/H RAIN`;
}

function setMode(next: Mode) {
  const stage = campaignProgress.stageId;
  const guided = uiState.getState().gameMode === 'guided-campaign';
  const available = !guided || next === 'simulation'
    || (['first-drop', 'hidden-pattern'].includes(stage) && next === 'analysis')
    || (['predict-flood', 'prediction-failure', 'save-novara'].includes(stage) && next === 'prediction')
    || (stage === 'save-novara' && next === 'response');
  if (!available) return;
  uiState.setState({ activityMode: next });
  document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === next));
  if (next === 'analysis') {
    if (!activeOverlay) setOverlay('elevation');
    openWorkbench(stage === 'hidden-pattern' ? 'moving-average' : 'weather');
    notify('Weather Lab: inspect station readings and experiment with rainfall trends.');
  } else if (next === 'prediction') {
    if (activeOverlay !== 'risk') setOverlay('risk');
    showContext(uiState.getState().gameMode === 'free-play' ? 'regression' : stage === 'prediction-failure' ? 'evaluation' : 'regression', true);
    if (uiState.getState().gameMode === 'free-play' && !['predict-flood', 'prediction-failure'].includes(stage)) {
      void renderRegressionStage('predict-flood');
    } else void loadStageExperiment();
    notify(stage === 'prediction-failure' ? 'Prediction Lab: compare model errors on unseen observations.' : 'Prediction Lab: explore how rainfall relates to water depth.');
  } else if (next === 'response') {
    if (activeOverlay !== 'drainage') setOverlay('drainage');
    showContext('response');
    $('response-hint').textContent = 'Choose a resource in the right panel, then click an open tile to deploy.';
  } else {
    if (activeOverlay) setOverlay(null);
    closeContext();
    notify('Simulation mode: inspect Eastbank and follow the mission briefing.');
  }
}

const sceneCallbacks = {
  onCellSelected: onSelected,
  onCellHovered: onHover,
  onPlacementTarget: (cell: MapCell) => updatePlacementPreview(cell, true),
  onPlacementHover: (cell: MapCell | null) => updatePlacementPreview(cell),
};
scene = new EastbankScene(sceneCallbacks);
renderCampaign();
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#152323',
  // #game is already a flex-centered viewport. Phaser's own autoCenter writes
  // margins that the flex container also centers, shifting the canvas off-center.
  scale: { mode: Phaser.Scale.FIT, width: 1024, height: 768 },
  scene: [scene], render: { antialias: false, pixelArt: true },
});
void startNewGame();

document.querySelectorAll<HTMLButtonElement>('[data-overlay]').forEach(button => button.addEventListener('click', () => {
  const layer = button.dataset.overlay as Exclude<FloodOverlay, null>;
  const active = activeOverlay === layer ? null : layer;
  setOverlay(active);
  if (layer === 'risk' && active) completeGoal('risk');
  if (layer === 'drainage' && active) completeGoal('drainage');
}));
document.querySelector('#reset-view')!.addEventListener('click', () => scene.resetCamera());
document.querySelector('#zoom-in')!.addEventListener('click', () => scene.zoomBy(0.25));
document.querySelector('#zoom-out')!.addEventListener('click', () => scene.zoomBy(-0.25));
document.querySelector('#new-run')!.addEventListener('click', () => void startNewGame(true));
document.querySelector('#reset-game')!.addEventListener('click', () => void resetCurrentGame());
document.querySelector('#close-context')!.addEventListener('click', closeContext);
document.querySelector('#weather-history-button')!.addEventListener('click', () => setMode('analysis'));
document.querySelector('#guide-action')!.addEventListener('click', () => {
  if (guidedTutorial.isSkipped()) {
    setMode(($('guide-action') as HTMLButtonElement).dataset.mode as Mode);
    return;
  }
  if (uiState.getState().gameMode === 'guided-campaign' && guidedTutorial.getCurrentStepId() === 'mission-introduction') {
    const stage = campaignProgress.stageId;
    if (stage === 'first-drop') {
      guidedTutorial.completeAction('start-first-drop', { started: true });
      return;
    }
    setMode(guidePrompts[stage].mode);
    guidedTutorial.completeAction('open-stage-lab', { success: !$('context-panel').hidden });
    return;
  }
  setMode(($('guide-action') as HTMLButtonElement).dataset.mode as Mode);
});
document.querySelector('#reveal-trend')!.addEventListener('click', () => {
  const stationId = ($('lab-station') as HTMLSelectElement).value;
  const readings = hourlyRainfallForStation(stationId);
  if (readings.length !== 6) { notify('Meteo AI: six hourly observations are needed to reveal the trend.'); return; }
  const labels = readings.map(row => new Date(row.timestamp).toISOString().slice(11, 16));
  const first = readings[0].rainfall_mm_hr, last = readings[readings.length - 1].rainfall_mm_hr;
  drawScatter([
    { label: 'Observed hourly rainfall', data: readings.map((row, index) => ({ x: index, y: row.rainfall_mm_hr })), showLine: true, borderColor: '#76c9b3', backgroundColor: '#76c9b3', pointRadius: 3, borderWidth: 2 },
    { label: 'Start-to-end direction', data: [{ x: 0, y: first }, { x: 5, y: last }], showLine: true, borderColor: '#f2c96e', backgroundColor: '#f2c96e', pointRadius: 0, borderDash: [5, 4], borderWidth: 2 },
  ], 'SIX-HOUR WATCH · HOURLY OBSERVATION', 'RAINFALL · mm/h');
  predictionChart!.options.scales!.x!.ticks!.callback = value => labels[Number(value)] ?? '';
  predictionChart!.update();
  const direction = last > first ? 'increased' : last < first ? 'eased' : 'ended near its starting level';
  $('trend-interpretation').textContent = `Rainfall ${direction} from ${first.toFixed(1)} to ${last.toFixed(1)} mm/h. The hourly readings still show the short-term fluctuations.`;
  $('trend-interpretation').hidden = false;
  $('lab-note').textContent = $('trend-interpretation').textContent;
  guidedTutorial.completeAction('reveal-rainfall-trend', { visible: true });
});
document.querySelector('#next-mission')!.addEventListener('click', () => {
  const next = campaignStages[campaignStages.findIndex(stage => stage.id === campaignProgress.stageId) + 1];
  if (!next || !isStageUnlocked(campaignProgress, next.id)) { notify('Complete the mission objectives to unlock the next operation.'); return; }
  if (!guidedTutorial.completeAction('start-next-mission', { missionUnlocked: true })) return;
  campaignProgress = selectCampaignStage(campaignProgress, next.id);
  void enterCampaignStage(next.id);
});
document.querySelector('#tutorial-replay')!.addEventListener('click', () => guidedTutorial.replay());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !chosenResource && !$('context-panel').hidden) closeContext();
});
document.querySelector('#game-mode-toggle')!.addEventListener('click', () => {
  const gameMode = uiState.getState().gameMode === 'guided-campaign' ? 'free-play' : 'guided-campaign';
  uiState.setState({ gameMode, ...(gameMode === 'guided-campaign' ? { activityMode: 'simulation' as const } : {}) });
  $('game-mode-toggle').textContent = gameMode === 'guided-campaign' ? 'GUIDED' : 'FREE PLAY';
  renderCampaign();
  if (gameMode === 'free-play') {
    document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => { button.hidden = false; button.disabled = false; });
    notify('Free Play: all city tools are open. Explore, analyze and respond at your own pace.');
  } else {
    closeContext();
    document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === 'simulation'));
  }
});
document.querySelector('#advance-step')!.addEventListener('click', () => void advanceOneStep());
document.querySelector('#confirm-placement')!.addEventListener('click', () => void confirmPlacement());
document.querySelector('#cancel-placement')!.addEventListener('click', () => {
  chosenResource = null; pendingPlacement = null; scene.setPlacementMode(false); scene.setPlacementPreview(null);
  $('response-hint').textContent = 'Placement cancelled. Budget and inventory were not changed.';
  renderResources(); renderPlacementState();
});
document.querySelector('#barrier-direction')!.addEventListener('change', event => {
  barrierDirection = (event.currentTarget as HTMLSelectElement).value as typeof barrierDirection;
  if (pendingPlacement) updatePlacementPreview(pendingPlacement.cell, true);
});
document.querySelector('#mark-risk')!.addEventListener('click', () => {
  if (!sessionId || !selectedCell) return;
  void serializeStateAction(() => identifyRisk(sessionId!, selectedCell!.x, selectedCell!.y))
    .then(state => { syncGameState(state); notify('Risk cell recorded by Python for outcome scoring.'); })
    .catch(showApiError);
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && chosenResource) {
    chosenResource = null; pendingPlacement = null; scene.setPlacementMode(false);
    $('response-hint').textContent = 'Placement cancelled. Budget and inventory were not changed.';
    renderResources(); renderPlacementState();
  }
});
document.querySelector('#rainfall-control')!.addEventListener('input', event => {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  $('rainfall-value').textContent = value.toFixed(0);
  changeRainfall(value);
});
document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode as Mode)));
document.querySelector('#lab-station')!.addEventListener('change', () => {
  const stage = campaignProgress.stageId;
  predictionLabData = null;
  if (stage === 'first-drop') { renderStageOne(); markCampaignObjectiveId('station', 'Station selected. Compare its six hourly rainfall measurements.'); }
  else if (stage === 'hidden-pattern') requestSmoothingForCurrentWindow(false);
  else if (stage === 'predict-flood' || stage === 'prediction-failure') void renderRegressionStage(stage);
});
document.querySelector('#lab-window')!.addEventListener('input', () => {
  if (campaignProgress.stageId === 'hidden-pattern') requestSmoothingForCurrentWindow(true);
});
document.querySelector('#lab-rainfall')!.addEventListener('input', event => {
  $('lab-rain-output').textContent = (event.currentTarget as HTMLInputElement).value;
});
document.querySelector('#lab-horizon')!.addEventListener('input', event => {
  $('lab-horizon-output').textContent = (event.currentTarget as HTMLInputElement).value;
});
document.querySelector('#run-forecast')!.addEventListener('click', () => void runLabForecast());
document.querySelector('#next-story')!.addEventListener('click', () => {
  const messages: Record<CampaignStageId, string> = {
    'first-drop': 'Meteo AI: a mean is useful for the overall watch, but it cannot tell whether the peak is rising or falling.',
    'hidden-pattern': 'Meteo AI: each new moving-average point shifts the window forward once. Larger windows respond more slowly to a sharp burst.',
    'predict-flood': 'Meteo AI: a residual is observed depth minus your line’s estimate. Look for a line that keeps those vertical gaps small.',
    'prediction-failure': 'Meteo AI: the holdout period was not used to train either model. Large misses there reveal a forecast that may not generalize.',
    'save-novara': 'Meteo AI: a resource only helps where it can operate. Check the drainage overlay and protect the low road leading to the hospital.',
  };
  notify(messages[campaignProgress.stageId]);
});
document.querySelector('#pause')!.addEventListener('click', event => {
  if (paused && sessionUnavailable) { notify('Backend session unavailable. Use NEW RUN to reconnect and preserve a fresh Python session.'); return; }
  if (campaignProgress.stageId === 'save-novara' && !gameState?.scenario_progress.active && paused) {
    notify('Meteo AI: start the Eastbank storm from the mission workbench before resuming its clock.');
    return;
  }
  paused = !paused;
  syncPauseButton();
  if (campaignProgress.stageId === 'save-novara') renderStageActions();
  notify(paused ? 'Simulation clock paused. Eastbank conditions remain available for inspection.' : 'Simulation clock resumed. Continue monitoring the storm approach.');
});
setInterval(() => {
  if (paused || sessionUnavailable) return;
  void advanceOneStep(6);
}, 1000);
