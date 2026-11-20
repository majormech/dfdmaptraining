"use strict";

// ------------------------------------------------------------
// Decatur Fire Map Trainer
// Plain JavaScript by design: no framework or build step needed.
// ------------------------------------------------------------

const Core = window.DFDTrainingCore;
const KnowledgeData = window.DFDKnowledgeData;
const ActiveAddressData = window.DFDActiveAddressData;
const GAME_ROUNDS = 10;
const MAP_LOAD_TIMEOUT_MS = 18000;
const MAP_ID =
  document
    .querySelector('meta[name="google-maps-map-id"]')
    ?.getAttribute("content")
    ?.trim() || "DEMO_MAP_ID";
const HIDDEN_LABEL_MAP_ID =
  document
    .querySelector('meta[name="google-maps-hidden-labels-map-id"]')
    ?.getAttribute("content")
    ?.trim() ||
  document
    .querySelector('meta[name="google-maps-hidden-streets-map-id"]')
    ?.getAttribute("content")
    ?.trim() ||
  "";
// A map ID cannot use embedded JSON styles. With no dedicated cloud-styled
// hidden-label ID, the local fallback uses a non-map-ID map plus DOM overlays
// instead of the deprecated google.maps.Marker API.
const HIDDEN_MAP_LABEL_STYLES = [
  {
    featureType: "all",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

const STATION_COLORS = {
  "1": "#ef4444",
  "2": "#2563eb",
  "3": "#16a36a",
  "4": "#f97316",
  "5": "#9333ea",
  "6": "#0d9488",
  "7": "#d6b300",
};

const MODE_LABELS = {
  idle: "Ready",
  "distance-single": "Single location",
  "distance-game": "Location game",
  "route-single": "Single route",
  "route-game": "Route game",
  "cross-streets-game": "Cross streets",
  "hundred-blocks-game": "100-block lines",
};

const ui = {
  mapShell: document.querySelector(".map-shell"),
  mapElement: document.getElementById("map"),
  header: document.getElementById("header"),
  centerEntry: document.getElementById("center-entry"),
  addCenterPoint: document.getElementById("add-center-point"),
  restoreRoute: document.getElementById("restore-route"),
  recenterMap: document.getElementById("recenter-map"),
  repeatDrill: document.getElementById("repeat-drill"),
  roundRecap: document.getElementById("round-recap"),
  headerContent: document.getElementById("header-content"),
  toggleHeader: document.getElementById("toggle-header"),
  toggleHeaderIcon: document.querySelector("#toggle-header > span"),
  toggleHeaderLabel: document.querySelector("#toggle-header .toggle-label"),
  stationSelect: document.getElementById("station-select"),
  zonesCheckbox: document.getElementById("toggle-zones"),
  mapLabelsCheckbox: document.getElementById("toggle-map-labels"),
  practiceMisses: document.getElementById("practice-misses"),
  revealAnswerMap: document.getElementById("reveal-answer-map"),
  nextCall: document.getElementById("next-call"),
  referenceRouteLabel: document.getElementById("reference-route-label"),
  openInstructor: document.getElementById("open-instructor"),
  instructorDialog: document.getElementById("instructor-dialog"),
  instructorForm: document.getElementById("instructor-form"),
  instructorAddress: document.getElementById("instructor-address"),
  instructorMatch: document.getElementById("instructor-match"),
  instructorName: document.getElementById("instructor-name"),
  instructorNotes: document.getElementById("instructor-notes"),
  instructorStatus: document.getElementById("instructor-status"),
  instructorRoutes: document.getElementById("instructor-routes"),
  practiceInstructorRoute: document.getElementById("practice-instructor-route"),
  drawInstructorRoute: document.getElementById("draw-instructor-route"),
  closeInstructor: document.getElementById("close-instructor"),
  saveInstructorRoute: document.getElementById("save-instructor-route"),
  address: document.getElementById("address"),
  status: document.getElementById("status"),
  modeLabel: document.getElementById("mode-label"),
  gameInfo: document.getElementById("game-info"),
  gameScore: document.getElementById("game-score"),
  callPanel: document.getElementById("call-panel"),
  mapStatus: document.getElementById("map-status"),
  mapStatusText: document.getElementById("map-status-text"),
  stepTitle: document.getElementById("step-title"),
  stepDetail: document.getElementById("step-detail"),
  trainingControls: document.getElementById("training-controls"),
  newDrill: document.getElementById("new-drill"),
  startGame: document.getElementById("start-game"),
  singleRouteDrill: document.getElementById("single-route-drill"),
  startRouteGame: document.getElementById("start-route-game"),
  startCrossStreetGame: document.getElementById("start-cross-street-game"),
  startHundredBlockGame: document.getElementById("start-hundred-block-game"),
  textAnswerForm: document.getElementById("text-answer-form"),
  answerLegend: document.getElementById("answer-legend"),
  answerOne: document.getElementById("answer-one"),
  answerTwo: document.getElementById("answer-two"),
  answerOneLabel: document.getElementById("answer-one-label"),
  answerTwoLabel: document.getElementById("answer-two-label"),
  answerHelp: document.getElementById("answer-help"),
  answerFeedback: document.getElementById("answer-feedback"),
  submitTextAnswer: document.getElementById("submit-text-answer"),
  routeActions: document.getElementById("route-actions"),
  moveRouteGuess: document.getElementById("move-route-guess"),
  undoRoute: document.getElementById("undo-route"),
  clearRoute: document.getElementById("clear-route"),
  submitRoute: document.getElementById("submit-route"),
  routeLegend: document.getElementById("route-legend"),
  acceptedRouteLegend: document.getElementById("accepted-route-legend"),
  resultDialog: document.getElementById("result-dialog"),
  resultTitle: document.getElementById("result-title"),
  resultSummary: document.getElementById("result-summary"),
  resultRows: document.getElementById("result-rows"),
  closeResults: document.getElementById("close-results"),
};

const modeButtons = [
  ui.newDrill,
  ui.startGame,
  ui.singleRouteDrill,
  ui.startRouteGame,
  ui.startCrossStreetGame,
  ui.startHundredBlockGame,
];

const state = {
  mapReady: false,
  mapStartupFailed: false,
  runSequence: 0,
  roundSequence: 0,
  run: null,
  round: null,
  lastPenalty: null,
  resultReturnFocus: null,
  mapLabelsHidden: false,
};

let map = null;
let MapsMapClass = null;
let AdvancedMarkerElementClass = null;
let PinElementClass = null;
let OverlayMarkerRendererClass = null;
let RouteClass = null;
let mapUsesAdvancedMarkers = true;
let infoWindow = null;
let activeMapResult = null;
let actualMarker = null;
let guessMarker = null;
let routePolyline = null;
let referenceRoutePolylines = [];
let reviewMarkers = [];
let stationMarkers = [];
let stationZonePolygons = [];
const stationsById = {};

const mapsLoadTimer = window.setTimeout(function () {
  if (!state.mapReady) {
    handleMapsLoadError(
      "Google Maps did not finish loading. Check the connection and Maps API configuration."
    );
  }
}, MAP_LOAD_TIMEOUT_MS);

function setMapStatus(status, message) {
  ui.mapStatus.dataset.state = status;
  ui.mapStatusText.textContent = message;
}

function setStatus(message) {
  ui.status.textContent = message;
}

function setStep(title, detail) {
  ui.stepTitle.textContent = title;
  ui.stepDetail.textContent = detail;
}

function setBusy(isBusy) {
  ui.callPanel.setAttribute("aria-busy", String(Boolean(isBusy)));
}

function isRouteMode(mode) {
  return mode === "route-single" || mode === "route-game";
}

function isKnowledgeMode(mode) {
  return mode === "cross-streets-game" || mode === "hundred-blocks-game";
}

function isMapSelectionMode(mode) {
  return mode === "distance-single" ||
    mode === "distance-game" ||
    isRouteMode(mode);
}

function isGameMode(mode) {
  return mode === "distance-game" ||
    mode === "route-game" ||
    isKnowledgeMode(mode);
}

function currentMode() {
  return state.run ? state.run.mode : "idle";
}

function currentRoundIs(status) {
  return Boolean(state.round && state.round.status === status);
}

function isCurrentRun(runId) {
  return Boolean(
    state.run && state.run.id === runId && state.run.active
  );
}

function isCurrentRound(runId, roundId) {
  return Boolean(
    isCurrentRun(runId) &&
      state.round &&
      state.round.runId === runId &&
      state.round.id === roundId
  );
}

function questionBankForMode(mode, stationId) {
  if (!KnowledgeData) return [];
  let questions = [];
  if (mode === "cross-streets-game") {
    questions = KnowledgeData.crossStreetQuestions || [];
  } else if (mode === "hundred-blocks-game") {
    questions = KnowledgeData.hundredBlockQuestions || [];
  } else {
    return [];
  }
  if (!stationId || stationId === "any") return questions;
  return questions.filter(function (question) {
    return Array.isArray(question.stationIds) &&
      question.stationIds.includes(String(stationId));
  });
}

function activeAddressBankForStation(stationId) {
  if (!ActiveAddressData || !Array.isArray(ActiveAddressData.addresses)) {
    return [];
  }
  if (!stationId || stationId === "any") return ActiveAddressData.addresses;
  const expectedStation = String(stationId);
  return ActiveAddressData.addresses.filter(function (record) {
    const stationIds = String(record[4] || "").split(",").filter(Boolean);
    return stationIds.includes(expectedStation);
  });
}

function officialAddressFromRecord(record, requestedStationId) {
  if (!Array.isArray(record) || record.length < 5) return null;
  const stationIds = String(record[4] || "").split(",").filter(Boolean);
  const stationId =
    requestedStationId && requestedStationId !== "any"
      ? String(requestedStationId)
      : stationIds[Math.floor(Math.random() * stationIds.length)];
  const lat = Number(record[2]);
  const lng = Number(record[3]);
  if (
    !Number.isInteger(Number(record[0])) ||
    !String(record[1] || "").trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !stationId
  ) {
    return null;
  }
  return {
    id: Number(record[0]),
    label: String(record[1]) + ", Decatur, IL",
    lat,
    lng,
    stationId,
  };
}

function shuffledCopy(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

const DRILL_MODES = ["distance-single", "distance-game", "route-single", "route-game", "cross-streets-game", "hundred-blocks-game"];
const SETTINGS_KEY = "dfd-trainer.settings.v1";
let settings = {};
try { settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* Use defaults. */ }
if (Array.from(ui.stationSelect.options).some((option) => option.value === settings.station)) ui.stationSelect.value = settings.station;
let preferredStationId = ui.stationSelect.value;
ui.mapLabelsCheckbox.checked = settings.hideLabels === true;
ui.zonesCheckbox.checked = settings.showZones !== false;
ui.practiceMisses.checked = settings.practiceMisses === true;

function saveSettings(mode) {
  settings = {
    mode: mode || settings.mode,
    station: preferredStationId,
    hideLabels: ui.mapLabelsCheckbox.checked,
    showZones: ui.zonesCheckbox.checked,
    practiceMisses: ui.practiceMisses.checked,
  };
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Keep session settings. */ }
}

const MISSES_KEY = "dfd-trainer.misses.v1";
const APPROVED_ROUTES_KEY = "dfd-trainer.approved-routes.v1";
const sessionLists = new Map();

function readTrainingList(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key));
    if (sessionLists.has(key)) return sessionLists.get(key);
    return Array.isArray(value) ? value : [];
  } catch {
    return sessionLists.get(key) || [];
  }
}

function writeTrainingList(key, entries) {
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
    sessionLists.delete(key);
    return true;
  } catch {
    if (key === MISSES_KEY) sessionLists.set(key, entries);
    return false;
  }
}

function practiceMode(mode) {
  if (isKnowledgeMode(mode)) return mode;
  return isRouteMode(mode) ? "route" : "location";
}

function recordPracticeOutcome(round, missed) {
  const mode = practiceMode(state.run.mode);
  const id = String(round.question?.id ?? round.address.id);
  const stationId = round.address?.stationId ?? null;
  const entries = readTrainingList(MISSES_KEY);
  const remaining = entries.filter((entry) =>
    entry?.mode !== mode || entry.id !== id || entry.stationId !== stationId
  );
  if (missed) remaining.unshift({ mode, id, stationId });
  if (missed || remaining.length !== entries.length) {
    writeTrainingList(MISSES_KEY, remaining.slice(0, 2000));
  }
}

function practiceDeck(bank, mode, stationId, totalRounds) {
  const entries = readTrainingList(MISSES_KEY).filter((entry) =>
    entry?.mode === practiceMode(mode) &&
    (stationId === "any" || entry.stationId === null || entry.stationId === stationId)
  );
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const missed = [];
  const fresh = [];
  for (const item of bank) {
    const entry = byId.get(String(item.id ?? item[0]));
    if (entry) {
      // Citywide route retries must use the station where the miss occurred.
      missed.push({ item, stationId: entry.stationId });
    } else {
      fresh.push({ item, stationId: null });
    }
  }
  const retryCount = Math.min(missed.length, Math.max(Math.ceil(totalRounds * 0.8), totalRounds - fresh.length));
  return shuffledCopy([
    ...shuffledCopy(missed).slice(0, retryCount),
    ...shuffledCopy(fresh).slice(0, totalRounds - retryCount),
  ]);
}

function resetTextAnswerPanel() {
  if (!ui.textAnswerForm) return;
  ui.textAnswerForm.reset();
  ui.answerFeedback.hidden = true;
  ui.answerFeedback.textContent = "";
  delete ui.answerFeedback.dataset.state;
  ui.submitTextAnswer.textContent = "Check answer";
  [ui.answerOne, ui.answerTwo].forEach(function (input) {
    input.removeAttribute("aria-invalid");
  });
}

function updateGameUI() {
  const run = state.run;
  const mode = currentMode();

  if (!run) {
    ui.modeLabel.textContent = "Stand by";
    ui.gameInfo.textContent = state.mapReady
      ? "Choose a training mode"
      : "Map initialization";
    ui.gameScore.textContent = state.lastPenalty === null
      ? "—"
      : String(state.lastPenalty);
    return;
  }

  ui.modeLabel.textContent = run.active
    ? run.instructor ? "Instructor route" : MODE_LABELS[mode] + (run.practicingMisses ? " · Miss practice" : "")
    : "Complete";
  const compactScopeLabel =
    run.stationId && run.stationId !== "any"
      ? "Station " + run.stationId
      : run.scopeLabel;
  const scopeSuffix =
    isKnowledgeMode(mode) && compactScopeLabel
      ? " · " + compactScopeLabel
      : "";

  if (run.totalRounds > 1) {
    ui.gameInfo.textContent = run.active
      ? "Round " + run.roundIndex + " of " + run.totalRounds + scopeSuffix
      : run.totalRounds + " rounds complete" + scopeSuffix;
    ui.gameScore.textContent = String(run.totalPenalty);
  } else {
    ui.gameInfo.textContent = run.active
      ? "Practice round" + scopeSuffix
      : "Round complete" + scopeSuffix;
    ui.gameScore.textContent = state.lastPenalty === null
      ? "—"
      : String(state.lastPenalty);
  }
}

function updateControls() {
  const mapReady = state.mapReady;
  const roundBusy =
    currentRoundIs("loading") ||
    currentRoundIs("submitting") ||
    currentRoundIs("advancing");
  const knowledgeSession =
    isKnowledgeMode(currentMode()) && Boolean(state.run);
  const knowledgeActive = knowledgeSession && state.run.active;
  const knowledgeOpen = knowledgeActive && currentRoundIs("open");
  modeButtons.forEach(function (button) {
    button.disabled = !mapReady || roundBusy;
  });

  const fixedAssignment = state.run?.active && state.run.fixedAssignment;
  ui.stationSelect.value = fixedAssignment ? state.run.stationId : preferredStationId;
  ui.stationSelect.disabled = !mapReady || roundBusy || Boolean(fixedAssignment);
  ui.zonesCheckbox.disabled = !mapReady || knowledgeActive;
  ui.mapLabelsCheckbox.disabled = !mapReady || roundBusy || knowledgeActive;
  ui.textAnswerForm.hidden = !knowledgeActive;
  ui.answerOne.disabled = !knowledgeOpen;
  ui.answerTwo.disabled = !knowledgeOpen;
  ui.submitTextAnswer.disabled = !knowledgeOpen;
  ui.submitTextAnswer.hidden = !knowledgeOpen;
  ui.practiceMisses.disabled = !mapReady || roundBusy || knowledgeActive;
  ui.openInstructor.disabled = !mapReady || roundBusy || knowledgeActive;
  const reviewReady = Boolean(state.run?.active && currentRoundIs("settled"));
  const mapConcealed = knowledgeActive && !state.round?.mapRevealed;
  const settled = currentRoundIs("settled");
  ui.recenterMap.disabled = roundBusy;
  const lastDrill = DRILL_MODES.includes(settings.mode) ? MODE_LABELS[settings.mode] : null;
  ui.repeatDrill.hidden = !mapReady || state.run?.active || !lastDrill;
  ui.repeatDrill.textContent = lastDrill ? "Start " + lastDrill.toLowerCase() : "";
  ui.recenterMap.hidden = !mapReady || mapConcealed || (!state.round?.address && !state.round?.mapRevealed);
  ui.recenterMap.textContent = settled ? "Fit review" : "Recenter map";
  ui.roundRecap.hidden = !settled || !state.round?.recap;
  ui.roundRecap.textContent = settled ? state.round?.recap || "" : "";
  ui.mapShell.dataset.centerEntry = String(currentRoundIs("open") && isRouteMode(currentMode()) && ui.centerEntry.getAttribute("aria-pressed") === "true");
  ui.nextCall.hidden = !reviewReady;
  ui.nextCall.textContent = state.round?.index === state.run?.totalRounds ? "View results" : "Next call";
  ui.revealAnswerMap.hidden = !reviewReady || !mapConcealed;
  ui.saveInstructorRoute.hidden = !state.run?.instructor || !currentRoundIs("open");
  ui.saveInstructorRoute.disabled = !routePolyline || routePolyline.getPath().getLength() < 2;

  const routeSession =
    isRouteMode(currentMode()) && Boolean(state.run);
  const routeMode = routeSession && state.run.active && !currentRoundIs("settled");
  ui.routeActions.hidden = !routeMode;
  ui.routeLegend.hidden = !routeSession;
  ui.trainingControls.dataset.routeActive = String(routeMode);
  ui.header.dataset.knowledgeActive = String(knowledgeActive);
  ui.header.dataset.stationScopedActive = String(knowledgeActive);
  ui.mapShell.dataset.knowledgeActive = String(mapConcealed);
  if (mapConcealed) {
    ui.mapElement.setAttribute("inert", "");
    ui.mapElement.setAttribute("aria-hidden", "true");
  } else {
    ui.mapElement.removeAttribute("inert");
    ui.mapElement.removeAttribute("aria-hidden");
  }
  ui.mapElement.tabIndex = mapConcealed ? -1 : 0;
  ui.mapShell.dataset.selectable = String(
    Boolean(currentRoundIs("open") && isMapSelectionMode(currentMode()))
  );

  ui.submitRoute.hidden = !routeMode || Boolean(state.run?.instructor);
  ui.submitRoute.textContent = state.round?.retryRoute ? "Retry route" : "Submit route";
  ui.restoreRoute.hidden = !routeMode || !state.round?.clearedRoute;
  ui.restoreRoute.disabled = !currentRoundIs("open");
  if (!routeMode) {
    if (!routeSession) ui.acceptedRouteLegend.hidden = true;
    ui.moveRouteGuess.disabled = true;
    ui.undoRoute.disabled = true;
    ui.clearRoute.disabled = true;
    ui.submitRoute.disabled = true;
    return;
  }

  const pathLength =
    routePolyline && routePolyline.getPath()
      ? routePolyline.getPath().getLength()
      : 0;
  const routeOpen = currentRoundIs("open");
  const hasGuess = Boolean(guessMarker);
  const hasDrawnPoint = pathLength > 1;

  ui.centerEntry.disabled = !routeOpen;
  ui.addCenterPoint.disabled = !routeOpen;
  ui.addCenterPoint.textContent = hasGuess ? "Add route point" : "Place pin";
  ui.moveRouteGuess.disabled = !routeOpen || !hasGuess || Boolean(state.run.instructor);
  ui.undoRoute.disabled = !routeOpen || !hasDrawnPoint;
  ui.clearRoute.disabled = !routeOpen || !hasDrawnPoint;
  ui.submitRoute.disabled = !routeOpen || !hasGuess || !hasDrawnPoint;
}

function setMarkerMap(marker, targetMap) {
  if (!marker) return;
  if (typeof marker.setMap === "function") {
    marker.setMap(targetMap);
  } else {
    marker.map = targetMap;
  }
}

function setMarkerVisible(marker, visible) {
  if (!marker) return;
  if (typeof marker.setOpacity === "function") {
    marker.setOpacity(visible ? 1 : 0);
  } else {
    marker.map = visible ? map : null;
  }
}

function getMarkerPosition(marker) {
  if (!marker) return null;
  if (typeof marker.getPosition === "function") {
    return marker.getPosition();
  }
  return marker.position || null;
}

function clearRoundGraphics() {
  reviewMarkers.forEach((marker) => marker.setMap(null));
  reviewMarkers = [];
  setMarkerMap(actualMarker, null);
  setMarkerMap(guessMarker, null);
  actualMarker = null;
  guessMarker = null;

  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }
  referenceRoutePolylines.forEach(function (polyline) {
    polyline.setMap(null);
  });
  referenceRoutePolylines = [];
  ui.acceptedRouteLegend.hidden = true;
  activeMapResult = null;
  if (infoWindow) {
    infoWindow.close();
  }
  resetTextAnswerPanel();
  if (state.mapReady && state.mapLabelsHidden !== ui.mapLabelsCheckbox.checked) {
    recreateMapForLabels(ui.mapLabelsCheckbox.checked);
  }
}

function applyZoneVisibility() {
  if (!map) return;
  stationZonePolygons.forEach(function (entry) {
    entry.polygon.setMap(ui.zonesCheckbox.checked ? map : null);
  });
}

function ensureOverlayMarkerRendererClass() {
  if (OverlayMarkerRendererClass) return;

  OverlayMarkerRendererClass = class extends google.maps.OverlayView {
    constructor(owner) {
      super();
      this.owner = owner;
      this.element = null;
      this.dragging = false;
      this.pointerId = null;
      this.previousGestureHandling = "greedy";
    }

    onAdd() {
      const interactive = this.owner.clickable;
      const element = document.createElement(interactive ? "button" : "div");
      if (interactive) element.type = "button";
      element.className = "training-map-marker";
      element.title = this.owner.title;
      element.setAttribute("aria-label", this.owner.title);
      if (!interactive) element.setAttribute("role", "img");
      if (this.owner.draggable) element.dataset.draggable = "true";
      element.style.setProperty(
        "--marker-background",
        this.owner.pin.background
      );
      element.style.setProperty(
        "--marker-border",
        this.owner.pin.borderColor
      );
      element.style.setProperty(
        "--marker-glyph",
        this.owner.pin.glyphColor
      );
      element.style.setProperty(
        "--marker-scale",
        String(this.owner.pin.scale)
      );

      const pin = document.createElement("span");
      pin.className = "training-map-marker__pin";
      const glyph = document.createElement("span");
      glyph.className = "training-map-marker__glyph";
      glyph.textContent = this.owner.pin.glyphText;
      pin.appendChild(glyph);
      element.appendChild(pin);
      if (this.owner.reviewLabel) element.appendChild(reviewMapLabel(this.owner.reviewLabel));

      if (interactive) {
        const activateMarker = (event) => {
          event.preventDefault();
          this.owner.emit("gmp-click", {
            domEvent: event,
            latLng: this.owner.getPosition(),
          });
        };
        element.addEventListener("click", activateMarker);
        element.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.stopPropagation();
          activateMarker(event);
        });
      }

      if (this.owner.draggable) {
        element.addEventListener("pointerdown", (event) => {
          this.handlePointerDown(event);
        });
        element.addEventListener("pointermove", (event) => {
          this.handlePointerMove(event);
        });
        element.addEventListener("pointerup", (event) => {
          this.handlePointerEnd(event, true);
        });
        element.addEventListener("pointercancel", (event) => {
          this.handlePointerEnd(event, false);
        });
      }

      google.maps.OverlayView.preventMapHitsAndGesturesFrom(element);
      this.element = element;
      this.getPanes().overlayMouseTarget.appendChild(element);
    }

    draw() {
      if (!this.element) return;
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(
        this.owner.getPosition()
      );
      if (!point) return;
      this.element.style.left = point.x + "px";
      this.element.style.top = point.y + "px";
      this.element.style.zIndex = String(Math.round(point.y));
    }

    onRemove() {
      if (this.element) this.element.remove();
      this.element = null;
      this.restoreMapGestures();
    }

    handlePointerDown(event) {
      if (event.button !== 0 || !this.element) return;
      event.preventDefault();
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.element.dataset.dragging = "true";
      this.element.setPointerCapture(event.pointerId);
      const ownerMap = this.getMap();
      this.previousGestureHandling =
        (ownerMap && ownerMap.get("gestureHandling")) || "greedy";
      if (ownerMap) ownerMap.setOptions({ gestureHandling: "none" });
    }

    handlePointerMove(event) {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      event.preventDefault();
      const ownerMap = this.getMap();
      const projection = this.getProjection();
      if (!ownerMap || !projection) return;
      const bounds = ownerMap.getDiv().getBoundingClientRect();
      const position = projection.fromContainerPixelToLatLng(
        new google.maps.Point(
          event.clientX - bounds.left,
          event.clientY - bounds.top
        )
      );
      if (!position) return;
      this.owner.updatePositionFromRenderer(position);
      this.draw();
    }

    handlePointerEnd(event, shouldNotify) {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      event.preventDefault();
      this.dragging = false;
      this.pointerId = null;
      if (this.element) {
        delete this.element.dataset.dragging;
        if (this.element.hasPointerCapture(event.pointerId)) {
          this.element.releasePointerCapture(event.pointerId);
        }
      }
      this.restoreMapGestures();
      if (shouldNotify) {
        this.owner.emit("dragend", {
          latLng: this.owner.getPosition(),
        });
      }
    }

    restoreMapGestures() {
      const ownerMap = this.getMap();
      if (ownerMap) {
        ownerMap.setOptions({
          gestureHandling: this.previousGestureHandling || "greedy",
        });
      }
    }
  };
}

class TrainingMarker {
  constructor(options) {
    const point = Core.normalizePoint(options.position);
    if (!point) throw new Error("A marker position is required.");

    const pinOptions = options.pin || {};
    const label = options.label || null;
    this.title = options.title || "Map marker";
    this.reviewLabel = options.reviewLabel;
    this.clickable = Boolean(options.gmpClickable);
    this.draggable = Boolean(options.gmpDraggable);
    this.pin = {
      background: pinOptions.background || "#ff4d31",
      borderColor: pinOptions.borderColor || "#ffffff",
      glyphColor: pinOptions.glyphColor || "#ffffff",
      glyphText:
        pinOptions.glyphText || (label && label.text) || "",
      scale: pinOptions.scale || 1,
    };
    this.markerPosition = point;
    this.markerMap = null;
    this.opacity = options.opacity === 0 ? 0 : 1;
    this.renderer = null;
    this.rendererType = null;
    this.listeners = new Map();
    this.setMap(options.map || null);
  }

  setMap(targetMap) {
    this.detachRenderer();
    this.markerMap = targetMap;
    this.render();
  }

  getMap() {
    return this.markerMap;
  }

  getPosition() {
    return new google.maps.LatLng(
      this.markerPosition.lat,
      this.markerPosition.lng
    );
  }

  setPosition(position) {
    const point = Core.normalizePoint(position);
    if (!point) return;
    this.markerPosition = point;
    if (!this.renderer) return;
    if (this.rendererType === "advanced") {
      this.renderer.position = point;
    } else {
      this.renderer.draw();
    }
  }

  updatePositionFromRenderer(position) {
    const point = Core.normalizePoint(position);
    if (point) this.markerPosition = point;
  }

  setDraggable(draggable) {
    if (this.draggable === draggable) return;
    this.detachRenderer();
    this.draggable = draggable;
    this.render();
  }

  setOpacity(opacity) {
    const nextOpacity = Number(opacity) > 0 ? 1 : 0;
    if (this.opacity === nextOpacity) return;
    this.detachRenderer();
    this.opacity = nextOpacity;
    this.render();
  }

  addEventListener(eventName, listener) {
    this.addStoredListener(eventName, listener);
  }

  addListener(eventName, listener) {
    this.addStoredListener(eventName, listener);
    return {
      remove: () => {
        const handlers = this.listeners.get(eventName);
        if (handlers) handlers.delete(listener);
      },
    };
  }

  addStoredListener(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(listener);
  }

  emit(eventName, event) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;
    handlers.forEach(function (handler) {
      handler(event);
    });
  }

  detachRenderer() {
    if (!this.renderer) return;
    if (this.rendererType === "advanced") {
      this.renderer.map = null;
    } else {
      this.renderer.setMap(null);
    }
    this.renderer = null;
    this.rendererType = null;
  }

  render() {
    if (!this.markerMap || this.opacity === 0) return;

    if (mapUsesAdvancedMarkers) {
      if (!AdvancedMarkerElementClass || !PinElementClass) {
        throw new Error("The Advanced Marker library is unavailable.");
      }
      const pin = new PinElementClass({
        background: this.pin.background,
        borderColor: this.pin.borderColor,
        glyphColor: this.pin.glyphColor,
        glyphText: this.pin.glyphText,
        scale: this.pin.scale,
      });
      const renderer = new AdvancedMarkerElementClass({
        map: this.markerMap,
        position: this.markerPosition,
        title: this.title,
        gmpClickable: this.clickable,
        gmpDraggable: this.draggable,
      });
      if (this.reviewLabel) {
        const labeledPin = document.createElement("div");
        labeledPin.className = "review-map-pin";
        labeledPin.append(pin, reviewMapLabel(this.reviewLabel));
        renderer.append(labeledPin);
      } else {
        renderer.append(pin);
      }
      if (this.clickable) {
        renderer.addEventListener("gmp-click", (event) => {
          this.emit("gmp-click", event);
        });
      }
      if (this.draggable) {
        renderer.addListener("dragend", (event) => {
          this.updatePositionFromRenderer(renderer.position);
          this.emit("dragend", event);
        });
      }
      this.renderer = renderer;
      this.rendererType = "advanced";
      return;
    }

    ensureOverlayMarkerRendererClass();
    const renderer = new OverlayMarkerRendererClass(this);
    renderer.setMap(this.markerMap);
    this.renderer = renderer;
    this.rendererType = "overlay";
  }
}

function createMarker(options) {
  return new TrainingMarker(options);
}

function stationOriginForAddress(address) {
  return address && address.stationId
    ? stationsById[address.stationId] || null
    : null;
}

function restoreRouteOrigin(path, changedIndex) {
  if (
    changedIndex !== 0 ||
    !currentRoundIs("open") ||
    !isRouteMode(currentMode())
  ) {
    return false;
  }

  const station = stationOriginForAddress(state.round.address);
  const currentOrigin =
    path.getLength() > 0 ? Core.normalizePoint(path.getAt(0)) : null;
  if (
    !station ||
    (currentOrigin && Core.haversineFeet(currentOrigin, station) <= 1)
  ) {
    return false;
  }

  path.setAt(0, new google.maps.LatLng(station.lat, station.lng));
  setStatus("The route start is fixed at the assigned station.");
  return true;
}

function handleRoutePathMutation() {
  if (currentRoundIs("open") && guessMarker) {
    updateRouteDrawingGuidance();
  }
  updateControls();
}

function ensureRoutePolyline() {
  if (!routePolyline) {
    routePolyline = new google.maps.Polyline({
      map,
      strokeColor: "#ff4d31",
      strokeOpacity: 1,
      strokeWeight: 5,
      clickable: true,
      editable: false,
      geodesic: false,
      zIndex: 10,
    });
    const path = routePolyline.getPath();
    ["insert_at", "remove_at"].forEach(function (eventName) {
      path.addListener(eventName, function () {
        handleRoutePathMutation();
      });
    });
    path.addListener("set_at", function (index) {
      if (!restoreRouteOrigin(path, index)) {
        handleRoutePathMutation();
      }
    });
  }
  return routePolyline;
}

function setRoutePath(points) {
  const path = ensureRoutePolyline().getPath();
  path.clear();
  points.forEach(function (point) {
    const normalizedPoint = Core.normalizePoint(point);
    if (normalizedPoint) {
      path.push(
        new google.maps.LatLng(
          normalizedPoint.lat,
          normalizedPoint.lng
        )
      );
    }
  });
}

function setRouteEditable(editable) {
  if (routePolyline) {
    routePolyline.setEditable(Boolean(editable));
  }
}

function updateRouteDrawingGuidance() {
  if (!routePolyline || !guessMarker) return;
  const roadPointCount = Math.max(
    0,
    routePolyline.getPath().getLength() - 1
  );
  const pointLabel =
    roadPointCount === 1
      ? "1 road point"
      : roadPointCount + " road points";
  setStep(
    roadPointCount > 0 ? "Refine or submit" : "Draw your route",
    pointLabel +
      " · Click roads to add points, or drag the white handles to adjust."
  );
}

function startRun(mode, totalRounds, sourceButton, assignment = null) {
  if (!state.mapReady) return;

  const stationId = assignment?.stationId || preferredStationId;
  const scopeLabel =
    stationId === "any"
      ? "Citywide"
      : "Station " + stationId + " response area";
  const questionBank = questionBankForMode(mode, stationId);
  const addressBank = isKnowledgeMode(mode)
    ? []
    : assignment ? [assignment.record] : activeAddressBankForStation(stationId);
  if (isKnowledgeMode(mode) && questionBank.length < totalRounds) {
    ui.address.textContent = "Question bank unavailable";
    const questionType =
      mode === "hundred-blocks-game" ? "100-block" : "cross-street";
    setStatus(
      scopeLabel +
        " needs " +
        totalRounds +
        " verified " +
        questionType +
        " questions, but only " +
        questionBank.length +
        " loaded."
    );
    setStep("Check training data", "Reload after the question bank is restored.");
    return;
  }
  if (!isKnowledgeMode(mode) && addressBank.length < totalRounds) {
    ui.address.textContent = "Address bank unavailable";
    setStatus(
      scopeLabel +
        " needs " +
        totalRounds +
        " official active addresses, but only " +
        addressBank.length +
        " loaded."
    );
    setStep("Check address data", "Reload after the official address bank is restored.");
    return;
  }

  if (!assignment) saveSettings(mode);
  if (state.run) state.run.active = false;
  state.lastPenalty = null;
  state.resultReturnFocus = sourceButton || document.activeElement;
  closeResults();
  clearRoundGraphics();

  const deck = !assignment && ui.practiceMisses.checked
    ? practiceDeck(isKnowledgeMode(mode) ? questionBank : addressBank, mode, stationId, totalRounds)
    : null;
  state.run = {
    instructor: assignment?.instructor,
    fixedAssignment: Boolean(assignment),
    practicingMisses: Boolean(deck),
    practiceStations: deck?.map((entry) => entry.stationId) || [],
    id: ++state.runSequence,
    mode,
    totalRounds,
    roundIndex: 0,
    totalPenalty: 0,
    totalCredit: 0,
    details: [],
    stationId,
    scopeLabel,
    questions: isKnowledgeMode(mode)
      ? deck?.map((entry) => entry.item) || shuffledCopy(questionBank).slice(0, totalRounds)
      : [],
    addresses: isKnowledgeMode(mode)
      ? []
      : deck?.map((entry) => entry.item) || shuffledCopy(addressBank).slice(0, totalRounds),
    active: true,
  };
  state.round = null;

  updateGameUI();
  updateControls();
  void loadNextRound(state.run.id);
}

function loadKnowledgeRound(run, round) {
  const question = run.questions[round.index - 1];
  if (!question) {
    run.active = false;
    round.status = "error";
    ui.address.textContent = "Question unavailable";
    setStatus("The verified question could not be loaded.");
    setStep("Try again", "Start a new knowledge game.");
    setBusy(false);
    updateGameUI();
    updateControls();
    return;
  }

  round.question = question;
  round.status = "open";
  ui.address.textContent = question.prompt;
  resetTextAnswerPanel();

  if (run.mode === "cross-streets-game") {
    ui.answerLegend.textContent = "Enter both cross streets";
    ui.answerOneLabel.textContent = "Cross street 1";
    ui.answerTwoLabel.textContent = "Cross street 2";
    ui.answerOne.placeholder = "N Union St";
    ui.answerTwo.placeholder = "Church St";
    ui.answerHelp.textContent =
      "Street names only; abbreviations are accepted and order does not matter.";
    setStatus(
      run.scopeLabel +
        ": Which two cross streets bound this address? Enter both street names."
    );
    setStep("Name both cross streets", "The map is concealed until the game ends.");
  } else {
    ui.answerLegend.textContent = "Enter both adjoining 100 blocks";
    ui.answerOneLabel.textContent = "100 block 1";
    ui.answerTwoLabel.textContent = "100 block 2";
    ui.answerOne.placeholder = "1000 N";
    ui.answerTwo.placeholder = "1100 N";
    ui.answerHelp.textContent =
      "Block number earns 80%; direction earns 20%. Number credit steps down through ±500. Order does not matter.";
    setStatus(
      run.scopeLabel +
        ": Which two 100-block lines does this street divide? Enter both blocks."
    );
    setStep(
      "Name both blocks",
      "Include the number and N, S, E, or W in each answer."
    );
  }

  setHeaderPanelExpanded(true);
  setBusy(false);
  updateGameUI();
  updateControls();
  window.requestAnimationFrame(function () {
    if (isCurrentRound(run.id, round.id) && round.status === "open") {
      ui.answerOne.focus();
    }
  });
}

async function loadNextRound(runId) {
  if (!isCurrentRun(runId)) return;

  const run = state.run;
  if (run.roundIndex >= run.totalRounds) {
    finishRun(runId);
    return;
  }

  clearRoundGraphics();
  run.roundIndex += 1;
  const round = {
    id: ++state.roundSequence,
    runId,
    index: run.roundIndex,
    status: "loading",
    address: null,
    question: null,
    routeStep: null,
  };
  state.round = round;

  if (isKnowledgeMode(run.mode)) {
    loadKnowledgeRound(run, round);
    return;
  }

  ui.address.textContent = "Finding a verified address…";
  setStatus(
    "Loading an official active address from the selected response area."
  );
  setStep("Generating call", "The map will unlock when the address is ready.");
  setBusy(true);
  updateGameUI();
  updateControls();

  const address = officialAddressFromRecord(
    run.addresses[round.index - 1],
    run.practiceStations[round.index - 1] || run.stationId
  );
  if (!address) {
    run.active = false;
    round.status = "error";
    ui.address.textContent = "Address unavailable";
    setStatus("An official active address could not be loaded for this round.");
    setStep("Try again", "Start a new drill after the address bank is restored.");
    setBusy(false);
    setMapStatus("error", "Address data issue");
    updateGameUI();
    updateControls();
    return;
  }

  round.address = Object.freeze(Object.assign({}, address));
  round.status = "open";
  round.routeStep = isRouteMode(run.mode) ? "place-guess" : null;

  const stationLabel = address.stationId
    ? "Station " + address.stationId
    : "Citywide";
  ui.address.textContent = address.label + " · " + stationLabel;

  actualMarker = createMarker({
    position: { lat: address.lat, lng: address.lng },
    map,
    title: "Verified address",
    opacity: 0,
    pin: {
      background: "#13b8c4",
      borderColor: "#ffffff",
      glyphText: "✓",
    },
  });

  if (run.instructor) {
    placeRouteGuess({ lat: address.lat, lng: address.lng });
    guessMarker.setDraggable(false);
    map.setCenter({ lat: address.lat, lng: address.lng });
    map.setZoom(15);
    setStatus("Draw from the assigned station to the official address, then save the approved route.");
    setStep("Draw approved route", "The station and destination are fixed.");
  } else if (isRouteMode(run.mode)) {
    setStatus(
      "Place the address on the map. Your route will start at the assigned station automatically."
    );
    setStep(
      "Place the address",
      "Click where you believe the displayed address is located."
    );
  } else {
    setStatus("Click where you believe this address is located.");
    setStep(
      "Place your location",
      "One map click settles this round."
    );
  }

  setBusy(false);
  setMapStatus(
    "ready",
    state.mapLabelsHidden ? "Map labels hidden" : "Map ready"
  );
  updateGameUI();
  updateControls();
}

function reviewMapLabel(text) {
  const label = document.createElement("span");
  label.className = "review-map-label";
  label.textContent = text;
  return label;
}

function addReviewMarker(position, title, glyph, reviewLabel) {
  reviewMarkers.push(createMarker({
    position, map, title, reviewLabel,
    pin: { background: "#136f78", glyphText: glyph },
  }));
}

let centerlinesPromise;

function loadReviewCenterlines() {
  if (!centerlinesPromise) {
    centerlinesPromise = Promise.all(
      [0, 2000, 4000, 6000, 8000].map(async (offset) => {
        const response = await fetch("data/source/street-centerlines-" + offset + ".geojson");
        if (!response.ok) throw new Error("Street geometry is unavailable.");
        return (await response.json()).features;
      })
    ).then((pages) => new Map(pages.flat().map((feature) => [
      Number(feature.properties.OBJECTID), feature,
    ]))).catch((error) => {
      centerlinesPromise = null;
      throw error;
    });
  }
  return centerlinesPromise;
}

async function revealKnowledgeMap() {
  const round = state.round;
  if (!round?.question || round.status !== "settled" || round.mapRevealed) return;
  round.mapRevealed = true;
  const question = round.question;
  const answers = question.answers.map((answer) => answer.display);
  const crossStreet = currentMode() === "cross-streets-game";
  if (state.mapLabelsHidden) {
    recreateMapForLabels(false);
  }
  updateControls();
  setHeaderPanelExpanded(false);
  map.setCenter(question.coordinates);
  map.setZoom(17);
  const resultLines = [{ label: crossStreet ? "Bounding streets" : "Adjoining blocks", value: answers.join(" and ") }];
  if (!crossStreet && question.verifiedUsing.length) {
    resultLines.push({ label: "Verified on", value: question.verifiedUsing.join(", ") });
  }
  addReviewMarker(question.coordinates, question.prompt, "✓");
  showMapResult(question.coordinates, question.prompt, resultLines);
  setStep("Answer shown on map", answers.join(" and "));
  ui.nextCall.focus({ preventScroll: true });

  try {
    const centerlines = await loadReviewCenterlines();
    if (!isCurrentRound(round.runId, round.id)) return;
    const sourceIds = crossStreet ? [question.sourceCenterlineObjectId] : question.sourceFeatureIds;
    const paths = sourceIds.flatMap((id) => {
      const geometry = centerlines.get(id)?.geometry;
      const lines = geometry?.type === "LineString"
        ? [geometry.coordinates]
        : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
      return lines.map((line) => line.map(([lng, lat]) => ({ lat, lng })));
    });
    const nearbyPaths = crossStreet ? paths : paths.filter((path) =>
      Core.distanceToPathFeet(question.coordinates, path) <= 150
    );
    referenceRoutePolylines = nearbyPaths.map((path) => new google.maps.Polyline({
      map, path, strokeColor: "#13b8c4", strokeOpacity: 0.9, strokeWeight: 6, clickable: false,
    }));
    if (crossStreet && nearbyPaths.length) {
      const properties = centerlines.get(sourceIds[0]).properties;
      const first = nearbyPaths[0][0];
      const last = nearbyPaths.at(-1).at(-1);
      if (first && last && properties.SB_FSTREET && properties.SB_TSTREET) {
        addReviewMarker(first, properties.SB_FSTREET, "1");
        addReviewMarker(last, properties.SB_TSTREET, "2");
      }
      round.reviewPoints = [question.coordinates, ...nearbyPaths.flat()];
      fitPoints(round.reviewPoints);
    }
  } catch {
    if (isCurrentRound(round.runId, round.id)) {
      setStatus("Street geometry could not load. The verified point and answers are still shown.");
    }
  }
}

function fitPoints(points) {
  const bounds = new google.maps.LatLngBounds();
  points.filter(Boolean).forEach(function (point) {
    bounds.extend(point);
  });
  if (!bounds.isEmpty()) map.fitBounds(bounds, 56);
}

function appendResultLine(container, label, value, isStrong) {
  const row = document.createElement("div");
  row.className = "map-result-row";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = isStrong
    ? document.createElement("strong")
    : document.createElement("span");
  valueElement.textContent = value;

  row.append(labelElement, valueElement);
  container.appendChild(row);
}

function renderActiveMapResult() {
  if (!activeMapResult || !map) return;
  if (infoWindow) infoWindow.close();

  const content = document.createElement("div");
  content.className = "map-result";
  const heading = document.createElement("strong");
  heading.className = "map-result-title";
  heading.textContent = activeMapResult.title;
  content.appendChild(heading);

  activeMapResult.resultLines.forEach(function (line) {
    appendResultLine(content, line.label, line.value, line.strong);
  });

  infoWindow = new google.maps.InfoWindow({
    content,
    position: activeMapResult.position,
  });
  infoWindow.addListener("closeclick", function () {
    activeMapResult = null;
  });
  infoWindow.open({ map });
}

function showMapResult(position, title, resultLines) {
  const normalizedPosition = Core.normalizePoint(position);
  if (!normalizedPosition) return;
  activeMapResult = {
    position: normalizedPosition,
    title,
    resultLines: resultLines.map(function (line) {
      return Object.assign({}, line);
    }),
  };
  renderActiveMapResult();
}

function settleDistanceRound(latLng) {
  const round = state.round;
  const run = state.run;
  if (!round || !run || round.status !== "open") return;

  round.status = "settled";
  updateControls();

  const guessPoint = Core.normalizePoint(latLng);
  const answerPoint = {
    lat: round.address.lat,
    lng: round.address.lng,
  };
  const distanceFeet = Core.haversineFeet(guessPoint, answerPoint);
  const penalty = Core.scoreLocationPenalty(distanceFeet);
  state.lastPenalty = penalty;

  setMarkerMap(guessMarker, null);
  guessMarker = createMarker({
    position: latLng,
    map,
    title: "Your guess",
    pin: {
      background: "#ff4d31",
      borderColor: "#ffffff",
      glyphText: "?",
    },
  });
  setMarkerVisible(actualMarker, true);

  const actualLatLng = new google.maps.LatLng(
    round.address.lat,
    round.address.lng
  );
  showMapResult(actualLatLng, round.address.label, [
    { label: "Location error", value: Math.round(distanceFeet) + " ft" },
    { label: "Penalty", value: String(penalty), strong: true },
  ]);
  round.reviewPoints = [latLng, actualLatLng];
  fitPoints(round.reviewPoints);

  const detail = {
    address: round.address.label,
    result: Math.round(distanceFeet) + " ft",
    penalty,
  };
  run.details.push(detail);
  recordPracticeOutcome(round, penalty > 1);
  if (run.totalRounds > 1) run.totalPenalty += penalty;

  setStatus(
    "Round settled: " +
      Math.round(distanceFeet) +
      " ft away · " +
      penalty +
      " penalty points."
  );
  reviewSettledRound(run, round, "Round complete", "Review the location on the map.");
}

function reviewSettledRound(run, round, title, detail) {
  if (round.question) {
    round.recap = round.question.answers.map((answer) => answer.display).join(" · ") + " · " + state.lastPenalty + " penalty";
  } else if (activeMapResult) {
    round.recap = ui.status.textContent;
  }
  if (run.totalRounds === 1) run.active = false;
  setStep(title, detail);
  updateGameUI();
  updateControls();
  if (run.active) {
    window.requestAnimationFrame(function () {
      if (isCurrentRound(run.id, round.id) && round.status === "settled") {
        ui.nextCall.focus({ preventScroll: true });
      }
    });
  }
}

function settleKnowledgeRound() {
  const round = state.round;
  const run = state.run;
  if (
    !round ||
    !run ||
    round.status !== "open" ||
    !isKnowledgeMode(run.mode)
  ) {
    return;
  }

  const responses = [ui.answerOne.value.trim(), ui.answerTwo.value.trim()];
  const missingIndexes = responses
    .map(function (value, index) {
      return value ? -1 : index;
    })
    .filter(function (index) {
      return index >= 0;
    });

  [ui.answerOne, ui.answerTwo].forEach(function (input, index) {
    if (missingIndexes.includes(index)) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  });
  if (missingIndexes.length) {
    ui.answerFeedback.dataset.state = "error";
    ui.answerFeedback.textContent = "Enter both answers before checking the round.";
    ui.answerFeedback.hidden = false;
    [ui.answerOne, ui.answerTwo][missingIndexes[0]].focus();
    return;
  }

  round.status = "settled";
  const isHundredBlockRound = run.mode === "hundred-blocks-game";
  const evaluation = isHundredBlockRound
    ? Core.evaluateHundredBlockPair(responses, round.question.answers)
    : Core.evaluateUnorderedPair(
        responses,
        round.question.answers,
        Core.normalizeStreetAnswer
      );
  const penalty = isHundredBlockRound
    ? evaluation.penalty
    : Core.scoreKnowledgePenalty(evaluation.correctCount);
  const displays = round.question.answers.map(function (answer) {
    return answer.display;
  });
  state.lastPenalty = penalty;
  run.totalPenalty += penalty;
  if (isHundredBlockRound) {
    run.totalCredit += evaluation.creditPercent;
  }

  [ui.answerOne, ui.answerTwo].forEach(function (input, index) {
    if (isHundredBlockRound) {
      input.removeAttribute("aria-invalid");
    } else {
      input.setAttribute(
        "aria-invalid",
        String(!evaluation.inputMatches[index])
      );
    }
  });
  const earnedCredit = isHundredBlockRound
    ? evaluation.creditPercent
    : evaluation.correctCount * 50;
  ui.answerFeedback.dataset.state =
    earnedCredit === 100
      ? "correct"
      : earnedCredit > 0
        ? "partial"
        : "incorrect";
  ui.answerFeedback.textContent = isHundredBlockRound
    ? evaluation.creditPercent +
      "/100 credit · " +
      penalty +
      (penalty === 1 ? " penalty point. " : " penalty points. ") +
      "Block number " +
      evaluation.numberCredit +
      "/80 · Direction " +
      evaluation.directionCredit +
      "/20. Correct: " +
      displays.join(" and ") +
      "."
    : evaluation.correctCount +
      " of 2 correct · Answer: " +
      displays.join(" and ") +
      " · " +
      penalty +
      (penalty === 1 ? " penalty point." : " penalty points.");
  ui.answerFeedback.hidden = false;

  run.details.push({
    prompt: round.question.prompt,
    result: isHundredBlockRound
      ? evaluation.creditPercent +
        "/100 credit · block " +
        evaluation.numberCredit +
        "/80 · direction " +
        evaluation.directionCredit +
        "/20 · " +
        displays.join(" / ")
      : evaluation.correctCount + " of 2 · " + displays.join(" / "),
    penalty,
  });

  recordPracticeOutcome(round, earnedCredit < 100);
  reviewSettledRound(run, round, "Answer checked", "Review the answer or reveal it on the map.");
}

function advanceReviewedRound() {
  if (!state.run?.active || !currentRoundIs("settled")) return;
  if (state.round.index >= state.run.totalRounds) {
    if (state.round.mapRevealed) clearRoundGraphics();
    finishRun(state.run.id);
    return;
  }
  state.round.status = "advancing";
  setBusy(true);
  updateControls();
  void loadNextRound(state.run.id);
}

function placeRouteGuess(latLng) {
  const round = state.round;
  if (!round || round.status !== "open") return;

  const station = stationOriginForAddress(round.address);
  if (!station) {
    setStatus("The assigned station could not be determined.");
    return;
  }

  guessMarker = createMarker({
    position: latLng,
    map,
    title: "Your address guess",
    gmpDraggable: true,
    pin: {
      background: "#ff4d31",
      borderColor: "#ffffff",
      glyphText: "?",
    },
  });
  guessMarker.addListener("dragend", function () {
    setStatus(
      "Address guess moved. Continue drawing, adjust route handles, or submit."
    );
    updateRouteDrawingGuidance();
  });

  const route = ensureRoutePolyline();
  if (route.getPath().getLength() === 0) {
    setRoutePath([
      new google.maps.LatLng(station.lat, station.lng),
    ]);
  }
  setRouteEditable(true);
  round.routeStep = "draw-route";

  setStatus(
    "Address placed. Click along the roads you would take; the route begins at Station " +
      round.address.stationId +
      "."
  );
  setStep(
    "Draw your route",
    "Click roads to add points. Drag the address pin or route handles to adjust."
  );
  updateControls();
}

function addRoutePoint(latLng) {
  if (!currentRoundIs("open") || !guessMarker) return;
  ensureRoutePolyline().getPath().push(latLng);
  updateRouteDrawingGuidance();
  updateControls();
}

function undoRoutePoint() {
  if (!routePolyline || !currentRoundIs("open")) return;
  const path = routePolyline.getPath();
  if (path.getLength() > 1) path.pop();
  updateRouteDrawingGuidance();
  updateControls();
}

function moveRouteGuess() {
  if (!currentRoundIs("open") || !guessMarker || state.run.instructor) return;
  setMarkerMap(guessMarker, null);
  guessMarker = null;
  state.round.routeStep = "place-guess";
  setStatus(
    "Address guess cleared. Your route points were kept; choose the address again."
  );
  setStep(
    "Move the address",
    "Click a new location, or pan the focused map and press Enter."
  );
  updateControls();
}

function clearRoute() {
  if (!routePolyline || !currentRoundIs("open")) return;
  const station = stationOriginForAddress(state.round.address);
  if (!station || routePolyline.getPath().getLength() < 2) return;
  state.round.clearedRoute = routePolyline.getPath().getArray().slice();
  setRoutePath([
    new google.maps.LatLng(station.lat, station.lng),
  ]);
  updateRouteDrawingGuidance();
  updateControls();
}

function restoreRoute() {
  if (!currentRoundIs("open") || !state.round.clearedRoute) return;
  const path = state.round.clearedRoute;
  if (routePolyline.getPath().getLength() > 1 && !window.confirm("Replace the current drawing with the cleared route?")) return;
  state.round.clearedRoute = null;
  setRoutePath(path);
  updateControls();
}

function recenterMap() {
  const round = state.round;
  if (!map || ui.recenterMap.hidden || !round) return;
  if (round.status === "settled") {
    if (round.reviewPoints?.length) fitPoints(round.reviewPoints);
    else if (round.mapRevealed) {
      map.setCenter(round.question.coordinates);
      map.setZoom(17);
    }
    return;
  }
  const station = stationOriginForAddress(round.address);
  if (station) {
    map.setCenter({ lat: station.lat, lng: station.lng });
    map.setZoom(15);
  }
}

let instructorMatches = [];

function getApprovedRoutes(address) {
  return readTrainingList(APPROVED_ROUTES_KEY).filter((route) =>
    route?.addressId === address.id && route.stationId === address.stationId &&
    typeof route.name === "string" && typeof route.notes === "string" &&
    Array.isArray(route.path) && Core.normalizePath(route.path).length > 1
  );
}

function refreshInstructorRoutes() {
  ui.instructorRoutes.replaceChildren();
  const match = instructorMatches[ui.instructorMatch.value];
  ui.drawInstructorRoute.disabled = !match;
  ui.practiceInstructorRoute.hidden = true;
  if (!match) return;

  const address = officialAddressFromRecord(match.record, match.stationId);
  const routes = getApprovedRoutes(address);
  ui.practiceInstructorRoute.hidden = routes.length === 0;
  ui.instructorStatus.textContent = routes.length
    ? routes.length + (routes.length === 1 ? " approved route for this assignment." : " approved routes for this assignment.")
    : "No approved routes for this assignment.";
  for (const route of routes) {
    const row = document.createElement("li");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "utility-button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + route.name);
    remove.addEventListener("click", () => {
      const remaining = readTrainingList(APPROVED_ROUTES_KEY).filter((entry) => entry?.id !== route.id);
      if (writeTrainingList(APPROVED_ROUTES_KEY, remaining)) {
        refreshInstructorRoutes();
        ui.instructorMatch.focus();
      } else {
        ui.instructorStatus.textContent = "Browser storage is unavailable. The route was not removed.";
      }
    });
    row.append(route.name + (route.notes ? " · " + route.notes : ""), remove);
    ui.instructorRoutes.append(row);
  }
}

function refreshInstructorMatches() {
  const term = ui.instructorAddress.value.trim().toLowerCase().replace(/\s+/g, " ");
  instructorMatches = [];
  ui.instructorMatch.replaceChildren(new Option("Select an address and station", ""));
  if (term.length >= 3) {
    for (const record of ActiveAddressData.addresses) {
      if (!String(record[1]).toLowerCase().includes(term)) continue;
      for (const stationId of String(record[4]).split(",")) {
        const index = instructorMatches.push({ record, stationId }) - 1;
        ui.instructorMatch.add(new Option(record[1] + " · Station " + stationId, String(index)));
      }
      if (instructorMatches.length >= 30) break;
    }
  }
  ui.instructorStatus.textContent = term.length < 3 ? "Enter at least three characters."
    : instructorMatches.length ? "Choose the address and station." : "No matching official address.";
  refreshInstructorRoutes();
}

function openInstructorRoutes() {
  if (!state.mapReady) return;
  if (!ui.instructorMatch.options.length) refreshInstructorMatches();
  refreshInstructorRoutes();
  ui.instructorDialog.showModal();
  ui.instructorAddress.focus();
}

function startInstructorRoute(event) {
  event.preventDefault();
  const match = instructorMatches[ui.instructorMatch.value];
  const name = ui.instructorName.value.trim();
  if (!match || !name) {
    ui.instructorStatus.textContent = "Choose an assignment and enter a route name.";
    return;
  }
  const notes = ui.instructorNotes.value.trim();
  ui.instructorDialog.close();
  startRun("route-single", 1, ui.openInstructor, { ...match, instructor: { name, notes } });
}

function practiceInstructorRoute() {
  const match = instructorMatches[ui.instructorMatch.value];
  if (!match) return;
  ui.instructorDialog.close();
  startRun("route-single", 1, ui.openInstructor, match);
}

function saveInstructorRoute() {
  const run = state.run;
  const round = state.round;
  if (!run?.instructor || round?.status !== "open" || !routePolyline) return;
  const path = Core.normalizePath(routePolyline.getPath().getArray());
  if (path.length < 2) return;
  const { id: addressId, stationId, lat, lng } = round.address;
  const destination = { lat, lng };
  if (Core.pathLengthFeet(path) < 1) {
    setStatus("Draw the route before saving.");
    return;
  }
  if (Core.haversineFeet(path[path.length - 1], destination) > 250) {
    setStatus("Extend the drawing to the marked address before saving.");
    return;
  }
  if (Core.haversineFeet(path[path.length - 1], destination) > 1) path.push(destination);
  const { name, notes } = run.instructor;
  const routes = readTrainingList(APPROVED_ROUTES_KEY);
  const route = { id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2), addressId, stationId, name, notes, path };
  if (!writeTrainingList(APPROVED_ROUTES_KEY, [...routes, route])) {
    setStatus("Browser storage is unavailable. The drawing is still open so you can retry.");
    return;
  }
  round.status = "settled";
  round.reviewPoints = path;
  setRoutePath(path);
  setRouteEditable(false);
  setStatus("Saved " + name + " for " + round.address.label + " from Station " + stationId + ".");
  reviewSettledRound(run, round, "Approved route saved", "Open Instructor routes to review saved routes or draw another option.");
  ui.openInstructor.focus();
}

async function requestReferenceRoutes(origin, destination) {
  if (!RouteClass) {
    throw new Error("The Google Routes library is unavailable.");
  }

  let timeoutId = null;
  const timeoutPromise = new Promise(function (_resolve, reject) {
    timeoutId = window.setTimeout(function () {
      reject(
        new Error(
          "The reference-route request timed out. Check the connection and try again."
        )
      );
    }, 15000);
  });

  try {
    const result = await Promise.race([
      RouteClass.computeRoutes({
        origin: Core.normalizePoint(origin),
        destination: Core.normalizePoint(destination),
        travelMode: "DRIVING",
        routingPreference: "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: true,
        polylineQuality: "HIGH_QUALITY",
        fields: ["path", "routeLabels"],
      }),
      timeoutPromise,
    ]);
    const routes =
      result && Array.isArray(result.routes)
        ? result.routes.filter(function (route) {
            return Array.isArray(route.path) && route.path.length > 1;
          })
        : [];
    if (!routes.length) {
      throw new Error("Google Routes returned no drivable route options.");
    }
    return routes;
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      throw error;
    }
    const code = String(error && error.code ? error.code : "");
    const errorText =
      code + " " + String(error && error.message ? error.message : "");
    if (errorText.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Google Routes quota was reached. Wait and try again.");
    }
    if (
      errorText.includes("PERMISSION_DENIED") ||
      errorText.includes("UNAUTHENTICATED")
    ) {
      throw new Error(
        "Google Routes was denied. Enable the Routes API and check the key restrictions."
      );
    }
    if (errorText.includes("INVALID_ARGUMENT")) {
      throw new Error("Google Routes rejected the route request.");
    }
    if (errorText.includes("UNAVAILABLE")) {
      throw new Error("Google Routes is temporarily unavailable.");
    }
    throw new Error(
      error && error.message
        ? "Reference routes could not be calculated: " + error.message
        : "Reference routes could not be calculated."
    );
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

function appendGuessToPath(path, guessPosition) {
  const points = path.slice();
  const guess = Core.normalizePoint(guessPosition);
  const last = points.length
    ? Core.normalizePoint(points[points.length - 1])
    : null;

  if (!last || Core.haversineFeet(last, guess) > 25) {
    points.push(guess);
  }
  return points;
}

async function submitRoute() {
  const round = state.round;
  const run = state.run;
  if (!round || !run || run.instructor || round.status !== "open") return;
  if (!guessMarker) {
    setStatus("Place your address guess before submitting a route.");
    return;
  }

  const route = ensureRoutePolyline();
  const drawnPath = route.getPath().getArray();
  if (drawnPath.length <= 1) {
    setStatus("Add at least one road point before submitting.");
    return;
  }

  const runId = run.id;
  const roundId = round.id;
  const addressSnapshot = Object.freeze(Object.assign({}, round.address));
  const station = stationOriginForAddress(addressSnapshot);
  if (!station) {
    setStatus("The assigned station could not be determined.");
    return;
  }
  const stationSnapshot = Object.freeze(Object.assign({}, station));
  const guessSnapshot = getMarkerPosition(guessMarker);
  if (!guessSnapshot) {
    setStatus("The address guess could not be read. Move it and try again.");
    return;
  }
  const origin = new google.maps.LatLng(
    stationSnapshot.lat,
    stationSnapshot.lng
  );
  const drawnPathSnapshot = drawnPath.slice();
  drawnPathSnapshot[0] = origin;
  const userPath = appendGuessToPath(drawnPathSnapshot, guessSnapshot);
  round.status = "submitting";
  round.retryRoute = false;
  guessMarker.setDraggable(false);
  guessMarker.setPosition(guessSnapshot);
  setRoutePath(userPath);
  setRouteEditable(false);

  setStatus("Comparing your route with the reference route…");
  setStep(
    "Scoring route",
    "This round is locked while the route is calculated."
  );
  setBusy(true);
  updateControls();

  const destination = new google.maps.LatLng(
    addressSnapshot.lat,
    addressSnapshot.lng
  );

  const approvedRoutes = getApprovedRoutes(addressSnapshot);
  let referenceRoutes;
  try {
    referenceRoutes = approvedRoutes.length ? approvedRoutes : await requestReferenceRoutes(origin, destination);
  } catch (error) {
    if (!isCurrentRound(runId, roundId)) return;
    round.status = "open";
    setRoutePath(drawnPathSnapshot);
    setRouteEditable(true);
    guessMarker.setDraggable(true);
    setBusy(false);
    round.retryRoute = true;
    setStatus(error.message + " Your drawing was kept.");
    setStep(
      "Route not scored",
      "Your drawing is still available. Try submitting again."
    );
    updateControls();
    return;
  }

  if (
    !isCurrentRound(runId, roundId) ||
    round.status !== "submitting"
  ) {
    return;
  }

  round.status = "settled";
  const candidates = referenceRoutes.map((candidate) => ({
    ...candidate, path: Core.normalizePath(candidate.path),
  })).filter((candidate) => candidate.path.length > 1);
  const referencePaths = candidates.map((candidate) => candidate.path);
  const bestMatch = Core.computeBestRouteMatch(
    referencePaths,
    userPath
  );
  const comparison = bestMatch.selectedResult;
  if (!comparison || bestMatch.selectedIndex < 0) {
    round.status = "open";
    setRoutePath(drawnPathSnapshot);
    setRouteEditable(true);
    guessMarker.setDraggable(true);
    setBusy(false);
    round.retryRoute = true;
    setStatus("No usable reference route was available. Your drawing was kept.");
    updateControls();
    return;
  }
  const closestRoute = candidates[bestMatch.selectedIndex];
  const referencePath = closestRoute.path;
  const referenceName = approvedRoutes.length
    ? closestRoute.name + " (instructor-approved)"
    : "Google reference " + (bestMatch.selectedIndex + 1) + " of " + referencePaths.length;
  const routePenalty = Core.scoreRoutePenalty(comparison.matchPercent);
  const distanceFeet = Core.haversineFeet(
    Core.normalizePoint(guessSnapshot),
    { lat: addressSnapshot.lat, lng: addressSnapshot.lng }
  );
  const locationPenalty = Core.scoreLocationPenalty(distanceFeet);
  const totalPenalty = locationPenalty + routePenalty;
  state.lastPenalty = totalPenalty;

  setMarkerVisible(actualMarker, true);
  const drawingOrder = referencePaths
    .map(function (path, index) {
      return { path, index };
    })
    .sort(function (left, right) {
      if (left.index === bestMatch.selectedIndex) return 1;
      if (right.index === bestMatch.selectedIndex) return -1;
      return left.index - right.index;
    });
  referenceRoutePolylines = drawingOrder.map(function (candidate) {
    const selected = candidate.index === bestMatch.selectedIndex;
    return new google.maps.Polyline({
      map,
      path: candidate.path,
      strokeColor: selected ? "#13b8c4" : "#4d8fc8",
      strokeOpacity: selected ? 0.9 : 0.28,
      strokeWeight: selected ? 9 : 4,
      clickable: false,
      geodesic: false,
      zIndex: selected ? 3 : 1,
    });
  });
  ui.acceptedRouteLegend.hidden = false;
  ui.referenceRouteLabel.textContent = approvedRoutes.length ? "Closest instructor-approved route" : "Closest Google reference";
  if (comparison.departure) addReviewMarker(comparison.departure, "First significant departure", "D", "Departure");
  if (comparison.rejoin) addReviewMarker(comparison.rejoin, "First rejoin", "R", "Rejoin");

  const resultLines = [
    { label: "Location error", value: Math.round(distanceFeet) + " ft" },
    { label: "Location penalty", value: String(locationPenalty) },
    {
      label: "Route match",
      value: comparison.matchPercent.toFixed(1) + "%",
    },
    { label: "Reference", value: referenceName },
    { label: "Route penalty", value: String(routePenalty) },
    { label: "Round penalty", value: String(totalPenalty), strong: true },
  ];
  if (closestRoute.notes) resultLines.push({ label: "Instructor notes", value: closestRoute.notes });
  showMapResult(destination, addressSnapshot.label, resultLines);
  round.reviewPoints = referencePath.concat(userPath);
  fitPoints(round.reviewPoints);

  run.details.push({
    address: addressSnapshot.label,
    result:
      Math.round(distanceFeet) +
      " ft · " +
      comparison.matchPercent.toFixed(1) +
      "% route · " + referenceName + (closestRoute.notes ? " · " + closestRoute.notes : ""),
    penalty: totalPenalty,
  });
  if (run.totalRounds > 1) run.totalPenalty += totalPenalty;

  setBusy(false);
  setStatus(
    "Round settled: " +
      Math.round(distanceFeet) +
      " ft away · " +
      comparison.matchPercent.toFixed(1) +
      "% route match (best of " +
      referencePaths.length +
      ") · " +
      totalPenalty +
      " total penalty."
  );
  recordPracticeOutcome(round, locationPenalty > 1 || routePenalty > 1);
  const reviewDetail = comparison.rejoin
    ? "Departure marks the first difference; Rejoin marks where the routes meet again."
    : comparison.departure
      ? "Departure marks the first difference. The routes did not rejoin."
      : "Review your route and the closest reference on the map.";
  reviewSettledRound(run, round, "Route scored", reviewDetail);
}

function finishRun(runId) {
  if (!isCurrentRun(runId)) return;
  state.run.active = false;
  setBusy(false);
  const isHundredBlockRun = state.run.mode === "hundred-blocks-game";
  setStatus(
    isHundredBlockRun
      ? "Training complete · " +
          state.run.scopeLabel +
          ". " +
          state.run.totalCredit +
          " of " +
          state.run.totalRounds * 100 +
          " credit earned · Final penalty: " +
          state.run.totalPenalty +
          "."
      : "Training complete. Final penalty: " +
          state.run.totalPenalty +
          ". Lower is better."
  );
  setStep(
    "Session complete",
    "Review the round summary, then return to the map."
  );
  updateGameUI();
  updateControls();
  showResults();
}

function showResults() {
  const run = state.run;
  if (!run || !ui.resultDialog) return;

  ui.resultTitle.textContent =
    MODE_LABELS[run.mode] + " results";
  ui.resultSummary.textContent = run.mode === "hundred-blocks-game"
    ? run.totalRounds +
      " rounds · " +
      run.totalCredit +
      " of " +
      run.totalRounds * 100 +
      " credit earned · " +
      Math.round(run.totalCredit / run.totalRounds) +
      "/100 average · " +
      run.totalPenalty +
      " total penalty points."
    : run.totalRounds +
      " rounds · " +
      run.totalPenalty +
      " total penalty points · lower is better.";
  ui.resultRows.replaceChildren();

  run.details.forEach(function (detail, index) {
    const row = document.createElement("tr");
    const roundCell = document.createElement("td");
    const addressCell = document.createElement("td");
    const resultCell = document.createElement("td");
    const penaltyCell = document.createElement("td");

    roundCell.textContent = String(index + 1);
    addressCell.textContent = detail.prompt || detail.address;
    resultCell.textContent = detail.result;
    penaltyCell.textContent = String(detail.penalty);
    row.append(roundCell, addressCell, resultCell, penaltyCell);
    ui.resultRows.appendChild(row);
  });

  if (typeof ui.resultDialog.showModal === "function") {
    ui.resultDialog.showModal();
    ui.closeResults.focus();
  }
}

function closeResults() {
  if (ui.resultDialog && ui.resultDialog.open) {
    ui.resultDialog.close();
  }
}

function handleMapSelection(latLng) {
  if (!state.round || state.round.status !== "open") return;
  if (!isMapSelectionMode(currentMode())) return;

  if (isRouteMode(currentMode())) {
    if (!guessMarker) {
      placeRouteGuess(latLng);
    } else {
      addRoutePoint(latLng);
    }
    return;
  }

  settleDistanceRound(latLng);
}

function handleMapClick(event) {
  if (ui.mapShell.dataset.centerEntry === "true") return;
  handleMapSelection(event.latLng);
}

function handleMapRightClick() {
  if (isRouteMode(currentMode())) undoRoutePoint();
}

function parseStationIdFromProperties(properties) {
  if (!properties) return null;

  for (const entry of Object.entries(properties)) {
    const key = String(entry[0]).toLowerCase();
    if (!key.includes("station") && !key.includes("response")) continue;
    const match = String(entry[1]).match(/([1-7])/);
    if (match) return match[1];
  }
  return null;
}

function validateZoneData() {
  if (
    typeof RESPONSE_ZONES_GEOJSON === "undefined" ||
    !RESPONSE_ZONES_GEOJSON ||
    !Array.isArray(RESPONSE_ZONES_GEOJSON.features)
  ) {
    throw new Error("Response-zone data is missing or malformed.");
  }
}

function initZonesAndStations() {
  validateZoneData();

  stationMarkers.forEach(function (marker) {
    setMarkerMap(marker, null);
  });
  stationZonePolygons.forEach(function (entry) {
    entry.polygon.setMap(null);
  });
  stationMarkers = [];
  stationZonePolygons = [];
  Object.keys(stationsById).forEach(function (stationId) {
    delete stationsById[stationId];
  });

  RESPONSE_ZONES_GEOJSON.features.forEach(function (feature) {
    if (!feature || !feature.geometry) return;
    const stationId = parseStationIdFromProperties(
      feature.properties || {}
    );
    if (!stationId) return;

    const geometry = feature.geometry;
    const color = STATION_COLORS[stationId] || "#64748b";

    if (geometry.type === "Point") {
      const coordinates = geometry.coordinates || [];
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const station = {
        id: stationId,
        name: "Station " + stationId,
        lat,
        lng,
      };
      stationsById[stationId] = station;

      const marker = createMarker({
        position: { lat, lng },
        map,
        title: station.name,
        gmpClickable: true,
        pin: {
          background: color,
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
          glyphText: stationId,
          scale: 1.08,
        },
      });
      const stationInfo = new google.maps.InfoWindow();
      const content = document.createElement("div");
      content.className = "map-result station-result";
      const title = document.createElement("strong");
      title.textContent = station.name;
      content.appendChild(title);
      stationInfo.setContent(content);
      marker.addEventListener("gmp-click", function () {
        stationInfo.setPosition({ lat, lng });
        stationInfo.open({ map });
      });
      stationMarkers.push(marker);
      return;
    }

    if (geometry.type === "Polygon") {
      const rings = geometry.coordinates || [];
      if (!rings.length) return;
      const paths = rings.map(function (ring) {
        return ring.map(function (pair) {
          return { lat: Number(pair[1]), lng: Number(pair[0]) };
        });
      });

      const polygon = new google.maps.Polygon({
        paths,
        strokeColor: color,
        strokeOpacity: 0.92,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.1,
        map,
        clickable: false,
      });
      stationZonePolygons.push({ polygon, stationId });
    }
  });

  const stationCount = Object.keys(stationsById).length;
  const zoneStationCount = new Set(
    stationZonePolygons.map(function (entry) {
      return entry.stationId;
    })
  ).size;

  if (stationCount !== 7 || zoneStationCount !== 7) {
    throw new Error(
      "Expected seven stations and seven response zones, but loaded " +
        stationCount +
        " stations and " +
        zoneStationCount +
        " zones."
    );
  }

  applyZoneVisibility();
}

function getMapCameraSnapshot() {
  const center = map && map.getCenter ? map.getCenter() : null;
  return {
    center: center
      ? center.toJSON()
      : { lat: 39.8425, lng: -88.9531 },
    zoom:
      map && Number.isFinite(map.getZoom()) ? map.getZoom() : 13,
    heading:
      map && Number.isFinite(map.getHeading()) ? map.getHeading() : 0,
    tilt: map && Number.isFinite(map.getTilt()) ? map.getTilt() : 0,
    mapTypeId:
      (map && map.getMapTypeId && map.getMapTypeId()) || "roadmap",
  };
}

function buildMapOptions(camera, hideMapLabels) {
  const options = {
    center: camera.center,
    zoom: camera.zoom,
    heading: camera.heading,
    tilt: camera.tilt,
    mapTypeId: camera.mapTypeId,
    fullscreenControl: true,
    streetViewControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
    },
    gestureHandling: "greedy",
    draggableCursor: "crosshair",
  };

  if (hideMapLabels && HIDDEN_LABEL_MAP_ID) {
    options.mapId = HIDDEN_LABEL_MAP_ID;
  } else if (hideMapLabels) {
    options.styles = HIDDEN_MAP_LABEL_STYLES;
  } else {
    options.mapId = MAP_ID;
  }
  return options;
}

function bindMapKeyboardSelection() {
  ui.mapElement.addEventListener("keydown", function (event) {
    const interactiveTarget =
      event.target && event.target.closest
        ? event.target.closest(
            "button, a, input, select, textarea, [role='button'], [role='link']"
          )
        : null;
    if (interactiveTarget) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z" && isRouteMode(currentMode()) && currentRoundIs("open")) {
      event.preventDefault();
      undoRoutePoint();
      return;
    }
    if (
      (event.key === "Enter" || event.key === " ") &&
      map &&
      currentRoundIs("open")
    ) {
      event.preventDefault();
      handleMapSelection(map.getCenter());
    }
  });
}

function bindMapInteractionListeners() {
  map.addListener("click", handleMapClick);
  map.addListener("rightclick", handleMapRightClick);
  bindMapKeyboardSelection();
}

function replaceMapElement() {
  const previousElement = ui.mapElement;
  const shouldRestoreFocus =
    previousElement === document.activeElement ||
    previousElement.contains(document.activeElement);
  const replacement = document.createElement("div");
  replacement.id = "map";
  replacement.setAttribute("role", "region");
  replacement.setAttribute(
    "aria-label",
    "Interactive Decatur training map"
  );
  replacement.setAttribute("aria-describedby", "map-help");
  replacement.tabIndex = 0;
  previousElement.replaceWith(replacement);
  ui.mapElement = replacement;
  return shouldRestoreFocus;
}

function activeTrainingMarkers() {
  return Array.from(
    new Set(
      stationMarkers
        .concat([actualMarker, guessMarker], reviewMarkers)
        .filter(Boolean)
    )
  );
}

function detachMapGraphics(markers) {
  markers.forEach(function (marker) {
    setMarkerMap(marker, null);
  });
  stationZonePolygons.forEach(function (entry) {
    entry.polygon.setMap(null);
  });
  if (routePolyline) routePolyline.setMap(null);
  referenceRoutePolylines.forEach(function (polyline) {
    polyline.setMap(null);
  });
  if (infoWindow) infoWindow.close();
}

function attachMapGraphics(markers) {
  markers.forEach(function (marker) {
    setMarkerMap(marker, map);
  });
  applyZoneVisibility();
  if (routePolyline) routePolyline.setMap(map);
  referenceRoutePolylines.forEach(function (polyline) {
    polyline.setMap(map);
  });
  renderActiveMapResult();
}

function recreateMapForLabels(hideMapLabels) {
  if (!map || !MapsMapClass || !state.mapReady) return;

  const camera = getMapCameraSnapshot();
  const markers = activeTrainingMarkers();
  detachMapGraphics(markers);
  google.maps.event.clearInstanceListeners(map);
  const shouldRestoreFocus = replaceMapElement();

  state.mapLabelsHidden = Boolean(hideMapLabels);
  mapUsesAdvancedMarkers =
    !state.mapLabelsHidden || Boolean(HIDDEN_LABEL_MAP_ID);
  map = new MapsMapClass(
    ui.mapElement,
    buildMapOptions(camera, state.mapLabelsHidden)
  );
  bindMapInteractionListeners();
  attachMapGraphics(markers);

  setMapStatus(
    "ready",
    state.mapLabelsHidden ? "Map labels hidden" : "Map ready"
  );
  if (shouldRestoreFocus) ui.mapElement.focus();
}

async function initMap() {
  if (state.mapStartupFailed || state.mapReady) return;

  try {
    if (!Core) {
      throw new Error("Training scoring logic did not load.");
    }
    if (!KnowledgeData) {
      throw new Error("Street-training question data did not load.");
    }
    if (!ActiveAddressData || !Array.isArray(ActiveAddressData.addresses)) {
      throw new Error("The official active-address bank did not load.");
    }

    const libraries = await Promise.all([
      google.maps.importLibrary("maps"),
      google.maps.importLibrary("marker"),
      google.maps.importLibrary("routes"),
    ]);
    const mapsLibrary = libraries[0];
    if (state.mapStartupFailed) return;
    const markerLibrary = libraries[1];
    const routesLibrary = libraries[2];
    AdvancedMarkerElementClass = markerLibrary.AdvancedMarkerElement;
    PinElementClass = markerLibrary.PinElement;
    RouteClass = routesLibrary.Route;
    MapsMapClass = mapsLibrary.Map;
    state.mapLabelsHidden = Boolean(ui.mapLabelsCheckbox.checked);
    mapUsesAdvancedMarkers =
      !state.mapLabelsHidden || Boolean(HIDDEN_LABEL_MAP_ID);

    map = new MapsMapClass(
      ui.mapElement,
      buildMapOptions(getMapCameraSnapshot(), state.mapLabelsHidden)
    );

    bindMapInteractionListeners();
    initZonesAndStations();

    window.clearTimeout(mapsLoadTimer);
    state.mapReady = true;
    setMapStatus(
      "ready",
      state.mapLabelsHidden ? "Map labels hidden" : "Map ready"
    );
    ui.address.textContent = "Ready for a training call";
    setStatus(
      "Choose a response area and training mode. Scores are penalties; lower is better."
    );
    setStep(
      "Choose a mode",
      "Select a location or route drill from the tray below."
    );
    setBusy(false);
    updateGameUI();
    updateControls();
  } catch (error) {
    handleMapsLoadError(error.message);
  }
}

function handleMapsLoadError(message) {
  state.mapStartupFailed = true;
  window.clearTimeout(mapsLoadTimer);
  state.mapReady = false;
  if (state.run) state.run.active = false;

  setMapStatus("error", "Map unavailable");
  ui.address.textContent = "Training map unavailable";
  setStatus(
    message ||
      "Google Maps could not load. Check the connection and API configuration."
  );
  setStep(
    "Map setup needed",
    "Resolve the Maps loading issue, then refresh this page."
  );
  setBusy(false);
  updateGameUI();
  updateControls();
}

function setHeaderPanelExpanded(willExpand) {
  ui.toggleHeader.setAttribute("aria-expanded", String(willExpand));
  ui.headerContent.hidden = !willExpand;
  ui.headerContent.inert = !willExpand;
  ui.toggleHeaderIcon.textContent = willExpand ? "⌃" : "⌄";
  ui.toggleHeaderLabel.textContent = willExpand ? "Hide panel" : "Show panel";

  if (map && window.google) {
    window.setTimeout(function () {
      google.maps.event.trigger(map, "resize");
    }, 0);
  }
}

function toggleHeaderPanel() {
  const isExpanded =
    ui.toggleHeader.getAttribute("aria-expanded") === "true";
  setHeaderPanelExpanded(!isExpanded);
}

function handleResponseAreaChange() {
  preferredStationId = ui.stationSelect.value;
  saveSettings();
  const mode = currentMode();
  if (
    state.run &&
    state.run.active &&
    !state.run.fixedAssignment &&
    mode !== "idle"
  ) {
    startRun(mode, state.run.totalRounds, ui.stationSelect);
  }
}

ui.toggleHeader.addEventListener("click", toggleHeaderPanel);
ui.stationSelect.addEventListener("change", handleResponseAreaChange);
ui.newDrill.addEventListener("click", function () {
  startRun("distance-single", 1, ui.newDrill);
});
ui.startGame.addEventListener("click", function () {
  startRun("distance-game", GAME_ROUNDS, ui.startGame);
});
ui.singleRouteDrill.addEventListener("click", function () {
  startRun("route-single", 1, ui.singleRouteDrill);
});
ui.startRouteGame.addEventListener("click", function () {
  startRun("route-game", GAME_ROUNDS, ui.startRouteGame);
});
ui.startCrossStreetGame.addEventListener("click", function () {
  startRun("cross-streets-game", GAME_ROUNDS, ui.startCrossStreetGame);
});
ui.startHundredBlockGame.addEventListener("click", function () {
  startRun("hundred-blocks-game", GAME_ROUNDS, ui.startHundredBlockGame);
});
ui.openInstructor.addEventListener("click", openInstructorRoutes);
ui.instructorAddress.addEventListener("input", refreshInstructorMatches);
ui.instructorMatch.addEventListener("change", refreshInstructorRoutes);
ui.instructorForm.addEventListener("submit", startInstructorRoute);
ui.practiceInstructorRoute.addEventListener("click", practiceInstructorRoute);
ui.closeInstructor.addEventListener("click", () => ui.instructorDialog.close());
ui.saveInstructorRoute.addEventListener("click", saveInstructorRoute);
ui.nextCall.addEventListener("click", advanceReviewedRound);
ui.revealAnswerMap.addEventListener("click", revealKnowledgeMap);
ui.textAnswerForm.addEventListener("submit", function (event) {
  event.preventDefault();
  setHeaderPanelExpanded(true);
  settleKnowledgeRound();
});
ui.answerOne.addEventListener("keydown", function (event) {
  if (
    event.key === "Enter" &&
    !event.isComposing &&
    !ui.answerTwo.value.trim()
  ) {
    event.preventDefault();
    ui.answerTwo.focus();
  }
});
[ui.answerOne, ui.answerTwo].forEach(function (input) {
  input.addEventListener("input", function () {
    input.removeAttribute("aria-invalid");
    if (ui.answerFeedback.dataset.state === "error") {
      ui.answerFeedback.hidden = true;
    }
  });
});
ui.centerEntry.setAttribute("aria-pressed", String(window.matchMedia("(pointer: coarse)").matches));
ui.centerEntry.addEventListener("click", () => {
  ui.centerEntry.setAttribute("aria-pressed", String(ui.centerEntry.getAttribute("aria-pressed") !== "true"));
  updateControls();
});
ui.addCenterPoint.addEventListener("click", () => handleMapSelection(map.getCenter()));
ui.restoreRoute.addEventListener("click", restoreRoute);
ui.recenterMap.addEventListener("click", recenterMap);
ui.repeatDrill.addEventListener("click", () => {
  const mode = settings.mode;
  if (DRILL_MODES.includes(mode)) startRun(mode, isGameMode(mode) ? GAME_ROUNDS : 1, ui.repeatDrill);
});
ui.practiceMisses.addEventListener("change", () => saveSettings());
ui.undoRoute.addEventListener("click", undoRoutePoint);
ui.clearRoute.addEventListener("click", clearRoute);
ui.submitRoute.addEventListener("click", function () {
  void submitRoute();
});
ui.moveRouteGuess.addEventListener("click", moveRouteGuess);
ui.zonesCheckbox.addEventListener("change", () => { saveSettings(); applyZoneVisibility(); });
ui.mapLabelsCheckbox.addEventListener("change", function () {
  saveSettings();
  recreateMapForLabels(ui.mapLabelsCheckbox.checked);
});
ui.closeResults.addEventListener("click", closeResults);
ui.resultDialog.addEventListener("close", function () {
  const target = state.resultReturnFocus;
  if (target && typeof target.focus === "function") target.focus();
});

window.initMap = initMap;
window.handleMapsLoadError = handleMapsLoadError;
window.gm_authFailure = function () {
  handleMapsLoadError(
    "Google Maps rejected the API key. Check its website and API restrictions."
  );
};
