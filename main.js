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
const decaturBounds = L.latLngBounds(
  [39.80, -89.05], // SW-ish
  [39.90, -88.85]  // NE-ish
);

const map = L.map("map", {
  center: [39.8425, -88.9531],
  zoom: 12,
  maxBounds: decaturBounds,
  maxBoundsViscosity: 0.8,
});

// Esri World Street Map – solid streets like Google
const esriStreets = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    minZoom: 11,
    attribution: "Tiles © Esri"
  }
);

// Esri World Imagery – satellite
const esriImagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    minZoom: 11,
    attribution:
      "Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  }
);

// Label overlay (for SATELLITE only – streets layer already has labels)
const labelOverlay = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
  {
    attribution: ""
  }
);

// Start with streets
let currentBase = esriStreets;
currentBase.addTo(map);

// -------------------------------------------
// STATION DEFINITIONS (hard-coded coords)
// -------------------------------------------
// Colors for polygons/areas
const stationColors = {
  "1": "#ff5555",
  "2": "#ff9955",
  "3": "#ffee55",
  "4": "#55ff55",
  "5": "#55ddff",
  "6": "#9977ff",
  "7": "#ff77dd",
};

// Lat, lon (corrected for 2, 6, 7)
const stations = [
  {
    id: "1",
    name: "Station 1 – Headquarters",
    address: "1415 N Water Street, Decatur, IL 62526",
    coords: [39.8654, -88.9519]
  },
  {
    id: "2",
    name: "Station 2",
    address: "2707 E William Street, Decatur, IL 62521",
    coords: [39.84479, -88.91433] // corrected
  },
  {
    id: "3",
    name: "Station 3",
    address: "855 N Fairview Avenue, Decatur, IL 62526",
    coords: [39.8526, -88.9804]
  },
  {
    id: "4",
    name: "Station 4",
    address: "2760 N 22nd Street, Decatur, IL 62526",
    coords: [39.8868, -88.9296]
  },
  {
    id: "5",
    name: "Station 5",
    address: "3808 Greenridge Drive, Decatur, IL 62526",
    coords: [39.8953, -88.9458]
  },
  {
    id: "6",
    name: "Station 6",
    address: "1880 S US Route BUS 51, Decatur, IL 62521",
    coords: [39.82031, -88.95992] // corrected
  },
  {
    id: "7",
    name: "Station 7",
    address: "3540 E Chestnut Avenue / 1250 S Airport Road area, Decatur, IL 62521",
    coords: [39.82831, -88.87796] // corrected
  }
];

let stationAreasById = {};   // id -> GeoJSON polygon
let stationMarkers = [];

// Add station markers
stations.forEach((s) => {
  const marker = L.marker(s.coords).addTo(map);
  marker.bindPopup(`<strong>${s.name}</strong><br>${s.address}`);
  stationMarkers.push(marker);
});

// -------------------------------------------
// BUILD VORONOI POLYGONS FOR STATION AREAS
// -------------------------------------------
function buildStationVoronoi() {
  const ptFeatures = stations.map((s) =>
    turf.point([s.coords[1], s.coords[0]], { id: s.id, name: s.name })
  );

  const fc = turf.featureCollection(ptFeatures);

  const bbox = [
    decaturBounds.getWest(),
    decaturBounds.getSouth(),
    decaturBounds.getEast(),
    decaturBounds.getNorth()
  ];

  const voronoi = turf.voronoi(fc, { bbox });

  if (!voronoi || !voronoi.features) {
    console.warn("Voronoi generation failed – no polygons created");
    return;
  }

  stationAreasById = {};

  const cityPoly = turf.bboxPolygon(bbox);

  voronoi.features.forEach((poly) => {
    if (!poly || !poly.properties || !poly.properties.id) return;
    const id = poly.properties.id;
    const color = stationColors[id] || "#999";

    let clipped;
    try {
      clipped = turf.intersect(poly, cityPoly) || poly;
    } catch {
      clipped = poly;
    }

    stationAreasById[id] = clipped;

    L.geoJSON(clipped, {
      style: {
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.12
      }
    }).addTo(map);
  });
}

buildStationVoronoi();

// -------------------------------------------
// RANDOM ADDRESS HELPERS
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
  return stations.find((s) => s.id === id);
}

// Reverse geocode via Nominatim
async function reverseGeocode(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DecaturAddressDrill/1.0",
      "Accept-Language": "en"
    }
  });

  if (!res.ok) return null;
  return res.json();
}

function formatAddress(addr) {
  return `${addr.house_number || ""} ${addr.road || ""}, ${
    addr.city || addr.town || addr.village || "Decatur"
  }, ${addr.state || "IL"}`.replace(/\s+/g, " ");
}

// Get random address for a station (inside its polygon if available)
async function getRandomDecaturAddressForStation(station) {
  const cityBbox = [
    decaturBounds.getWest(),
    decaturBounds.getSouth(),
    decaturBounds.getEast(),
    decaturBounds.getNorth()
  ];

  const areaPoly = station ? stationAreasById[station.id] : null;
  const bbox = areaPoly ? turf.bbox(areaPoly) : cityBbox;

  for (let i = 0; i < 30; i++) {
    const lat = rand(bbox[1], bbox[3]);
    const lon = rand(bbox[0], bbox[2]);

    const point = turf.point([lon, lat]);

    // If we have a polygon for this station, require the point to be inside it
    if (areaPoly && !turf.booleanPointInPolygon(point, areaPoly)) continue;

    const data = await reverseGeocode(lat, lon);
    if (!data || !data.address) continue;

    const addr = data.address;
    const cityName = (addr.city || addr.town || addr.village || "").toLowerCase();

    if (cityName !== "decatur") continue;
    if (!addr.house_number || !addr.road) continue;

    return {
      lat,
      lon,
      label: formatAddress(addr)
    };
  }

  throw new Error("Could not find a random Decatur address for this station.");
}

// -------------------------------------------
// DRILL STATE & LOGIC
// -------------------------------------------
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
    const addrInfo = await getRandomDecaturAddressForStation(station);
    addressSpan.textContent = addrInfo.label;
    setStatus("Tap the map where you think this address is.");

    actualMarker = L.marker([addrInfo.lat, addrInfo.lon], {
      opacity: 0
    }).addTo(map);

    map.setView([addrInfo.lat, addrInfo.lon], 15);

    clickHandler = (e) => {
      if (guessMarker) map.removeLayer(guessMarker);
      guessMarker = L.marker(e.latlng).addTo(map);

      actualMarker.setOpacity(1);

      const distMeters = turf.distance(
        turf.point([e.latlng.lng, e.latlng.lat]),
        turf.point([addrInfo.lon, addrInfo.lat]),
        { units: "meters" }
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

      actualMarker
        .bindPopup(`<b>${addrInfo.label}</b><br>${msg}`)
        .openPopup();

      const group = L.featureGroup([guessMarker, actualMarker]);
      map.fitBounds(group.getBounds().pad(0.5));

      setStatus('Drill complete. Tap "New Drill" to try another address.');

      map.off("click", clickHandler);
      clickHandler = null;
    };

    map.on("click", clickHandler);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't find a valid address this time. Try again.");
  }
}

// -------------------------------------------
// UI EVENTS
// -------------------------------------------
newDrillBtn.addEventListener("click", startNewDrill);

// Basemap toggle – road vs satellite
basemapSelect.addEventListener("change", () => {
  map.removeLayer(currentBase);

  if (basemapSelect.value === "satellite") {
    currentBase = esriImagery;
    currentBase.addTo(map);

    // Apply label overlay only if checkbox is on
    if (streetNamesCheckbox.checked) {
      labelOverlay.addTo(map);
    } else {
      map.removeLayer(labelOverlay);
    }
  } else {
    // Road view: Esri streets already has labels – no extra label overlay
    currentBase = esriStreets;
    currentBase.addTo(map);
    map.removeLayer(labelOverlay);
  }
});

// Street names toggle – affects satellite only
streetNamesCheckbox.addEventListener("change", () => {
  if (basemapSelect.value === "satellite") {
    if (streetNamesCheckbox.checked) {
      labelOverlay.addTo(map);
    } else {
      map.removeLayer(labelOverlay);
    }
  } else {
    // On streets layer, labels are built-in – ensure overlay is off
    map.removeLayer(labelOverlay);
  }
});

// Initial status
setStatus("Pick a station, choose map view, then click “New Drill”.");

