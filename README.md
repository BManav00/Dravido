# Tracklimo Pricing Platform

A self-contained prototype for the Fleet Partner and Admin pricing workflows described in the architecture documents.

## What is included

- Fleet partner city and airport selection
- Leaflet map rendering with OpenStreetMap tiles
- Leaflet Draw zone creation and editing
- Nominatim place search and reverse geocoding
- OSRM route distance, duration, and path display
- Vehicle category assignment
- Polygon, rectangle, circle, and marker zone creation
- Airport to zone, zone to zone, and distance pricing
- Price testing with masked affiliate comparisons
- Admin review, approve, reject, enable, and disable workflows
- Local persistence in the browser through `localStorage`

## Run

Open `index.html` in a browser. No build step or server is required.

For step-by-step run instructions, manual tests, and expected behavior, see `RUN_AND_TEST.md`.

## Mapping Stack

The app uses a completely free and open-source mapping stack:

- Leaflet for interactive map rendering.
- OpenStreetMap raster tiles for the base map.
- Leaflet Draw for polygon, rectangle, circle, and marker drawing/editing.
- Nominatim for user-triggered place search and reverse geocoding.
- OSRM for route geometry, distance, and duration.

No proprietary map credential is required.

Nominatim public servers do not allow client-side autocomplete. The app therefore uses explicit Search/Enter requests with caching and rate limiting. A self-hosted Nominatim instance can be added later if production autocomplete is required.

## Notes

This prototype stores data locally in the browser. A production version should move pricing, zones, approvals, and audit history to backend APIs and PostgreSQL.
