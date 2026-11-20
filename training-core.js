"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DFDTrainingCore = api;
  }
})(typeof window !== "undefined" ? window : null, function () {
  const EARTH_RADIUS_FEET = 20902231;
  const DEFAULT_ROUTE_SPACING_FEET = 150;
  const DEFAULT_ROUTE_TOLERANCE_FEET = 350;
  const DEFAULT_ENDPOINT_TOLERANCE_FEET = 900;
  const HUNDRED_BLOCK_NUMBER_CREDIT = [80, 64, 48, 32, 16, 8];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizePoint(point) {
    if (!point) return null;

    const lat =
      typeof point.lat === "function" ? point.lat() : Number(point.lat);
    const lng =
      typeof point.lng === "function" ? point.lng() : Number(point.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function normalizePath(path) {
    if (!Array.isArray(path)) return [];
    return path.map(normalizePoint).filter(Boolean);
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function haversineFeet(aInput, bInput) {
    const a = normalizePoint(aInput);
    const b = normalizePoint(bInput);
    if (!a || !b) return Infinity;

    const lat1 = degreesToRadians(a.lat);
    const lat2 = degreesToRadians(b.lat);
    const deltaLat = lat2 - lat1;
    const deltaLng = degreesToRadians(b.lng - a.lng);

    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLng / 2) ** 2;

    return 2 * EARTH_RADIUS_FEET * Math.asin(Math.sqrt(clamp(h, 0, 1)));
  }

  function pathLengthFeet(pathInput) {
    const path = normalizePath(pathInput);
    let total = 0;
    for (let index = 1; index < path.length; index += 1) {
      total += haversineFeet(path[index - 1], path[index]);
    }
    return total;
  }

  function interpolatePoint(a, b, ratio) {
    const t = clamp(ratio, 0, 1);
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    };
  }

  function resamplePath(pathInput, spacingFeet) {
    const path = normalizePath(pathInput);
    const spacing =
      Number.isFinite(spacingFeet) && spacingFeet > 0
        ? spacingFeet
        : DEFAULT_ROUTE_SPACING_FEET;

    if (path.length < 2) return path.slice();

    const samples = [path[0]];
    let distanceSinceSample = 0;

    for (let index = 1; index < path.length; index += 1) {
      let segmentStart = path[index - 1];
      const segmentEnd = path[index];
      let segmentLength = haversineFeet(segmentStart, segmentEnd);

      if (!Number.isFinite(segmentLength) || segmentLength === 0) continue;

      while (distanceSinceSample + segmentLength >= spacing) {
        const needed = spacing - distanceSinceSample;
        const sample = interpolatePoint(segmentStart, segmentEnd, needed / segmentLength);
        samples.push(sample);
        segmentStart = sample;
        segmentLength = haversineFeet(segmentStart, segmentEnd);
        distanceSinceSample = 0;
        if (segmentLength < 0.01) break;
      }

      distanceSinceSample += segmentLength;
    }

    const finalPoint = path[path.length - 1];
    if (haversineFeet(samples[samples.length - 1], finalPoint) > 1) {
      samples.push(finalPoint);
    }

    return samples;
  }

  function pointToSegmentFeet(pointInput, startInput, endInput) {
    const point = normalizePoint(pointInput);
    const start = normalizePoint(startInput);
    const end = normalizePoint(endInput);
    if (!point || !start || !end) return Infinity;

    const meanLat = degreesToRadians((start.lat + end.lat + point.lat) / 3);
    const feetPerDegreeLat = 364000;
    const feetPerDegreeLng = Math.max(
      1,
      feetPerDegreeLat * Math.cos(meanLat)
    );

    const bx = (end.lng - start.lng) * feetPerDegreeLng;
    const by = (end.lat - start.lat) * feetPerDegreeLat;
    const px = (point.lng - start.lng) * feetPerDegreeLng;
    const py = (point.lat - start.lat) * feetPerDegreeLat;
    const segmentSquared = bx * bx + by * by;

    if (segmentSquared === 0) {
      return Math.sqrt(px * px + py * py);
    }

    const ratio = clamp((px * bx + py * by) / segmentSquared, 0, 1);
    const dx = px - ratio * bx;
    const dy = py - ratio * by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distanceToPathFeet(point, pathInput) {
    const path = normalizePath(pathInput);
    if (!path.length) return Infinity;
    if (path.length === 1) return haversineFeet(point, path[0]);

    let best = Infinity;
    for (let index = 1; index < path.length; index += 1) {
      best = Math.min(
        best,
        pointToSegmentFeet(point, path[index - 1], path[index])
      );
    }
    return best;
  }

  function coverageRatio(samples, comparisonPath, toleranceFeet) {
    if (!samples.length || comparisonPath.length < 2) return 0;
    const matched = samples.reduce(function (count, sample) {
      return (
        count +
        (distanceToPathFeet(sample, comparisonPath) <= toleranceFeet ? 1 : 0)
      );
    }, 0);
    return matched / samples.length;
  }

  function scoreLocationPenalty(distanceFeet) {
    const distance = Math.max(0, Number(distanceFeet) || 0);

    if (distance <= 150) return 1;
    if (distance <= 600) {
      const ratio = clamp((distance - 151) / (600 - 151), 0, 1);
      return Math.round(2 + ratio * (300 - 2));
    }
    if (distance <= 1750) {
      const ratio = clamp((distance - 601) / (1750 - 601), 0, 1);
      return Math.round(301 + ratio * (750 - 301));
    }
    return 1000;
  }

  function scoreRoutePenalty(matchPercent) {
    const match = clamp(Number(matchPercent) || 0, 0, 100);
    return Math.max(1, Math.round(100 - match));
  }

  function normalizeStreetAnswer(value) {
    const directionWords = {
      n: "north",
      north: "north",
      s: "south",
      south: "south",
      e: "east",
      east: "east",
      w: "west",
      west: "west",
      ne: "northeast",
      northeast: "northeast",
      nw: "northwest",
      northwest: "northwest",
      se: "southeast",
      southeast: "southeast",
      sw: "southwest",
      southwest: "southwest",
    };
    const streetSuffixes = new Set([
      "st",
      "street",
      "ave",
      "avenue",
      "blvd",
      "boulevard",
      "cir",
      "circle",
      "ct",
      "court",
      "dr",
      "drive",
      "hwy",
      "highway",
      "ln",
      "lane",
      "pkwy",
      "parkway",
      "pl",
      "place",
      "rd",
      "road",
      "ter",
      "terrace",
      "trl",
      "trail",
      "way",
    ]);
    const words = String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(function (word) {
        return directionWords[word] || word;
      });

    if (words.length > 1 && streetSuffixes.has(words[words.length - 1])) {
      words.pop();
    }
    return words.join(" ");
  }

  function parseHundredBlockAnswer(value) {
    const normalized = String(value || "")
      .toLowerCase()
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(^|\s)([nsew])\.(?=\s|\d|$)/g, "$1$2 ")
      .trim();
    if (!normalized) {
      return { blockNumber: null, direction: null, normalized: "" };
    }

    const words = normalized.split(/\s+/).filter(function (word) {
      return word !== "block" && word !== "blocks";
    });
    const directionMap = {
      n: "north",
      north: "north",
      s: "south",
      south: "south",
      e: "east",
      east: "east",
      w: "west",
      west: "west",
    };
    const numberTokens = words.filter(function (word) {
      // With one number and one direction word, a typo only costs direction credit.
      if (words.length === 2 && /^[a-z]+(?:\.[a-z]+)*\.?$/.test(word)) return false;
      return !Object.hasOwn(directionMap, word);
    });
    const numberToken = numberTokens[0];
    const number = numberTokens.length === 1 &&
      /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(numberToken)
      ? Number(numberToken.replace(/,/g, ""))
      : null;
    const directions = Array.from(
      new Set(
        words
          .filter(function (word) {
            return Object.hasOwn(directionMap, word);
          })
          .map(function (word) {
            return directionMap[word];
          })
      )
    );

    return {
      blockNumber: Number.isSafeInteger(number) ? number : null,
      direction: directions.length === 1 ? directions[0] : null,
      normalized: words.join(" "),
    };
  }

  function normalizeHundredBlockAnswer(value) {
    const parsed = parseHundredBlockAnswer(value);

    if (parsed.blockNumber === null || !parsed.direction) {
      return parsed.normalized;
    }
    return parsed.blockNumber + " " + parsed.direction;
  }

  function valuesForAnswerGroup(group) {
    if (Array.isArray(group)) return group;
    if (typeof group === "string") return [group];
    if (!group || typeof group !== "object") return [];
    return [group.display].concat(group.aliases || []).filter(Boolean);
  }

  function scoreHundredBlockAnswer(response, expectedGroup) {
    const responseParts = parseHundredBlockAnswer(response);
    const expectedParts = valuesForAnswerGroup(expectedGroup)
      .map(parseHundredBlockAnswer)
      .find(function (candidate) {
        return candidate.blockNumber !== null && Boolean(candidate.direction);
      }) || { blockNumber: null, direction: null };
    const responseNumberValid = Boolean(
      Number.isInteger(responseParts.blockNumber) &&
        responseParts.blockNumber >= 0 &&
        responseParts.blockNumber % 100 === 0
    );
    const expectedNumberValid = Boolean(
      Number.isInteger(expectedParts.blockNumber) &&
        expectedParts.blockNumber >= 0 &&
        expectedParts.blockNumber % 100 === 0
    );
    const hasBothNumbers = responseNumberValid && expectedNumberValid;
    const blockDifference = hasBothNumbers
      ? Math.abs(responseParts.blockNumber - expectedParts.blockNumber)
      : null;
    const stepsAway =
      blockDifference === null
        ? null
        : blockDifference === 0
          ? 0
          : Math.ceil(blockDifference / 100);
    const numberCredit =
      stepsAway !== null && stepsAway <= 5
        ? HUNDRED_BLOCK_NUMBER_CREDIT[stepsAway]
        : 0;
    const directionCorrect = Boolean(
      responseParts.direction &&
        expectedParts.direction &&
        responseParts.direction === expectedParts.direction
    );
    const directionCredit = directionCorrect ? 20 : 0;

    return {
      credit: numberCredit + directionCredit,
      numberCredit,
      directionCredit,
      blockDifference,
      stepsAway,
      directionCorrect,
      responseNumberValid,
      expectedNumberValid,
      response: responseParts,
      expected: expectedParts,
    };
  }

  function scoreHundredBlockPenalty(creditPercent) {
    const credit = clamp(Number(creditPercent) || 0, 0, 100);
    return Math.max(1, Math.round(100 - credit));
  }

  function evaluateHundredBlockPair(responsesInput, answerGroupsInput) {
    const responses = Array.isArray(responsesInput)
      ? responsesInput.slice(0, 2)
      : [];
    const answerGroups = Array.isArray(answerGroupsInput)
      ? answerGroupsInput.slice(0, 2)
      : [];
    while (responses.length < 2) responses.push("");
    while (answerGroups.length < 2) answerGroups.push([]);

    const assignments = [
      [0, 1],
      [1, 0],
    ];
    let best = null;

    assignments.forEach(function (assignment) {
      const inputScores = responses.map(function (response, index) {
        return scoreHundredBlockAnswer(
          response,
          answerGroups[assignment[index]]
        );
      });
      const creditPercent =
        inputScores.reduce(function (total, score) {
          return total + score.credit;
        }, 0) / 2;
      const numberCredit =
        inputScores.reduce(function (total, score) {
          return total + score.numberCredit;
        }, 0) / 2;
      const directionCredit =
        inputScores.reduce(function (total, score) {
          return total + score.directionCredit;
        }, 0) / 2;
      const totalBlockDifference = inputScores.reduce(function (total, score) {
        return total +
          (score.blockDifference === null
            ? Number.MAX_SAFE_INTEGER
            : score.blockDifference);
      }, 0);

      if (
        !best ||
        numberCredit > best.numberCredit ||
        (numberCredit === best.numberCredit &&
          directionCredit > best.directionCredit) ||
        (numberCredit === best.numberCredit &&
          directionCredit === best.directionCredit &&
          totalBlockDifference < best.totalBlockDifference)
      ) {
        best = {
          creditPercent,
          numberCredit,
          directionCredit,
          inputScores,
          assignment,
          totalBlockDifference,
        };
      }
    });

    best.penalty = scoreHundredBlockPenalty(best.creditPercent);
    best.correctCount = best.inputScores.filter(function (score) {
      return score.credit === 100;
    }).length;
    best.total = 2;
    best.inputMatches = best.inputScores.map(function (score) {
      return score.credit === 100;
    });
    best.matchedAnswerIndexes = best.assignment.slice();
    return best;
  }

  function evaluateUnorderedPair(responsesInput, answerGroupsInput, normalizer) {
    const normalize =
      typeof normalizer === "function" ? normalizer : normalizeStreetAnswer;
    const responses = Array.isArray(responsesInput)
      ? responsesInput.slice(0, 2)
      : [];
    const answerGroups = Array.isArray(answerGroupsInput)
      ? answerGroupsInput.slice(0, 2)
      : [];
    while (responses.length < 2) responses.push("");
    while (answerGroups.length < 2) answerGroups.push([]);

    const normalizedResponses = responses.map(normalize);
    const normalizedGroups = answerGroups.map(function (group) {
      return new Set(valuesForAnswerGroup(group).map(normalize).filter(Boolean));
    });
    const assignments = [
      [0, 1],
      [1, 0],
    ];
    let best = null;

    assignments.forEach(function (assignment) {
      const inputMatches = normalizedResponses.map(function (response, index) {
        return Boolean(
          response && normalizedGroups[assignment[index]].has(response)
        );
      });
      const correctCount = inputMatches.filter(Boolean).length;
      if (!best || correctCount > best.correctCount) {
        best = {
          correctCount,
          total: 2,
          inputMatches,
          matchedAnswerIndexes: inputMatches.map(function (matched, index) {
            return matched ? assignment[index] : -1;
          }),
        };
      }
    });

    return best;
  }

  function scoreKnowledgePenalty(correctCount) {
    const correct = clamp(Math.floor(Number(correctCount) || 0), 0, 2);
    if (correct === 2) return 1;
    if (correct === 1) return 50;
    return 100;
  }

  function compareRouteOrder(referenceSamples, userSamples, toleranceFeet) {
    function headings(points) {
      return points.map(function (point, index) {
        const before = points[Math.max(0, index - 1)];
        const after = points[Math.min(points.length - 1, index + 1)];
        const x = (after.lng - before.lng) * Math.cos(degreesToRadians(point.lat));
        const y = after.lat - before.lat;
        const length = Math.hypot(x, y);
        return length ? [x / length, y / length] : [0, 0];
      });
    }

    // Longest ordered sequence of nearby samples. A matched point is used once.
    const referenceHeadings = headings(referenceSamples);
    const userHeadings = headings(userSamples);
    const columns = referenceSamples.length + 1;
    const matches = new Uint16Array((userSamples.length + 1) * columns);
    for (let row = 1; row <= userSamples.length; row += 1) {
      const [userX, userY] = userHeadings[row - 1];
      for (let column = 1; column < columns; column += 1) {
        const index = row * columns + column;
        const [referenceX, referenceY] = referenceHeadings[column - 1];
        const sameDirection = userX * referenceX + userY * referenceY >= -0.25;
        const nearby = sameDirection &&
          haversineFeet(userSamples[row - 1], referenceSamples[column - 1]) <= toleranceFeet;
        matches[index] = Math.max(
          matches[index - 1],
          matches[index - columns],
          nearby ? matches[index - columns - 1] + 1 : 0
        );
      }
    }

    const matched = new Set();
    let row = userSamples.length;
    let column = referenceSamples.length;
    while (row > 0 && column > 0) {
      const index = row * columns + column;
      if (matches[index] === matches[index - 1]) {
        column -= 1;
      } else if (matches[index] === matches[index - columns]) {
        row -= 1;
      } else {
        matched.add(row - 1);
        row -= 1;
        column -= 1;
      }
    }

    // Skip isolated unmatched samples caused by interpolation near a turn.
    const departureIndex = userSamples.findIndex(function (_point, index) {
      return index + 1 < userSamples.length &&
        !matched.has(index) && !matched.has(index + 1);
    });
    const rejoinIndex = departureIndex < 0 ? -1 : userSamples.findIndex(function (_point, index) {
      return index > departureIndex && matched.has(index);
    });
    return {
      ratio: (2 * matches[matches.length - 1]) / (referenceSamples.length + userSamples.length),
      departure: departureIndex < 0 ? null : userSamples[departureIndex],
      rejoin: rejoinIndex < 0 ? null : userSamples[rejoinIndex],
    };
  }

  function computeRouteMatch(referenceInput, userInput, options) {
    const referencePath = normalizePath(referenceInput);
    const userPath = normalizePath(userInput);
    const settings = options || {};
    const spacingFeet =
      settings.spacingFeet || DEFAULT_ROUTE_SPACING_FEET;
    const toleranceFeet =
      settings.toleranceFeet || DEFAULT_ROUTE_TOLERANCE_FEET;
    const endpointToleranceFeet =
      settings.endpointToleranceFeet || DEFAULT_ENDPOINT_TOLERANCE_FEET;

    if (referencePath.length < 2 || userPath.length < 2) {
      return {
        matchPercent: 0,
        referenceCoverage: 0,
        userCoverage: 0,
        lengthRatio: 0,
        endpointScore: 0,
        directionFactor: 0,
      };
    }

    const referenceSamples = resamplePath(referencePath, spacingFeet);
    const userSamples = resamplePath(userPath, spacingFeet);
    const referenceCoverage = coverageRatio(
      referenceSamples,
      userPath,
      toleranceFeet
    );
    const userCoverage = coverageRatio(
      userSamples,
      referencePath,
      toleranceFeet
    );
    const coverageF1 =
      referenceCoverage + userCoverage === 0
        ? 0
        : (2 * referenceCoverage * userCoverage) /
          (referenceCoverage + userCoverage);

    const referenceLength = pathLengthFeet(referencePath);
    const userLength = pathLengthFeet(userPath);
    if (referenceLength < 1 || userLength < 1) {
      return {
        matchPercent: 0,
        referenceCoverage: 0,
        userCoverage: 0,
        lengthRatio: 0,
        endpointScore: 0,
        directionFactor: 0,
        referenceLength,
        userLength,
      };
    }
    const lengthRatio =
      Math.min(referenceLength, userLength) /
      Math.max(referenceLength, userLength);

    const forwardEndpointDistance =
      haversineFeet(userPath[0], referencePath[0]) +
      haversineFeet(
        userPath[userPath.length - 1],
        referencePath[referencePath.length - 1]
      );
    const reverseEndpointDistance =
      haversineFeet(userPath[0], referencePath[referencePath.length - 1]) +
      haversineFeet(
        userPath[userPath.length - 1],
        referencePath[0]
      );

    const startFit =
      1 -
      clamp(
        haversineFeet(userPath[0], referencePath[0]) /
          endpointToleranceFeet,
        0,
        1
      );
    const endFit =
      1 -
      clamp(
        haversineFeet(
          userPath[userPath.length - 1],
          referencePath[referencePath.length - 1]
        ) / endpointToleranceFeet,
        0,
        1
      );
    const endpointScore = (startFit + endFit) / 2;
    const directionFactor =
      forwardEndpointDistance <= reverseEndpointDistance ? 1 : 0.55;

    const orderSpacing = Math.max(spacingFeet, Math.max(referenceLength, userLength) / 350);
    const order = compareRouteOrder(
      resamplePath(referencePath, orderSpacing),
      resamplePath(userPath, orderSpacing),
      toleranceFeet
    );
    const weighted =
      coverageF1 * 0.7 + lengthRatio * 0.15 + endpointScore * 0.15;
    const orderFactor = coverageF1 > 0 ? Math.min(1, order.ratio / coverageF1) : 1;
    const matchPercent = clamp(weighted * directionFactor * orderFactor * 100, 0, 100);

    return {
      matchPercent,
      referenceCoverage,
      userCoverage,
      lengthRatio,
      endpointScore,
      directionFactor,
      referenceLength,
      userLength,
      departure: order.departure,
      rejoin: order.rejoin,
    };
  }

  function computeBestRouteMatch(referenceCandidatesInput, userInput, options) {
    const referenceCandidates = Array.isArray(referenceCandidatesInput)
      ? referenceCandidatesInput
      : [];
    const candidateResults = referenceCandidates.map(function (referencePath) {
      return computeRouteMatch(referencePath, userInput, options);
    });

    let selectedIndex = -1;
    for (let index = 0; index < candidateResults.length; index += 1) {
      if (
        selectedIndex === -1 ||
        candidateResults[index].matchPercent >
          candidateResults[selectedIndex].matchPercent
      ) {
        selectedIndex = index;
      }
    }

    return {
      selectedIndex,
      selectedResult:
        selectedIndex === -1 ? null : candidateResults[selectedIndex],
      candidateResults,
    };
  }

  return {
    clamp,
    normalizePoint,
    normalizePath,
    haversineFeet,
    pathLengthFeet,
    resamplePath,
    pointToSegmentFeet,
    distanceToPathFeet,
    scoreLocationPenalty,
    scoreRoutePenalty,
    normalizeStreetAnswer,
    parseHundredBlockAnswer,
    normalizeHundredBlockAnswer,
    evaluateUnorderedPair,
    scoreKnowledgePenalty,
    scoreHundredBlockAnswer,
    scoreHundredBlockPenalty,
    evaluateHundredBlockPair,
    computeRouteMatch,
    computeBestRouteMatch,
  };
});
