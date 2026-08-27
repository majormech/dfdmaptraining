"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_ON = "2026-08-27";
const CENTERLINE_OFFSETS = [0, 2000, 4000, 6000, 8000];
const ADDRESS_OFFSETS = [0, 10000, 20000, 30000, 40000];
const STATION_IDS = ["1", "2", "3", "4", "5", "6", "7"];
const MAX_ADDRESS_DISTANCE_FEET = 500;
const MAIN_INTERSECTION = Object.freeze({ lat: 39.8414287, lng: -88.9558687 });
const INVALID_CROSS_STREETS = new Set([
  "",
  "EOP",
  "END OF PAVEMENT",
  "END OF ROAD",
  "END OF STREET",
  "DEAD END",
  "CUL DE SAC",
  "CUL-DE-SAC",
  "CITY LIMITS",
  "ASPHALT",
  "CONCRETE",
  "NWRR",
]);
const SOURCE_URLS = Object.freeze({
  activeAddresses:
    "https://maps.decaturil.gov/arcgis/rest/services/Public/addresses/FeatureServer/0",
  roadCenterlines:
    "https://maps.decaturil.gov/arcgis/rest/services/Transportation/Street_Centerlines/FeatureServer/0",
  stationTerritories:
    "https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0",
});
const PREFERRED_FIXTURES = new Set([
  "232 W PACKARD ST",
  "355 W PACKARD ST",
  "252 W MAIN ST",
  "899 W MAIN ST",
  "353 E WILLIAM ST",
  "1050 E WILLIAM ST",
  "1149 E CANTRELL ST",
  "553 W WOOD ST",
  "703 W WILLIAM ST",
  "1252 E MAIN ST",
]);
const PREFERRED_FIXTURE_IDS = Object.freeze({
  "232 W PACKARD ST": "cross-232-w-packard",
  "355 W PACKARD ST": "cross-355-w-packard",
  "252 W MAIN ST": "cross-252-w-main",
  "899 W MAIN ST": "cross-899-w-main",
  "353 E WILLIAM ST": "cross-353-e-william",
  "1050 E WILLIAM ST": "cross-1050-e-william",
  "1149 E CANTRELL ST": "cross-1149-e-cantrell",
  "553 W WOOD ST": "cross-553-w-wood",
  "703 W WILLIAM ST": "cross-703-w-william",
  "1252 E MAIN ST": "cross-1252-e-main",
});

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanName(value).toUpperCase().replace(/\./g, "");
}

function loadGeoJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filename), "utf8"));
}

function loadPagedFeatures(prefix, offsets) {
  return offsets.flatMap(function (offset) {
    const filename = path.join("data", "source", prefix + "-" + offset + ".geojson");
    return loadGeoJson(filename).features || [];
  });
}

function sourceSnapshotMetadata() {
  const filenames = CENTERLINE_OFFSETS.map(function (offset) {
    return path.join("data", "source", "street-centerlines-" + offset + ".geojson");
  })
    .concat(
      ADDRESS_OFFSETS.map(function (offset) {
        return path.join("data", "source", "active-addresses-" + offset + ".geojson");
      })
    )
    .concat([path.join("data", "source", "still-alarm-territories.geojson")]);

  return filenames.map(function (filename) {
    const contents = fs.readFileSync(path.join(ROOT, filename));
    const collection = JSON.parse(contents.toString("utf8"));
    return {
      file: filename.replace(/\\/g, "/"),
      featureCount: (collection.features || []).length,
      bytes: contents.length,
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    };
  });
}

function coordinatePaths(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates || []];
  if (geometry.type === "MultiLineString") return geometry.coordinates || [];
  return [];
}

function pointToSegmentFeet(point, start, end) {
  const longitudeScale =
    364000 * Math.cos((MAIN_INTERSECTION.lat * Math.PI) / 180);
  const startX = (Number(start[0]) - point.lng) * longitudeScale;
  const startY = (Number(start[1]) - point.lat) * 364000;
  const endX = (Number(end[0]) - point.lng) * longitudeScale;
  const endY = (Number(end[1]) - point.lat) * 364000;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const ratio = denominator
    ? Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / denominator))
    : 0;
  return Math.hypot(startX + ratio * deltaX, startY + ratio * deltaY);
}

function pointToGeometryFeet(point, geometry) {
  let minimum = Infinity;
  coordinatePaths(geometry).forEach(function (line) {
    for (let index = 1; index < line.length; index += 1) {
      minimum = Math.min(
        minimum,
        pointToSegmentFeet(point, line[index - 1], line[index])
      );
    }
  });
  return minimum;
}

function bboxForCoordinates(coordinates) {
  const points = [];
  function collect(value) {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      points.push(value);
      return;
    }
    value.forEach(collect);
  }
  collect(coordinates);
  return points.reduce(
    function (bbox, point) {
      bbox.minLng = Math.min(bbox.minLng, Number(point[0]));
      bbox.maxLng = Math.max(bbox.maxLng, Number(point[0]));
      bbox.minLat = Math.min(bbox.minLat, Number(point[1]));
      bbox.maxLat = Math.max(bbox.maxLat, Number(point[1]));
      return bbox;
    },
    { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
  );
}

function pointOnSegment(point, first, second, tolerance) {
  const cross =
    (second.lng - first.lng) * (point.lat - first.lat) -
    (second.lat - first.lat) * (point.lng - first.lng);
  if (Math.abs(cross) > tolerance) return false;
  return (
    point.lng >= Math.min(first.lng, second.lng) - tolerance &&
    point.lng <= Math.max(first.lng, second.lng) + tolerance &&
    point.lat >= Math.min(first.lat, second.lat) - tolerance &&
    point.lat <= Math.max(first.lat, second.lat) + tolerance
  );
}

function pointOnRing(point, ring) {
  for (let index = 1; index < ring.length; index += 1) {
    const first = { lng: Number(ring[index - 1][0]), lat: Number(ring[index - 1][1]) };
    const second = { lng: Number(ring[index][0]), lat: Number(ring[index][1]) };
    if (pointOnSegment(point, first, second, 1e-9)) return true;
  }
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current];
    const b = ring[previous];
    const intersects =
      Number(a[1]) > point.lat !== Number(b[1]) > point.lat &&
      point.lng <
        ((Number(b[0]) - Number(a[0])) * (point.lat - Number(a[1]))) /
          (Number(b[1]) - Number(a[1])) +
          Number(a[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, coordinates) {
  if (!coordinates.length || !pointOnRing(point, coordinates[0])) return false;
  return !coordinates.slice(1).some(function (hole) {
    return pointOnRing(point, hole);
  });
}

function prepareStationPolygons(collection) {
  return (collection.features || []).flatMap(function (feature) {
    if (!feature || !feature.geometry) return [];
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.type === "MultiPolygon"
          ? feature.geometry.coordinates
          : [];
    return polygons.map(function (coordinates) {
      return {
        coordinates,
        bbox: bboxForCoordinates(coordinates),
        properties: feature.properties || {},
      };
    });
  });
}

function stationIdFromProperties(properties) {
  const direct = cleanName(properties.STATION).match(/([1-7])/);
  if (direct) return direct[1];
  for (const entry of Object.entries(properties || {})) {
    if (!/station|response/i.test(entry[0])) continue;
    const match = String(entry[1]).match(/([1-7])/);
    if (match) return match[1];
  }
  return null;
}

function stationIdsForPoint(point, polygons) {
  return Array.from(
    new Set(
      polygons
        .filter(function (polygon) {
          const bbox = polygon.bbox;
          return (
            point.lng >= bbox.minLng &&
            point.lng <= bbox.maxLng &&
            point.lat >= bbox.minLat &&
            point.lat <= bbox.maxLat &&
            pointInPolygon(point, polygon.coordinates)
          );
        })
        .map(function (polygon) {
          return stationIdFromProperties(polygon.properties);
        })
        .filter(Boolean)
    )
  ).sort();
}

function titleCaseStreet(value) {
  const smallWords = new Set(["OF", "THE"]);
  const directions = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "US"]);
  const suffixes = new Set([
    "AVE", "BLVD", "CIR", "CT", "DR", "EXPY", "HWY", "LN", "PKWY",
    "PL", "RD", "ST", "TER", "TRL", "WAY",
  ]);
  return cleanName(value)
    .split(" ")
    .map(function (word, index) {
      const upper = word.toUpperCase();
      if (directions.has(upper) || /^\d+$/.test(upper)) return upper;
      if (suffixes.has(upper)) return upper[0] + upper.slice(1).toLowerCase();
      if (/^\d+(ST|ND|RD|TH)$/.test(upper)) {
        return upper.replace(/[A-Z]+$/, function (suffix) {
          return suffix.toLowerCase();
        });
      }
      if (index > 0 && smallWords.has(upper)) return upper.toLowerCase();
      return upper[0] + upper.slice(1).toLowerCase();
    })
    .join(" ");
}

function aliasesForStreet(value, includeDirectionless) {
  const normalized = normalizeName(value);
  const words = normalized.split(" ");
  const aliases = new Set([titleCaseStreet(normalized)]);
  if (
    includeDirectionless &&
    /^(N|S|E|W|NE|NW|SE|SW)$/.test(words[0])
  ) {
    aliases.add(titleCaseStreet(words.slice(1).join(" ")));
  }
  return Array.from(aliases);
}

function directionlessAnswerKey(value) {
  const words = normalizeName(value).split(" ");
  if (/^(N|S|E|W|NE|NW|SE|SW)$/.test(words[0])) words.shift();
  return normalizedAnswerKey(words.join(" "));
}

function normalizedAnswerKey(value) {
  const directionWords = {
    N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST",
    NE: "NORTHEAST", NW: "NORTHWEST", SE: "SOUTHEAST", SW: "SOUTHWEST",
  };
  const suffixes = new Set([
    "ST", "STREET", "AVE", "AVENUE", "BLVD", "BOULEVARD", "CIR", "CIRCLE",
    "CT", "COURT", "DR", "DRIVE", "HWY", "HIGHWAY", "LN", "LANE", "PKWY",
    "PARKWAY", "PL", "PLACE", "RD", "ROAD", "TER", "TERRACE", "TRL", "TRAIL", "WAY",
  ]);
  const words = normalizeName(value)
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(function (word) {
      return directionWords[word] || word;
    });
  if (words.length > 1 && suffixes.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

function streetNameFromAddress(properties) {
  const address = normalizeName(properties.ADDRESS);
  const number = Number(properties.STREET_NUM);
  if (!address || !Number.isFinite(number)) return "";
  const numberToken = Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, "");
  if (!address.startsWith(numberToken + " ")) return "";
  let remainder = address.slice(numberToken.length).trim();
  const supplement = normalizeName(properties.STREET_SUP);
  if (supplement && remainder.startsWith(supplement + " ")) {
    remainder = remainder.slice(supplement.length).trim();
  }
  return remainder;
}

function validRangeContains(properties, number) {
  return [
    [properties.FROMLEFT, properties.TOLEFT],
    [properties.FROMRIGHT, properties.TORIGHT],
  ].some(function (range) {
    const first = Number(range[0]);
    const second = Number(range[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) {
      return false;
    }
    return number >= Math.min(first, second) && number <= Math.max(first, second);
  });
}

function validCrossStreet(value, carrier) {
  const normalized = normalizeName(value);
  return (
    !INVALID_CROSS_STREETS.has(normalized) &&
    normalized !== normalizeName(carrier) &&
    normalized.length > 1
  );
}

function candidateSegment(feature) {
  const properties = feature.properties || {};
  const carrier = normalizeName(properties.FULL_NAME);
  const first = normalizeName(properties.SB_FSTREET);
  const second = normalizeName(properties.SB_TSTREET);
  return Boolean(
    carrier &&
      validCrossStreet(first, carrier) &&
      validCrossStreet(second, carrier) &&
      first !== second &&
      normalizedAnswerKey(first) !== normalizedAnswerKey(second)
  );
}

function addressPoint(feature) {
  const coordinates = feature.geometry && feature.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const point = { lng: Number(coordinates[0]), lat: Number(coordinates[1]) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null;
}

function chooseRepresentative(entries) {
  return entries.slice().sort(function (left, right) {
    const leftPreferred = PREFERRED_FIXTURES.has(normalizeName(left.address.properties.ADDRESS));
    const rightPreferred = PREFERRED_FIXTURES.has(normalizeName(right.address.properties.ADDRESS));
    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    return (
      left.distanceFeet - right.distanceFeet ||
      Number(left.address.properties.OBJECTID) - Number(right.address.properties.OBJECTID)
    );
  })[0];
}

function buildBank(centerlines, addresses, stationPolygons) {
  const segmentsByName = new Map();
  centerlines.filter(candidateSegment).forEach(function (feature) {
    const name = normalizeName(feature.properties.FULL_NAME);
    if (!segmentsByName.has(name)) segmentsByName.set(name, []);
    segmentsByName.get(name).push(feature);
  });

  const buckets = new Map();
  const rejectionCounts = {
    missingPoint: 0,
    unmatchedStreet: 0,
    noAddressRange: 0,
    tooFarFromCenterline: 0,
    noStation: 0,
  };
  let matchedAddresses = 0;

  addresses.forEach(function (address) {
    const properties = address.properties || {};
    const point = addressPoint(address);
    if (!point) {
      rejectionCounts.missingPoint += 1;
      return;
    }
    const streetName = streetNameFromAddress(properties);
    const candidates = segmentsByName.get(streetName) || [];
    if (!candidates.length) {
      rejectionCounts.unmatchedStreet += 1;
      return;
    }
    const number = Number(properties.STREET_NUM);
    const ranged = candidates.filter(function (feature) {
      return validRangeContains(feature.properties || {}, number);
    });
    if (!ranged.length) {
      rejectionCounts.noAddressRange += 1;
      return;
    }
    const scored = ranged
      .map(function (feature) {
        return {
          feature,
          distanceFeet: pointToGeometryFeet(point, feature.geometry),
        };
      })
      .sort(function (left, right) {
        return left.distanceFeet - right.distanceFeet;
      });
    const best = scored[0];
    if (!best || best.distanceFeet > MAX_ADDRESS_DISTANCE_FEET) {
      rejectionCounts.tooFarFromCenterline += 1;
      return;
    }
    const stationIds = stationIdsForPoint(point, stationPolygons);
    if (!stationIds.length) {
      rejectionCounts.noStation += 1;
      return;
    }
    matchedAddresses += 1;
    const segmentId = Number((best.feature.properties || {}).OBJECTID);
    const bucketKey = segmentId + "|" + stationIds.join(",");
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push({
      address,
      feature: best.feature,
      point,
      stationIds,
      distanceFeet: best.distanceFeet,
    });
  });

  const questions = Array.from(buckets.values())
    .map(chooseRepresentative)
    .map(function (entry) {
      const addressProperties = entry.address.properties || {};
      const segmentProperties = entry.feature.properties || {};
      const first = normalizeName(segmentProperties.SB_FSTREET);
      const second = normalizeName(segmentProperties.SB_TSTREET);
      const normalizedAddress = normalizeName(addressProperties.ADDRESS);
      const directionlessAnswersAreDistinct =
        directionlessAnswerKey(first) !== directionlessAnswerKey(second);
      return {
        id:
          PREFERRED_FIXTURE_IDS[normalizedAddress] ||
          ("cross-" +
            Number(segmentProperties.OBJECTID) +
            "-" +
            Number(addressProperties.OBJECTID)),
        prompt: titleCaseStreet(addressProperties.ADDRESS),
        streetName: titleCaseStreet(segmentProperties.FULL_NAME),
        stationIds: entry.stationIds,
        coordinates: entry.point,
        answers: [first, second].map(function (answer) {
          return {
            display: titleCaseStreet(answer),
            aliases: aliasesForStreet(answer, directionlessAnswersAreDistinct),
          };
        }),
        sourceAddressObjectId: Number(addressProperties.OBJECTID),
        sourceCenterlineObjectId: Number(segmentProperties.OBJECTID),
        matchDistanceFeet: Math.round(entry.distanceFeet * 10) / 10,
        verifiedUsing: ["active-address point", "centerline address range", "segment endpoint streets"],
      };
    })
    .sort(function (left, right) {
      return left.prompt.localeCompare(right.prompt) || left.id.localeCompare(right.id);
    });

  const officialStreetNames = Array.from(segmentsByName.keys()).sort();
  const includedNames = Array.from(new Set(questions.map(function (question) {
    return normalizeName(question.streetName);
  }))).sort();
  const includedSet = new Set(includedNames);
  const excludedNames = officialStreetNames.filter(function (name) {
    return !includedSet.has(name);
  });
  const stationQuestionCounts = Object.fromEntries(
    STATION_IDS.map(function (stationId) {
      return [
        stationId,
        questions.filter(function (question) {
          return question.stationIds.includes(stationId);
        }).length,
      ];
    })
  );

  return {
    questions,
    coverage: {
      schemaVersion: 1,
      generatedOn: GENERATED_ON,
      definition:
        "One verified active-address question for each matched official centerline segment and response-area membership with two named bounding streets.",
      methodology: [
        "Load every active Decatur address from the official public address layer.",
        "Match the address street and number to an official centerline address range.",
        "Require the address point to fall within 500 feet of that segment and require two distinct named endpoint streets.",
        "Assign each question from the address point to the official Still Alarm Territory.",
        "Keep one representative active address per centerline segment and station membership.",
      ],
      sources: SOURCE_URLS,
      sourceSnapshots: sourceSnapshotMetadata(),
      counts: {
        sourceActiveAddresses: addresses.length,
        sourceCenterlineSegments: centerlines.length,
        candidateCenterlineSegments: Array.from(segmentsByName.values()).flat().length,
        officialCandidateStreetNames: officialStreetNames.length,
        includedStreetNames: includedNames.length,
        excludedStreetNames: excludedNames.length,
        matchedActiveAddresses: matchedAddresses,
        questionRecords: questions.length,
        stationQuestionCounts,
      },
      rejectionCounts,
      includedStreetNames: includedNames.map(titleCaseStreet),
      excludedStreetNames: excludedNames.map(titleCaseStreet),
    },
  };
}

function generatedModuleSource(payload) {
  return (
    '"use strict";\n\n' +
    "// Generated by scripts/analyze-cross-street-bank.js from official Decatur GIS snapshots.\n" +
    "// Run `npm run generate:cross-streets` after refreshing data/source.\n" +
    "(function (root, factory) {\n" +
    "  const data = factory();\n" +
    '  if (typeof module === "object" && module.exports) module.exports = data;\n' +
    "  if (root) root.DFDCrossStreetData = data;\n" +
    '})(typeof window !== "undefined" ? window : null, function () {\n' +
    "  const data = " +
    JSON.stringify(payload, null, 2)
      .split("\n")
      .map(function (line, index) {
        return index ? "  " + line : line;
      })
      .join("\n") +
    ";\n\n" +
    "  function deepFreeze(value) {\n" +
    '    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;\n' +
    "    Object.values(value).forEach(deepFreeze);\n" +
    "    return Object.freeze(value);\n" +
    "  }\n\n" +
    "  return deepFreeze(data);\n" +
    "});\n"
  );
}

function main() {
  const centerlines = loadPagedFeatures("street-centerlines", CENTERLINE_OFFSETS);
  const addresses = loadPagedFeatures("active-addresses", ADDRESS_OFFSETS);
  const stationPolygons = prepareStationPolygons(
    loadGeoJson(path.join("data", "source", "still-alarm-territories.geojson"))
  );
  const result = buildBank(centerlines, addresses, stationPolygons);
  const payload = {
    schemaVersion: 1,
    generatedOn: GENERATED_ON,
    sources: SOURCE_URLS,
    questions: result.questions,
  };

  if (process.argv.includes("--write")) {
    fs.writeFileSync(
      path.join(ROOT, "cross-street-data.js"),
      generatedModuleSource(payload),
      "utf8"
    );
    fs.writeFileSync(
      path.join(ROOT, "data", "cross-street-coverage.json"),
      JSON.stringify(result.coverage, null, 2) + "\n",
      "utf8"
    );
  }

  console.log(JSON.stringify(result.coverage.counts, null, 2));
  console.log("Rejections:", JSON.stringify(result.coverage.rejectionCounts));
  if (!process.argv.includes("--write")) {
    console.log("Run with --write to regenerate cross-street-data.js and coverage JSON.");
  }
}

main();
