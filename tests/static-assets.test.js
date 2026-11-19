"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(
  path.join(projectRoot, "index.html"),
  "utf8"
);
const mainJs = fs.readFileSync(path.join(projectRoot, "main.js"), "utf8");
const zonesJs = fs.readFileSync(path.join(projectRoot, "zones.js"), "utf8");
const stylesCss = fs.readFileSync(
  path.join(projectRoot, "styles.css"),
  "utf8"
);

test("every local script, stylesheet, image, and icon reference exists", function () {
  const references = [];
  const pattern = /(?:src|href)="([^"]+)"/g;
  let match;

  while ((match = pattern.exec(indexHtml))) {
    const value = match[1];
    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("#") ||
      value.startsWith("data:")
    ) {
      continue;
    }
    references.push(value.split("?")[0]);
  }

  references.forEach(function (reference) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, reference)),
      true,
      "Missing local asset: " + reference
    );
  });
});

test("HTML ids are unique", function () {
  const ids = Array.from(indexHtml.matchAll(/\sid="([^"]+)"/g)).map(
    function (match) {
      return match[1];
    }
  );
  assert.equal(new Set(ids).size, ids.length);
});

test("every application DOM lookup has a matching element", function () {
  const htmlIds = new Set(
    Array.from(indexHtml.matchAll(/\sid="([^"]+)"/g)).map(function (match) {
      return match[1];
    })
  );
  const requestedIds = Array.from(
    mainJs.matchAll(/getElementById\("([^"]+)"\)/g)
  ).map(function (match) {
    return match[1];
  });

  requestedIds.forEach(function (id) {
    assert.equal(htmlIds.has(id), true, "Missing element id: " + id);
  });
});

test("response-zone data has one source of truth", function () {
  assert.equal(
    zonesJs.includes("const RESPONSE_ZONES_GEOJSON"),
    true
  );
  assert.equal(
    mainJs.includes("const RESPONSE_ZONES_GEOJSON"),
    false
  );
});

test("zone data includes seven station points and seven polygons", function () {
  const pointCount = (zonesJs.match(/"type": "Point"/g) || []).length;
  const polygonCount = (zonesJs.match(/"type": "Polygon"/g) || []).length;
  assert.equal(pointCount, 7);
  assert.equal(polygonCount, 7);
});

test("modern Maps libraries replace legacy marker and directions APIs", function () {
  assert.equal(mainJs.includes('importLibrary("marker")'), true);
  assert.equal(mainJs.includes('importLibrary("routes")'), true);
  assert.equal(mainJs.includes("AdvancedMarkerElementClass"), true);
  assert.equal(mainJs.includes("RouteClass.computeRoutes"), true);
  assert.equal(mainJs.includes("computeAlternativeRoutes: true"), true);
  assert.equal(mainJs.includes("new google.maps.Marker"), false);
  assert.equal(mainJs.includes("DirectionsService"), false);
  assert.match(indexHtml, /[?&]v=weekly(?:&|\")/);
});

test("route editing controls and responsive map aids are present", function () {
  [
    "move-route-guess",
    "undo-route",
    "clear-route",
    "submit-route",
    "map-crosshair",
    "route-legend",
  ].forEach(function (id) {
    assert.match(indexHtml, new RegExp('id="' + id + '"'));
  });
  assert.equal(stylesCss.includes("100dvh"), true);
  assert.equal(stylesCss.includes('[data-route-active="true"]'), true);
});

test("cross-street and hundred-block games are wired into the application shell", function () {
  [
    "start-cross-street-game",
    "start-hundred-block-game",
    "text-answer-form",
    "answer-one",
    "answer-two",
    "submit-text-answer",
    "answer-feedback",
  ].forEach(function (id) {
    assert.match(indexHtml, new RegExp('id="' + id + '"'));
  });

  assert.ok(
    indexHtml.indexOf('src="cross-street-data.js?v=0.6.0"') <
      indexHtml.indexOf('src="knowledge-data.js?v=0.6.0"')
  );
  assert.ok(
    indexHtml.indexOf('src="hundred-block-data.js?v=0.6.0"') <
      indexHtml.indexOf('src="knowledge-data.js?v=0.6.0"')
  );
  assert.ok(
    indexHtml.indexOf('src="active-address-data.js?v=0.6.0"') <
      indexHtml.indexOf('src="main.js?v=0.6.0"')
  );
  assert.ok(
    indexHtml.indexOf('src="knowledge-data.js?v=0.6.0"') <
      indexHtml.indexOf('src="main.js?v=0.6.0"')
  );
  assert.match(indexHtml, /<th scope="col">Prompt<\/th>/);
  assert.equal(mainJs.includes("function isKnowledgeMode"), true);
  assert.equal(mainJs.includes("function loadKnowledgeRound"), true);
  assert.equal(mainJs.includes("function settleKnowledgeRound"), true);
  assert.equal(mainJs.includes("Core.evaluateHundredBlockPair"), true);
  assert.equal(mainJs.includes("function advanceReviewedRound"), true);
  assert.match(indexHtml, /id="next-call"/);
  assert.match(indexHtml, /id="reveal-answer-map"/);
  assert.equal(mainJs.includes("function handleResponseAreaChange"), true);
  assert.match(
    mainJs,
    /stationSelect\.addEventListener\("change", handleResponseAreaChange\)/
  );
  assert.match(
    mainJs,
    /ui\.stationSelect\.disabled\s*=\s*!mapReady \|\| roundBusy/
  );
  assert.match(
    mainJs,
    /function handleResponseAreaChange\(\)[\s\S]*?mode !== "idle"[\s\S]*?startRun\(mode, state\.run\.totalRounds, ui\.stationSelect\)/
  );
  assert.match(
    mainJs,
    /function questionBankForMode\(mode, stationId\)[\s\S]*?question\.stationIds\.includes\(String\(stationId\)\)/
  );
  assert.equal(mainJs.includes("const stationId = selectedStationId"), true);
  assert.equal(mainJs.includes('"Station " + stationId + " response area"'), true);
  assert.match(indexHtml, /id="answer-feedback"[\s\S]*?aria-atomic="true"/);
  assert.match(
    mainJs,
    /function handleMapSelection[\s\S]*?!isMapSelectionMode\(currentMode\(\)\)/
  );
  assert.equal(stylesCss.includes('data-knowledge-active="true"'), true);
  assert.equal(stylesCss.includes('data-station-scoped-active="true"'), true);
  assert.match(
    stylesCss,
    /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/
  );
});

test("location and route modes use the official active-address bank", function () {
  assert.equal(mainJs.includes("const ActiveAddressData = window.DFDActiveAddressData"), true);
  assert.equal(mainJs.includes("function activeAddressBankForStation"), true);
  assert.equal(mainJs.includes("function officialAddressFromRecord"), true);
  assert.equal(mainJs.includes("shuffledCopy(addressBank).slice(0, totalRounds)"), true);
  assert.equal(mainJs.includes("address = await getRandomAddressForRound"), false);
  assert.match(
    mainJs,
    /run\.addresses\[round\.index - 1\][\s\S]*?run\.stationId/
  );
});

test("map-label visibility can switch without legacy markers", function () {
  assert.match(indexHtml, /id="toggle-map-labels"/);
  assert.match(indexHtml, />Hide map labels</);
  assert.match(
    indexHtml,
    /name="google-maps-hidden-labels-map-id"/
  );
  assert.equal(
    mainJs.includes("function recreateMapForLabels"),
    true
  );
  assert.equal(mainJs.includes("HIDDEN_MAP_LABEL_STYLES"), true);
  assert.equal(mainJs.includes("HIDDEN_LABEL_MAP_ID"), true);
  assert.match(
    mainJs,
    /featureType: "all",\s+elementType: "labels"/
  );
  assert.equal(mainJs.includes("class TrainingMarker"), true);
  assert.equal(stylesCss.includes(".training-map-marker"), true);
  assert.equal(mainJs.includes("const activateMarker"), true);
  assert.equal(
    mainJs.includes("const interactiveTarget"),
    true
  );
  assert.equal(mainJs.includes("renderActiveMapResult();"), true);
  assert.equal(mainJs.includes("new google.maps.Marker"), false);
});

test("route editing preserves the assigned-station origin", function () {
  assert.equal(mainJs.includes("function restoreRouteOrigin"), true);
  assert.equal(mainJs.includes("drawnPathSnapshot[0] = origin"), true);
  assert.match(
    mainJs,
    /function setRoutePath[\s\S]*?Core\.normalizePoint\(point\)/
  );
  assert.equal(mainJs.includes('addListener("dragend"'), true);
  assert.equal(mainJs.includes("gmp-dragend"), false);
});

test("local preview metadata does not hard-code a localhost URL", function () {
  assert.equal(indexHtml.includes("http://localhost"), false);
  assert.match(indexHtml, /property="og:image" content="og\.png"/);
  assert.match(indexHtml, /name="twitter:image" content="og\.png"/);
});
