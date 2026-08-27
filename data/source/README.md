# GIS source snapshots

These files were downloaded on 2026-08-26 and 2026-08-27 from the City of Decatur's public
ArcGIS REST services with `f=geojson` and `outSR=4326`. They are generator
inputs, not browser assets.

- `street-centerlines-{0,2000,4000,6000,8000}.geojson` contains the complete
  Street Centerlines layer, ordered by `OBJECTID` and paged with a 2,000-record
  limit. The retained fields are `OBJECTID`, `FULL_NAME`, `STR_DIR`,
  `STR_NAME`, `STR_TYPE`, `ROADTYPE`, `MAINTAINED`, `SB_FSTREET`,
  `SB_TSTREET`, `FROMLEFT`, `TOLEFT`, `FROMRIGHT`, `TORIGHT`, `LCITY`, and
  `RCITY`.
- `active-addresses-{0,10000,20000,30000,40000}.geojson` contains all 44,268
  active addresses whose `CITY` is Decatur, ordered by `OBJECTID`. The retained
  fields are `OBJECTID`, `STREET_NUM`, `STREET_SUP`, `ALT_NAME`, `ADDRESS`,
  `ADDR_STATE`, `CITY`, `Latitude`, and `Longitude`.
- `decatur-city-limits.geojson` contains all five features from the official
  city-limit layer.
- `still-alarm-territories.geojson` contains all seven official fire response
  polygons and their `STATION` values.

The source services are:

- <https://maps.decaturil.gov/arcgis/rest/services/Transportation/Street_Centerlines/FeatureServer/0>
- <https://maps.decaturil.gov/arcgis/rest/services/Public/addresses/FeatureServer/0>
- <https://maps.decaturil.gov/arcgis/rest/services/Public/city_limits/FeatureServer/0>
- <https://maps.decaturil.gov/arcgis/rest/services/Fire/Still_Alarm_Territories/FeatureServer/0>

Run `npm run generate:hundred-blocks` and `npm run generate:cross-streets` from
the project root after an intentional snapshot refresh. The generators write
SHA-256 checksums and feature counts to their coverage JSON files; tests fail if
a snapshot changes without matching regeneration.

The public layer metadata does not expose a useful edit timestamp or explicit
reuse license. Confirm the City's current data-use terms and DFD operational
accuracy before distributing a refreshed dataset as authoritative.
