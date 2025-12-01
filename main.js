// Decatur Address Drill – main.js
// - Shows all 7 fire stations as markers
// - Station selector: bias random address near selected station (or anywhere)
// - Toggle to show / hide street names (switch base tile layer)
// - On "New Drill", gets a random real address in Decatur with a house number
// - User clicks where they think it is; app scores their guess

// DOM elements
const newDrillBtn = document.getElementById("new-drill-btn");
const currentAddressSpan = document.getElementById("current-address");
const messageDiv = document.getElementById("message");
const stationSelect = document.getElementById("station-select");
const labelsCheckbox = document.getElementById("toggle-labels");

// Rough center of Decatur, IL
const map = L.map("map").setView([39.842468, -88.953148], 13);

// --- Base map layers (with and without labels) ---

// Normal OpenStreetMap with labels
const osmWithLabels = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }
);

// Carto "light_nolabels" – roads & buildings but no labels/street names
const osmNoLabels = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; OpenStreetMap contributors &copy; CARTO',
  }
);

// Start with labels on
let currentBaseLayer = osmWithLabels;
currentBaseLayer.addTo(map);

// Handle street-name toggle
labelsCheckbox.addEventListener("change", () => {
  const wantLabels = labelsCheckbox.checked;

  if (wantLabels) {
    if (map.hasLayer(osmNoLabels)) map.removeLayer(osmNoLabels);
    if (!map.hasLayer(osmWithLabels)) osmWithLabels.addTo(map);
    currentBaseLayer = osmWithLabels;
  } else {
    if (map.hasLayer(osmWithLabels)) map.removeLayer(osmWithLabels);
    if (!map.hasLayer(osmNoLabels)) osmNoLabels.addTo(map);
    currentBaseLayer = osmNoLabels;
  }
});

// --- Fire Station Markers ---

// NOTE: coords are approximate but close enough for drill visualization.
// You can refine later with exact GIS data if you want.
const fireStations = [
  {
    id: "1",
    name: "Station 1 – Headquarters",
    coords: [39.8654, -88.9519],
  },
  {
    id: "2",
    name: "Station 2",
    coords: [39.8448, -88.9143],
  },
  {
    id: "3",
    name: "Station 3",
    coords: [39.8526, -88.9804],
  },
  {
    id: "4",
    name: "Station 4",
    coords: [39.8868, -88.9296],
  },
  {
    id: "5",
    name: "Station 5",
    coords: [39.8953, -88.9458],
  },
  {
    id: "6",
    name: "Station 6",
    coords: [39.8274, -88.9440],
  },
  {
    id: "7",
    name: "Station 7",
    coords: [39.8423, -88.8743],
  },
];

// Add red markers with station names
fireStations.forEach((station) => {
  L.marker(station.coords, {
    icon: L.icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    }),
  })
    .addTo(map)
    .bindPopup(station.name);
});

// --- Drill state ---

let currentTarget = null; // { label, coords: [lat, lon] }
let targetMarker = null; // Leaflet marker for correct answer
let guessMarker = null; // Leaflet marker for user guess
let drillActive = false;

// Helpers
function setMessage(text, isError = false) {
  messageDiv.textContent = text;
  messageDiv.style.color = isError ? "darkred" : "#333";
}

function metersToFeet(m) {
  return m * 3.28084;
}

/**
 * Get a random coordinate inside a bounding box.
 * bbox = { south, west, north, east }
 */
function randomPointInBbox(bbox) {
  const lat = bbox.south + Math.random() * (bbox.north - bbox.south);
  const lon = bbox.west + Math.random() * (bbox.east - bbox.west);
  return { lat, lon };
}

/**
 * Get a small bounding box around a station (for station-specific drills).
 */
function getStationBbox(stationId) {
  // City-wide fallback box
  const cityBbox = {
    south: 39.80,
    west: -88.99,
    north: 39.89,
    east: -88.88,
  };

  if (stationId === "any") return cityBbox;

  const station = fireStations.find((s) => s.id === stationId);
  if (!station) return cityBbox;

  const [lat, lon] = station.coords;

  // ~1–1.5 miles around the station (tweak if you want bigger/smaller)
  const latDelta = 0.02;
  const lonDelta = 0.02;

  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lon - lonDelta,
    east: lon + lonDelta,
  };
}

/**
 * Ask Nominatim (OpenStreetMap geocoder) for the address at a lat/lon.
 * Returns null if no good address / not Decatur / no house number.
 *
 * IMPORTANT: replace the email in User-Agent with YOUR real contact.
 */
async function reverseGeocodeDecatur(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", "en");

  const resp = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DecaturFireDrillApp/1.0 (youremail@example.com)",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) {
    return null;
  }

  const data = await resp.json();
  if (!data.address) return null;

  const addr = data.address;
  const cityName =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    "";

  // Make sure it's actually Decatur
  if (cityName.toLowerCase() !== "decatur") {
    return null;
  }

  // Require a proper house number + street
  const house = addr.house_number || "";
  const road =
    addr.road ||
    addr.residential ||
    addr.street ||
    addr.neighbourhood ||
    "";

  if (!house || !road) {
    return null;
  }

  const state = addr.state || "IL";
  const label = `${house} ${road}, Decatur, ${state}`
    .replace(/\s+/g, " ")
    .trim();

  // Extra safety: require at least one digit in label
  if (!/\d/.test(label)) {
    return null;
  }

  const latNum = Number(data.lat);
  const lonNum = Number(data.lon);

  if (!label || Number.isNaN(latNum) || Number.isNaN(lonNum)) {
    return null;
  }

  return {
    label,
    coords: [latNum, lonNum], // [lat, lon]
  };
}

/**
 * Get a random address INSIDE Decatur.
 * If a station is selected, try that station's bbox first,
 * then fall back to whole-city bbox if needed.
 */
async function getRandomAddressInDecatur(maxTries = 40, stationId = "any") {
  const cityBbox = {
    south: 39.80,
    west: -88.99,
    north: 39.89,
    east: -88.88,
  };

  const stationBbox = getStationBbox(stationId);

  const halfTries = Math.floor(maxTries / 2);

  // First: try near the chosen station (if any)
  for (let i = 0; i < halfTries; i++) {
    const { lat, lon } = randomPointInBbox(stationBbox);
    const result = await reverseGeocodeDecatur(lat, lon);
    if (result) return result;
  }

  // Second: fall back to entire city if station area was too sparse
  for (let i = halfTries; i < maxTries; i++) {
    const { lat, lon } = randomPointInBbox(cityBbox);
    const result = await reverseGeocodeDecatur(lat, lon);
    if (result) return result;
  }

  throw new Error(
    "Could not find a random Decatur address with a house number after several tries."
  );
}

// New drill: fetch a random Decatur address
async function startNewDrill() {
  // Clear old markers
  if (targetMarker) {
    map.removeLayer(targetMarker);
    targetMarker = null;
  }
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }

  const selectedStationId = stationSelect?.value || "any";

  setMessage(
    selectedStationId === "any"
      ? "Getting a random address inside Decatur..."
      : `Getting a random address near ${stationSelect.options[stationSelect.selectedIndex].text}...`
  );

  try {
    currentTarget = await getRandomAddressInDecatur(40, selectedStationId);
    currentAddressSpan.textContent = currentTarget.label;
    setMessage("Drill started. Click on the map where you think this address is.");
    drillActive = true;

    // Recenter map around Decatur center
    map.setView([39.842468, -88.953148], 13);
  } catch (err) {
    currentTarget = null;
    drillActive = false;
    setMessage("Error getting address: " + err.message, true);
  }
}

// Handle map clicks: user guess
map.on("click", (e) => {
  if (!drillActive || !currentTarget) {
    setMessage('Click "New Drill" to start.', true);
    return;
  }

  const guessLatLng = e.latlng;

  // Place / move guess marker
  if (guessMarker) {
    guessMarker.setLatLng(guessLatLng);
  } else {
    guessMarker = L.marker(guessLatLng, { title: "Your guess" }).addTo(map);
  }

  // Compute distance between guess and target using Turf
  const guessPoint = turf.point([guessLatLng.lng, guessLatLng.lat]);
  const targetPoint = turf.point([
    currentTarget.coords[1], // lon
    currentTarget.coords[0], // lat
  ]);

  const distanceMeters = turf.distance(guessPoint, targetPoint, {
    units: "meters",
  });
  const distanceFeet = metersToFeet(distanceMeters);

  // Drop the actual location marker (if not already)
  if (!targetMarker) {
    targetMarker = L.marker(
      [currentTarget.coords[0], currentTarget.coords[1]],
      { title: "Actual location" }
    )
      .addTo(map)
      .bindPopup(`Actual: ${currentTarget.label}`)
      .openPopup();
  } else {
    targetMarker.setLatLng([
      currentTarget.coords[0],
      currentTarget.coords[1],
    ]);
  }

  // Zoom to show both points
  const group = L.featureGroup([guessMarker, targetMarker]);
  map.fitBounds(group.getBounds().pad(0.5));

  // Basic scoring message
  let rating;
  if (distanceFeet < 150) {
    rating = "🔥 Nailed it!";
  } else if (distanceFeet < 600) {
    rating = "👍 Close!";
  } else {
    rating = "🤔 Needs work.";
  }

  setMessage(
    `${rating} You were about ${distanceFeet.toFixed(
      0
    )} feet (${distanceMeters.toFixed(0)} m) from the actual address.`
  );

  // End this drill round; require another "New Drill" to continue
  drillActive = false;
});

// Wire up button
newDrillBtn.addEventListener("click", () => {
  startNewDrill();
});

// Initial message
setMessage(
  'Choose a station (or "Any"), decide if you want street names on or off, then click "New Drill" to start.'
);
