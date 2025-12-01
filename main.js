// Decatur Address Drill – main.js

// ---------- DOM ELEMENTS ----------
const newDrillBtn = document.getElementById("new-drill");
const stationSelect = document.getElementById("station-select");
const basemapSelect = document.getElementById("basemap-select");
const streetNamesCheckbox = document.getElementById("toggle-street-names");
const zonesCheckbox = document.getElementById("toggle-zones");
const addressSpan = document.getElementById("address");
const statusSpan = document.getElementById("status");

// ---------- MAP SETUP ----------
const decaturBounds = L.latLngBounds(
  [39.80, -89.05], // SW
  [39.90, -88.85]  // NE
);

const map = L.map("map", {
  center: [39.8425, -88.9531],
  zoom: 12,
  maxBounds: decaturBounds,
  maxBoundsViscosity: 0.8,
});

// Road base (Carto)
const roadBase = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    minZoom: 11,
    maxZoom: 19,
  }
);

// Esri satellite base
const satelliteBase = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution:
      'Tiles &copy; Esri — Source: Esri, Earthstar Geographics, ' +
      'CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
    minZoom: 11,
    maxZoom: 19,
  }
);

// Label overlay (street names)
const labelOverlay = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
  {
    attribution: "",
  }
);

// Start with road + labels
let currentBase = roadBase;
currentBase.addTo(map);
labelOverlay.addTo(map);

// ---------- STATION DATA ----------
// Coords are approximate; user can refine later.
const stations = [
  {
    id: "1",
    name: "Station 1 – Headquarters",
    coords: [39.8654, -88.9519],
  },
  {
    id: "2",
    name: "Station 2",
    coords: [39.8408, -88.8933],
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

const stationMarkers = [];
const stationZones = [];

// Add markers & simple shaded “areas” (circles) for each station
stations.forEach((s) => {
  const marker = L.marker(s.coords, { title: s.name })
    .addTo(map)
    .bindPopup(s.name);
  stationMarkers.push(marker);

  const circle = L.circle(s.coords, {
    radius: 2500, // meters – tweak later
    color: "#666",
    weight: 1,
    fillColor: "#ffaa00",
    fillOpacity: 0.08,
  });
  stationZones.push({ id: s.id, layer: circle });

  if (zonesCheckbox.checked) {
    circle.addTo(map);
  }
});

// ---------- HELPERS ----------
function setStatus(text) {
  statusSpan.textContent = text;
}

function metersToFeet(m) {
  return m * 3.28084;
}

// Random in [min, max]
function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getStationById(id) {
  return stations.find((s) => s.id === id);
}

function pickStationForAny() {
  const idx = Math.floor(Math.random() * stations.length);
  return stations[idx];
}

// Compute a loose bounding box around a station
function getStationBbox(station) {
  const [lat, lon] = station.coords;
  const dLat = 0.03; // ~2–3 km
  const dLon = 0.04;
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lon - dLon,
    maxLon: lon + dLon,
  };
}

// Nominatim reverse-geocode
async function reverseGeocode(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());
  url.searchParams.set("addressdetails", "1");

  const resp = await fetch(url.toString(), {
    headers: {
      // Optional: you can edit this string to include your real contact info
      "User-Agent": "DecaturAddressDrill/1.0",
      "Accept-Language": "en",
    },
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  return data;
}

function formatAddress(addr) {
  const parts = [];
  if (addr.house_number && addr.road) {
    parts.push(`${addr.house_number} ${addr.road}`);
  } else if (addr.road) {
    parts.push(addr.road);
  }
  if (addr.city || addr.town || addr.village) {
    parts.push(addr.city || addr.town || addr.village);
  }
  if (addr.state) {
    parts.push(addr.state);
  }
  return parts.join(", ");
}

// Get a random valid Decatur address within a station’s area
async function getRandomAddressForStation(station) {
  const cityBounds = decaturBounds;
  const bbox = station ? getStationBbox(station) : null;

  const maxTries = 20;
  for (let i = 0; i < maxTries; i++) {
    let lat, lon;

    if (station && bbox) {
      lat = randBetween(bbox.minLat, bbox.maxLat);
      lon = randBetween(bbox.minLon, bbox.maxLon);
    } else {
      // “Any Station” fallback: anywhere in the city box
      lat = randBetween(cityBounds.getSouth(), cityBounds.getNorth());
      lon = randBetween(cityBounds.getWest(), cityBounds.getEast());
    }

    // ensure within general city bounds
    if (!cityBounds.contains([lat, lon])) continue;

    const data = await reverseGeocode(lat, lon);
    if (!data || !data.address) continue;
    const addr = data.address;

    const cityName = (addr.city || addr.town || addr.village || "").toLowerCase();
    if (cityName !== "decatur") continue;
    if (!addr.house_number || !addr.road) continue;

    const label = formatAddress(addr);
    if (!/\d/.test(label)) continue;

    return { lat, lon, label };
  }

  throw new Error("Could not find a random Decatur address after several tries.");
}

// ---------- DRILL STATE ----------
let actualMarker = null;
let guessMarker = null;
let clickHandler = null;

function resetDrill() {
  if (actualMarker) {
    map.removeLayer(actualMarker);
    actualMarker = null;
  }
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }
  if (clickHandler) {
    map.off("click", clickHandler);
    clickHandler = null;
  }
}

// ---------- DRILL FLOW ----------
async function startNewDrill() {
  resetDrill();

  const selected = stationSelect.value;
  let station = null;

  if (selected === "any") {
    station = null; // city-wide
    setStatus("Getting a random address in Decatur...");
  } else {
    station = getStationById(selected) || pickStationForAny();
    setStatus(`Getting a random address near ${station.name}...`);
  }

  try {
    const result = await getRandomAddressForStation(station);
    addressSpan.textContent = result.label;
    setStatus("Drill started. Tap the map where you think the address is.");

    actualMarker = L.marker([result.lat, result.lon], {
      opacity: 0, // hidden until after guess
    }).addTo(map);

    map.setView([result.lat, result.lon], 15);

    clickHandler = (e) => {
      if (guessMarker) map.removeLayer(guessMarker);

      guessMarker = L.marker(e.latlng).addTo(map);

      // Reveal the actual marker
      actualMarker.setOpacity(1);

      const from = turf.point([e.latlng.lng, e.latlng.lat]);
      const to = turf.point([result.lon, result.lat]);
      const distKm = turf.distance(from, to, { units: "kilometers" });
      const distFeet = metersToFeet(distKm * 1000);

      let rating;
      if (distFeet < 300) {
        rating = `🔥 Nice! You were only about ${distFeet.toFixed(0)} feet away.`;
      } else if (distFeet < 1000) {
        rating = `👍 Pretty good. You were about ${distFeet.toFixed(0)} feet away.`;
      } else {
        rating = `😬 Needs work. You were about ${distFeet.toFixed(0)} feet away.`;
      }

      const popupHtml = `
        <div>
          <div><strong>Actual:</strong> ${result.label}</div>
          <div style="margin-top:4px;">${rating}</div>
        </div>
      `;

      actualMarker.bindPopup(popupHtml).openPopup();

      // Fit both markers
      const group = L.featureGroup([guessMarker, actualMarker]);
      map.fitBounds(group.getBounds().pad(0.5));

      setStatus('Drill complete. Tap "New Drill" to try another address.');

      map.off("click", clickHandler);
      clickHandler = null;
    };

    map.on("click", clickHandler);
  } catch (err) {
    console.error(err);
    addressSpan.textContent = "None yet – click “New Drill”";
    setStatus("Could not find a valid address. Try New Drill again.");
  }
}

// ---------- UI HANDLERS ----------

// New Drill button
newDrillBtn.addEventListener("click", startNewDrill);

// Basemap: road vs satellite
basemapSelect.addEventListener("change", () => {
  map.removeLayer(currentBase);
  if (basemapSelect.value === "satellite") {
    currentBase = satelliteBase;
  } else {
    currentBase = roadBase;
  }
  currentBase.addTo(map);
});

// Street names toggle
streetNamesCheckbox.addEventListener("change", () => {
  if (streetNamesCheckbox.checked) {
    labelOverlay.addTo(map);
  } else {
    map.removeLayer(labelOverlay);
  }
});

// Station areas toggle
zonesCheckbox.addEventListener("change", () => {
  stationZones.forEach((z) => {
    if (zonesCheckbox.checked) {
      z.layer.addTo(map);
    } else {
      map.removeLayer(z.layer);
    }
  });
});

// Initial status
setStatus('Pick a station, choose map view, then click “New Drill”.');
