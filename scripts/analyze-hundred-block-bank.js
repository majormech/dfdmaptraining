"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_OFFSETS = [0, 2000, 4000, 6000, 8000];
const GENERATED_ON = "2026-08-26";
const MAIN_INTERSECTION = Object.freeze({
  lat: 39.84142870831914,
  lng: -88.95586868750067,
});
const VALID_DIRECTIONS = new Set(["N", "S", "E", "W"]);
const STATION_IDS = ["1", "2", "3", "4", "5", "6", "7"];
const CLUSTER_DISTANCE_FEET = 35;
const TARGET_SNAP_DISTANCE_FEET = 25;
const ENDPOINT_EXCLUSIONS = new Set([
  "",
  "EOP",
  "END OF PAVEMENT",
  "END OF ROAD",
  "END OF STREET",
  "CUL DE SAC",
  "CUL-DE-SAC",
  "CITY LIMITS",
  "ASPHALT",
  "CONCRETE",
  "NWRR",
]);
const NON_STREET_NAMES = new Set([
  "ASPHALT",
  "CONCRETE",
  "NWRR",
  "SANDCREEK BRIDGE",
]);

const SOURCE_URLS = Object.freeze({
  roadCenterlines:
    "https://maps.decaturil.gov/arcgis/rest/services/Transportation/Street_Centerlines/FeatureServer/0",
  cityLimits:
    "https://maps.decaturil.gov/arcgis/rest/services/Public/city_limits/FeatureServer/0",
  stationTerritories:
    "https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0",
  numberingOrdinance:
    "https://decaturil.gov/DocumentCenter/View/118/Chapter-35---Numbering-Houses-PDF",
});

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function loadGeoJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filename), "utf8"));
}

function loadFeatures() {
  return SOURCE_OFFSETS.flatMap(function (offset) {
    return (
      loadGeoJson(
        path.join("data", "source", "street-centerlines-" + offset + ".geojson")
      ).features || []
    );
  });
}

function sourceSnapshotMetadata() {
  const filenames = SOURCE_OFFSETS.map(function (offset) {
    return path.join("data", "source", "street-centerlines-" + offset + ".geojson");
  }).concat([
    path.join("data", "source", "decatur-city-limits.geojson"),
    path.join("data", "source", "still-alarm-territories.geojson"),
  ]);
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

function allCoordinates(geometry) {
  return coordinatePaths(geometry).flat().filter(function (coordinate) {
    return Array.isArray(coordinate) && coordinate.length >= 2;
  });
}

function endpointCoordinate(feature, endpoint) {
  const paths = coordinatePaths(feature.geometry).filter(function (line) {
    return line.length > 0;
  });
  if (!paths.length) return null;
  const coordinate =
    endpoint === "from"
      ? paths[0][0]
      : paths[paths.length - 1][paths[paths.length - 1].length - 1];
  return { lng: Number(coordinate[0]), lat: Number(coordinate[1]) };
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
  if (!points.length) return null;
  return points.reduce(
    function (bbox, point) {
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      bbox.minLng = Math.min(bbox.minLng, lng);
      bbox.maxLng = Math.max(bbox.maxLng, lng);
      bbox.minLat = Math.min(bbox.minLat, lat);
      bbox.maxLat = Math.max(bbox.maxLat, lat);
      return bbox;
    },
    {
      minLng: Infinity,
      maxLng: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity,
    }
  );
}

function bboxForGeometry(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  return bboxForCoordinates(geometry.coordinates);
}

function bboxesOverlap(left, right) {
  return Boolean(
    left &&
      right &&
      left.minLng <= right.maxLng &&
      left.maxLng >= right.minLng &&
      left.minLat <= right.maxLat &&
      left.maxLat >= right.minLat
  );
}

function orientation(first, second, third) {
  return (
    (second.lng - first.lng) * (third.lat - first.lat) -
    (second.lat - first.lat) * (third.lng - first.lng)
  );
}

function pointOnSegment(point, first, second, tolerance) {
  const cross = Math.abs(orientation(first, second, point));
  if (cross > tolerance) return false;
  return (
    point.lng >= Math.min(first.lng, second.lng) - tolerance &&
    point.lng <= Math.max(first.lng, second.lng) + tolerance &&
    point.lat >= Math.min(first.lat, second.lat) - tolerance &&
    point.lat <= Math.max(first.lat, second.lat) + tolerance
  );
}

function segmentsIntersect(a, b, c, d) {
  const tolerance = 1e-10;
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (
    ((first > tolerance && second < -tolerance) ||
      (first < -tolerance && second > tolerance)) &&
    ((third > tolerance && fourth < -tolerance) ||
      (third < -tolerance && fourth > tolerance))
  ) {
    return true;
  }
  return (
    (Math.abs(first) <= tolerance && pointOnSegment(c, a, b, tolerance)) ||
    (Math.abs(second) <= tolerance && pointOnSegment(d, a, b, tolerance)) ||
    (Math.abs(third) <= tolerance && pointOnSegment(a, c, d, tolerance)) ||
    (Math.abs(fourth) <= tolerance && pointOnSegment(b, c, d, tolerance))
  );
}

function pointOnRingBoundary(point, ring) {
  for (let index = 1; index < ring.length; index += 1) {
    const first = { lng: Number(ring[index - 1][0]), lat: Number(ring[index - 1][1]) };
    const second = { lng: Number(ring[index][0]), lat: Number(ring[index][1]) };
    if (pointOnSegment(point, first, second, 1e-9)) return true;
  }
  return false;
}

function pointOnRing(point, ring) {
  if (pointOnRingBoundary(point, ring)) return true;
  let inside = false;
  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    const intersects =
      currentPoint[1] > point.lat !== previousPoint[1] > point.lat &&
      point.lng <
        ((previousPoint[0] - currentPoint[0]) *
          (point.lat - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygonCoordinates) {
  if (!polygonCoordinates.length || !pointOnRing(point, polygonCoordinates[0])) {
    return false;
  }
  return !polygonCoordinates.slice(1).some(function (hole) {
    return pointOnRing(point, hole) && !pointOnRingBoundary(point, hole);
  });
}

function preparePolygons(collection) {
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

function lineIntersectsPreparedPolygon(line, polygon) {
  const lineBbox = bboxForCoordinates(line);
  if (!bboxesOverlap(lineBbox, polygon.bbox)) return false;
  if (
    line.some(function (coordinate) {
      return pointInPolygon(
        { lng: Number(coordinate[0]), lat: Number(coordinate[1]) },
        polygon.coordinates
      );
    })
  ) {
    return true;
  }
  const outerRing = polygon.coordinates[0] || [];
  for (let lineIndex = 1; lineIndex < line.length; lineIndex += 1) {
    const first = {
      lng: Number(line[lineIndex - 1][0]),
      lat: Number(line[lineIndex - 1][1]),
    };
    const second = {
      lng: Number(line[lineIndex][0]),
      lat: Number(line[lineIndex][1]),
    };
    for (let ringIndex = 1; ringIndex < outerRing.length; ringIndex += 1) {
      const third = {
        lng: Number(outerRing[ringIndex - 1][0]),
        lat: Number(outerRing[ringIndex - 1][1]),
      };
      const fourth = {
        lng: Number(outerRing[ringIndex][0]),
        lat: Number(outerRing[ringIndex][1]),
      };
      if (segmentsIntersect(first, second, third, fourth)) return true;
    }
  }
  return false;
}

function geometryIntersectsPolygons(geometry, polygons) {
  return coordinatePaths(geometry).some(function (line) {
    return polygons.some(function (polygon) {
      return lineIntersectsPreparedPolygon(line, polygon);
    });
  });
}

function distanceFeet(left, right) {
  const latitudeFeet = (left.lat - right.lat) * 364000;
  const longitudeFeet =
    (left.lng - right.lng) *
    364000 *
    Math.cos((MAIN_INTERSECTION.lat * Math.PI) / 180);
  return Math.hypot(latitudeFeet, longitudeFeet);
}

function pointToSegmentFeet(point, start, end) {
  const longitudeScale =
    364000 * Math.cos((MAIN_INTERSECTION.lat * Math.PI) / 180);
  const startX = (start.lng - point.lng) * longitudeScale;
  const startY = (start.lat - point.lat) * 364000;
  const endX = (end.lng - point.lng) * longitudeScale;
  const endY = (end.lat - point.lat) * 364000;
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
        pointToSegmentFeet(
          point,
          { lng: Number(line[index - 1][0]), lat: Number(line[index - 1][1]) },
          { lng: Number(line[index][0]), lat: Number(line[index][1]) }
        )
      );
    }
  });
  return minimum;
}

function stationIdFromProperties(properties) {
  const direct = cleanName(properties.STATION).match(/([1-7])/);
  if (direct) return direct[1];
  for (const entry of Object.entries(properties || {})) {
    const key = String(entry[0]).toLowerCase();
    if (!key.includes("station") && !key.includes("response")) continue;
    const match = String(entry[1]).match(/([1-7])/);
    if (match) return match[1];
  }
  return null;
}

function stationIdsForPoint(point, stationPolygons) {
  return Array.from(
    new Set(
      stationPolygons
        .filter(function (polygon) {
          return (
            point.lng >= polygon.bbox.minLng &&
            point.lng <= polygon.bbox.maxLng &&
            point.lat >= polygon.bbox.minLat &&
            point.lat <= polygon.bbox.maxLat &&
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

function carrierBaseName(name) {
  return cleanName(name).replace(/^[NSEW]\s+/, "");
}

function inferGridDirection(feature) {
  const properties = feature.properties || {};
  const stated = cleanName(properties.STR_DIR).toUpperCase();
  if (VALID_DIRECTIONS.has(stated)) return stated;

  const coordinates = allCoordinates(feature.geometry);
  if (coordinates.length < 2) return null;
  const lngs = coordinates.map(function (coordinate) {
    return Number(coordinate[0]);
  });
  const lats = coordinates.map(function (coordinate) {
    return Number(coordinate[1]);
  });
  const longitudeSpan =
    (Math.max.apply(null, lngs) - Math.min.apply(null, lngs)) *
    Math.cos((MAIN_INTERSECTION.lat * Math.PI) / 180);
  const latitudeSpan = Math.max.apply(null, lats) - Math.min.apply(null, lats);
  const vertical = latitudeSpan > longitudeSpan;
  const primarySpan = vertical ? latitudeSpan : longitudeSpan;
  const secondarySpan = vertical ? longitudeSpan : latitudeSpan;
  if (!primarySpan || primarySpan < secondarySpan * 3) return null;

  const averageLongitude =
    lngs.reduce(function (total, value) {
      return total + value;
    }, 0) / lngs.length;
  const averageLatitude =
    lats.reduce(function (total, value) {
      return total + value;
    }, 0) / lats.length;
  if (vertical) {
    return averageLatitude >= MAIN_INTERSECTION.lat ? "N" : "S";
  }
  return averageLongitude >= MAIN_INTERSECTION.lng ? "E" : "W";
}

function outwardScore(point, direction) {
  if (direction === "N") return point.lat - MAIN_INTERSECTION.lat;
  if (direction === "S") return MAIN_INTERSECTION.lat - point.lat;
  if (direction === "E") return point.lng - MAIN_INTERSECTION.lng;
  if (direction === "W") return MAIN_INTERSECTION.lng - point.lng;
  return 0;
}

function endpointBlockNumber(feature, endpoint, direction) {
  const properties = feature.properties || {};
  const hundreds = ["FROMLEFT", "TOLEFT", "FROMRIGHT", "TORIGHT"]
    .map(function (field) {
      return Number(properties[field]);
    })
    .filter(function (value) {
      return Number.isFinite(value) && value >= 100;
    })
    .map(function (value) {
      return Math.floor(value / 100) * 100;
    });
  if (!hundreds.length) return null;

  const minimum = Math.min.apply(null, hundreds);
  const maximum = Math.max.apply(null, hundreds);
  if (minimum === maximum) return minimum;

  const point = endpointCoordinate(feature, endpoint);
  const opposite = endpointCoordinate(feature, endpoint === "from" ? "to" : "from");
  if (!point || !opposite) return null;
  const scoreDifference = outwardScore(point, direction) - outwardScore(opposite, direction);
  if (Math.abs(scoreDifference) < 1e-8) return null;
  return scoreDifference > 0 ? maximum : minimum;
}

function pairKey(labels) {
  return labels
    .slice()
    .sort(function (left, right) {
      return (
        left.direction.localeCompare(right.direction) ||
        left.number - right.number
      );
    })
    .map(function (label) {
      return label.number + label.direction;
    })
    .join("|");
}

function sortedLabels(labels) {
  const directionOrder = { N: 0, S: 1, E: 2, W: 3 };
  return labels.slice().sort(function (left, right) {
    return (
      (directionOrder[left.direction] || 0) -
        (directionOrder[right.direction] || 0) ||
      left.number - right.number
    );
  });
}

function validPair(labels) {
  if (labels.length !== 2) return false;
  const first = labels[0];
  const second = labels[1];
  if (first.direction === second.direction) {
    return Math.abs(first.number - second.number) === 100;
  }
  const sameAxis =
    ("NS".includes(first.direction) && "NS".includes(second.direction)) ||
    ("EW".includes(first.direction) && "EW".includes(second.direction));
  return sameAxis && first.number === 100 && second.number === 100;
}

function candidateAxis(name) {
  const direction = cleanName(name).split(" ")[0];
  if (direction === "N" || direction === "S") return "vertical";
  if (direction === "E" || direction === "W") return "horizontal";
  return null;
}

function labelAxis(labels) {
  if (!labels.length) return null;
  if (
    labels.every(function (label) {
      return label.direction === "N" || label.direction === "S";
    })
  ) {
    return "vertical";
  }
  if (
    labels.every(function (label) {
      return label.direction === "E" || label.direction === "W";
    })
  ) {
    return "horizontal";
  }
  return null;
}

function streetLikeFeature(feature) {
  const name = cleanName((feature.properties || {}).FULL_NAME).toUpperCase();
  return Boolean(name && !NON_STREET_NAMES.has(name));
}

function featureIndexByName(features) {
  const index = new Map();
  features.forEach(function (feature) {
    const name = cleanName((feature.properties || {}).FULL_NAME);
    if (!name || !streetLikeFeature(feature)) return;
    if (!index.has(name)) index.set(name, []);
    index.get(name).push(feature);
  });
  return index;
}

function pointMatchesTargetStreet(point, targetFeatures) {
  return targetFeatures.some(function (feature) {
    const bbox = bboxForGeometry(feature.geometry);
    const paddingLat = TARGET_SNAP_DISTANCE_FEET / 364000;
    const paddingLng =
      TARGET_SNAP_DISTANCE_FEET /
      (364000 * Math.cos((MAIN_INTERSECTION.lat * Math.PI) / 180));
    if (
      !bbox ||
      point.lng < bbox.minLng - paddingLng ||
      point.lng > bbox.maxLng + paddingLng ||
      point.lat < bbox.minLat - paddingLat ||
      point.lat > bbox.maxLat + paddingLat
    ) {
      return false;
    }
    return pointToGeometryFeet(point, feature.geometry) <= TARGET_SNAP_DISTANCE_FEET;
  });
}

function collectObservations(features, targetFeaturesByName, rejectionCounts) {
  const observations = [];
  features.forEach(function (feature) {
    const properties = feature.properties || {};
    const carrier = cleanName(properties.FULL_NAME);
    const carrierBase = carrierBaseName(carrier);
    const direction = inferGridDirection(feature);
    if (!carrier || !carrierBase || !streetLikeFeature(feature)) return;
    if (!direction) {
      rejectionCounts.carrierDirection += 1;
      return;
    }

    ["from", "to"].forEach(function (endpoint) {
      const candidate = cleanName(
        properties[endpoint === "from" ? "SB_FSTREET" : "SB_TSTREET"]
      );
      if (ENDPOINT_EXCLUSIONS.has(candidate.toUpperCase())) {
        rejectionCounts.endpointToken += 1;
        return;
      }
      const targetFeatures = targetFeaturesByName.get(candidate);
      if (!targetFeatures) {
        rejectionCounts.notCityStreet += 1;
        return;
      }
      const number = endpointBlockNumber(feature, endpoint, direction);
      const point = endpointCoordinate(feature, endpoint);
      if (!number || !point) {
        rejectionCounts.missingRange += 1;
        return;
      }
      if (!pointMatchesTargetStreet(point, targetFeatures)) {
        rejectionCounts.targetTooFar += 1;
        return;
      }
      observations.push({
        candidate,
        carrier,
        carrierBase,
        label: { number, direction },
        point,
        objectId: Number(properties.OBJECTID),
      });
    });
  });
  return observations;
}

function intersectionGroups(observations) {
  const observationsByKey = new Map();
  observations.forEach(function (observation) {
    const key = observation.candidate + "\u0000" + observation.carrierBase;
    if (!observationsByKey.has(key)) observationsByKey.set(key, []);
    observationsByKey.get(key).push(observation);
  });

  return Array.from(observationsByKey.values()).flatMap(function (entries) {
    const sorted = entries.slice().sort(function (left, right) {
      return (
        left.point.lat - right.point.lat ||
        left.point.lng - right.point.lng ||
        left.objectId - right.objectId
      );
    });
    const groups = [];
    sorted.forEach(function (observation) {
      const group = groups.find(function (candidate) {
        return candidate.observations.every(function (existing) {
          return distanceFeet(existing.point, observation.point) <= CLUSTER_DISTANCE_FEET;
        });
      });
      if (group) {
        group.observations.push(observation);
      } else {
        groups.push({
          candidate: observation.candidate,
          carrierBase: observation.carrierBase,
          observations: [observation],
        });
      }
    });
    return groups.map(function (group) {
      const point = group.observations.reduce(
        function (total, observation) {
          total.lat += observation.point.lat / group.observations.length;
          total.lng += observation.point.lng / group.observations.length;
          return total;
        },
        { lat: 0, lng: 0 }
      );
      return Object.assign(group, { point });
    });
  });
}

function buildPairEvidence(groups, stationPolygons, rejectionCounts) {
  return groups
    .map(function (group) {
      const distinctObjectIds = new Set(
        group.observations.map(function (observation) {
          return observation.objectId;
        })
      );
      if (distinctObjectIds.size < 2) {
        rejectionCounts.singleSegment += 1;
        return null;
      }
      const labelMap = new Map();
      group.observations.forEach(function (observation) {
        const key = observation.label.number + observation.label.direction;
        labelMap.set(key, observation.label);
      });
      const labels = sortedLabels(Array.from(labelMap.values()));
      if (!validPair(labels)) {
        rejectionCounts.invalidPair += 1;
        return null;
      }
      const promptAxis = candidateAxis(group.candidate);
      const carrierGridAxis = labelAxis(labels);
      if (promptAxis && carrierGridAxis && promptAxis === carrierGridAxis) {
        rejectionCounts.axisConflict += 1;
        return null;
      }
      const stationIds = stationIdsForPoint(group.point, stationPolygons);
      if (!stationIds.length) {
        rejectionCounts.noStation += 1;
        return null;
      }
      return {
        candidate: group.candidate,
        carrier: Array.from(
          new Set(
            group.observations.map(function (observation) {
              return observation.carrier;
            })
          )
        ).sort()[0],
        carrierBase: group.carrierBase,
        labels,
        pairKey: pairKey(labels),
        point: group.point,
        stationIds,
        objectIds: Array.from(distinctObjectIds).sort(function (left, right) {
          return left - right;
        }),
      };
    })
    .filter(Boolean)
    .sort(function (left, right) {
      return (
        left.candidate.localeCompare(right.candidate) ||
        left.pairKey.localeCompare(right.pairKey) ||
        left.carrier.localeCompare(right.carrier) ||
        left.point.lat - right.point.lat ||
        left.point.lng - right.point.lng
      );
    });
}

function titleCaseStreet(value) {
  const smallWords = new Set(["OF", "THE"]);
  const suffixes = new Set([
    "AVE",
    "BLVD",
    "CIR",
    "CT",
    "DR",
    "EXPY",
    "HWY",
    "LN",
    "PKWY",
    "PL",
    "RD",
    "ST",
    "TER",
    "TRL",
    "WAY",
  ]);
  return cleanName(value)
    .split(" ")
    .map(function (word, index) {
      const upper = word.toUpperCase();
      if (VALID_DIRECTIONS.has(upper) || upper === "US") return upper;
      if (suffixes.has(upper)) {
        return upper.charAt(0) + upper.slice(1).toLowerCase();
      }
      if (/^\d+(ST|ND|RD|TH)$/.test(upper)) {
        return upper.replace(/[A-Z]+$/, function (suffix) {
          return suffix.toLowerCase();
        });
      }
      if (index > 0 && smallWords.has(upper)) return upper.toLowerCase();
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .join(" ");
}

function slug(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function unionValues(entries, selector, sorter) {
  const values = Array.from(new Set(entries.flatMap(selector)));
  return sorter ? values.sort(sorter) : values.sort();
}

function createQuestion(candidate, entries, contextual) {
  const representative = entries[0];
  const stationIds = unionValues(entries, function (entry) {
    return entry.stationIds;
  });
  const sourceFeatureIds = unionValues(
    entries,
    function (entry) {
      return entry.objectIds;
    },
    function (left, right) {
      return left - right;
    }
  );
  const verifiedUsing = unionValues(entries, function (entry) {
    return [titleCaseStreet(entry.carrier)];
  });
  const displayStreet = titleCaseStreet(candidate);
  const prompt = contextual
    ? displayStreet + " near " + titleCaseStreet(representative.carrier)
    : displayStreet;
  const pairId = representative.labels
    .map(function (label) {
      return label.number + label.direction.toLowerCase();
    })
    .join("-");
  const stationId = stationIds.join("");
  let id =
    candidate === "W PACKARD ST" && !contextual
      ? "blocks-w-packard"
      : "blocks-" + slug(candidate);
  if (contextual) {
    id += "-" + pairId + "-s" + stationId + "-near-" + slug(representative.carrier);
  }
  return {
    id,
    prompt,
    streetName: displayStreet,
    contextual,
    stationIds,
    blocks: representative.labels.map(function (label) {
      return [label.number, label.direction];
    }),
    verifiedUsing,
    coordinates: {
      lat: Number(representative.point.lat.toFixed(8)),
      lng: Number(representative.point.lng.toFixed(8)),
    },
    witnessCount: entries.length,
    sourceFeatureIds,
  };
}

function buildQuestions(evidence) {
  const evidenceByCandidate = new Map();
  evidence.forEach(function (entry) {
    if (!evidenceByCandidate.has(entry.candidate)) {
      evidenceByCandidate.set(entry.candidate, []);
    }
    evidenceByCandidate.get(entry.candidate).push(entry);
  });

  const questions = [];
  Array.from(evidenceByCandidate.keys())
    .sort()
    .forEach(function (candidate) {
      const entries = evidenceByCandidate.get(candidate);
      const pairKeys = new Set(
        entries.map(function (entry) {
          return entry.pairKey;
        })
      );
      if (pairKeys.size === 1) {
        questions.push(createQuestion(candidate, entries, false));
        return;
      }

      const variants = new Map();
      entries.forEach(function (entry) {
        const key = entry.pairKey + "\u0000" + entry.stationIds.join("");
        if (!variants.has(key)) variants.set(key, []);
        variants.get(key).push(entry);
      });
      Array.from(variants.values()).forEach(function (variantEntries) {
        questions.push(createQuestion(candidate, variantEntries, true));
      });
    });

  const seenIds = new Map();
  questions.forEach(function (question) {
    const count = seenIds.get(question.id) || 0;
    seenIds.set(question.id, count + 1);
    if (count) question.id += "-" + (count + 1);
  });
  return questions.sort(function (left, right) {
    return left.prompt.localeCompare(right.prompt) || left.id.localeCompare(right.id);
  });
}

function buildCoverage(allFeatures, cityFeatures, evidence, questions, rejectionCounts) {
  const officialStreetNames = Array.from(
    new Set(
      cityFeatures
        .filter(streetLikeFeature)
        .map(function (feature) {
          return cleanName((feature.properties || {}).FULL_NAME);
        })
        .filter(Boolean)
    )
  ).sort();
  const includedStreetNames = Array.from(
    new Set(
      evidence.map(function (entry) {
        return entry.candidate;
      })
    )
  ).sort();
  const includedSet = new Set(includedStreetNames);
  const excludedStreetNames = officialStreetNames
    .filter(function (street) {
      return !includedSet.has(street);
    })
    .map(function (street) {
      return {
        street: titleCaseStreet(street),
        reason: "No verified pair of adjacent 100-block ranges at a named intersection",
      };
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
  const pairVariants = new Set(
    evidence.map(function (entry) {
      return entry.candidate + "\u0000" + entry.pairKey;
    })
  );

  return {
    schemaVersion: 1,
    generatedOn: GENERATED_ON,
    definition:
      "Every named Decatur street for which official centerline ranges prove two adjoining 100-blocks; contextual prompts preserve streets that shift or curve.",
    methodology: [
      "Intersect the complete centerline layer with the official Decatur city limits.",
      "Derive each endpoint block from all four address-range fields and the endpoint farthest from the Main Street baselines.",
      "Require two adjacent carrier segments, a valid consecutive pair, and a named target street within 25 feet.",
      "Assign the verified intersection to every matching official Still Alarm Territory.",
      "Use location-qualified prompts when one street has more than one valid block pair.",
    ],
    sources: SOURCE_URLS,
    sourceSnapshots: sourceSnapshotMetadata(),
    counts: {
      sourceSegments: allFeatures.length,
      cityIntersectingSegments: cityFeatures.length,
      officialCityStreetNames: officialStreetNames.length,
      includedBoundaryStreetNames: includedStreetNames.length,
      excludedStreetNames: excludedStreetNames.length,
      verifiedIntersectionPairs: evidence.length,
      streetBlockPairVariants: pairVariants.size,
      questionRecords: questions.length,
      contextualQuestionRecords: questions.filter(function (question) {
        return question.contextual;
      }).length,
      stationQuestionCounts,
    },
    rejectionCounts,
    includedStreetNames: includedStreetNames.map(titleCaseStreet),
    excludedStreetNames,
  };
}

function generatedModuleSource(payload) {
  return (
    '"use strict";\n\n' +
    "// Generated by scripts/analyze-hundred-block-bank.js from official Decatur GIS snapshots.\n" +
    "// Run `npm run generate:hundred-blocks` after refreshing data/source.\n" +
    "(function (root, factory) {\n" +
    "  const data = factory();\n" +
    '  if (typeof module === "object" && module.exports) module.exports = data;\n' +
    "  if (root) root.DFDHundredBlockData = data;\n" +
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
  const allFeatures = loadFeatures();
  const uniqueIds = new Set(
    allFeatures.map(function (feature) {
      return Number((feature.properties || {}).OBJECTID);
    })
  );
  if (uniqueIds.size !== allFeatures.length) {
    throw new Error("Centerline pages contain duplicate or missing OBJECTIDs.");
  }

  const cityPolygons = preparePolygons(
    loadGeoJson(path.join("data", "source", "decatur-city-limits.geojson"))
  );
  const stationPolygons = preparePolygons(
    loadGeoJson(path.join("data", "source", "still-alarm-territories.geojson"))
  );
  const cityFeatures = allFeatures.filter(function (feature) {
    return geometryIntersectsPolygons(feature.geometry, cityPolygons);
  });
  const targetFeaturesByName = featureIndexByName(cityFeatures);
  const rejectionCounts = {
    carrierDirection: 0,
    endpointToken: 0,
    notCityStreet: 0,
    missingRange: 0,
    targetTooFar: 0,
    singleSegment: 0,
    invalidPair: 0,
    axisConflict: 0,
    noStation: 0,
  };
  const observations = collectObservations(
    cityFeatures,
    targetFeaturesByName,
    rejectionCounts
  );
  const groups = intersectionGroups(observations);
  const evidence = buildPairEvidence(groups, stationPolygons, rejectionCounts);
  const questions = buildQuestions(evidence);
  const coverage = buildCoverage(
    allFeatures,
    cityFeatures,
    evidence,
    questions,
    rejectionCounts
  );

  const payload = {
    schemaVersion: 1,
    generatedOn: GENERATED_ON,
    sources: SOURCE_URLS,
    questions,
  };
  if (process.argv.includes("--write")) {
    fs.writeFileSync(
      path.join(ROOT, "hundred-block-data.js"),
      generatedModuleSource(payload),
      "utf8"
    );
    fs.writeFileSync(
      path.join(ROOT, "data", "hundred-block-coverage.json"),
      JSON.stringify(coverage, null, 2) + "\n",
      "utf8"
    );
  }

  console.log(JSON.stringify(coverage.counts, null, 2));
  console.log("Rejections:", JSON.stringify(rejectionCounts));
  if (!process.argv.includes("--write")) {
    console.log("Run with --write to regenerate hundred-block-data.js and coverage JSON.");
  }
}

main();
