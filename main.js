// -------------------------------------------
// Decatur Address Drill – main.js
// -------------------------------------------

// DOM references
const newDrillBtn = document.getElementById("new-drill");
const stationSelect = document.getElementById("station-select");
const basemapSelect = documentElementById
  ? document.getElementById("basemap-select")
  : document.getElementById("basemap-select");
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

// Esri World Street Map – solid, Google-like streets
const roadBase = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    minZoom: 11,
    attribution: "Tiles © Esri"
  }
);

// Esri World Imagery – satellite
const satelliteBase = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    minZoom: 11,
    attribution:
      "Tiles © Esri — Source: Esri, Earthstar Geographics, " +
      "CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community"
  }
);

// Label overlay for SATELLITE ONLY (Carto labels)
const labelOverlay = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
  {
    attribution: ""
  }
);

// Start with road view (Esri Streets). No extra label overlay.
let currentBase = roadBase;
currentBase.addTo(map);

// -------------------------------------------
// FIRE STATIONS – ADDRESSES & COLORS
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

// We geocode these so markers actually sit on the real buildings
const stations = [
  {
    id: "1",
    name: "Station 1 – Headquarters",
    address: "1415 N Water Street, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "2",
    name: "Station 2",
    address: "2707 E William Street, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "3",
    name: "Station 3",
    address: "855 N Fairview Avenue, Decatur, IL 62526",
    coords: null,
  },
  {
    id: "4",
    name: "Station 4",
    address: "2760 N 22nd Street, Decatur, IL 62526",
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
    address: "1880 S US Route BUS 51, Decatur, IL 62521",
    coords: null,
  },
  {
    id: "7",
    name: "Station 7",
    address: "3540 E Chestnut Avenue, Decatur, IL 62521",
    coords: null,
  },
];

let stationAreasById = {}; // id -> GeoJSON polygon
let stationMarkers = [];

// -------------------------------------------
// GEOCODING (Nominatim)
// -------------------------------------------

async function geocodeAddress(addr) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", addr);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DecaturAddressDrill/1.0",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data[0]) return null;

  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return [lat, lon];
}

// -------------------------------------------
// INITIALIZE STATIONS: GEOCODE, MARKERS, POLYGONS
// -------------------------------------------

async function initStations() {
  setStatus("Geocoding fire station addresses…");

  // 1) Geocode each station
  for (const s of stations) {
    try {
      const coords = await geocodeAddress(s.address);
      if (coords) {
        s.coords = coords;
      } else {
        console.warn("Could not geocode", s.name, "– using fallback near center");
      }
    } catch (err) {
      console.error("Geocode failed for", s.name, err);
    }
  }

  // Fallback for any station with no coords
  stations.forEach((s, idx) => {
    if (!s.coords) {
      const baseLat = 39.8425;
      const baseLon = -88.9531;
      s.coords = [
        baseLat + 0.01 * Math.sin(idx),
        baseLon + 0.01 * Math.cos(idx),
      ];
    }
  });

  // 2) Add markers
  stations.forEach((s) => {
    const marker = L.marker(s.coords).addTo(map);
    marker.bindPopup(`<strong>${s.name}</strong><br>${s.address}`);
    stationMarkers.push(marker);
  });

  // 3) Build Voronoi polygons = rough “first-due” areas
  buildStationVoronoi();

  setStatus(
    "Stations loaded. Pick a station, choose map view, then click “New Drill”."
  );
}

function buildStationVoronoi() {
  const ptFeatures = stations.map((s) =>
    turf.point([s.coords[1], s.coords[0]], {
      id: s.id,
      name: s.name,
    })
  );
  const fc = turf.featureCollection(ptFeatures);

  const bbox = [
    decaturBounds.getWest(),
    decaturBounds.getSouth(),
    decaturBounds.getEast(),
    decaturBounds.getNorth(),
  ];

  const voronoi = turf.voronoi(fc, { bbox });

  if (!voronoi || !voronoi.features) {
    console.warn("Voronoi generation failed – no polygons created");
    return;
  }

  stationAreasById = {};

  voronoi.features.forEach((poly) => {
    if (!poly || !poly.properties || !poly.properties.id) return;
    const id = poly.properties.id;
    const color = stationColors[id] || "#999";

    const cityPoly = turf.bboxPolygon(bbox);
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
        fillOpacity: 0.12,
      },
    }).addTo(map);
  });
}

// -------------------------------------------
// RANDOM ADDRESS HELPERS
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

function getStationById(id) {
  return stations.find((s) => s.id === id);
}

async function reverseGeocode(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DecaturAddressDrill/1.0",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) return null;
  return res.json();
}

function formatAddress(addr) {
  return `${addr.house_number || ""} ${addr.road || ""}, ${
    addr.city || addr.town || addr.village || "Decatur"
  }, ${addr.state || "IL"}`.replace(/\s+/g, " ");
}

async function getRandomDecaturAddressForStation(station) {
  const cityBbox = [
    decaturBounds.getWest(),
    decaturBounds.getSouth(),
    decaturBounds.getEast(),
    decaturBounds.getNorth(),
  ];

  const areaPoly = station ? stationAreasById[station.id] : null;
  const bbox = areaPoly ? turf.bbox(areaPoly) : cityBbox;

  for (let i = 0; i < 30; i++) {
    const lat = rand(bbox[1], bbox[3]);
    const lon = rand(bbox[0], bbox[2]);

    const point = turf.point([lon, lat]);

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
      label: formatAddress(addr),
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

  if (choice !== "any" && (!station || !station.coords)) {
    setStatus("Stations still loading – try again in a moment.");
    return;
  }

  setStatus(
    station
      ? `Looking for a random address in ${station.name}'s area…`
      : "Looking for a random address in Decatur…"
  );

  try {
    const addrInfo = await getRandomDecaturAddressForStation(station);
    addressSpan.textContent = addrInfo.label;
    setStatus("Tap the map where you think this address is.");

    actualMarker = L.marker([addrInfo.lat, addrInfo.lon], { opacity: 0 }).addTo(
      map
    );
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
      const distFeet = feet(distMeters);

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
// UI WIRES
// -------------------------------------------

newDrillBtn.addEventListener("click", startNewDrill);

// Basemap toggle: Road (Esri Streets) vs Satellite (Esri Imagery)
basemapSelect.addEventListener("change", () => {
  map.removeLayer(currentBase);

  if (basemapSelect.value === "satellite") {
    currentBase = satelliteBase;
    currentBase.addTo(map);

    // In satellite mode, streetNamesCheckbox controls label overlay
    if (streetNamesCheckbox.checked) {
      labelOverlay.addTo(map);
    } else {
      map.removeLayer(labelOverlay);
    }
  } else {
    // Road mode: Esri Streets already has labels baked in
    currentBase = roadBase;
    currentBase.addTo(map);
    // Remove label overlay if it was on
    map.removeLayer(labelOverlay);
  }
});

// Street names toggle – only meaningful in Satellite mode
streetNamesCheckbox.addEventListener("change", () => {
  if (basemapSelect.value === "satellite") {
    if (streetNamesCheckbox.checked) {
      labelOverlay.addTo(map);
    } else {
      map.removeLayer(labelOverlay);
    }
  }
});

// Initial status & station init
setStatus("Geocoding stations…");
initStations().catch((e) => {
  console.error("Error during station init", e);
  setStatus(
    "Error loading station locations. You can still try drills, but markers may be off."
  );
});
