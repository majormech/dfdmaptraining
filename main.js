// -------------------------------------------
// Decatur Address Drill – Google Maps + Snazzy
// -------------------------------------------

// DOM references
const newDrillBtn = document.getElementById("new-drill");
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

// Decatur bounding box (lat, lng)
const decaturBounds = {
  minLat: 39.80,
  maxLat: 39.90,
  minLng: -89.05,
  maxLng: -88.85,
};

// Snazzy Maps style: "Map without labels" (ID 24088)
// https://snazzymaps.com/style/24088/map-without-labels
// This style hides *all* text and icon labels.
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

// Helper to update the current map styling based on checkbox
function applyMapStyle() {
  const showStreetNames = streetNamesCheckbox.checked;
  if (showStreetNames) {
    // Default Google style with labels
    map.setOptions({ styles: [] });
  } else {
    // Snazzy style: labels off
    map.setOptions({ styles: NO_LABELS_STYLE });
  }
}

// -------------------------------------------
// STATION DATA (hard-coded coords)
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
    address: "1415 N Water Street, Decatur, IL 62526",
    coords: { lat: 39.8654, lng: -88.9519 },
  },
  {
    id: "2",
    name: "Station 2",
    address: "2707 E William Street, Decatur, IL 62521",
    coords: { lat: 39.84479, lng: -88.91433 }, // corrected
  },
  {
    id: "3",
    name: "Station 3",
    address: "855 N Fairview Avenue, Decatur, IL 62526",
    coords: { lat: 39.8526, lng: -88.9804 },
  },
  {
    id: "4",
    name: "Station 4",
    address: "2760 N 22nd Street, Decatur, IL 62526",
    coords: { lat: 39.8868, lng: -88.9296 },
  },
  {
    id: "5",
    name: "Station 5",
    address: "3808 Greenridge Drive, Decatur, IL 62526",
    coords: { lat: 39.8953, lng: -88.9458 },
  },
  {
    id: "6",
    name: "Station 6",
    address: "1880 S US Route BUS 51, Decatur, IL 62521",
    coords: { lat: 39.82031, lng: -88.95992 }, // corrected
  },
  {
    id: "7",
    name: "Station 7",
    address: "3540 E Chestnut Avenue, Decatur, IL 62521",
    coords: { lat: 39.82831, lng: -88.87796 }, // corrected
  },
];

let stationAreasById = {}; // id -> Turf polygon feature
let stationMarkers = [];
let stationPolygons = [];

// -------------------------------------------
// INIT MAP
// -------------------------------------------
function initMapCore() {
  // Create map
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 39.8425, lng: -88.9531 },
    zoom: 12,
    mapTypeId: "roadmap",
    styles: [], // start with labels on; Snazzy applied via checkbox
  });

  geocoder = new google.maps.Geocoder();

  // Add station markers
  STATIONS.forEach((s) => {
    const marker = new google.maps.Marker({
      position: s.coords,
      map,
      title: s.name,
    });

    const info = new google.maps.InfoWindow({
      content: `<strong>${s.name}</strong><br>${s.address}`,
    });

    marker.addListener("click", () => {
      info.open(map, marker);
    });

    stationMarkers.push(marker);
  });

  // Build Voronoi station areas and draw polygons
  buildStationVoronoi();

  // Wire UI events
  wireUI();

  setStatus('Pick a station, choose map view, then click "New Drill".');
  applyMapStyle(); // respect initial checkbox state
}

// Call init once DOM + Google Maps are ready
window.addEventListener("load", () => {
  if (!window.google || !google.maps) {
    console.error("Google Maps JavaScript API not loaded.");
    setStatus("Error loading Google Maps. Check your API key.");
    return;
  }
  initMapCore();
});

// -------------------------------------------
// BUILD STATION AREAS (Voronoi using Turf.js)
// -------------------------------------------
function buildStationVoronoi() {
  // Build FeatureCollection of station points
  const ptFeatures = STATIONS.map((s) =>
    turf.point([s.coords.lng, s.coords.lat], {
      id: s.id,
      name: s.name,
    })
  );

  const fc = turf.featureCollection(ptFeatures);

  const bbox = [
    decaturBounds.minLng,
    decaturBounds.minLat,
    decaturBounds.maxLng,
    decaturBounds.maxLat,
  ];

  const voronoi = turf.voronoi(fc, { bbox });
  if (!voronoi || !voronoi.features) {
    console.warn("Voronoi generation failed; no station polygons created.");
    return;
  }

  stationAreasById = {};
  stationPolygons.forEach((poly) => poly.setMap(null));
  stationPolygons = [];

  const cityPoly = turf.bboxPolygon(bbox);

  voronoi.features.forEach((feature) => {
    if (!feature || !feature.properties || !feature.properties.id) return;
    const id = feature.properties.id;
    const color = STATION_COLORS[id] || "#999999";

    let clipped;
    try {
      clipped = turf.intersect(feature, cityPoly) || feature;
    } catch (e) {
      clipped = feature;
    }

    stationAreasById[id] = clipped;

    // Convert Turf polygon to Google Maps Polygon
    if (!clipped.geometry || clipped.geometry.type !== "Polygon") return;
    const coords = clipped.geometry.coordinates[0]; // first ring
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
// GEO / ADDRESS HELPERS (using Google Geocoder)
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

// Wrap Google Geocoder in a Promise
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

// Get random address within station polygon (or entire city)
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

    // Check city is Decatur (just to be safe)
    const comps = geoResult.address_components || [];
    const city =
      getComponent(comps, "locality") ||
      getComponent(comps, "postal_town") ||
      "";
    if (city.toLowerCase() !== "decatur") continue;

    return {
      lat,
      lng,
      label,
    };
  }

  throw new Error("Could not find a random Decatur address for this station.");
}

// -------------------------------------------
// DRILL STATE & LOGIC
// -------------------------------------------
let actualMarker = null;
let guessMarker = null;
let clickListener = null;

function resetDrill() {
  if (actualMarker) {
    actualMarker.setMap(null);
    actualMarker = null;
  }
  if (guessMarker) {
    guessMarker.setMap(null);
    guessMarker = null;
  }
  if (clickListener) {
    google.maps.event.removeListener(clickListener);
    clickListener = null;
  }
}

async function startNewDrill() {
  resetDrill();

  const choice = stationSelect.value;
  const station = choice === "any" ? null : getStationById(choice);

  setStatus(
    station
      ? `Looking for a random address in ${station.name}'s area…`
      : "Looking for a random address in Decatur…"
  );

  try {
    const addrInfo = await getRandomAddressForStation(station);
    addressSpan.textContent = addrInfo.label;
    setStatus("Click on the map where you think this address is.");

    actualMarker = new google.maps.Marker({
      position: { lat: addrInfo.lat, lng: addrInfo.lng },
      map,
      opacity: 0, // hidden until after guess
    });

    map.setCenter({ lat: addrInfo.lat, lng: addrInfo.lng });
    map.setZoom(15);

    clickListener = map.addListener("click", (e) => {
      if (guessMarker) guessMarker.setMap(null);
      guessMarker = new google.maps.Marker({
        position: e.latLng,
        map,
      });

      // Reveal actual marker
      actualMarker.setOpacity(1);

      const from = e.latLng;
      const to = new google.maps.LatLng(addrInfo.lat, addrInfo.lng);
      const distMeters = google.maps.geometry.spherical.computeDistanceBetween(
        from,
        to
      );
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

      setStatus('Drill complete. Click "New Drill" to try another address.');

      google.maps.event.removeListener(clickListener);
      clickListener = null;
    });
  } catch (err) {
    console.error(err);
    addressSpan.textContent = "None yet – click “New Drill”";
    setStatus("Couldn't find a valid address this time. Try again.");
  }
}

// -------------------------------------------
// UI WIRING
// -------------------------------------------
function wireUI() {
  // New Drill
  newDrillBtn.addEventListener("click", startNewDrill);

  // Basemap: road vs satellite
  basemapSelect.addEventListener("change", () => {
    if (basemapSelect.value === "satellite") {
      map.setMapTypeId("hybrid"); // imagery + labels
    } else {
      map.setMapTypeId("roadmap");
    }
    applyMapStyle(); // re-apply styles after type change
  });

  // Street names toggle (Snazzy style vs default)
  streetNamesCheckbox.addEventListener("change", () => {
    applyMapStyle();
  });
}
