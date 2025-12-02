// -------------------------------------------
// Decatur Address Drill – Google Maps + Snazzy + Routing
// -------------------------------------------

// DOM references
const newDrillBtn = document.getElementById("new-drill");
const startRouteBtn = document.getElementById("start-route");
const clearRouteBtn = document.getElementById("clear-route");
const submitRouteBtn = document.getElementById("submit-route");
const stationSelect = document.getElementById("station-select");
const basemapSelect = document.getElementById("basemap-select");
const streetNamesCheckbox = document.getElementById("toggle-street-names");
const addressSpan = document.getElementById("address");
const statusSpan = document.getElementById("status");

// -------------------------------------------
// MAP SETUP
// -------------------------------------------
let map;
let geocoder;

// For random-address generation (city box)
const decaturBounds = {
  minLat: 39.80,
  maxLat: 39.90,
  minLng: -89.05,
  maxLng: -88.85,
};

// Snazzy style: Map without labels
const NO_LABELS_STYLE = [
  {
    featureType: "all",
    elementType: "labels.text",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "all",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

function applyMapStyle() {
  const showStreetNames = streetNamesCheckbox.checked;
  if (showStreetNames) {
    map.setOptions({ styles: [] }); // default Google with labels
  } else {
    map.setOptions({ styles: NO_LABELS_STYLE }); // Snazzy style, labels off
  }
}

// -------------------------------------------
// STATIONS (address-based)
// -------------------------------------------
const STATION_COLORS = {
  "1": "#ff5555",
  "2": "#ff9955",
  "3": "#ffee55",
  "4": "#55ff55",
  "5": "#55ddff",
  "6": "#9977ff",
  "7": "#ff77dd",
};

const STATIONS = [
  {
    id: "1",
    name: "Station 1 – Headquarters",
    address: "1415 North Water Street, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "2",
    name: "Station 2",
    address: "2707 East William Street, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "3",
    name: "Station 3",
    address: "855 North Fairview Avenue, Decatur, IL 62522",
    coords: null,
  },
  {
    id: "4",
    name: "Station 4",
    address: "2760 North 22nd Street, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "5",
    name: "Station 5",
    address: "3808 Greenridge Drive, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "6",
    name: "Station 6",
    address: "1880 South US Route BUS 51, Decatur, IL 62521",
    coords: null,
  },
  {
    id: "7",
    name: "Station 7",
    address: "3540 East Chestnut Avenue, Decatur, IL 62521",
    coords: null,
  },
];

let stationAreasById = {};
let stationMarkers = [];
let stationPolygons = [];
let stationsReady = false;
let currentStation = null;

// -------------------------------------------
// ROUTING STATE
// -------------------------------------------
let actualMarker = null;
let guessMarker = null;
let clickListener = null;

let directionsService = null;
let optimalRoutePolyline = null;

let userRoutePolyline = null;
let userRoutePoints = [];
let routeClickListener = null;

function resetRoute() {
  if (optimalRoutePolyline) {
    optimalRoutePolyline.setMap(null);
    optimalRoutePolyline = null;
  }
  if (userRoutePolyline) {
    userRoutePolyline.setMap(null);
    userRoutePolyline = null;
  }
  userRoutePoints = [];
  if (routeClickListener) {
    google.maps.event.removeListener(routeClickListener);
    routeClickListener = null;
  }
  startRouteBtn.disabled = true;
  clearRouteBtn.disabled = true;
  submitRouteBtn.disabled = true;
}

// -------------------------------------------
// INIT MAP
// -------------------------------------------
function initMapCore() {
  const center = { lat: 39.8425, lng: -88.9531 };

  // ~20 mile restriction box from center
  const latDelta = 0.29;
  const lngDelta = 0.38;
  const viewBounds = {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };

  map = new google.maps.Map(document.getElementById("map"), {
    center,
    zoom: 12,
    mapTypeId: "roadmap",
    styles: [],
    restriction: {
      latLngBounds: viewBounds,
      strictBounds: false,
    },
  });

  geocoder = new google.maps.Geocoder();
  directionsService = new google.maps.DirectionsService();

  wireUI();
  applyMapStyle();
  initStations();
}

window.addEventListener("load", () => {
  if (!window.google || !google.maps) {
    console.error("Google Maps JavaScript API not loaded.");
    setStatus("Error loading Google Maps. Check your API key.");
    return;
  }
  initMapCore();
});

// -------------------------------------------
// STATION INIT (geocode by address)
// -------------------------------------------
function geocodeAddress(address) {
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        console.warn("Geocode failed for", address, status);
        resolve(null);
      }
    });
  });
}

async function initStations() {
  setStatus("Locating fire stations from their addresses…");

  for (const s of STATIONS) {
    const coords = await geocodeAddress(s.address);
    if (coords) {
      s.coords = coords;
    } else {
      console.warn("No coords for station:", s.name);
    }
  }

  addStationMarkers();
  buildStationVoronoi();

  stationsReady = true;
  setStatus('Stations loaded. Pick a station and click "New Drill".');
}

function addStationMarkers() {
  stationMarkers.forEach((m) => m.setMap(null));
  stationMarkers = [];

  STATIONS.forEach((s) => {
    if (!s.coords) return;

    const marker = new google.maps.Marker({
      position: s.coords,
      map,
      title: s.name,
    });

    const info = new google.maps.InfoWindow({
      content: `<strong>${s.name}</strong><br>${s.address}`,
    });

    marker.addListener("click", () => info.open(map, marker));
    stationMarkers.push(marker);
  });
}

// -------------------------------------------
// STATION AREAS (Voronoi)
// -------------------------------------------
function buildStationVoronoi() {
  const pts = STATIONS.filter((s) => s.coords).map((s) =>
    turf.point([s.coords.lng, s.coords.lat], { id: s.id, name: s.name })
  );
  if (!pts.length) return;

  const fc = turf.featureCollection(pts);
  const bbox = [
    decaturBounds.minLng,
    decaturBounds.minLat,
    decaturBounds.maxLng,
    decaturBounds.maxLat,
  ];

  const voronoi = turf.voronoi(fc, { bbox });
  if (!voronoi || !voronoi.features) return;

  stationAreasById = {};
  stationPolygons.forEach((p) => p.setMap(null));
  stationPolygons = [];

  const cityPoly = turf.bboxPolygon(bbox);

  voronoi.features.forEach((feature) => {
    if (!feature || !feature.properties || !feature.properties.id) return;
    const id = feature.properties.id;
    const color = STATION_COLORS[id] || "#999";

    let clipped;
    try {
      clipped = turf.intersect(feature, cityPoly) || feature;
    } catch {
      clipped = feature;
    }
    stationAreasById[id] = clipped;

    if (!clipped.geometry || clipped.geometry.type !== "Polygon") return;
    const coords = clipped.geometry.coordinates[0];
    const path = coords.map(([lng, lat]) => ({ lat, lng }));

    const gPoly = new google.maps.Polygon({
      paths: path,
      strokeColor: color,
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.12,
      map,
    });
    stationPolygons.push(gPoly);
  });
}

// -------------------------------------------
// GEO HELPERS
// -------------------------------------------
function setStatus(msg) {
  statusSpan.textContent = msg;
}

function metersToFeet(m) {
  return m * 3.28084;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function getStationById(id) {
  return STATIONS.find((s) => s.id === id);
}

function geocodeLatLng(lat, lng) {
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results && results.length) {
        resolve(results[0]);
      } else {
        resolve(null);
      }
    });
  });
}

function getComponent(components, type) {
  const c = components.find((ac) => ac.types.includes(type));
  return c ? c.long_name : "";
}

function formatAddressFromResult(result) {
  const comps = result.address_components || [];
  const house = getComponent(comps, "street_number");
  const road = getComponent(comps, "route");
  const city =
    getComponent(comps, "locality") ||
    getComponent(comps, "postal_town") ||
    "";
  const state = getComponent(comps, "administrative_area_level_1") || "IL";

  if (!house || !road || !city) return null;
  return `${house} ${road}, ${city}, ${state}`;
}

async function getRandomAddressForStation(station) {
  const cityBbox = [
    decaturBounds.minLng,
    decaturBounds.minLat,
    decaturBounds.maxLng,
    decaturBounds.maxLat,
  ];

  const areaFeature = station ? stationAreasById[station.id] : null;
  const bbox = areaFeature ? turf.bbox(areaFeature) : cityBbox;

  for (let i = 0; i < 30; i++) {
    const lat = rand(bbox[1], bbox[3]);
    const lng = rand(bbox[0], bbox[2]);
    const pt = turf.point([lng, lat]);

    if (areaFeature && !turf.booleanPointInPolygon(pt, areaFeature)) continue;

    const geoResult = await geocodeLatLng(lat, lng);
    if (!geoResult) continue;

    const label = formatAddressFromResult(geoResult);
    if (!label) continue;

    const comps = geoResult.address_components || [];
    const city =
      getComponent(comps, "locality") ||
      getComponent(comps, "postal_town") ||
      "";
    if (city.toLowerCase() !== "decatur") continue;

    return { lat, lng, label };
  }

  throw new Error("Could not find a random Decatur address for this station.");
}

// -------------------------------------------
// DRILL + GUESS LOGIC (NO ZOOM ON NEW DRILL)
// -------------------------------------------
async function startNewDrill() {
  if (!stationsReady) {
    setStatus("Still loading station locations. Try again in a moment.");
    return;
  }

  // Reset markers & route
  if (actualMarker) actualMarker.setMap(null);
  if (guessMarker) guessMarker.setMap(null);
  if (clickListener) {
    google.maps.event.removeListener(clickListener);
    clickListener = null;
  }
  resetRoute();

  const choice = stationSelect.value;
  currentStation = choice === "any" ? null : getStationById(choice);

  setStatus(
    currentStation
      ? `Looking for a random address in ${currentStation.name}'s area…`
      : "Looking for a random address in Decatur…"
  );
  addressSpan.textContent = "Searching…";

  try {
    const addrInfo = await getRandomAddressForStation(currentStation);
    addressSpan.textContent = addrInfo.label;
    setStatus("Click on the map where you think this address is.");

    // Add actual marker but keep it invisible until after the guess
    actualMarker = new google.maps.Marker({
      position: { lat: addrInfo.lat, lng: addrInfo.lng },
      map,
      opacity: 0,
    });

    // IMPORTANT: do NOT change center/zoom here
    // (no map.setCenter / map.setZoom)

    clickListener = map.addListener("click", (e) => {
      if (guessMarker) guessMarker.setMap(null);
      guessMarker = new google.maps.Marker({ position: e.latLng, map });

      actualMarker.setOpacity(1);

      const from = e.latLng;
      const to = new google.maps.LatLng(addrInfo.lat, addrInfo.lng);
      const distMeters =
        google.maps.geometry.spherical.computeDistanceBetween(from, to);
      const distFeet = metersToFeet(distMeters);

      let msg;
      if (distFeet < 300) {
        msg = `🔥 Awesome! Only ${distFeet.toFixed(0)} ft away.`;
      } else if (distFeet < 1000) {
        msg = `👍 Not bad — ${distFeet.toFixed(0)} ft away.`;
      } else {
        msg = `😬 ${distFeet.toFixed(0)} ft away. Keep practicing.`;
      }

      const info = new google.maps.InfoWindow({
        content: `<b>${addrInfo.label}</b><br>${msg}`,
        position: { lat: addrInfo.lat, lng: addrInfo.lng },
      });
      info.open(map, actualMarker);

      google.maps.event.removeListener(clickListener);
      clickListener = null;

      if (!currentStation) {
        setStatus(
          "Drill complete. Choose a specific station (not 'Any') if you want to practice routing."
        );
      } else {
        setStatus(
          `Correct location shown. Now click "Start Route" and trace your route from ${currentStation.name}.`
        );
        startRouteBtn.disabled = false;
        clearRouteBtn.disabled = false;
        submitRouteBtn.disabled = true;
      }
    });
  } catch (err) {
    console.error(err);
    addressSpan.textContent = "None yet – click “New Drill”";
    setStatus("Couldn't find a valid address this time. Try again.");
  }
}

// -------------------------------------------
// ROUTE DRAWING + COMPARISON
// -------------------------------------------
function beginUserRoute() {
  if (!currentStation || !currentStation.coords || !actualMarker) {
    setStatus("You need a completed drill with a specific station selected.");
    return;
  }

  // Reset any previous route, but keep markers
  resetRoute();

  // Initialize user route starting at station
  const startLatLng = new google.maps.LatLng(
    currentStation.coords.lat,
    currentStation.coords.lng
  );
  userRoutePoints = [startLatLng];

  userRoutePolyline = new google.maps.Polyline({
    map,
    path: userRoutePoints,
    strokeColor: "#ff0000",
    strokeOpacity: 0.9,
    strokeWeight: 4,
  });

  routeClickListener = map.addListener("click", (e) => {
    userRoutePoints.push(e.latLng);
    userRoutePolyline.setPath(userRoutePoints);
    if (userRoutePoints.length >= 2) {
      submitRouteBtn.disabled = false;
    }
  });

  setStatus(
    `Click along the streets from ${currentStation.name} to the call. When done, click "Submit Route".`
  );
  clearRouteBtn.disabled = false;
}

function clearUserRoute() {
  resetRoute();
  if (currentStation && actualMarker) {
    setStatus(
      `Route cleared. Click "Start Route" to trace again from ${currentStation.name}.`
    );
    startRouteBtn.disabled = false;
    clearRouteBtn.disabled = false;
  }
}

function submitUserRoute() {
  if (!currentStation || !currentStation.coords || !actualMarker) {
    setStatus("You need a completed drill first.");
    return;
  }
  if (!userRoutePolyline || userRoutePoints.length < 2) {
    setStatus("Draw your route by clicking on the map before submitting.");
    return;
  }

  // Stop accepting more clicks
  if (routeClickListener) {
    google.maps.event.removeListener(routeClickListener);
    routeClickListener = null;
  }
  startRouteBtn.disabled = true;
  submitRouteBtn.disabled = true;

  setStatus("Comparing your route to Google's optimal route…");

  const origin = new google.maps.LatLng(
    currentStation.coords.lat,
    currentStation.coords.lng
  );
  const destination = actualMarker.getPosition();

  directionsService.route(
    {
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status !== "OK" || !result || !result.routes || !result.routes[0]) {
        console.error("Directions failed:", status, result);
        setStatus("Couldn't get Google route to compare. Try again later.");
        return;
      }

      const route = result.routes[0];
      const path = route.overview_path;

      if (optimalRoutePolyline) {
        optimalRoutePolyline.setMap(null);
      }
      optimalRoutePolyline = new google.maps.Polyline({
        map,
        path,
        strokeColor: "#0000ff",
        strokeOpacity: 0.7,
        strokeWeight: 4,
      });

      const userLenMeters = polyLengthMeters(userRoutePoints);
      const optimalLenMeters = polyLengthMeters(path);
      const userMiles = userLenMeters / 1609.34;
      const optimalMiles = optimalLenMeters / 1609.34;
      const extraMiles = userMiles - optimalMiles;
      const extraPct =
        optimalMiles > 0 ? ((userMiles / optimalMiles - 1) * 100) : 0;

      let summary = `Your route: ${userMiles.toFixed(
        2
      )} mi.  Google optimal: ${optimalMiles.toFixed(2)} mi.`;
      if (extraMiles > 0) {
        summary += `  You added about ${extraMiles.toFixed(
          2
        )} mi (${extraPct.toFixed(0)}% longer).`;
      } else {
        summary += "  You matched or beat Google's distance! 💪";
      }

      setStatus(summary);
    }
  );
}

function polyLengthMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += google.maps.geometry.spherical.computeDistanceBetween(
      points[i - 1],
      points[i]
    );
  }
  return total;
}

// -------------------------------------------
// UI WIRING
// -------------------------------------------
function wireUI() {
  newDrillBtn.addEventListener("click", startNewDrill);

  basemapSelect.addEventListener("change", () => {
    if (basemapSelect.value === "satellite") {
      map.setMapTypeId("hybrid");
    } else {
      map.setMapTypeId("roadmap");
    }
    applyMapStyle();
  });

  streetNamesCheckbox.addEventListener("change", () => {
    applyMapStyle();
  });

  startRouteBtn.addEventListener("click", beginUserRoute);
  clearRouteBtn.addEventListener("click", clearUserRoute);
  submitRouteBtn.addEventListener("click", submitUserRoute);

  startRouteBtn.disabled = true;
  clearRouteBtn.disabled = true;
  submitRouteBtn.disabled = true;
}
