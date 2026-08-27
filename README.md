# Decatur Fire Map Trainer

A browser-based station, address-location, route, cross-street, and hundred-block
training tool for Decatur, Illinois. The project intentionally stays on plain
HTML, CSS, and JavaScript so it can be reviewed and tested locally before
choosing a hosting or backend platform.

## Training modes

- Single location drill
- 10-address location game
- Single route drill
- 10-address route game
- 10-address cross-street game with two order-independent answers
- 10-question hundred-block-line game with citywide or station-area scope
- Best-match scoring across all returned drivable route alternatives
- Editable route lines, draggable address guesses, and keyboard route entry
- Station-specific or random-station address generation
- Optional response-zone overlays
- A Hide map labels switch that preserves the current drill and camera

All modes retain a penalty score: **lower is better**. Cross-street rounds score
1 penalty point when both blanks are correct, 50 when one is correct, and 100
when neither is correct. Common street abbreviations and reversed answer order
are accepted; fuzzy spelling is intentionally not used.

Each hundred-block answer earns up to 100 credit: 80 for the block number and
20 for the cardinal direction. Numeric credit steps down as the answer moves
away from the correct hundred block: 80 exact, then 64, 48, 32, 16, and 8 at
100 through 500 away; farther answers earn no numeric credit. Direction credit
is independent. The two answer scores are averaged, and the round penalty is
`100 - credit`, with the existing 1-point minimum for a perfect answer.

## Local preview

Serve the project directory with any static web server. For example:

    python -m http.server 4173 --bind 127.0.0.1

Then open http://127.0.0.1:4173/.

Opening **index.html** directly is not recommended because Maps API referrer
restrictions and browser security policies can behave differently for local
files.

## Automated checks

Node.js 20 or newer is required for the deterministic scoring tests.

    npm test
    npm run check

The checked-in GIS snapshots are not read by the browser. After intentionally
refreshing those source files, regenerate the static question bank with:

    npm run generate:hundred-blocks

The test suite covers:

- location-penalty thresholds;
- route-match behavior across sparse and dense drawings;
- reversed routes;
- large detours;
- parallel-route offsets;
- degenerate paths; and
- route resampling;
- street-name and hundred-block normalization;
- every hundred-block proximity tier and the independent 80/20 weighting;
- swapped, duplicate, malformed, and ambiguous two-answer handling; and
- city-limit coverage and per-station question counts;
- source-feature evidence and exclusion-manifest integrity; and
- Packard, Pine, Main Street, and curved-street regression fixtures.

## Project structure

    index.html                    Application shell and metadata
    styles.css                    Responsive interface and accessibility styles
    zones.js                      Station locations and response-zone GeoJSON
    hundred-block-data.js         Generated static citywide block-line bank
    knowledge-data.js             Runtime question schema and cross-street bank
    training-core.js              Pure scoring and route-geometry functions
    main.js                       Maps integration and training lifecycle
    data/hundred-block-coverage.json  Included/excluded street audit
    data/source/                  Official GIS snapshots used by the generator
    scripts/analyze-hundred-block-bank.js  Deterministic bank generator
    tests/training-core.test.js   Deterministic unit tests
    tests/knowledge-data.test.js  Question-bank integrity and source checks
    docs/QA.md                    Manual acceptance checklist
    og.png                        Social preview card

## Correctness safeguards

The improved local version:

- scores the geocoder result's canonical location rather than the random probe;
- rechecks canonical addresses against the selected response-zone polygon;
- locks each round before accepting a guess or route submission;
- ignores late results from abandoned modes or rounds;
- creates only one next-round timer;
- compares route segments in both directions instead of comparing click
  vertices only;
- evaluates every available reference-route alternative and scores the closest
  acceptable match;
- penalizes omitted route sections, detours, reversed travel, and poor
  endpoints; and
- keeps the final score visible after a game ends.

## Street-training data

The two recall games use checked-in question data rather than attempting to
infer operational street relationships from live Google results. The
cross-street bank remains a citywide set of ten verified address questions.
The 100-block bank contains **609 questions covering 507 official block-line
street names**. Selecting Station 1–7 filters that bank to verified
intersections in the chosen response area; Any station uses every question
once.

The complete city-limit scan found 1,308 street-like names. The remaining 801
are listed in `data/hundred-block-coverage.json` because the official ranges do
not prove that they divide two adjoining 100 blocks. This is common for short
subdivision streets, cul-de-sacs, dead ends, and roads that sit inside a block.
The app does not invent answers for those streets.

The bank includes the two reference examples:

- `232 W Packard St` is bounded by `N Union St` and `N Church St`.
- `W Packard St` divides the `1000 N` and `1100 N` blocks at `N Union St`.

The records were generated and verified on 2026-08-26 from the City of
Decatur's public [active-address layer](https://maps.decaturil.gov/arcgis/rest/services/Public/addresses/FeatureServer/0),
[street-centerline layer](https://maps.decaturil.gov/arcgis/rest/services/Transportation/Street_Centerlines/FeatureServer/0),
[city-limit layer](https://maps.decaturil.gov/arcgis/rest/services/Public/city_limits/FeatureServer/0),
and [Still Alarm Territories](https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0).
The derivation follows [Decatur Code Chapter 35](https://decaturil.gov/DocumentCenter/View/118/Chapter-35---Numbering-Houses-PDF):
Main Street supplies the north/south and east/west numbering baselines, and
numbers increase by 100 for each block.

Each generated question stores its station IDs, representative coordinates,
supporting crossing streets, and centerline feature IDs. A question is accepted
only when two adjacent centerline segments prove consecutive hundred blocks and
the named boundary street is within 25 feet of that intersection. Streets that
bend or shift are kept as contextual prompts such as `W Olive St near N Union
St`; conflicting answers are never silently collapsed.

Station-area counts in this snapshot are 107, 101, 150, 75, 112, 104, and 77
for Stations 1–7 respectively. Shared boundary questions carry more than one
station ID, so those counts intentionally overlap. The GIS relationships and
territory assignments should still receive DFD operational review before
deployment.

During a recall game the Google map is concealed and removed from keyboard
navigation so its labels cannot reveal an answer. The response-area selector
stays available during a 100-block game; changing it immediately starts a new
10-question session from the selected area and resets that session's score.
The unrelated map-display controls remain locked. The current ten-question
cross-street game remains citywide.

## Google Maps configuration

The Maps JavaScript API key is visible in **index.html** because browser-based
Maps applications must send a key. Before any future deployment:

1. restrict the key to the intended HTTPS hostnames;
2. restrict it to only the required Google Maps APIs;
3. configure quota and billing alerts;
4. use a separate key for local development if practical; and
5. replace the document-relative social-preview image URLs in **index.html**
   with the final absolute HTTPS URL.

The local build uses **AdvancedMarkerElement** on the normal map and
**Route.computeRoutes** from the weekly Maps JavaScript API. It requests route
alternatives, scores the user's drawing against every returned path, and shows
the closest option in teal after scoring.

Advanced Markers require a map ID. The checked-in local configuration uses
Google's `DEMO_MAP_ID`; replace the `google-maps-map-id` meta value in
**index.html** with a production JavaScript map ID before deployment. The
Google Cloud project must have the Maps JavaScript API and Routes API enabled.

The Hide map labels switch works locally without extra Google Cloud setup.
When its optional `google-maps-hidden-labels-map-id` meta value is empty, the
app rebuilds the map without a map ID, applies an embedded all-label style, and
uses accessible DOM overlay markers. Road names, parks, water features,
businesses, places of worship, civic buildings, neighborhoods, and similar
Google basemap labels are hidden. Camera position, zones, guesses, and drawn or
scored routes remain attached during the change.

For production, create a second JavaScript map ID and associate it with a
published cloud map style whose map-feature labels are hidden. Put that ID in
the `google-maps-hidden-labels-map-id` meta value. The app will then use Advanced
Markers in both views and will not apply embedded styling. This two-map-ID path
is needed because Google does not support embedded JSON styles and a map ID on
the same map.

Google-generated alternatives are routing-engine candidates, not formally
approved apparatus routes. Department-curated paths can later be added to the
same candidate list without changing the scoring core.

## Current scope

This version stores no accounts, progress, or results. Everything runs in the
browser. A backend such as Cloudflare Workers and D1 should only be introduced
after this local behavior and scoring model are accepted.
