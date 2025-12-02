// -------------------------------------------
// Decatur Address Drill – Google Maps + Snazzy v1
// -------------------------------------------

const newDrillBtn = document.getElementById("new-drill");
const streetNamesCheckbox = document.getElementById("toggle-street-names");
const addressSpan = document.getElementById("address");
const statusSpan = document.getElementById("status");

// Map + services
let map;
let geocoder;

// Rough bounding box for Decatur, IL (for random point generation)
const decaturBounds = {
  minLat: 39.80,
  maxLat: 39.90,
  minLng: -89.05,
  maxLng: -88.85,
};

// Snazzy Maps style: "Map without labels"
// https://snazzymaps.com/style/24088/map-without-labels
const NO_LABELS_STYLE = [
  {
    featureType: "all",
    elementType: "labels.text",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "all",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }]
  }
];

let actualMarker = null;
let guessMarker = null;
let clickListener = null;

function setStatus(msg) {
  statusSpan.textContent = msg;
}

function metersToFeet(m) {
  return m * 3.28084;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Toggle Snazzy no-labels vs standard labels-on style
function applyMapStyle() {
  if (!map) return;
  const showStreetNames = streetNamesCheckbox.checked;
  if (showStreetNames) {
    map.setOptions({ styles: [] }); // default Google style
  } else {
    map.setOptions({ styles: NO_LABELS_STYLE });
  }
}

// Geocode a lat/lng using Google Geocoder
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
  const state =
    getComponent(comps, "administrative_area_level_1") || "IL";

  if (!house || !road || !city) return null;

  return `${house} ${road}, ${city}, ${state}`;
}

// Get a random address inside Decatur city box using Google Geocoder
async function getRandomDecaturAddress() {
  for (let i = 0; i < 40; i++) {
    const lat = rand(decaturBounds.minLat, decaturBounds.maxLat);
    const lng = rand(decaturBounds.minLng, decaturBounds.maxLng);

    const result = await geocodeLatLng(lat, lng);
    if (!result) continue;

    const label = formatAddressFromResult(result);
    if (!label) continue;

    const comps = result.address_components || [];
    const city =
      getComponent(comps, "locality") ||
      getComponent(comps, "postal_town") ||
      "";

    if (city.toLowerCase() !== "decatur") continue;

    return { lat, lng, label };
  }

  throw new Error("Could not find a random Decatur address. Try again.");
}

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

// Main drill: pick random address, let user guess, then show distance
async function startNewDrill() {
  resetDrill();
  setStatus("Looking for a random address in Decatur…");
  addressSpan.textContent = "Searching…";

  try {
    const addrInfo = await getRandomDecaturAddress();
    addressSpan.textContent = addrInfo.label;
    setStatus("Click on the map where you think this address is.");

    // Hidden marker for the correct location
    actualMarker = new google.maps.Marker({
      position: { lat: addrInfo.lat, lng: addrInfo.lng },
      map,
      opacity: 0
    });

    // Do NOT recenter/zoom; user can move the map as they like

    clickListener = map.addListener("click", (e) => {
      if (guessMarker) guessMarker.setMap(null);
      guessMarker = new google.maps.Marker({
        position: e.latLng,
        map
      });

      // Reveal the correct location
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
        position: { lat: addrInfo.lat, lng: addrInfo.lng }
      });
      info.open(map, actualMarker);

      // Fit both markers into view so they can see their error
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(actualMarker.getPosition());
      bounds.extend(guessMarker.getPosition());
      map.fitBounds(bounds);

      setStatus('Drill complete. Click "New Drill" for another address.');

      google.maps.event.removeListener(clickListener);
      clickListener = null;
    });
  } catch (err) {
    console.error(err);
    addressSpan.textContent = "None – try again";
    setStatus("Couldn't find a valid address this time. Click New Drill again.");
  }
}

// -------------------------------------------
// initMap – called by Google Maps callback
// -------------------------------------------
function initMap() {
  // Approx center of Decatur (Main & Main-ish)
  const center = { lat: 39.8425, lng: -88.9531 };

  map = new google.maps.Map(document.getElementById("map"), {
    center,
    zoom: 13,
    mapTypeId: "roadmap",
    styles: [] // start with labels on
  });

  geocoder = new google.maps.Geocoder();

  // Wire up UI
  newDrillBtn.addEventListener("click", startNewDrill);
  streetNamesCheckbox.addEventListener("change", applyMapStyle);

  applyMapStyle();
  setStatus('Click "New Drill" to start.');
}

// Expose initMap globally for the Google Maps callback
window.initMap = initMap;
