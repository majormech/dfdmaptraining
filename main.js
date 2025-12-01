// Simple Decatur drill v1
// - Pick a random address from a hard-coded list
// - Show the text of the address
// - User clicks the map where they think it is
// - App shows error distance + actual location

// Rough center of Decatur, IL
const map = L.map("map").setView([39.8403, -88.9548], 13);

// Basemap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

// --- Fake address list (we’ll replace with real data later) ---
// NOTE: These are example coordinates around Decatur, not exact house locations.
const addresses = [
  {
    label: "1234 E Eldorado St",
    coords: [39.8424, -88.9333],
  },
  {
    label: "900 W Main St",
    coords: [39.8429, -88.9712],
  },
  {
    label: "2500 N Water St",
    coords: [39.8698, -88.9501],
  },
  {
    label: "600 S Franklin St",
    coords: [39.8341, -88.9574],
  },
  {
    label: "1500 E William St",
    coords: [39.8420, -88.9380],
  },
  {
    label: "300 W Eldorado St",
    coords: [39.8397, -88.9665],
  },
  {
    label: "1100 E Main St",
    coords: [39.8426, -88.9423],
  },
  {
    label: "400 S Main St",
    coords: [39.8350, -88.9538],
  },
];

// DOM elements
const newDrillBtn = document.getElementById("new-drill-btn");
const currentAddressSpan = document.getElementById("current-address");
const messageDiv = document.getElementById("message");

// State
let currentTarget = null;      // { label, coords }
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

// New drill: pick a random address
function startNewDrill() {
  // Clear old markers
  if (targetMarker) {
    map.removeLayer(targetMarker);
    targetMarker = null;
  }
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }

  // Random address
  const randomIndex = Math.floor(Math.random() * addresses.length);
  currentTarget = addresses[randomIndex];

  // Update UI
  currentAddressSpan.textContent = currentTarget.label;
  setMessage("Drill started. Click on the map where you think this address is.");

  drillActive = true;

  // Optional: recenter map around Decatur
  map.setView([39.8403, -88.9548], 13);
}

// Handle map clicks: user guess
map.on("click", (e) => {
  if (!drillActive || !currentTarget) {
    setMessage("Click “New Drill” to start.", true);
    return;
  }

  const guessLatLng = e.latlng;

  // Place / move guess marker
  if (guessMarker) {
    guessMarker.setLatLng(guessLatLng);
  } else {
    guessMarker = L.marker(guessLatLng, { title: "Your guess" }).addTo(map);
  }

  // Compute distance between guess and target
  const guessPoint = turf.point([guessLatLng.lng, guessLatLng.lat]);
  const targetPoint = turf.point([
    currentTarget.coords[1],
    currentTarget.coords[0],
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
newDrillBtn.addEventListener("click", startNewDrill);

// Initial message
setMessage("Click “New Drill” to generate an address and start the drill.");
