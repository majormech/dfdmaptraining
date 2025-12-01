// main.js
// Decatur Address Drill

// ----- Map / bounds setup -----
const decaturBounds = L.latLngBounds(
  [39.80, -89.05], // SW
  [39.90, -88.85]  // NE
);

// Base map & layers
const map = L.map('map', {
  center: [39.8425, -88.9531],
  zoom: 12,
  maxBounds: decaturBounds,
  maxBoundsViscosity: 0.8,
});

// Road (no labels) and satellite base layers
const cartoBase = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> ' +
      'tiles &copy; <a href="https://carto.com/">CARTO</a>',
    minZoom: 11,
    maxZoom: 19,
  }
);

const esriSatellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, Earthstar Geographics, ' +
      'CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
    minZoom: 11,
    maxZoom: 19,
  }
);

// Label overlay (only labels, no fill)
const cartoLabels = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
  {
    attribution: '',
    pane: 'overlayPane',
  }
);

// Start with road + labels
let currentBaseLayer = cartoBase;
currentBaseLayer.addTo(map);
cartoLabels.addTo(map);

// Slight grayscale filter so streets pop
const mapContainer = document.getElementById('map');
if (mapContainer) {
  mapContainer.style.filter = 'grayscale(0.8) contrast(1.1)';
}

// ----- DOM elements -----
const newDrillBtn = document.getElementById('new-drill');
const addressSpan = document.getElementById('address');
const statusSpan = document.getElementById('status');
const stationSelect = document.getElementById('station-select');
const streetNamesCheckbox = document.getElementById('toggle-street-names');
const basemapSelect = document.getElementById('basemap-select');
const zonesCheckbox = document.getElementById('toggle-zones');

// ----- Nominatim config -----
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Helper: fetch wrapper for Nominatim
async function nominatimFetch(url) {
  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
    },
  });
  if (!res.ok) throw new Error('Nominatim error ' + res.status);
  return res.json();
}

// ----- Fire stations -----
// NOTE: coords below are FALLBACK approx values inside Decatur.
// The app will try to geocode the addresses and overwrite these.
const fireStations = [
  {
    id: '1',
    name: 'Station 1 – Headquarters',
    address: '1415 North Water Street, Decatur, IL 62526',
    // approx north-central
    coords: [39.8635, -88.9510],
  },
  {
    id: '2',
    name: 'Station 2',
    address: '2707 East William Street, Decatur, IL 62526',
    // approx east side
    coords: [39.8355, -88.9185],
  },
  {
    id: '3',
    name: 'Station 3',
    address: '855 North Fairview Avenue, Decatur, IL 62522',
    // approx west-central
    coords: [39.8480, -88.9900],
  },
  {
    id: '4',
    name: 'Station 4',
    address: '2760 North 22nd Street, Decatur, IL 62526',
    // approx NE
    coords: [39.8770, -88.9300],
  },
  {
    id: '5',
    name: 'Station 5',
    address: '3808 Greenridge Drive, Decatur, IL 62526',
    // approx NW
    coords: [39.8850, -88.9990],
  },
  {
    id: '6',
    name: 'Station 6',
    // tweak address wording for better geocode
    address: '1880 S State Route 51, Decatur, IL 62521',
    // approx south-central on 51
    coords: [39.8040, -88.9560],
  },
  {
    id: '7',
    name: 'Station 7',
    address: '3540 E Chestnut Ave, Decatur, IL 62521',
    // approx far east / SE
    coords: [39.8110, -88.8760],
  },
];

let stationMarkers = [];
let stationZoneLayers = {}; // id -> L.Circle

let stationsReady = false;

// ----- Geocoding helpers -----
async function geocodeAddress(address) {
  const url =
    `${NOMINATIM_BASE}/search?` +
    new URLSearchParams({
      q: address,
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
      countrycodes: 'us',
    }).toString();

  const data = await nominatimFetch(url);
  if (!data || !data.length) return null;
  const p = data[0];
  return [parseFloat(p.lat), parseFloat(p.lon)];
}

async function reverseGeocode(lat, lon) {
  const url =
    `${NOMINATIM_BASE}/reverse?` +
    new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      format: 'jsonv2',
      addressdetails: '1',
    }).toString();

  const data = await nominatimFetch(url);
  return data;
}

// ----- Station markers / areas -----
async function initStations() {
  statusSpan.textContent = 'Loading stations...';

  // Clear old markers/zones if re-running
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];
  Object.values(stationZoneLayers).forEach(z => map.removeLayer(z));
  stationZoneLayers = {};

  for (const station of fireStations) {
    const fallback = station.coords.slice();

    try {
      const geocoded = await geocodeAddress(station.address);
      if (geocoded) {
        station.coords = geocoded;
      } else {
        station.coords = fallback;
        console.warn('Using fallback coords for', station.name);
      }
    } catch (err) {
      station.coords = fallback;
      console.warn('Error geocoding', station.name, err);
    }

    const marker = L.marker(station.coords, {
      title: station.name,
    }).addTo(map);

    marker.bindPopup(
      `<strong>${station.name}</strong><br>${station.address}`
    );

    stationMarkers.push(marker);

    // Simple shaded "boundary" – circle around the station (will refine later)
    const zone = L.circle(station.coords, {
      radius: 2500, // meters – tweak later
      color: '#666',
      weight: 1,
      fillColor: '#ffaa00',
      fillOpacity: 0.08,
    });

    stationZoneLayers[station.id] = zone;
    if (zonesCheckbox && zonesCheckbox.checked) {
      zone.addTo(map);
    }
  }

  stationsReady = true;
  statusSpan.textContent =
    'Pick a station, choose map labels/view, then click “New Drill”.';
}

// ----- Random point helpers -----
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// A loose “box” around a station for random address selection
function getStationBbox(station) {
  const [lat, lon] = station.coords;
  const dLat = 0.03; // ~3 km north/south
  const dLon = 0.04; // ~3–4 km east/west (adjusted for longitude)
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lon - dLon,
    maxLon: lon + dLon,
  };
}

function pickStationForDrill() {
  const choice = stationSelect.value;
  if (choice === 'any') {
    const idx = Math.floor(Math.random() * fireStations.length);
    return fireStations[idx];
  }
  return fireStations.find(s => s.id === choice) || fireStations[0];
}

// ----- Drill state -----
let currentActualMarker = null;
let currentGuessMarker = null;
let currentClickHandler = null;

// Clean up old markers / handler
function resetDrillState() {
  if (currentActualMarker) {
    map.removeLayer(currentActualMarker);
    currentActualMarker = null;
  }
  if (currentGuessMarker) {
    map.removeLayer(currentGuessMarker);
    currentGuessMarker = null;
  }
  if (currentClickHandler) {
    map.off('click', currentClickHandler);
    currentClickHandler = null;
  }
}

// Turn Nominatim address into “123 Main St, Decatur, Illinois”
function formatNiceAddress(addr) {
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
  return parts.join(', ');
}

// Generate a random valid address within a station area
async function getRandomAddressNearStation(station) {
  const bbox = getStationBbox(station);

  const maxTries = 20;
  for (let i = 0; i < maxTries; i++) {
    const lat = randomBetween(bbox.minLat, bbox.maxLat);
    const lon = randomBetween(bbox.minLon, bbox.maxLon);

    if (!decaturBounds.contains([lat, lon])) continue;

    try {
      const data = await reverseGeocode(lat, lon);
      const addr = data.address || {};

      // Require: house number, road, and Decatur
      const cityName = addr.city || addr.town || addr.village || '';
      if (!addr.house_number || !addr.road) continue;
      if (cityName.toLowerCase() !== 'decatur') continue;

      const niceAddress = formatNiceAddress(addr);

      return {
        lat,
        lon,
        niceAddress,
        raw: addr,
      };
    } catch (err) {
      console.warn('Reverse geocode failed, retrying...', err);
    }
  }

  throw new Error('Could not find a valid address after several tries.');
}

// Start a new drill
async function startNewDrill() {
  if (!stationsReady) {
    statusSpan.textContent = 'Still loading stations – try again in a moment.';
    return;
  }

  resetDrillState();

  const station = pickStationForDrill();
  statusSpan.textContent = `Getting a random address near ${station.name}...`;

  try {
    const info = await getRandomAddressNearStation(station);

    addressSpan.textContent = info.niceAddress || 'Unknown address';
    statusSpan.textContent =
      'Drill started. Click on the map where you think this address is.';

    currentActualMarker = L.marker([info.lat, info.lon], {
      opacity: 0, // hidden until after guess
    }).addTo(map);

    // Zoom to that general area
    map.setView([info.lat, info.lon], 15);

    // One-time click handler for the guess
    currentClickHandler = function (e) {
      if (currentGuessMarker) {
        map.removeLayer(currentGuessMarker);
      }

      currentGuessMarker = L.marker(e.latlng, {
        icon: L.icon({
          iconUrl:
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl:
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      }).addTo(map);

      // Reveal actual marker
      currentActualMarker.setOpacity(1);

      // Distance in meters
      const from = turf.point([e.latlng.lng, e.latlng.lat]);
      const to = turf.point([info.lon, info.lat]);
      const distKm = turf.distance(from, to, { units: 'kilometers' });
      const distFeet = distKm * 3280.84;

      let resultText;
      if (distFeet < 300) {
        resultText = `🔥 Nice! You were only about ${distFeet.toFixed(
          0
        )} feet from the address.`;
      } else if (distFeet < 1000) {
        resultText = `👍 Pretty good. You were about ${distFeet.toFixed(
          0
        )} feet away.`;
      } else {
        resultText = `😬 Needs work. You were about ${distFeet.toFixed(
          0
        )} feet from the actual address.`;
      }

      const popupHtml = `
        <div>
          <div><strong>Actual:</strong> ${info.niceAddress}</div>
          <div style="margin-top:4px;">${resultText}</div>
        </div>
      `;

      currentActualMarker.bindPopup(popupHtml).openPopup();

      statusSpan.textContent =
        'Drill complete. Click “New Drill” to try another address.';

      // Only allow one guess
      map.off('click', currentClickHandler);
      currentClickHandler = null;
    };

    map.on('click', currentClickHandler);
  } catch (err) {
    console.error(err);
    statusSpan.textContent =
      'Could not find a valid address this time. Click “New Drill” to try again.';
    addressSpan.textContent = 'None yet – click “New Drill”';
  }
}

// ----- UI wiring -----

// New Drill button
if (newDrillBtn) {
  newDrillBtn.addEventListener('click', () => {
    startNewDrill();
  });
}

// Street names toggle = labels overlay on/off
if (streetNamesCheckbox) {
  streetNamesCheckbox.addEventListener('change', () => {
    if (streetNamesCheckbox.checked) {
      cartoLabels.addTo(map);
    } else {
      map.removeLayer(cartoLabels);
    }
  });
}

// Basemap style select: road vs satellite
if (basemapSelect) {
  basemapSelect.addEventListener('change', () => {
    const style = basemapSelect.value;
    map.removeLayer(currentBaseLayer);
    if (style === 'satellite') {
      currentBaseLayer = esriSatellite;
    } else {
      currentBaseLayer = cartoBase;
    }
    currentBaseLayer.addTo(map);
  });
}

// Station area shading toggle
if (zonesCheckbox) {
  zonesCheckbox.addEventListener('change', () => {
    const show = zonesCheckbox.checked;
    Object.values(stationZoneLayers).forEach(zone => {
      if (show) {
        zone.addTo(map);
      } else {
        map.removeLayer(zone);
      }
    });
  });
}

// Populate station dropdown
if (stationSelect) {
  // Keep existing "Any Station" option
  fireStations.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.textContent = st.name;
    stationSelect.appendChild(opt);
  });
}

// Init
initStations().catch(err => {
  console.error('Error initializing stations', err);
  statusSpan.textContent =
    'Error loading stations (check console). You can still try drills, but markers may be off.';
});
