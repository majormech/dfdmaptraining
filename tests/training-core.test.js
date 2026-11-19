"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../training-core.js");

const ORIGIN = { lat: 39.8425, lng: -88.9531 };

function pointOffset(origin, eastFeet, northFeet) {
  const feetPerDegreeLat = 364000;
  const feetPerDegreeLng =
    feetPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + northFeet / feetPerDegreeLat,
    lng: origin.lng + eastFeet / feetPerDegreeLng,
  };
}

function straightRoute(lengthFeet, stepFeet) {
  const points = [];
  for (let distance = 0; distance < lengthFeet; distance += stepFeet) {
    points.push(pointOffset(ORIGIN, distance, 0));
  }
  points.push(pointOffset(ORIGIN, lengthFeet, 0));
  return points;
}

test("location penalty preserves the documented thresholds", function () {
  assert.equal(Core.scoreLocationPenalty(0), 1);
  assert.equal(Core.scoreLocationPenalty(150), 1);
  assert.equal(Core.scoreLocationPenalty(151), 2);
  assert.equal(Core.scoreLocationPenalty(600), 300);
  assert.equal(Core.scoreLocationPenalty(601), 301);
  assert.equal(Core.scoreLocationPenalty(1750), 750);
  assert.equal(Core.scoreLocationPenalty(1750.01), 1000);
});

test("route penalty is lower for a stronger match", function () {
  assert.equal(Core.scoreRoutePenalty(100), 1);
  assert.equal(Core.scoreRoutePenalty(80), 20);
  assert.equal(Core.scoreRoutePenalty(0), 100);
});

test("street answers normalize direction, punctuation, and suffix variants", function () {
  assert.equal(Core.normalizeStreetAnswer("N. Union Ave."), "north union");
  assert.equal(Core.normalizeStreetAnswer("North Union Street"), "north union");
  assert.equal(Core.normalizeStreetAnswer("CHURCH ST"), "church");
  assert.equal(
    Core.normalizeStreetAnswer("S Martin Luther King Jr. Dr"),
    "south martin luther king jr"
  );
});

test("hundred-block answers normalize number and direction order", function () {
  assert.equal(Core.normalizeHundredBlockAnswer("1000 N block"), "1000 north");
  assert.equal(Core.normalizeHundredBlockAnswer("N 1000"), "1000 north");
  assert.equal(
    Core.normalizeHundredBlockAnswer("1000 north blocks"),
    "1000 north"
  );
  assert.notEqual(
    Core.normalizeHundredBlockAnswer("1000 S"),
    Core.normalizeHundredBlockAnswer("1000 N")
  );
});

test("hundred-block answers expose number and direction independently", function () {
  assert.deepEqual(Core.parseHundredBlockAnswer("N 1000 block"), {
    blockNumber: 1000,
    direction: "north",
    normalized: "n 1000",
  });
  assert.deepEqual(Core.parseHundredBlockAnswer("1000"), {
    blockNumber: 1000,
    direction: null,
    normalized: "1000",
  });
  assert.deepEqual(Core.parseHundredBlockAnswer("south"), {
    blockNumber: null,
    direction: "south",
    normalized: "south",
  });
});

test("hundred-block scoring weights number accuracy at 80 and direction at 20", function () {
  const expected = {
    display: "1000 N block",
    aliases: ["1000 N", "N 1000"],
  };

  assert.deepEqual(
    Core.scoreHundredBlockAnswer("1000 N", expected),
    {
      credit: 100,
      numberCredit: 80,
      directionCredit: 20,
      blockDifference: 0,
      stepsAway: 0,
      directionCorrect: true,
      responseNumberValid: true,
      expectedNumberValid: true,
      response: {
        blockNumber: 1000,
        direction: "north",
        normalized: "1000 n",
      },
      expected: {
        blockNumber: 1000,
        direction: "north",
        normalized: "1000 n",
      },
    }
  );
  assert.equal(Core.scoreHundredBlockAnswer("1000 S", expected).credit, 80);
  assert.equal(Core.scoreHundredBlockAnswer("1000", expected).credit, 80);
  assert.equal(Core.scoreHundredBlockAnswer("N", expected).credit, 20);
});

test("hundred-block number credit staggers through plus or minus 500", function () {
  const expected = { display: "1000 N block", aliases: [] };
  const expectedCredits = new Map([
    [1000, 80],
    [900, 64],
    [1100, 64],
    [800, 48],
    [1200, 48],
    [700, 32],
    [1300, 32],
    [600, 16],
    [1400, 16],
    [500, 8],
    [1500, 8],
    [400, 0],
    [1600, 0],
  ]);

  expectedCredits.forEach(function (numberCredit, responseNumber) {
    const result = Core.scoreHundredBlockAnswer(
      responseNumber + " N",
      expected
    );
    assert.equal(result.numberCredit, numberCredit, String(responseNumber));
    assert.equal(result.directionCredit, 20, String(responseNumber));
  });
});

test("hundred-block pair scoring is unordered and converts credit to penalty", function () {
  const expected = [
    { display: "1000 N block", aliases: ["1000 N"] },
    { display: "1100 N block", aliases: ["1100 N"] },
  ];
  const exact = Core.evaluateHundredBlockPair(
    ["N 1100", "1000 north"],
    expected
  );
  assert.equal(exact.creditPercent, 100);
  assert.equal(exact.numberCredit, 80);
  assert.equal(exact.directionCredit, 20);
  assert.equal(exact.penalty, 1);
  assert.deepEqual(exact.assignment, [1, 0]);

  const numbersOnly = Core.evaluateHundredBlockPair(
    ["1000", "1100"],
    expected
  );
  assert.equal(numbersOnly.creditPercent, 80);
  assert.equal(numbersOnly.penalty, 20);

  const directionsOnly = Core.evaluateHundredBlockPair(["N", "N"], expected);
  assert.equal(directionsOnly.creditPercent, 20);
  assert.equal(directionsOnly.penalty, 80);
});

test("hundred-block pair scoring chooses the highest-credit assignment", function () {
  const expected = [
    { display: "1000 N block", aliases: [] },
    { display: "1100 N block", aliases: [] },
  ];
  const evaluation = Core.evaluateHundredBlockPair(
    ["1200 N", "900 N"],
    expected
  );

  assert.deepEqual(evaluation.assignment, [1, 0]);
  assert.equal(evaluation.creditPercent, 84);
  assert.equal(evaluation.numberCredit, 64);
  assert.equal(evaluation.directionCredit, 20);
  assert.equal(evaluation.penalty, 16);
});

test("hundred-block scoring gives no number credit beyond 500", function () {
  const expected = { display: "1000 N block", aliases: [] };
  const beyond = Core.scoreHundredBlockAnswer("1600 N", expected);
  const nonHundred = Core.scoreHundredBlockAnswer("1050 N", expected);
  const malformed = Core.scoreHundredBlockAnswer("not a block", expected);

  assert.equal(beyond.numberCredit, 0);
  assert.equal(beyond.directionCredit, 20);
  assert.equal(beyond.credit, 20);
  assert.equal(nonHundred.numberCredit, 0);
  assert.equal(nonHundred.directionCredit, 20);
  assert.equal(malformed.credit, 0);
  assert.equal(Core.scoreHundredBlockPenalty(100), 1);
  assert.equal(Core.scoreHundredBlockPenalty(84), 16);
  assert.equal(Core.scoreHundredBlockPenalty(20), 80);
  assert.equal(Core.scoreHundredBlockPenalty(0), 100);
});

test("hundred-block parser accepts compact forms but rejects ambiguity", function () {
  assert.equal(Core.normalizeHundredBlockAnswer("1000N"), "1000 north");
  assert.equal(Core.normalizeHundredBlockAnswer("N1000"), "1000 north");
  assert.equal(Core.normalizeHundredBlockAnswer("1,000 N"), "1000 north");
  assert.equal(
    Core.parseHundredBlockAnswer("1000 1100 N").blockNumber,
    null
  );
  assert.equal(Core.parseHundredBlockAnswer("1000 N S").direction, null);
});

test("malformed block numbers cannot earn number credit", function () {
  const expected = { display: "1000 N block", aliases: [] };
  for (const response of ["-1000 N", "10,00 N", "1000 N garbage", "1.000 N"]) {
    const score = Core.scoreHundredBlockAnswer(response, expected);
    assert.equal(score.numberCredit, 0, response);
    assert.equal(score.directionCredit, 20, response);
  }
});

test("hundred-block pair scoring favors exact numbers before directions", function () {
  const expected = [
    { display: "1000 N block", aliases: [] },
    { display: "1100 S block", aliases: [] },
  ];
  const mixedDirections = Core.evaluateHundredBlockPair(
    ["1000 S", "1100 N"],
    expected
  );

  assert.deepEqual(mixedDirections.assignment, [0, 1]);
  assert.equal(mixedDirections.numberCredit, 80);
  assert.equal(mixedDirections.directionCredit, 0);
  assert.equal(mixedDirections.creditPercent, 80);
  assert.equal(mixedDirections.penalty, 20);
});

test("duplicate hundred-block responses receive ordinary proximity credit", function () {
  const evaluation = Core.evaluateHundredBlockPair(
    ["1000 N", "1000 N"],
    [
      { display: "1000 N block", aliases: [] },
      { display: "1100 N block", aliases: [] },
    ]
  );

  assert.equal(evaluation.creditPercent, 92);
  assert.equal(evaluation.numberCredit, 72);
  assert.equal(evaluation.directionCredit, 20);
  assert.equal(evaluation.penalty, 8);
});

test("knowledge pairs accept swapped answers and explicit aliases", function () {
  const answers = [
    { display: "North Union Street", aliases: ["Union"] },
    { display: "North Church Street", aliases: ["Church"] },
  ];
  const result = Core.evaluateUnorderedPair(
    ["Church St", "N. Union Ave."],
    answers,
    Core.normalizeStreetAnswer
  );

  assert.equal(result.correctCount, 2);
  assert.deepEqual(result.inputMatches, [true, true]);
  assert.deepEqual(result.matchedAnswerIndexes, [1, 0]);
});

test("a duplicate knowledge response cannot satisfy both answers", function () {
  const answers = [
    { display: "North Union Street", aliases: ["Union"] },
    { display: "North Church Street", aliases: ["Church"] },
  ];
  const result = Core.evaluateUnorderedPair(
    ["Union", "Union"],
    answers,
    Core.normalizeStreetAnswer
  );

  assert.equal(result.correctCount, 1);
  assert.equal(result.inputMatches.filter(Boolean).length, 1);
});

test("knowledge scoring uses the app's lower-is-better penalty scale", function () {
  assert.equal(Core.scoreKnowledgePenalty(2), 1);
  assert.equal(Core.scoreKnowledgePenalty(1), 50);
  assert.equal(Core.scoreKnowledgePenalty(0), 100);
  assert.equal(Core.scoreKnowledgePenalty(-1), 100);
});

test("point-to-segment distance measures the drawn line, not vertices", function () {
  const start = pointOffset(ORIGIN, 0, 0);
  const end = pointOffset(ORIGIN, 2000, 0);
  const point = pointOffset(ORIGIN, 1000, 100);
  const distance = Core.pointToSegmentFeet(point, start, end);
  assert.ok(Math.abs(distance - 100) < 3);
});

test("identical routes score approximately 100 percent", function () {
  const route = straightRoute(4000, 400);
  const result = Core.computeRouteMatch(route, route);
  assert.ok(result.matchPercent >= 99);
});

test("route score is insensitive to sparse click density", function () {
  const reference = straightRoute(4000, 100);
  const sparseUserRoute = straightRoute(4000, 2000);
  const result = Core.computeRouteMatch(reference, sparseUserRoute);
  assert.ok(result.matchPercent >= 98);
});

test("a reversed route is strongly penalized", function () {
  const route = straightRoute(4000, 250);
  const reversed = route.slice().reverse();
  const result = Core.computeRouteMatch(route, reversed);
  assert.ok(result.matchPercent <= 56);
  assert.equal(result.directionFactor, 0.55);
});

test("an intermediate wrong-way loop loses credit even with identical endpoints", function () {
  const start = { lat: 39.84, lng: -88.95 };
  const east = { lat: 39.84, lng: -88.94 };
  const northeast = { lat: 39.85, lng: -88.94 };
  const north = { lat: 39.85, lng: -88.95 };
  const finish = { lat: 39.851, lng: -88.95 };
  const reference = [start, east, northeast, north, start, finish];
  const reversedLoop = [start, north, northeast, east, start, finish];
  const exact = Core.computeRouteMatch(reference, reference);
  assert.equal(exact.matchPercent, 100);
  assert.equal(exact.departure, null);
  const result = Core.computeRouteMatch(reference, reversedLoop);
  assert.ok(result.matchPercent < 75);
  assert.equal(result.referenceCoverage, 1);
  assert.ok(result.departure);
  assert.ok(result.rejoin);

  // Even a loop that fits inside the usual proximity tolerance has a direction.
  const compact = (point) => ({
    lat: start.lat + (point.lat - start.lat) * 0.05,
    lng: start.lng + (point.lng - start.lng) * 0.05,
  });
  const compactResult = Core.computeRouteMatch(reference.map(compact), reversedLoop.map(compact));
  assert.equal(compactResult.referenceCoverage, 1);
  assert.ok(compactResult.matchPercent < 100);
});

test("a large detour reduces route match", function () {
  const reference = straightRoute(4000, 250);
  const detour = [
    pointOffset(ORIGIN, 0, 0),
    pointOffset(ORIGIN, 1000, 0),
    pointOffset(ORIGIN, 1000, 2500),
    pointOffset(ORIGIN, 3000, 2500),
    pointOffset(ORIGIN, 3000, 0),
    pointOffset(ORIGIN, 4000, 0),
  ];
  const result = Core.computeRouteMatch(reference, detour);
  assert.ok(result.matchPercent < 65);
  assert.ok(result.userCoverage < 0.7);
});

test("a distant parallel route scores much lower than a nearby route", function () {
  const reference = straightRoute(4000, 250);
  const near = reference.map(function (point) {
    return pointOffset(point, 0, 100);
  });
  const far = reference.map(function (point) {
    return pointOffset(point, 0, 1100);
  });

  const nearScore = Core.computeRouteMatch(reference, near).matchPercent;
  const farScore = Core.computeRouteMatch(reference, far).matchPercent;

  assert.ok(nearScore > 90);
  assert.ok(farScore < 25);
});

test("the best acceptable route is selected from all candidates", function () {
  const westToEast = straightRoute(4000, 250);
  const northbound = westToEast.map(function (point, index) {
    return pointOffset(ORIGIN, 0, index * 250);
  });

  const result = Core.computeBestRouteMatch(
    [northbound, westToEast],
    westToEast
  );

  assert.equal(result.selectedIndex, 1);
  assert.equal(result.candidateResults.length, 2);
  assert.equal(result.selectedResult, result.candidateResults[1]);
  assert.ok(
    result.candidateResults[1].matchPercent >
      result.candidateResults[0].matchPercent
  );
});

test("equal candidate scores deterministically select the first route", function () {
  const route = straightRoute(3000, 250);
  const result = Core.computeBestRouteMatch(
    [route, route.slice()],
    route
  );

  assert.equal(result.candidateResults[0].matchPercent, 100);
  assert.equal(
    result.candidateResults[0].matchPercent,
    result.candidateResults[1].matchPercent
  );
  assert.equal(result.selectedIndex, 0);
  assert.equal(result.selectedResult, result.candidateResults[0]);
});

test("no acceptable route candidates returns an explicit empty result", function () {
  const route = straightRoute(3000, 250);

  assert.deepEqual(Core.computeBestRouteMatch([], route), {
    selectedIndex: -1,
    selectedResult: null,
    candidateResults: [],
  });
  assert.deepEqual(Core.computeBestRouteMatch(null, route), {
    selectedIndex: -1,
    selectedResult: null,
    candidateResults: [],
  });
});

test("one acceptable route has the same result as the single-route API", function () {
  const reference = straightRoute(4000, 200);
  const userRoute = reference.map(function (point) {
    return pointOffset(point, 0, 75);
  });
  const singleResult = Core.computeRouteMatch(reference, userRoute);
  const multiResult = Core.computeBestRouteMatch([reference], userRoute);

  assert.equal(multiResult.selectedIndex, 0);
  assert.deepEqual(multiResult.selectedResult, singleResult);
  assert.deepEqual(multiResult.candidateResults, [singleResult]);
});

test("candidate comparison preserves direction and detour penalties", function () {
  const directRoute = straightRoute(4000, 250);
  const reversedRoute = directRoute.slice().reverse();
  const detourRoute = [
    pointOffset(ORIGIN, 0, 0),
    pointOffset(ORIGIN, 1000, 0),
    pointOffset(ORIGIN, 1000, 2500),
    pointOffset(ORIGIN, 3000, 2500),
    pointOffset(ORIGIN, 3000, 0),
    pointOffset(ORIGIN, 4000, 0),
  ];

  const result = Core.computeBestRouteMatch(
    [reversedRoute, detourRoute, directRoute],
    directRoute
  );

  assert.equal(result.selectedIndex, 2);
  assert.equal(result.candidateResults[0].directionFactor, 0.55);
  assert.ok(result.candidateResults[0].matchPercent <= 56);
  assert.ok(result.candidateResults[1].matchPercent < 65);
  assert.ok(result.candidateResults[2].matchPercent >= 99);
});

test("degenerate routes return zero without throwing", function () {
  const route = straightRoute(1000, 250);
  assert.equal(Core.computeRouteMatch([], route).matchPercent, 0);
  assert.equal(Core.computeRouteMatch([ORIGIN], route).matchPercent, 0);
  assert.equal(
    Core.computeRouteMatch(route, [ORIGIN, ORIGIN]).matchPercent,
    0
  );
});

test("resampling produces bounded, evenly spaced route points", function () {
  const route = straightRoute(3000, 1500);
  const samples = Core.resamplePath(route, 150);
  assert.ok(samples.length >= 20);
  assert.ok(samples.length <= 22);

  for (let index = 1; index < samples.length - 1; index += 1) {
    const segment = Core.haversineFeet(samples[index - 1], samples[index]);
    assert.ok(Math.abs(segment - 150) < 3);
  }
});
