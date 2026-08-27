"use strict";

(function (root, factory) {
  const hundredBlockData =
    typeof module === "object" && module.exports
      ? require("./hundred-block-data.js")
      : root && root.DFDHundredBlockData;
  const data = factory(hundredBlockData);
  if (typeof module === "object" && module.exports) {
    module.exports = data;
  }
  if (root) {
    root.DFDKnowledgeData = data;
  }
})(typeof window !== "undefined" ? window : null, function (HundredBlockData) {
  if (!HundredBlockData || !Array.isArray(HundredBlockData.questions)) {
    throw new Error("The generated 100-block question bank is unavailable.");
  }

  const VERIFIED_ON = "2026-08-26";
  const ACTIVE_ADDRESS_URL =
    "https://maps.decaturil.gov/arcgis/rest/services/Public/addresses/FeatureServer/0";
  const ROAD_CENTERLINE_URL =
    "https://maps.decaturil.gov/arcgis/rest/services/Transportation/Street_Centerlines/FeatureServer/0";
  const CITY_LIMITS_URL =
    "https://maps.decaturil.gov/arcgis/rest/services/Public/city_limits/FeatureServer/0";
  const STATION_TERRITORIES_URL =
    "https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0";
  const NUMBERING_ORDINANCE_URL =
    "https://decaturil.gov/DocumentCenter/View/118/Chapter-35---Numbering-Houses-PDF";

  const sources = Object.freeze({
    activeAddresses: Object.freeze({
      title: "City of Decatur active-address layer",
      url: ACTIVE_ADDRESS_URL,
    }),
    roadCenterlines: Object.freeze({
      title: "City of Decatur road-centerline layer",
      url: ROAD_CENTERLINE_URL,
    }),
    cityLimits: Object.freeze({
      title: "City of Decatur corporate-limit layer",
      url: CITY_LIMITS_URL,
    }),
    stationTerritories: Object.freeze({
      title: "Decatur Fire Still Alarm Territories",
      url: STATION_TERRITORIES_URL,
    }),
    numberingOrdinance: Object.freeze({
      title: "Decatur Code Chapter 35 — Numbering Houses",
      url: NUMBERING_ORDINANCE_URL,
    }),
  });

  function streetAnswer(display, aliases) {
    return Object.freeze({
      display,
      aliases: Object.freeze(aliases.slice()),
    });
  }

  function streetAliases(directionShort, directionLong, streetName, suffixShort, suffixLong) {
    return [
      directionShort + " " + streetName,
      directionLong + " " + streetName,
      streetName,
      directionShort + " " + streetName + " " + suffixLong,
      directionLong + " " + streetName + " " + suffixShort,
      directionLong + " " + streetName + " " + suffixLong,
    ];
  }

  function crossStreetQuestion(
    id,
    prompt,
    coordinates,
    stationIds,
    firstAnswer,
    secondAnswer
  ) {
    return Object.freeze({
      id,
      prompt,
      stationIds: Object.freeze(stationIds.slice()),
      coordinates: Object.freeze({
        lat: coordinates[0],
        lng: coordinates[1],
      }),
      answers: Object.freeze([firstAnswer, secondAnswer]),
      sourceUrls: Object.freeze([
        ACTIVE_ADDRESS_URL,
        ROAD_CENTERLINE_URL,
      ]),
      verifiedOn: VERIFIED_ON,
    });
  }

  function blockAliases(number, directionShort, directionLong) {
    const value = String(number);
    return [
      value + " " + directionShort,
      value + " " + directionLong,
      value + " " + directionLong + " block",
      directionShort + " " + value,
      directionLong + " " + value,
    ];
  }

  function hundredBlockQuestion(question) {
    const directionNames = { N: "North", S: "South", E: "East", W: "West" };
    return Object.freeze({
      id: question.id,
      prompt: question.prompt,
      streetName: question.streetName,
      contextual: Boolean(question.contextual),
      stationIds: Object.freeze(question.stationIds.slice()),
      coordinates: Object.freeze({
        lat: question.coordinates.lat,
        lng: question.coordinates.lng,
      }),
      answers: Object.freeze(
        question.blocks.map(function (block) {
          const number = block[0];
          const direction = block[1];
          return streetAnswer(
            number + " " + direction + " block",
            blockAliases(number, direction, directionNames[direction])
          );
        })
      ),
      verifiedUsing: Object.freeze(question.verifiedUsing.slice()),
      witnessCount: question.witnessCount,
      sourceFeatureIds: Object.freeze(question.sourceFeatureIds.slice()),
      sourceUrls: Object.freeze([
        ROAD_CENTERLINE_URL,
        CITY_LIMITS_URL,
        STATION_TERRITORIES_URL,
        NUMBERING_ORDINANCE_URL,
      ]),
      verifiedOn: VERIFIED_ON,
    });
  }

  const crossStreetQuestions = Object.freeze([
    crossStreetQuestion(
      "cross-232-w-packard",
      "232 W Packard St",
      [39.85254649, -88.95823722],
      ["1"],
      streetAnswer(
        "N Union St",
        streetAliases("N", "North", "Union", "St", "Street")
      ),
      streetAnswer(
        "N Church St",
        streetAliases("N", "North", "Church", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-355-w-packard",
      "355 W Packard St",
      [39.85218187, -88.9598293],
      ["1"],
      streetAnswer(
        "N Edward St",
        streetAliases("N", "North", "Edward", "St", "Street")
      ),
      streetAnswer(
        "N Union St",
        streetAliases("N", "North", "Union", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-252-w-main",
      "252 W Main St",
      [39.84150262, -88.95832772],
      ["1"],
      streetAnswer(
        "S Union St",
        streetAliases("S", "South", "Union", "St", "Street")
      ),
      streetAnswer(
        "N Church St",
        streetAliases("N", "North", "Church", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-899-w-main",
      "899 W Main St",
      [39.84093968, -88.9680362],
      ["3"],
      streetAnswer(
        "N Haworth Ave",
        streetAliases("N", "North", "Haworth", "Ave", "Avenue")
      ),
      streetAnswer(
        "N Pine St",
        streetAliases("N", "North", "Pine", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-353-e-william",
      "353 E William St",
      [39.84312192, -88.95205902],
      ["6"],
      streetAnswer(
        "N Franklin St",
        streetAliases("N", "North", "Franklin", "St", "Street")
      ),
      streetAnswer(
        "N Jackson St",
        streetAliases("N", "North", "Jackson", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-1050-e-william",
      "1050 E William St",
      [39.84405903, -88.94242358],
      ["2"],
      streetAnswer(
        "N Calhoun St",
        streetAliases("N", "North", "Calhoun", "St", "Street")
      ),
      streetAnswer(
        "N Illinois St",
        streetAliases("N", "North", "Illinois", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-1149-e-cantrell",
      "1149 E Cantrell St",
      [39.83310454, -88.94098292],
      ["6"],
      streetAnswer(
        "S Illinois St",
        streetAliases("S", "South", "Illinois", "St", "Street")
      ),
      streetAnswer(
        "S Jasper St",
        streetAliases("S", "South", "Jasper", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-553-w-wood",
      "553 W Wood St",
      [39.83994244, -88.9630032],
      ["6"],
      streetAnswer(
        "S Monroe St",
        streetAliases("S", "South", "Monroe", "St", "Street")
      ),
      streetAnswer(
        "S College St",
        streetAliases("S", "South", "College", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-703-w-william",
      "703 W William St",
      [39.8431754, -88.96489643],
      ["3"],
      streetAnswer(
        "N Pine St",
        streetAliases("N", "North", "Pine", "St", "Street")
      ),
      streetAnswer(
        "N Monroe St",
        streetAliases("N", "North", "Monroe", "St", "Street")
      )
    ),
    crossStreetQuestion(
      "cross-1252-e-main",
      "1252 E Main St",
      [39.84196673, -88.93938268],
      ["2"],
      streetAnswer(
        "S Jasper St",
        streetAliases("S", "South", "Jasper", "St", "Street")
      ),
      streetAnswer(
        "S Witt St",
        streetAliases("S", "South", "Witt", "St", "Street")
      )
    ),
  ]);

  const hundredBlockQuestions = Object.freeze(
    HundredBlockData.questions.map(hundredBlockQuestion)
  );

  return Object.freeze({
    schemaVersion: 2,
    verifiedOn: VERIFIED_ON,
    sources,
    crossStreetQuestions,
    hundredBlockQuestions,
    hundredBlockGeneratedOn: HundredBlockData.generatedOn,
    hundredBlockSourceVersion: HundredBlockData.schemaVersion,
  });
});
