# Local QA checklist

Use this checklist before treating a local build as ready for deployment.

## Startup

- [ ] The page begins with disabled training controls and a visible loading
      status.
- [ ] Seven station markers and seven response zones load.
- [ ] A Maps or API-key failure produces a visible error instead of an inert
      "Ready" screen.
- [ ] No application asset returns a 404.

## Address integrity

- [ ] Each station-specific call displays the selected station.
- [ ] The revealed marker corresponds to the displayed geocoded address.
- [ ] The canonical address remains inside the selected response zone.
- [ ] Quota and authorization errors stop retries and explain the issue.

## Location drills

- [ ] The first map selection settles the round.
- [ ] A double-click records exactly one result.
- [ ] The correct marker is hidden before the answer and visible afterward.
- [ ] The score is labeled as a penalty and remains visible at completion.
- [ ] A 10-round game contains exactly ten distinct settled rounds.

## Route drills

- [ ] The first selection places the address guess.
- [ ] The address guess can be dragged or replaced with Move address.
- [ ] The route begins automatically at the assigned station.
- [ ] Dragging the first route handle snaps it back to the assigned station.
- [ ] Additional selections extend the route.
- [ ] Existing route points can be adjusted with the editable line handles.
- [ ] Undo removes exactly the last user-added point.
- [ ] Clear retains the station origin and removes user-added points.
- [ ] Submit can be accepted only once while a route is being calculated.
- [ ] A failed reference-route request leaves the drawing available to retry.
- [ ] The red user route and teal reference route remain visible after scoring.
- [ ] When alternatives are returned, the best match is selected and the
      other accepted routes appear as faint blue lines.
- [ ] Sparse clicks along a correct road do not receive an artificial penalty.
- [ ] Large detours and reversed routes receive a meaningful penalty.

## Cross-street game

- [ ] A game contains ten distinct active-address questions with no repeats.
- [ ] Any station draws from all 2,914 generated questions.
- [ ] Selecting Station 1–7 draws only questions whose stored `stationIds`
      includes that station.
- [ ] The response-area selector remains enabled during the game, including at
      phone widths.
- [ ] Changing the response area immediately starts a new round 1 of 10 in the
      selected area and resets the session score.
- [ ] Each station offers at least ten questions; current generated counts are
      519, 425, 617, 232, 377, 472, and 272 for Stations 1–7.
- [ ] Each question presents two labeled cross-street blanks.
- [ ] Common forms such as `N Union St`, `North Union Street`, and `Union`
      match only the explicitly approved answer aliases.
- [ ] The two correct streets are accepted in either order.
- [ ] Repeating one correct street in both blanks earns credit only once.
- [ ] Submitting with a blank answer leaves the round open, identifies the
      missing field, and moves focus to it.
- [ ] Both correct answers are shown after scoring.
- [ ] The map is concealed and cannot receive pointer or keyboard input while
      the recall game is active.

## Hundred-block-line game

- [ ] A game contains ten distinct street-line questions with no repeats.
- [ ] Any station draws from all 609 generated questions without duplicating a
      shared response-boundary record.
- [ ] Selecting Station 1–7 draws only questions whose stored `stationIds`
      includes that station, and the selected scope remains visible and locked
      to that question pool.
- [ ] The response-area selector remains enabled during an open or reviewed
      100-block round, including at phone widths.
- [ ] Changing the response area during a 100-block game immediately starts a
      new round 1 of 10 in the selected area and resets the session score.
- [ ] Each station offers at least ten questions; current generated counts are
      107, 101, 150, 75, 112, 104, and 77 for Stations 1–7.
- [ ] `1000 N`, `N 1000`, and `1000 north block` normalize to the same answer.
- [ ] Each answer awards 80 credit for an exact hundred-block number and 20
      independent credit for the correct N, S, E, or W direction.
- [ ] Numeric credit is 80 exact, 64 at 100 away, 48 at 200, 32 at 300, 16 at
      400, 8 at 500, and 0 beyond 500, in either direction.
- [ ] Non-hundred entries such as `1050 N` earn no numeric credit.
- [ ] A wrong direction, such as `1000 S` for `1000 N`, can earn numeric credit
      but receives no direction credit.
- [ ] The two adjoining hundred blocks are accepted in either order.
- [ ] The two answer credits are averaged and converted to a penalty with a
      1-point minimum for a perfect round.
- [ ] The Packard fixture remains `1000 N block` and `1100 N block`.
- [ ] The N Pine fixture remains `700 W block` and `800 W block`; this catches
      reversed geometry and multi-hundred centerline ranges.
- [ ] E Main remains the grid-origin pair `100 N block` and `100 S block`.
- [ ] W Olive has location-qualified variants for `1600/1700 N`, `1700/1800
      N`, and `1800/1900 N`; it never appears as one unqualified answer.
- [ ] Curved streets such as Burgener retain distinct north/south and east/west
      contextual variants instead of being merged.
- [ ] After scoring, the weighted breakdown remains visible until Next question
      or View results is chosen.
- [ ] The result summary shows total credit, average credit, and total penalty.
- [ ] The final table contains ten rows and labels the question column Prompt.

## Generated street-bank audit

- [ ] `npm run generate:hundred-blocks` recreates `hundred-block-data.js` and
      `data/hundred-block-coverage.json` without a diff when source snapshots
      have not changed.
- [ ] The coverage manifest accounts for every one of the 1,308 street-like
      names intersecting the official city limits: 507 included block-line
      streets and 801 explicit exclusions in this snapshot.
- [ ] Every generated question has two or more unique source feature IDs,
      representative coordinates, at least one verification street, and one or
      more valid Station 1–7 memberships.
- [ ] `EOP`, `CUL-DE-SAC`, `ASPHALT`, `CONCRETE`, and `NWRR` are never emitted
      as question prompts.
- [ ] A question on a response-area boundary keeps all applicable station IDs.

## Mode changes and async safety

- [ ] Switching modes invalidates the previous address request.
- [ ] A late geocoder response cannot replace the current call.
- [ ] A late route response cannot score a newer game.
- [ ] Starting another mode cancels the previous next-round timer.

## Map-label visibility

- [ ] Hide map labels removes road, park, lake, river, business, church,
      school, hospital, public-building, transit, and neighborhood labels.
- [ ] Road geometry, land and water shapes, DFD station markers, response
      zones, training routes, and Google attribution remain visible.
- [ ] Turning Hide map labels off restores the Google basemap labels.
- [ ] The switch works with a mouse, touch, and keyboard.
- [ ] Toggling preserves the current center, zoom, assigned address, guess,
      editable route, and any scored reference-route alternatives.
- [ ] A route can still be submitted and scored while map labels are hidden.
- [ ] If a production hidden-labels map ID is configured, its cloud style has
      published label visibility turned off for every intended feature type.

## Accessibility and responsive behavior

- [ ] Every application button and field is keyboard reachable.
- [ ] Enter or Space on the focused map selects its current center.
- [ ] Route Move address, Undo, Clear, and Submit work without right-click.
- [ ] Collapsed header controls cannot receive focus.
- [ ] Status and scoring changes are announced by live regions.
- [ ] Focus moves into the result dialog and returns to the starting mode
      button when the dialog closes.
- [ ] At 320×568, 390×844, 768×1024, and 1280×720, controls do not overlap one
      another or require horizontal page scrolling.
- [ ] At phone widths, all six training modes are visible in the two-column
      tray without horizontal scrolling or clipped labels.
- [ ] At phone widths, a knowledge round hides the unused setup controls and
      keeps both inputs, Check answer, weighted feedback, and Next question
      reachable without horizontal scrolling.
- [ ] At phone widths, expanding the setup panel overlays the map and collapsing
      it restores an unobstructed map without changing the map's height.
- [ ] Google map-type, fullscreen, zoom, Street View, and attribution controls do
      not overlap the next-step card or the training tray.
- [ ] Mobile result rows remain readable at 200% text zoom and the Return to map
      action remains visible above the safe-area inset.
