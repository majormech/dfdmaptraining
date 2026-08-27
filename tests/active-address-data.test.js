"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const ActiveAddressData = require("../active-address-data.js");
const Coverage = require("../data/active-address-coverage.json");
const VALID_STATIONS = new Set(["1", "2", "3", "4", "5", "6", "7"]);

test("active-address bank matches the official source snapshot audit", function () {
  assert.equal(ActiveAddressData.schemaVersion, 1);
  assert.equal(ActiveAddressData.generatedOn, "2026-08-27");
  assert.equal(Coverage.counts.sourceActiveAddresses, 44268);
  assert.equal(Coverage.counts.usableUniqueAddresses, 43163);
  assert.equal(Coverage.rejectionCounts.missingPoint, 0);
  assert.equal(Coverage.rejectionCounts.missingLabel, 0);
  assert.equal(Coverage.rejectionCounts.noStation, 849);
  assert.equal(Coverage.rejectionCounts.duplicateLabel, 256);
  assert.equal(ActiveAddressData.addresses.length, 43163);
  assert.deepEqual(
    Coverage.sourceSnapshots.map(function (snapshot) {
      return snapshot.featureCount;
    }),
    [10000, 10000, 10000, 10000, 4268, 7]
  );
  Coverage.sourceSnapshots.forEach(function (snapshot) {
    const contents = fs.readFileSync(path.resolve(projectRoot, snapshot.file));
    assert.equal(contents.length, snapshot.bytes);
    assert.equal(
      crypto.createHash("sha256").update(contents).digest("hex"),
      snapshot.sha256,
      "Source snapshot changed without regenerating the active-address bank: " +
        snapshot.file
    );
  });
});

test("active-address records are unique, station-scoped, and map-ready", function () {
  const ids = new Set();
  const labels = new Set();
  const stationCounts = Object.fromEntries(
    Array.from(VALID_STATIONS).map(function (stationId) {
      return [stationId, 0];
    })
  );

  ActiveAddressData.addresses.forEach(function (record) {
    assert.equal(Array.isArray(record), true);
    assert.equal(record.length, 5);
    assert.equal(Number.isInteger(record[0]), true);
    assert.notEqual(String(record[1]).trim(), "");
    assert.ok(Number.isFinite(record[2]));
    assert.ok(Number.isFinite(record[3]));
    assert.ok(record[2] >= 39.7 && record[2] <= 40.0);
    assert.ok(record[3] >= -89.1 && record[3] <= -88.8);
    assert.equal(ids.has(record[0]), false, "Duplicate OBJECTID " + record[0]);
    assert.equal(labels.has(record[1]), false, "Duplicate address " + record[1]);
    ids.add(record[0]);
    labels.add(record[1]);

    const stationIds = String(record[4]).split(",").filter(Boolean);
    assert.ok(stationIds.length > 0, "Missing station for " + record[1]);
    stationIds.forEach(function (stationId) {
      assert.equal(VALID_STATIONS.has(stationId), true);
      stationCounts[stationId] += 1;
    });
  });

  assert.deepEqual(stationCounts, Coverage.counts.stationAddressCounts);
  assert.equal(labels.has("232 W Packard St"), true);
  assert.equal(Object.isFrozen(ActiveAddressData), true);
  assert.equal(Object.isFrozen(ActiveAddressData.addresses), true);
});
