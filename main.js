// -------------------------------------------
// Decatur Address Drill – v1 (Leaflet + Nominatim)
// -------------------------------------------

const newDrillBtn = document.getElementById("new-drill");
const addressSpan = document.getElementById("address");
const statusSpan = document.getElementById("status");

// Rough bounding box for Decatur, IL
const decaturBounds = L.latLngBounds(
  [39.80, -89.05], // SW
  [39.90, -88.85]  // NE
);

// Set up map
const map = L.map("map", {
  center: [39.8425, -88.9531],
  zoom: 13,
  maxBounds: decaturBounds.pad(0.5),
  maxBoundsViscosity: 0.8,
});

// Base map (OpenStreetMap)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let actualMarker = null;
let guessMarker = null;
let clickHandler = null;

function setStatus(msg) {
  statusSpan.textContent = msg;
}

function metersToFeet(m) {
  return m * 3.28084;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Reverse geocode using Nominatim (OpenStreetMap)
async function reverseGeocode(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DecaturAddressDrill-v1/1.0",
      "Accept-Language": "en"
    }
  });

  if (!res.ok) return null;
  return res.json();
}

function formatAddress(addr) {
  const house = addr.house_number || "";
  const road = addr.road || addr.residential || addr.footway || "";
  const city = addr.city || addr.town || addr.village || "Decatur";
  const state = addr.state || "IL";

  const line1 = `${house} ${road}`.trim();
  return `${line1}, ${city}, ${state}`;
}

// Find a random point in the decatur bounding box with a proper address
async function getRandomDecaturAddress() {
  const bbox = [
    decaturBounds.getSouth(),
    decaturBounds.getWest(),
    decaturBounds.getNorth(),
    decaturBounds.getEast()
  ];

  for (let i = 0; i < 40; i++) {
    const lat = rand(bbox[0], bbox[2]);
    const lon = rand(bbox[1], bbox[3]);

    const data = await reverseGeocode(lat, lon);
    if (!data || !data.address) continue;

    const addr = data.address;
    const cityName = (addr.city || addr.town || addr.village || "").toLowerCase();

    // Require it to be Decatur and have a house number and a road
    if (cityName !== "decatur") continue;
    if (!addr.house_number || !addr.road) continue;

    return {
      lat,
      lon,
      label: formatAddress(addr)
    };
  }

  throw new Error("Could not find a random Decatur address. Try again.");
}

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
  setStatus("Looking for a random address in Decatur…");
  addressSpan.textContent = "Searching…";

  try {
    const addrInfo = await getRandomDecaturAddress();

    // Save address and set UI
    addressSpan.textContent = addrInfo.label;
    setStatus("Click on the map where you think this address is.");

    // Place hidden marker at the true location
    actualMarker = L.marker([addrInfo.lat, addrInfo.lon], {
      opacity: 0
    }).addTo(map);

    // DO NOT recenter/zoom; user can move map as they wish

    clickHandler = (e) => {
      // Remove old guess marker if any
      if (guessMarker) map.removeLayer(guessMarker);
      guessMarker = L.marker(e.latlng).addTo(map);

      // Reveal actual marker
      actualMarker.setOpacity(1);

      // Distance calculation
      const distMeters = map.distance(e.latlng, actualMarker.getLatLng());
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

      // Fit bounds of guess + answer so user can see both
      const group = L.featureGroup([actualMarker, guessMarker]);
      map.fitBounds(group.getBounds().pad(0.5));

      setStatus('Drill complete. Click "New Drill" for another address.');

      // Stop listening for more clicks until next drill
      map.off("click", clickHandler);
      clickHandler = null;
    };

    map.on("click", clickHandler);
  } catch (err) {
    console.error(err);
    addressSpan.textContent = "None – try again";
    setStatus("Couldn't find a valid address this time. Click New Drill again.");
  }
}

// Wire up button
newDrillBtn.addEventListener("click", startNewDrill);

// Initial status
setStatus("Click New Drill to start.");
