# Decatur Fire Map Trainer

Practice finding Decatur addresses, drawing routes from a fire station, and
recalling cross streets and 100-block lines. Choose **Any station** to train
citywide or select a Station 1–7 response area. [Open the live map trainer](https://majormech.github.io/dfdmaptraining/)

## Training modes

| Mode | What you do |
| --- | --- |
| Location | Place a real address on the map and see how far off you were. Choose a single call or a 10-call game. |
| Route | Pin the address, draw the route from the assigned station, and compare it with the closest instructor-approved or Google route. Choose a single call or a 10-call game. |
| Cross streets | Enter the two streets that bound the given address. Each game has 10 questions. |
| 100-block lines | Enter the two adjoining hundred blocks and their directions. Each game has 10 questions. |

For a harder map drill, turn on **Hide map labels** to hide road, park, lake,
business, and public-building names. **Response zones** toggles station boundaries.

All modes retain a penalty score: **lower is better**. Cross-street rounds score
1 penalty point when both blanks are correct, 50 when one is correct, and 100
when neither is correct. Common street abbreviations and reversed answer order
are accepted; fuzzy spelling is intentionally not used.

Each hundred-block answer earns up to 100 credit: 80 for the block number and
20 for the cardinal direction. Numeric credit steps down as the answer moves
away from the correct hundred block: 80 exact, then 64, 48, 32, 16, and 8 at
100 through 500 away; farther answers earn no numeric credit. Direction credit
is independent. The two answer scores are averaged, and the round penalty is
`100 - credit`, with a 1-point minimum for a perfect answer. For an expected
answer of `1000 N`, entering `1000 N.` earns all 100 points and `1000 NE`
earns the 80 points for the correct number.

## Review and practice

The call bar stays visible when the setup panel is collapsed. The bottom bar
holds the primary action for answering, submitting a route, or advancing.
The trainer remembers the last drill, response area, and map preferences in
the current browser.

In a route drill on a touch screen, pan under the crosshair and use **Place pin** or **Add route
point**. Turn off **Crosshair entry** to place points by tapping the map. **Undo
point** works repeatedly, and **Restore route** recovers the last cleared path
within the current round. Use **Recenter map** to return to the assigned
station during a call or **Fit review** to see the scored map again.

After scoring a game round, review the answer and select **Next call** or
**View results**. Route review marks the first significant departure from the
closest reference and the first place the two routes rejoin, when present.
For cross-street and hundred-block questions, select **Reveal answer on map**
to see the verified location and street geometry.

Turn on **Practice my misses** in the setup panel, then choose a response area
and training mode. The trainer draws from missed rounds for that mode and area
and mixes in fresh calls. A successful retry clears the saved miss. Misses
are stored in the current browser. If storage is unavailable, practice history
lasts until the page closes or reloads.

In **Instructor routes**, search for an official address, choose its station,
and enter a route name and any notes. Select **Draw route**, click along the
route to the marked destination, and save it. Repeat to add alternatives or
select the same assignment to remove a previously saved route. **Practice this
call** starts a drill for the selected assignment. The response-area selector
shows the assigned station and locks while drawing or practicing that call.
Finishing it or starting a regular drill restores your previous station. Training uses
the closest approved route for the exact station and address, and shows its
notes with the score. When the assignment has no approved route, the trainer
uses clearly labeled Google references. Instructor routes are stored in the
current browser and do not sync across devices.

## GitHub Pages and local preview

GitHub Pages serves the static files from `main`. Test changes on `trainer`
before merging into `main`. After the push, check the **pages build and deployment**
run and open the public trainer to verify the release. Version 0.6.2 loads
`main.js` and `training-core.js` with the same release number so returning
browsers fetch the matching scoring rules. [Deployment runs](https://github.com/majormech/dfdmaptraining/actions)

Serve the project directory with any static web server. For example:

    python -m http.server 4173 --bind 127.0.0.1

Then open http://127.0.0.1:4173/.

Opening **index.html** directly is not recommended because Maps API referrer
restrictions and browser security policies can behave differently for local
files.

## Automated checks

The release checks were tested with Node.js 24. Run them from the repository root.

    npm test
    npm run check

The browser fetches the checked-in street centerlines when a trainee reveals
an answer on the map. After intentionally refreshing the GIS snapshots,
regenerate the static question banks with:

    npm run generate:hundred-blocks
    npm run generate:cross-streets

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
    active-address-data.js        Generated location and route address bank
    cross-street-data.js          Generated static active-address question bank
    hundred-block-data.js         Generated static citywide block-line bank
    knowledge-data.js             Runtime question schema and immutable records
    training-core.js              Pure scoring and route-geometry functions
    main.js                       Maps integration and training lifecycle
    data/active-address-coverage.json  Location/route address audit
    data/cross-street-coverage.json   Address/segment coverage audit
    data/hundred-block-coverage.json  Included/excluded street audit
    data/source/                  Official GIS snapshots used by the generator
    scripts/analyze-cross-street-bank.js   Cross-street bank generator
    scripts/analyze-hundred-block-bank.js  Hundred-block bank generator
    tests/training-core.test.js   Deterministic unit tests
    tests/knowledge-data.test.js  Question-bank integrity and source checks
    docs/QA.md                    Manual acceptance checklist
    og.png                        Social preview card

## Correctness safeguards

- Each call uses official address coordinates and station response-area polygons.
- Submitting a guess locks the round. A late route response from a previous
  round cannot change the current score.
- Route scoring compares road coverage, travel order, direction, and endpoints
  against each available reference. The closest match determines the route score.
- Each scored game round stays open for review until the trainee advances.
  The results table shows the final score and each round’s penalty.

## Location and route address data

Location and route rounds now draw from the complete official active-address
snapshot instead of reverse-geocoding random map points. The source contains
44,268 active records. The playable bank contains **43,163 unique addresses**
with an official Station 1–7 response-area assignment. It excludes 849 records
outside every supplied Still Alarm Territory and collapses 256 duplicate
address labels; it does not invent a station assignment for either case.

Selecting a response area filters both location and route rounds to that
station before the game begins. Any station draws from the complete playable
bank. Ten-round games shuffle ten distinct address records, and changing the
response area during a run restarts at Round 1 with a reset score.

## Street-training data

The two recall games use checked-in question data rather than attempting to
infer operational street relationships from live Google results. The generated
cross-street bank contains **2,914 active-address questions covering 724
official street names**. The 100-block bank contains **609 questions covering
507 official block-line street names**. Selecting Station 1–7 filters either
bank to verified questions in the chosen response area; Any station draws from
the complete citywide pool.

The complete city-limit scan found 1,308 street-like names. The remaining 801
are listed in `data/hundred-block-coverage.json` because the official ranges do
not prove that they divide two adjoining 100 blocks. This is common for short
subdivision streets, cul-de-sacs, dead ends, and roads that sit inside a block.
The app does not invent answers for those streets.

The bank includes the two reference examples:

- `232 W Packard St` is bounded by `N Union St` and `N Church St`.
- `W Packard St` divides the `1000 N` and `1100 N` blocks at `N Union St`.

The hundred-block records were generated on 2026-08-26, and the cross-street
records were generated on 2026-08-27 from the City of
Decatur's public [active-address layer](https://maps.decaturil.gov/arcgis/rest/services/Public/addresses/FeatureServer/0),
[street-centerline layer](https://maps.decaturil.gov/arcgis/rest/services/Transportation/Street_Centerlines/FeatureServer/0),
[city-limit layer](https://maps.decaturil.gov/arcgis/rest/services/Public/city_limits/FeatureServer/0),
and [Still Alarm Territories](https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0).
The derivation follows [Decatur Code Chapter 35](https://decaturil.gov/DocumentCenter/View/118/Chapter-35---Numbering-Houses-PDF):
Main Street supplies the north/south and east/west numbering baselines, and
numbers increase by 100 for each block.

Each cross-street question matches a real active-address point and number to an
official centerline range, requires two distinct named endpoint streets, and
stores the address and centerline object IDs. Each hundred-block question stores
its station IDs, representative coordinates, supporting crossing streets, and
centerline feature IDs. A hundred-block question is accepted only when two
adjacent centerline segments prove consecutive hundred blocks and the named
boundary street is within 25 feet of that intersection. Streets that bend or
shift are kept as contextual prompts such as `W Olive St near N Union St`;
conflicting answers are never silently collapsed.

Cross-street station-area counts are 519, 425, 617, 232, 377, 472, and 272 for
Stations 1–7 respectively. Hundred-block station-area counts are 107, 101, 150,
75, 112, 104, and 77. Shared boundary questions carry more than one station ID,
so those counts intentionally overlap. The GIS relationships and territory
assignments should still receive DFD operational review before deployment.

During each unanswered recall question, the map is concealed and removed from
keyboard navigation. After scoring, **Reveal answer on map** shows that round’s
location and supporting street geometry. Changing the response area starts a
new 10-question session with a fresh score.

## Google Maps configuration

The browser loads the Maps JavaScript API with the key in **index.html**.
In Google Cloud, maintain website restrictions for the Pages host and API
restrictions for the Maps JavaScript API and Routes API. Quotas and billing
alerts are managed there. A separate browser key can be used for local testing.

The trainer uses **AdvancedMarkerElement** on the normal map and
**Route.computeRoutes** from the weekly Maps JavaScript API. It requests route
alternatives, scores the user's drawing against every returned path, and shows
the closest option in teal after scoring.

Advanced Markers require a map ID. The checked-in configuration uses Google's
`DEMO_MAP_ID`. To use a project-owned map ID, set the `google-maps-map-id`
meta value in **index.html** to that JavaScript map ID. The
Google Cloud project must have the Maps JavaScript API and Routes API enabled.

The Hide map labels switch supports two configurations.
When its optional `google-maps-hidden-labels-map-id` meta value is empty, the
app rebuilds the map without a map ID, applies an embedded all-label style, and
uses accessible DOM overlay markers. Road names, parks, water features,
businesses, places of worship, civic buildings, neighborhoods, and similar
Google basemap labels are hidden. Camera position, zones, guesses, and drawn or
scored routes remain attached during the change.

To use cloud styling for the hidden-label view, associate a second JavaScript map ID with a
published cloud map style whose map-feature labels are hidden. Put that ID in
the `google-maps-hidden-labels-map-id` meta value. The app will then use Advanced
Markers in both views and will not apply embedded styling. This two-map-ID path
is needed because Google does not support embedded JSON styles and a map ID on
the same map.

Routes labeled **Google reference** are generated by the routing engine.
The **Instructor routes** workflow records approved apparatus routes with
assignment-specific notes.

## What is saved

Drill settings, missed calls, and instructor-approved routes are saved in the
current browser on the current device. Clearing site data removes them. Round
scores and the final results table last for the current session. The trainer
runs on GitHub Pages without accounts or a backend database.
