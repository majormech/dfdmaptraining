"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const HundredBlockData = require("../hundred-block-data.js");
const KnowledgeData = require("../knowledge-data.js");
const Coverage = require("../data/hundred-block-coverage.json");
const Core = require("../training-core.js");

const EXPECTED_VERIFIED_DATE = "2026-08-26";
const VALID_STATIONS = new Set(["1", "2", "3", "4", "5", "6", "7"]);
const OFFICIAL_SOURCE_HOSTS = new Set([
  "maps.decaturil.gov",
  "decaturil.gov",
]);

test("knowledge data exports through CommonJS and the browser globals", function () {
  assert.equal(KnowledgeData.schemaVersion, 2);
  assert.equal(HundredBlockData.schemaVersion, 1);

  const browserContext = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, "..", "hundred-block-data.js"),
      "utf8"
    ),
    browserContext
  );
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "..", "knowledge-data.js"), "utf8"),
    browserContext
  );
  assert.ok(browserContext.window.DFDHundredBlockData);
  assert.ok(browserContext.window.DFDKnowledgeData);
  assert.equal(
    browserContext.window.DFDKnowledgeData.hundredBlockQuestions.length,
    KnowledgeData.hundredBlockQuestions.length
  );
});

function allQuestions() {
  return KnowledgeData.crossStreetQuestions.concat(
    KnowledgeData.hundredBlockQuestions
  );
}

function validateStationIds(question) {
  assert.equal(Array.isArray(question.stationIds), true);
  assert.ok(question.stationIds.length > 0, "Missing station for " + question.id);
  assert.deepEqual(
    question.stationIds,
    Array.from(new Set(question.stationIds)).sort(),
    "Stations must be unique and sorted for " + question.id
  );
  question.stationIds.forEach(function (stationId) {
    assert.equal(
      VALID_STATIONS.has(stationId),
      true,
      "Invalid station " + stationId + " for " + question.id
    );
  });
}

function validateQuestion(question) {
  assert.equal(typeof question.id, "string");
  assert.notEqual(question.id.trim(), "");
  assert.equal(typeof question.prompt, "string");
  assert.notEqual(question.prompt.trim(), "");
  assert.equal(question.verifiedOn, EXPECTED_VERIFIED_DATE);
  validateStationIds(question);
  assert.equal(Array.isArray(question.answers), true);
  assert.equal(question.answers.length, 2);

  question.answers.forEach(function (answer) {
    assert.equal(typeof answer.display, "string");
    assert.notEqual(answer.display.trim(), "");
    assert.equal(Array.isArray(answer.aliases), true);
    assert.ok(answer.aliases.length > 0);
    answer.aliases.forEach(function (alias) {
      assert.equal(typeof alias, "string");
      assert.notEqual(alias.trim(), "");
    });
  });

  assert.equal(Array.isArray(question.sourceUrls), true);
  assert.ok(question.sourceUrls.length > 0);
  question.sourceUrls.forEach(function (sourceUrl) {
    const parsed = new URL(sourceUrl);
    assert.equal(parsed.protocol, "https:");
    assert.equal(OFFICIAL_SOURCE_HOSTS.has(parsed.hostname), true);
  });
}

test("generated citywide coverage is complete, deterministic, and auditable", function () {
  assert.equal(Coverage.generatedOn, EXPECTED_VERIFIED_DATE);
  assert.equal(Coverage.counts.sourceSegments, 9545);
  assert.equal(Coverage.counts.cityIntersectingSegments, 5370);
  assert.equal(Coverage.counts.officialCityStreetNames, 1308);
  assert.equal(Coverage.counts.includedBoundaryStreetNames, 507);
  assert.equal(Coverage.counts.excludedStreetNames, 801);
  assert.equal(Coverage.counts.verifiedIntersectionPairs, 1682);
  assert.equal(Coverage.counts.streetBlockPairVariants, 575);
  assert.equal(Coverage.counts.questionRecords, 609);
  assert.equal(
    Coverage.counts.includedBoundaryStreetNames +
      Coverage.counts.excludedStreetNames,
    Coverage.counts.officialCityStreetNames
  );
  assert.equal(Coverage.includedStreetNames.length, 507);
  assert.equal(Coverage.excludedStreetNames.length, 801);
  assert.equal(HundredBlockData.questions.length, Coverage.counts.questionRecords);
  assert.equal(
    KnowledgeData.hundredBlockQuestions.length,
    Coverage.counts.questionRecords
  );
  assert.deepEqual(
    Coverage.sourceSnapshots.map(function (snapshot) {
      return snapshot.featureCount;
    }),
    [2000, 2000, 2000, 2000, 1545, 5, 7]
  );
  Coverage.sourceSnapshots.forEach(function (snapshot) {
    const contents = fs.readFileSync(path.resolve(__dirname, "..", snapshot.file));
    assert.equal(contents.length, snapshot.bytes);
    assert.equal(
      crypto.createHash("sha256").update(contents).digest("hex"),
      snapshot.sha256,
      "Source snapshot changed without regenerating the bank: " + snapshot.file
    );
  });
});

test("every station has a substantial 100-block question pool", function () {
  Object.entries(Coverage.counts.stationQuestionCounts).forEach(function (entry) {
    const stationId = entry[0];
    const expectedCount = entry[1];
    const actual = KnowledgeData.hundredBlockQuestions.filter(function (question) {
      return question.stationIds.includes(stationId);
    });
    assert.ok(actual.length >= 10, "Station " + stationId + " is undersupplied");
    assert.equal(actual.length, expectedCount);
  });
});

test("knowledge question ids are unique across both banks", function () {
  const ids = allQuestions().map(function (question) {
    return question.id;
  });
  assert.equal(new Set(ids).size, ids.length);
  const hundredBlockPrompts = KnowledgeData.hundredBlockQuestions.map(function (question) {
    return question.prompt;
  });
  assert.equal(
    new Set(hundredBlockPrompts).size,
    hundredBlockPrompts.length,
    "No prompt may have two different correct pairs"
  );
});

test("every question has two answer groups, station scope, and official sources", function () {
  allQuestions().forEach(validateQuestion);

  Object.values(KnowledgeData.sources).forEach(function (source) {
    assert.equal(typeof source.title, "string");
    assert.notEqual(source.title.trim(), "");
    const parsed = new URL(source.url);
    assert.equal(parsed.protocol, "https:");
    assert.equal(OFFICIAL_SOURCE_HOSTS.has(parsed.hostname), true);
  });

  assert.equal(
    KnowledgeData.sources.stationTerritories.url,
    "https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0"
  );
});

test("all questions include valid coordinates", function () {
  allQuestions().forEach(function (question) {
    assert.equal(Number.isFinite(question.coordinates.lat), true);
    assert.equal(Number.isFinite(question.coordinates.lng), true);
    assert.ok(question.coordinates.lat >= 39.7);
    assert.ok(question.coordinates.lat <= 40.0);
    assert.ok(question.coordinates.lng >= -89.1);
    assert.ok(question.coordinates.lng <= -88.8);
  });
});

test("generated questions retain source evidence and immutable metadata", function () {
  KnowledgeData.hundredBlockQuestions.forEach(function (question) {
    assert.equal(typeof question.streetName, "string");
    assert.equal(Array.isArray(question.verifiedUsing), true);
    assert.ok(question.verifiedUsing.length > 0);
    assert.equal(Number.isInteger(question.witnessCount), true);
    assert.ok(question.witnessCount > 0);
    assert.equal(Array.isArray(question.sourceFeatureIds), true);
    assert.ok(question.sourceFeatureIds.length >= 2);
    assert.equal(new Set(question.sourceFeatureIds).size, question.sourceFeatureIds.length);
    if (question.contextual) {
      assert.match(question.prompt, / near /);
    }
  });
  assert.equal(Object.isFrozen(HundredBlockData), true);
  assert.equal(Object.isFrozen(KnowledgeData.hundredBlockQuestions), true);
});

test("answer groups stay distinct after user-input normalization", function () {
  [
    [KnowledgeData.crossStreetQuestions, Core.normalizeStreetAnswer],
    [KnowledgeData.hundredBlockQuestions, Core.normalizeHundredBlockAnswer],
  ].forEach(function (entry) {
    const questions = entry[0];
    const normalize = entry[1];
    questions.forEach(function (question) {
      const normalizedGroups = question.answers.map(function (answer) {
        return new Set(
          [answer.display].concat(answer.aliases).map(normalize).filter(Boolean)
        );
      });
      const overlap = Array.from(normalizedGroups[0]).filter(function (answer) {
        return normalizedGroups[1].has(answer);
      });
      assert.deepEqual(overlap, [], "Overlapping answers for " + question.id);
    });
  });
});

test("232 W Packard cross-street fixture remains authoritative", function () {
  const fixture = KnowledgeData.crossStreetQuestions.find(function (question) {
    return question.id === "cross-232-w-packard";
  });

  assert.ok(fixture);
  assert.equal(fixture.prompt, "232 W Packard St");
  assert.deepEqual(
    fixture.answers.map(function (answer) {
      return answer.display;
    }),
    ["N Union St", "N Church St"]
  );
  assert.deepEqual(fixture.stationIds, ["1"]);
});

test("W Packard is citywide-authoritative and shared by Stations 1 and 3", function () {
  const fixture = KnowledgeData.hundredBlockQuestions.find(function (question) {
    return question.id === "blocks-w-packard";
  });

  assert.ok(fixture);
  assert.equal(fixture.prompt, "W Packard St");
  assert.deepEqual(
    fixture.answers.map(function (answer) {
      return answer.display;
    }),
    ["1000 N block", "1100 N block"]
  );
  assert.deepEqual(fixture.stationIds, ["1", "3"]);
  assert.equal(fixture.witnessCount, 16);
  assert.equal(fixture.verifiedUsing.includes("N Union St"), true);
});

test("N Pine regression uses outward endpoint ranges", function () {
  const fixture = KnowledgeData.hundredBlockQuestions.find(function (question) {
    return question.prompt === "N Pine St";
  });
  assert.ok(fixture);
  assert.deepEqual(
    fixture.answers.map(function (answer) {
      return answer.display;
    }),
    ["700 W block", "800 W block"]
  );
});

test("Main Street origin and curved streets keep their distinct variants", function () {
  const main = KnowledgeData.hundredBlockQuestions.find(function (question) {
    return question.prompt === "E Main St";
  });
  assert.ok(main);
  assert.deepEqual(
    main.answers.map(function (answer) {
      return answer.display;
    }),
    ["100 N block", "100 S block"]
  );

  assert.equal(
    KnowledgeData.hundredBlockQuestions.some(function (question) {
      return question.prompt === "W Olive St";
    }),
    false,
    "W Olive must not be reduced to one unqualified answer"
  );
  const olivePairs = new Set(
    KnowledgeData.hundredBlockQuestions
      .filter(function (question) {
        return question.streetName === "W Olive St";
      })
      .map(function (question) {
        return question.answers.map(function (answer) {
          return answer.display;
        }).join("|");
      })
  );
  assert.deepEqual(olivePairs, new Set([
    "1600 N block|1700 N block",
    "1700 N block|1800 N block",
    "1800 N block|1900 N block",
  ]));

  const burgenerAxes = new Set(
    KnowledgeData.hundredBlockQuestions
      .filter(function (question) {
        return question.streetName === "Burgener Dr";
      })
      .map(function (question) {
        return question.answers[0].display.slice(-7, -6);
      })
  );
  assert.deepEqual(burgenerAxes, new Set(["S", "E"]));
});

test("non-street endpoints and unsupported streets stay in the exclusion manifest", function () {
  ["ASPHALT", "NWRR", "EOP", "CUL-DE-SAC"].forEach(function (token) {
    assert.equal(
      KnowledgeData.hundredBlockQuestions.some(function (question) {
        return question.streetName.toUpperCase() === token;
      }),
      false
    );
  });
  assert.ok(Coverage.rejectionCounts.endpointToken > 0);
  assert.ok(Coverage.excludedStreetNames.every(function (entry) {
    return entry.street && entry.reason;
  }));
});
