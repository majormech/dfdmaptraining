"use strict";

// ------------------------------------------------------------
// Decatur Fire Map Trainer
// Plain JavaScript by design: no framework or build step needed.
// ------------------------------------------------------------

const Core = window.DFDTrainingCore;
const KnowledgeData = window.DFDKnowledgeData;
const GAME_ROUNDS = 10;
const DISTANCE_NEXT_DELAY_MS = 1700;
const ROUTE_NEXT_DELAY_MS = 2100;
const KNOWLEDGE_NEXT_DELAY_MS = 2400;
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
  headerContent: document.getElementById("header-content"),
  toggleHeader: document.getElementById("toggle-header"),
  toggleHeaderIcon: document.querySelector("#toggle-header > span"),
  toggleHeaderLabel: document.querySelector("#toggle-header .toggle-label"),
  stationSelect: document.getElementById("station-select"),
  zonesCheckbox: document.getElementById("toggle-zones"),
  mapLabelsCheckbox: document.getElementById("toggle-map-labels"),
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
  runSequence: 0,
  roundSequence: 0,
  generationSequence: 0,
  run: null,
  round: null,
  nextRoundTimer: null,
  lastPenalty: null,
  resultReturnFocus: null,
  mapLabelsHidden: false,
};

let map = null;
let MapsMapClass = null;
let geocoder = null;
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
let stationMarkers = [];
let stationZonePolygons = [];
const stationsById = {};

const decaturBounds = {
  minLat: 39.8,
  maxLat: 39.9,
  minLng: -89.05,
  maxLng: -88.85,
};

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
  if (mode === "cross-streets-game") {
    return KnowledgeData.crossStreetQuestions || [];
  }
  if (mode === "hundred-blocks-game") {
    const questions = KnowledgeData.hundredBlockQuestions || [];
    if (!stationId || stationId === "any") return questions;
    return questions.filter(function (question) {
      return Array.isArray(question.stationIds) &&
        question.stationIds.includes(String(stationId));
    });
  }
  return [];
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

  ui.modeLabel.textContent = run.active ? MODE_LABELS[mode] : "Complete";
  const compactScopeLabel =
    run.stationId && run.stationId !== "any"
      ? "Station " + run.stationId
      : run.scopeLabel;
  const scopeSuffix =
    mode === "hundred-blocks-game" && compactScopeLabel
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
  const hundredBlockReview = Boolean(
    knowledgeActive &&
      currentMode() === "hundred-blocks-game" &&
      currentRoundIs("settled")
  );
  const hundredBlockActive = Boolean(
    knowledgeActive && currentMode() === "hundred-blocks-game"
  );

  modeButtons.forEach(function (button) {
    button.disabled = !mapReady || roundBusy;
  });

  ui.stationSelect.disabled =
    !mapReady || roundBusy || (knowledgeActive && !hundredBlockActive);
  ui.zonesCheckbox.disabled = !mapReady || knowledgeActive;
  ui.mapLabelsCheckbox.disabled = !mapReady || roundBusy || knowledgeActive;
  ui.textAnswerForm.hidden = !knowledgeActive;
  ui.answerOne.disabled = !knowledgeOpen;
  ui.answerTwo.disabled = !knowledgeOpen;
  ui.submitTextAnswer.disabled = !knowledgeOpen && !hundredBlockReview;

  const routeSession =
    isRouteMode(currentMode()) && Boolean(state.run);
  const routeMode = routeSession && state.run.active;
  ui.routeActions.hidden = !routeMode;
  ui.routeLegend.hidden = !routeSession;
  ui.trainingControls.dataset.routeActive = String(routeMode);
  ui.header.dataset.knowledgeActive = String(knowledgeActive);
  ui.header.dataset.hundredBlockActive = String(hundredBlockActive);
  ui.mapShell.dataset.knowledgeActive = String(knowledgeActive);
  if (knowledgeActive) {
    ui.mapElement.setAttribute("inert", "");
    ui.mapElement.setAttribute("aria-hidden", "true");
  } else {
    ui.mapElement.removeAttribute("inert");
    ui.mapElement.removeAttribute("aria-hidden");
  }
  ui.mapElement.tabIndex = knowledgeActive ? -1 : 0;
  ui.mapShell.dataset.selectable = String(
    Boolean(currentRoundIs("open") && isMapSelectionMode(currentMode()))
  );

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

  ui.moveRouteGuess.disabled = !routeOpen || !hasGuess;
  ui.undoRoute.disabled = !routeOpen || !hasDrawnPoint;
  ui.clearRoute.disabled = !routeOpen || !hasDrawnPoint;
  ui.submitRoute.disabled = !routeOpen || !hasGuess || !hasDrawnPoint;
}

function clearNextRoundTimer() {
  if (state.nextRoundTimer !== null) {
    window.clearTimeout(state.nextRoundTimer);
    state.nextRoundTimer = null;
  }
}

function invalidatePendingWork() {
  clearNextRoundTimer();
  state.generationSequence += 1;
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
}

function applyZoneVisibility() {
  if (!map) return;
  stationZonePolygons.forEach(function (entry) {
    entry.polygon.setMap(ui.zonesCheckbox.checked ? map : null);
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function geocodeLatLng(lat, lng) {
  return new Promise(function (resolve, reject) {
    geocoder.geocode({ location: { lat, lng } }, function (results, status) {
      if (status === "OK" && results && results.length) {
        resolve(results[0]);
        return;
      }
      if (status === "ZERO_RESULTS") {
        resolve(null);
        return;
      }

      const error = new Error(
        status === "OVER_QUERY_LIMIT"
          ? "Google geocoding quota was reached. Wait a moment and try again."
          : status === "REQUEST_DENIED"
            ? "Google geocoding was denied. Check the Maps API configuration."
            : "Google geocoding failed with status " + status + "."
      );
      error.code = status;
      reject(error);
    });
  });
}

function getAddressComponent(components, type, useShortName) {
  const component = components.find(function (candidate) {
    return candidate.types.includes(type);
  });
  if (!component) return "";
  return useShortName ? component.short_name : component.long_name;
}

function formatAddressFromResult(result) {
  const components = result.address_components || [];
  const house = getAddressComponent(components, "street_number", false);
  const road = getAddressComponent(components, "route", false);
  const city =
    getAddressComponent(components, "locality", false) ||
    getAddressComponent(components, "postal_town", false);
  const stateCode =
    getAddressComponent(
      components,
      "administrative_area_level_1",
      true
    ) || "IL";

  if (!house || !road || !city) return null;
  return house + " " + road + ", " + city + ", " + stateCode;
}

function canonicalAddressFromResult(result, stationId, polygons) {
  if (!result || !result.geometry || !result.geometry.location) return null;

  const label = formatAddressFromResult(result);
  if (!label) return null;

  const components = result.address_components || [];
  const city =
    getAddressComponent(components, "locality", false) ||
    getAddressComponent(components, "postal_town", false);
  if (!city || city.toLowerCase() !== "decatur") return null;

  const location = result.geometry.location;
  const lat = typeof location.lat === "function" ? location.lat() : location.lat;
  const lng = typeof location.lng === "function" ? location.lng() : location.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  if (stationId && polygons && polygons.length) {
    const canonicalPoint = new google.maps.LatLng(lat, lng);
    const insideSelectedZone = polygons.some(function (polygon) {
      return google.maps.geometry.poly.containsLocation(
        canonicalPoint,
        polygon
      );
    });
    if (!insideSelectedZone) return null;
  }

  return {
    lat,
    lng,
    label,
    stationId: stationId || null,
  };
}

function getPolygonsForStation(stationId) {
  return stationZonePolygons
    .filter(function (entry) {
      return entry.stationId === stationId;
    })
    .map(function (entry) {
      return entry.polygon;
    });
}

function getRandomPointInPolygon(polygon) {
  const bounds = new google.maps.LatLngBounds();
  const path = polygon.getPath();
  for (let index = 0; index < path.getLength(); index += 1) {
    bounds.extend(path.getAt(index));
  }

  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const point = new google.maps.LatLng(
      randomBetween(southWest.lat(), northEast.lat()),
      randomBetween(southWest.lng(), northEast.lng())
    );
    if (google.maps.geometry.poly.containsLocation(point, polygon)) {
      return point;
    }
  }

  return path.getAt(0);
}

async function getRandomDecaturAddressCityWide() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const probeLat = randomBetween(decaturBounds.minLat, decaturBounds.maxLat);
    const probeLng = randomBetween(decaturBounds.minLng, decaturBounds.maxLng);
    const result = await geocodeLatLng(probeLat, probeLng);
    const canonical = canonicalAddressFromResult(result, null, null);
    if (canonical) return canonical;
  }

  throw new Error(
    "No valid Decatur address was found. Try another round."
  );
}

async function getRandomAddressInStationZone(stationId) {
  const polygons = getPolygonsForStation(stationId);
  if (!polygons.length) {
    throw new Error(
      "Station " + stationId + " does not have a loaded response zone."
    );
  }

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const polygon = polygons[Math.floor(Math.random() * polygons.length)];
    const probe = getRandomPointInPolygon(polygon);
    const result = await geocodeLatLng(probe.lat(), probe.lng());
    const canonical = canonicalAddressFromResult(
      result,
      stationId,
      polygons
    );
    if (canonical) return canonical;
  }

  throw new Error(
    "No valid address was found inside Station " +
      stationId +
      "'s response zone. Try again."
  );
}

async function getRandomAddressForRound() {
  const selectedStationId = ui.stationSelect.value;
  const availableStationIds = Array.from(
    new Set(
      stationZonePolygons.map(function (entry) {
        return entry.stationId;
      })
    )
  ).sort();

  if (!availableStationIds.length) {
    return getRandomDecaturAddressCityWide();
  }

  const stationId =
    selectedStationId === "any"
      ? availableStationIds[
          Math.floor(Math.random() * availableStationIds.length)
        ]
      : selectedStationId;

  return getRandomAddressInStationZone(stationId);
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
      renderer.append(pin);
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

function startRun(mode, totalRounds, sourceButton) {
  if (!state.mapReady) return;

  const selectedStationId =
    ui.stationSelect && ui.stationSelect.value
      ? String(ui.stationSelect.value)
      : "any";
  const stationId =
    mode === "hundred-blocks-game" ? selectedStationId : "any";
  const scopeLabel =
    stationId === "any"
      ? "Citywide"
      : "Station " + stationId + " response area";
  const questionBank = questionBankForMode(mode, stationId);
  if (isKnowledgeMode(mode) && questionBank.length < totalRounds) {
    ui.address.textContent = "Question bank unavailable";
    setStatus(mode === "hundred-blocks-game"
      ? scopeLabel +
          " needs " +
          totalRounds +
          " verified 100-block questions, but only " +
          questionBank.length +
          " loaded."
      : "This knowledge game needs " +
          totalRounds +
          " verified questions, but only " +
          questionBank.length +
          " loaded.");
    setStep("Check training data", "Reload after the question bank is restored.");
    return;
  }

  invalidatePendingWork();
  if (state.run) state.run.active = false;
  state.lastPenalty = null;
  state.resultReturnFocus = sourceButton || document.activeElement;
  closeResults();
  clearRoundGraphics();

  state.run = {
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
      ? shuffledCopy(questionBank).slice(0, totalRounds)
      : [],
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
      "Which two cross streets bound this address? Enter both street names."
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

  const generationId = ++state.generationSequence;

  ui.address.textContent = "Finding a verified address…";
  setStatus(
    "Checking a real address against the selected response zone."
  );
  setStep("Generating call", "The map will unlock when the address is ready.");
  setBusy(true);
  updateGameUI();
  updateControls();

  let address;
  try {
    address = await getRandomAddressForRound();
  } catch (error) {
    if (
      !isCurrentRound(runId, round.id) ||
      generationId !== state.generationSequence
    ) {
      return;
    }

    run.active = false;
    round.status = "error";
    ui.address.textContent = "Address unavailable";
    setStatus(error.message || "A valid address could not be generated.");
    setStep("Try again", "Start a new drill when the service is available.");
    setBusy(false);
    setMapStatus("error", "Address service issue");
    updateGameUI();
    updateControls();
    return;
  }

  if (
    !isCurrentRound(runId, round.id) ||
    generationId !== state.generationSequence
  ) {
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

  if (isRouteMode(run.mode)) {
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

function scheduleNextRound(runId, roundId, delayMs) {
  clearNextRoundTimer();
  state.nextRoundTimer = window.setTimeout(function () {
    state.nextRoundTimer = null;
    if (!isCurrentRound(runId, roundId)) return;
    if (state.round.status !== "settled") return;
    void loadNextRound(runId);
  }, delayMs);
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
  fitPoints([latLng, actualLatLng]);

  const detail = {
    address: round.address.label,
    result: Math.round(distanceFeet) + " ft",
    penalty,
  };
  run.details.push(detail);
  if (run.totalRounds > 1) run.totalPenalty += penalty;

  setStatus(
    "Round settled: " +
      Math.round(distanceFeet) +
      " ft away · " +
      penalty +
      " penalty points."
  );
  setStep(
    "Round complete",
    run.totalRounds > 1 && round.index < run.totalRounds
      ? "The next address will load automatically."
      : "Start another drill whenever you are ready."
  );
  updateGameUI();

  if (run.totalRounds > 1) {
    if (round.index >= run.totalRounds) {
      finishRun(run.id);
    } else {
      scheduleNextRound(
        run.id,
        round.id,
        DISTANCE_NEXT_DELAY_MS
      );
    }
  } else {
    run.active = false;
    updateGameUI();
    updateControls();
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

  setStep(
    "Answer checked",
    isHundredBlockRound
      ? round.index < run.totalRounds
        ? "Review the breakdown, then choose Next question."
        : "Review the breakdown, then choose View results."
      : round.index < run.totalRounds
        ? "Review the answer; the next question will open automatically."
        : "Review the answer; your results will open automatically."
  );
  if (isHundredBlockRound) {
    ui.submitTextAnswer.textContent =
      round.index < run.totalRounds ? "Next question" : "View results";
  }
  updateGameUI();
  updateControls();
  if (isHundredBlockRound) {
    window.requestAnimationFrame(function () {
      ui.submitTextAnswer.focus({ preventScroll: true });
      ui.answerFeedback.scrollIntoView({ block: "nearest" });
    });
  } else {
    scheduleNextRound(run.id, round.id, KNOWLEDGE_NEXT_DELAY_MS);
  }
}

function advanceHundredBlockRound() {
  const round = state.round;
  const run = state.run;
  if (
    !round ||
    !run ||
    run.mode !== "hundred-blocks-game" ||
    round.status !== "settled"
  ) {
    return;
  }

  round.status = "advancing";
  setBusy(true);
  updateControls();
  void loadNextRound(run.id);
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
  if (!currentRoundIs("open") || !guessMarker) return;
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
  if (!station) return;
  setRoutePath([
    new google.maps.LatLng(station.lat, station.lng),
  ]);
  updateRouteDrawingGuidance();
  updateControls();
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
  if (!round || !run || round.status !== "open") return;
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

  let referenceRoutes;
  try {
    referenceRoutes = await requestReferenceRoutes(origin, destination);
  } catch (error) {
    if (!isCurrentRound(runId, roundId)) return;
    round.status = "open";
    setRoutePath(drawnPathSnapshot);
    setRouteEditable(true);
    setBusy(false);
    setStatus(error.message + " You can try Submit again.");
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
  const referencePaths = referenceRoutes
    .map(function (candidate) {
      return Core.normalizePath(candidate.path);
    })
    .filter(function (path) {
      return path.length > 1;
    });
  const bestMatch = Core.computeBestRouteMatch(
    referencePaths,
    userPath
  );
  const comparison = bestMatch.selectedResult;
  if (!comparison || bestMatch.selectedIndex < 0) {
    round.status = "open";
    setRoutePath(drawnPathSnapshot);
    setRouteEditable(true);
    setBusy(false);
    setStatus("No usable reference route was available. Try Submit again.");
    updateControls();
    return;
  }
  const referencePath = referencePaths[bestMatch.selectedIndex];
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

  showMapResult(destination, addressSnapshot.label, [
    { label: "Location error", value: Math.round(distanceFeet) + " ft" },
    { label: "Location penalty", value: String(locationPenalty) },
    {
      label: "Route match",
      value: comparison.matchPercent.toFixed(1) + "%",
    },
    {
      label: "Accepted option",
      value:
        "Route " +
        (bestMatch.selectedIndex + 1) +
        " of " +
        referencePaths.length,
    },
    { label: "Route penalty", value: String(routePenalty) },
    { label: "Round penalty", value: String(totalPenalty), strong: true },
  ]);
  fitPoints(referencePath.concat(userPath));

  run.details.push({
    address: addressSnapshot.label,
    result:
      Math.round(distanceFeet) +
      " ft · " +
      comparison.matchPercent.toFixed(1) +
      "% route · best of " +
      referencePaths.length,
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
  setStep(
    "Route scored",
    run.totalRounds > 1 && round.index < run.totalRounds
      ? "The next address will load automatically."
      : referencePaths.length > 1
        ? "Red is your route; teal is the closest accepted route; faint blue lines are other options."
        : "Red is your route; teal is the accepted route."
  );
  updateGameUI();
  updateControls();

  if (run.totalRounds > 1) {
    if (round.index >= run.totalRounds) {
      finishRun(run.id);
    } else {
      scheduleNextRound(run.id, round.id, ROUTE_NEXT_DELAY_MS);
    }
  } else {
    run.active = false;
    updateGameUI();
    updateControls();
  }
}

function finishRun(runId) {
  if (!isCurrentRun(runId)) return;
  clearNextRoundTimer();
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
        .concat([actualMarker, guessMarker])
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
  window.clearTimeout(mapsLoadTimer);

  try {
    if (!Core) {
      throw new Error("Training scoring logic did not load.");
    }
    if (!KnowledgeData) {
      throw new Error("Street-training question data did not load.");
    }

    const libraries = await Promise.all([
      google.maps.importLibrary("maps"),
      google.maps.importLibrary("geocoding"),
      google.maps.importLibrary("marker"),
      google.maps.importLibrary("routes"),
      google.maps.importLibrary("geometry"),
    ]);
    const mapsLibrary = libraries[0];
    const geocodingLibrary = libraries[1];
    const markerLibrary = libraries[2];
    const routesLibrary = libraries[3];
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
    geocoder = new geocodingLibrary.Geocoder();

    bindMapInteractionListeners();
    initZonesAndStations();

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
  window.clearTimeout(mapsLoadTimer);
  state.mapReady = false;
  invalidatePendingWork();
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
  if (
    state.run &&
    state.run.active &&
    currentMode() === "hundred-blocks-game"
  ) {
    startRun("hundred-blocks-game", GAME_ROUNDS, ui.stationSelect);
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
ui.textAnswerForm.addEventListener("submit", function (event) {
  event.preventDefault();
  if (
    currentMode() === "hundred-blocks-game" &&
    currentRoundIs("settled")
  ) {
    advanceHundredBlockRound();
    return;
  }
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
ui.undoRoute.addEventListener("click", undoRoutePoint);
ui.clearRoute.addEventListener("click", clearRoute);
ui.submitRoute.addEventListener("click", function () {
  void submitRoute();
});
ui.moveRouteGuess.addEventListener("click", moveRouteGuess);
ui.zonesCheckbox.addEventListener("change", applyZoneVisibility);
ui.mapLabelsCheckbox.addEventListener("change", function () {
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
