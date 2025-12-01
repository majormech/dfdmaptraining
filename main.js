// Decatur Address Drill – main.js
// - On "New Drill", pick a random coordinate around Decatur
// - Reverse-geocode it to a real address WITH a house number
// - Make sure it's actually in Decatur, IL
// - User clicks where they think it is; app scores their guess

// DOM elements
const newDrillBtn = document.getElementById("new-drill-btn");
const currentAddressSpan = document.getElementById("current-address");
const messageDiv = document.getElementById("message");

// Rough center of Decatur, IL
const map = L.map("map").setView([39.842468, -88.953148], 13);

// Basemap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

// State
let currentTarget = null;      // { label, coords: [lat, lon] }
let targetMarker = null;       // Leaflet marker for correct answer
let guessMarker = null;        // Leaflet marker for user guess
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
 * Get a random coordinate inside a bounding box that covers Decatur.
 * bbox = { south, west, north, east }
 */
function randomPointInBbox(bbox) {
  const lat = bbox.south + Math.random() * (bbox.north - bbox.south);
  const lon = bbox.west + Math.random() * (bbox.east - bbox.west);
  return { lat, lon };
}

/**
 * Ask Nominatim (OpenStreetMap geocoder) for the address at a lat/lon.
 * Returns null if no good address / not Decatur / no house number.
 *
 * NOTE: For real use, replace the email in User-Agent with YOUR email.
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

  // REQUIRE a proper house number + street
  const house = addr.house_number || "";
  const road =
    addr.road ||
    addr.residential ||
    addr.street ||
    addr.neighbourhood ||
    "";

  if (!house || !road) {
    // No specific address → skip this result
    return null;
  }

  const state = addr.state || "IL";
  const label = `${house} ${road}, Decatur, ${state}`
    .replace(/\s+/g, " ")
    .trim();

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
 * Get a random address INSIDE Decatur by:
 * - picking a random point in a bbox
 * - reverse geocoding it
 * - requiring house number + street
 */
async function getRandomAddressInDecatur(maxTries = 40) {
  // Bounding box that covers Decatur (rough but safe).
  const bbox = {
    south: 39.80,
    west: -88.99,
    north: 39.89,
    east: -88.88,
  };

  for (let i = 0; i < maxTries; i++) {
    const { lat, lon } = randomPointInBbox(bbox);
    const result = await reverseGeocodeDecatur(lat, lon);
    if (result) {
      return result;
    }
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

  setMessage("Getting a random address inside Decatur...");

  try {
    currentTarget = await getRandomAddressInDecatur();
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
  'Click "New Drill" to generate a random Decatur address with a house number and start the drill.'
);
