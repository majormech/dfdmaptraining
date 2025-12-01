// Decatur Address Drill – main.js
// - Carto basemap (reliable) with a labels / no-labels toggle
// - All 7 fire stations are geocoded from their real addresses
// - Station selector biases random address near chosen station (fallback = whole city)
// - On "New Drill", gets a random real address in Decatur with a house number
// - User clicks where they think it is; app scores their guess

// ------------ DOM ELEMENTS ------------
const newDrillBtn = document.getElementById("new-drill-btn");
const currentAddressSpan = document.getElementById("current-address");
const messageDiv = document.getElementById("message");
const stationSelect = document.getElementById("station-select");
const labelsCheckbox = document.getElementById("toggle-labels");

// Rough center of Decatur, IL
const map = L.map("map").setView([39.842468, -88.953148], 13);

// ------------ BASE MAP LAYERS (Carto) ------------
// Light map with labels (street names ON)
const cartoWithLabels = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }
);

// Same style but NO labels (street names OFF)
const cartoNoLabels = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  }
);

// Start with labels visible
let currentBaseLayer = cartoWithLabels;
currentBaseLayer.addTo(map);

// Checkbox to toggle labels on/off
labelsCheckbox.addEventListener("change", () => {
  const wantLabels = labelsCheckbox.checked;

  if (wantLabels) {
    if (map.hasLayer(cartoNoLabels)) map.removeLayer(cartoNoLabels);
    if (!map.hasLayer(cartoWithLabels)) cartoWithLabels.addTo(map);
    currentBaseLayer = cartoWithLabels;
  } else {
    if (map.hasLayer(cartoWithLabels)) map.removeLayer(cartoWithLabels);
    if (!map.hasLayer(cartoNoLabels)) cartoNoLabels.addTo(map);
    currentBaseLayer = cartoNoLabels;
  }
});

// ------------ FIRE STATIONS (GEOCODED BY ADDRESS) ------------
const fireStations = [
  {
    id: "1",
    name: "Station 1 – Headquarters",
    address: "1415 North Water Street, Decatur IL 62526",
    coords: null,
  },
  {
    id: "2",
    name: "Station 2",
    address: "2707 East William Street, Decatur IL 62526",
    coords: null,
  },
  {
    id: "3",
    name: "Station 3",
    address: "855 North Fairview Avenue, Decatur IL 62522",
    coords: null,
  },
  {
    id: "4",
    name: "Station 4",
    address: "2760 North 22nd Street, Decatur IL 62526",
    coords: null,
  },
  {
    id: "5",
    name: "Station 5",
    address: "3808 Greenridge Drive, Decatur IL 62526",
    coords: null,
  },
  {
    id: "6",
    name: "Station 6",
    address: "1880 South US Route BUS 51, Decatur IL",
    coords: null,
  },
  {
    id: "7",
    name: "Station 7",
    address: "3540 East Chestnut Avenue, Decatur IL",
    coords: null,
  },
];

let stationsReady = false;

function setMessage(text, isError = false) {
  messageDiv.textContent = text;
  messageDiv.style.color = isError ? "darkred" : "#333";
}

function metersToFeet(m) {
  return m * 3.28084;
}

// Forward geocode with Nominatim
async function geocodeAddress(address) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", address);
  url.searchParams.set("accept-language", "en");

  const resp = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DecaturFireDrillApp/1.0 (youremail@example.com)",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || !data[0]) return null;

  const item = data[0];
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return [lat, lon];
}

// Geocode stations and add markers
async function initStations() {
  setMessage("Loading station locations...");
  for (const station of fireStations) {
    try {
      const coords = await geocodeAddress(station.address);
      if (coords) {
        station.coords = coords;

        L.marker(coords, {
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
          .bindPopup(`${station.name}<br>${station.address}`);
      } else {
        console.warn("Could not geocode station:", station);
      }
    } catch (e) {
      console.error("Error geocoding station:", station, e);
    }
  }
  stationsReady = true;
  setMessage(
    'Stations loaded. Choose a station (or "Any"), decide if you want labels, then click "New Drill".'
  );
}

initStations();

// ------------ RANDOM ADDRESS / DRILL LOGIC ------------

let currentTarget = null; // { label, coords: [lat, lon] }
let targetMarker = null;
let guessMarker = null;
let drillActive = false;

function randomPointInBbox(bbox) {
  const lat = bbox.south + Math.random() * (bbox.north - bbox.south);
  const lon = bbox.west + Math.random() * (bbox.east - bbox.west);
  return { lat, lon };
}

function getStationBbox(stationId) {
  const cityBbox = {
    south: 39.80,
    west: -88.99,
    north: 39.89,
    east: -88.88,
  };

  if (stationId === "any") return cityBbox;

  const station = fireStations.find((s) => s.id === stationId);
  if (!station || !station.coords) return cityBbox;

  const [lat, lon] = station.coords;
  const latDelta = 0.02;
  const lonDelta = 0.02;

  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lon - lonDelta,
    east: lon + lonDelta,
  };
}

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

  if (!resp.ok) return null;
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

  if (cityName.toLowerCase() !== "decatur") return null;

  const house = addr.house_number || "";
  const road =
    addr.road ||
    addr.residential ||
    addr.street ||
    addr.neighbourhood ||
    "";

  if (!house || !road) return null;

  const state = addr.state || "IL";
  const label = `${house} ${road}, Decatur, ${state}`
    .replace(/\s+/g, " ")
    .trim();

  if (!/\d/.test(label)) return null;

  const latNum = Number(data.lat);
  const lonNum = Number(data.lon);
  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return null;

  return {
    label,
    coords: [latNum, lonNum],
  };
}

async function getRandomAddressInDecatur(maxTries = 40, stationId = "any") {
  const cityBbox = {
    south: 39.80,
    west: -88.99,
    north: 39.89,
    east: -88.88,
  };

  const stationBbox = getStationBbox(stationId);
  const halfTries = Math.floor(maxTries / 2);

  for (let i = 0; i < halfTries; i++) {
    const { lat, lon } = randomPointInBbox(stationBbox);
    const result = await reverseGeocodeDecatur(lat, lon);
    if (result) return result;
  }

  for (let i = halfTries; i < maxTries; i++) {
    const { lat, lon } = randomPointInBbox(cityBbox);
    const result = await reverseGeocodeDecatur(lat, lon);
    if (result) return result;
  }

  throw new Error(
    "Could not find a random Decatur address with a house number after several tries."
  );
}

async function startNewDrill() {
  if (targetMarker) {
    map.removeLayer(targetMarker);
    targetMarker = null;
  }
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }

  const selectedStationId = stationSelect?.value || "any";

  if (!stationsReady && selectedStationId !== "any") {
    setMessage(
      "Station locations are still loading; using whole-city area for now."
    );
  }

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

    map.setView([39.842468, -88.953148], 13);
  } catch (err) {
    currentTarget = null;
    drillActive = false;
    setMessage("Error getting address: " + err.message, true);
  }
}

map.on("click", (e) => {
  if (!drillActive || !currentTarget) {
    setMessage('Click "New Drill" to start.', true);
    return;
  }

  const guessLatLng = e.latlng;

  if (guessMarker) {
    guessMarker.setLatLng(guessLatLng);
  } else {
    guessMarker = L.marker(guessLatLng, { title: "Your guess" }).addTo(map);
  }

  const guessPoint = turf.point([guessLatLng.lng, guessLatLng.lat]);
  const targetPoint = turf.point([
    currentTarget.coords[1],
    currentTarget.coords[0],
  ]);

  const distanceMeters = turf.distance(guessPoint, targetPoint, {
    units: "meters",
  });
  const distanceFeet = metersToFeet(distanceMeters);

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

  const group = L.featureGroup([guessMarker, targetMarker]);
  map.fitBounds(group.getBounds().pad(0.5));

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

  drillActive = false;
});

newDrillBtn.addEventListener("click", () => {
  startNewDrill();
});

setMessage(
  'Loading stations… then choose a station (or "Any"), decide if you want labels, and click "New Drill".'
);
