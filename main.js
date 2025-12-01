// -------------------------------------------
// Decatur Address Drill – main.js
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
const decaturBounds = L.latLngBounds([39.80, -89.05], [39.90, -88.85]);

const map = L.map("map", {
  center: [39.8425, -88.9531],
  zoom: 12,
  maxBounds: decaturBounds,
  maxBoundsViscosity: 0.8,
});

// Road base
const roadBase = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    minZoom: 11,
  }
);

// Satellite base
const satelliteBase = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, minZoom: 11 }
);

// Labels
const labelOverlay = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
);

// start on road mode
let currentBase = roadBase;
currentBase.addTo(map);
labelOverlay.addTo(map);

// -------------------------------------------
// STATION DEFINITIONS (approx coords)
// -------------------------------------------
const stationColors = {
  "1": "#ff5555",
  "2": "#ff9955",
  "3": "#ffee55",
  "4": "#55ff55",
  "5": "#55ddff",
  "6": "#9977ff",
  "7": "#ff77dd",
};

const stations = [
  { id: "1", name: "Station 1 – Headquarters", coords: [39.8654, -88.9519] },
  { id: "2", name: "Station 2", coords: [39.8408, -88.8933] },
  { id: "3", name: "Station 3", coords: [39.8526, -88.9804] },
  { id: "4", name: "Station 4", coords: [39.8868, -88.9296] },
  { id: "5", name: "Station 5", coords: [39.8953, -88.9458] },
  { id: "6", name: "Station 6", coords: [39.8274, -88.9440] },
  { id: "7", name: "Station 7", coords: [39.8423, -88.8743] },
];

// markers + color zones
stations.forEach((s) => {
  // marker
  L.marker(s.coords).addTo(map).bindPopup(s.name);

  // colored circle zone (will replace with polygons later)
  L.circle(s.coords, {
    radius: 2500,
    color: stationColors[s.id],
    weight: 2,
    fillColor: stationColors[s.id],
    fillOpacity: 0.12,
  }).addTo(map);
});

// -------------------------------------------
// HELPERS
// -------------------------------------------
function setStatus(msg) {
  statusSpan.textContent = msg;
}

function feet(m) {
  return m * 3.28084;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function getStation(id) {
  return stations.find((s) => s.id === id);
}

function getRandomBbox(st) {
  const [lat, lon] = st.coords;
  return {
    minLat: lat - 0.03,
    maxLat: lat + 0.03,
    minLon: lon - 0.04,
    maxLon: lon + 0.04,
  };
}

async function reverseGeo(lat, lon) {
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=" +
    lat +
    "&lon=" +
    lon;

  const res = await fetch(url, {
    headers: { "User-Agent": "DecaturAddressDrill" },
  });

  if (!res.ok) return null;
  return res.json();
}

function formatAddress(addr) {
  return `${addr.house_number || ""} ${addr.road || ""}, ${addr.city || ""}, ${
    addr.state || "IL"
  }`.replace(/\s+/g, " ");
}

async function randomDecaturAddress(station) {
  const bbox = station ? getRandomBbox(station) : null;

  for (let i = 0; i < 25; i++) {
    let lat, lon;

    if (bbox) {
      lat = rand(bbox.minLat, bbox.maxLat);
      lon = rand(bbox.minLon, bbox.maxLon);
    } else {
      lat = rand(decaturBounds.getSouth(), decaturBounds.getNorth());
      lon = rand(decaturBounds.getWest(), decaturBounds.getEast());
    }

    const data = await reverseGeo(lat, lon);
    if (!data || !data.address) continue;

    const a = data.address;
    if ((a.city || "").toLowerCase() !== "decatur") continue;
    if (!a.house_number || !a.road) continue;

    return { lat, lon, label: formatAddress(a) };
  }

  throw new Error("Couldn't find address");
}

// -------------------------------------------
// DRILL LOGIC
// -------------------------------------------
let actualMarker = null;
let guessMarker = null;
let clickHandler = null;

function resetDrill() {
  if (actualMarker) map.removeLayer(actualMarker);
  if (guessMarker) map.removeLayer(guessMarker);
  if (clickHandler) map.off("click", clickHandler);

  actualMarker = null;
  guessMarker = null;
  clickHandler = null;
}

async function startDrill() {
  resetDrill();

  const choice = stationSelect.value;
  const station = choice === "any" ? null : getStation(choice);

  setStatus("Looking for a random address…");

  try {
    const a = await randomDecaturAddress(station);
    addressSpan.textContent = a.label;
    setStatus("Tap the map where you think this address is.");

    actualMarker = L.marker([a.lat, a.lon], { opacity: 0 }).addTo(map);

    map.setView([a.lat, a.lon], 15);

    clickHandler = (e) => {
      if (guessMarker) map.removeLayer(guessMarker);
      guessMarker = L.marker(e.latlng).addTo(map);

      actualMarker.setOpacity(1);

      const d = turf.distance(
        turf.point([e.latlng.lng, e.latlng.lat]),
        turf.point([a.lon, a.lat]),
        { units: "meters" }
      );

      const f = feet(d);
      let msg =
        f < 300
          ? `🔥 Awesome! Only ${f.toFixed(0)} ft away.`
          : f < 1000
          ? `👍 Not bad — ${f.toFixed(0)} ft away.`
          : `😬 ${f.toFixed(0)} ft away. Keep practicing.`;

      actualMarker.bindPopup(`<b>${a.label}</b><br>${msg}`).openPopup();

      map.off("click", clickHandler);
    };

    map.on("click", clickHandler);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't find a valid address — try again.");
  }
}

// -------------------------------------------
// UI EVENTS
// -------------------------------------------
newDrillBtn.addEventListener("click", startDrill);

// Street name toggle
streetNamesCheckbox.addEventListener("change", () => {
  streetNamesCheckbox.checked
    ? labelOverlay.addTo(map)
    : map.removeLayer(labelOverlay);
});

// Basemap toggle
basemapSelect.addEventListener("change", () => {
  map.removeLayer(currentBase);
  currentBase =
    basemapSelect.value === "satellite" ? satelliteBase : roadBase;
  currentBase.addTo(map);
});

// Initial status
setStatus("Ready");
