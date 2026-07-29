# How To Run And Test

## Requirements

- A modern browser such as Chrome, Safari, Edge, or Firefox.
- Node.js is optional for this static prototype. It is useful only for syntax checks or running a local static server.

## Mapping Stack

This app uses only the open-source mapping stack listed below.

It uses:

- Leaflet for the interactive map.
- OpenStreetMap tiles for the base map.
- Leaflet Draw for polygons, rectangles, circles, markers, editing, and deletion.
- Nominatim for explicit place search and reverse geocoding.
- OSRM for route geometry, distance, and duration.

Nominatim public servers do not allow client-side autocomplete. For that reason, place lookup runs only when the user clicks `Search` or presses Enter, with client-side caching and rate limiting.

## Run The App

### Recommended: Run A Local Server

From the project folder:

```bash
cd /Users/manavberiwal/Dravido
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/
```

### Alternative: Open Directly

You can also open `/Users/manavberiwal/Dravido/index.html` directly in a browser, but the local server is preferred because the app uses external map tiles and public geocoding/routing services.

## Quick Smoke Test

Run this command to check JavaScript syntax:

```bash
cd /Users/manavberiwal/Dravido
node --check app.js
```

Expected result:

```text
No output and exit code 0
```

No output means the JavaScript parsed successfully.

## Manual Test Checklist

### 1. Partner Portal Loads

1. Open the app.
2. Confirm the left sidebar shows `Partner Portal` and `Admin Portal`.
3. Confirm the main page shows city, airport, vehicle, map, pricing, test, and approval sections.

Expected result:

- `Partner Portal` is active by default.
- Default partner is `Royal Miles Fleet`.
- Default city is `Delhi NCR`.
- Default airport is `Indira Gandhi International`.
- OpenStreetMap tiles load in the map.
- Several editable zones appear on the map.
- The Leaflet Draw toolbar appears on the map.

### 2. Change City And Airport

1. Change the `City` dropdown to another city.
2. Change the `Airport` dropdown if multiple airports are available.

Expected result:

- Airport options update based on the selected city.
- All airports for the selected city are listed and shown on the map.
- The pricing editor and test dropdowns update for the selected city.
- If a city has no zones yet, the app shows an empty-zone message.

### 3. Create, Edit, And Rename A Zone

1. Use the Leaflet Draw toolbar on the map.
2. Draw a polygon, rectangle, circle, or marker.
3. Enter a zone name when prompted.
4. Use the edit tool to drag the shape or its editable points.
5. Click `Rename`.
6. Enter a new zone name.

Expected result:

- The new zone is displayed immediately.
- The zone is stored as Leaflet-compatible geometry.
- The renamed zone appears in the zone list, pricing rows, and test dropdowns.
- Approval status changes back to `Draft` after edits.

### 4. Search A Place

1. Type a landmark, hotel, or route point in `Search place`.
2. Click `Search` or press Enter.
3. Click one search result.

Expected result:

- Nominatim returns up to five matching places.
- Clicking a result moves the map to that place and drops a marker.
- Search results are cached for repeated queries.

### 5. Configure Airport To Zone Pricing

1. In `Rules by route type`, select `Airport to zone`.
2. Edit a price for one vehicle category.
3. Click into another field or section.

Expected result:

- The new price stays in the field.
- Every airport in the selected city gets a separate row to every created zone.
- The approval status becomes `Draft`.
- The price is saved in browser `localStorage`.

### 6. Configure Zone To Zone Pricing

1. Select `Zone to zone`.
2. Edit pricing between two zones.

Expected result:

- Rows show origin zone, destination zone, and vehicle price fields.
- Edited values persist when switching pricing tabs.

### 7. Configure Distance Pricing

1. Select `By distance`.
2. Edit prices for distance buckets.

Expected result:

- Distance buckets appear as `0-10`, `11-25`, `26-50`, and `51+` km.
- These values are used as fallback pricing when no zone rule matches.

### 8. Run A Price Test

1. Choose a pickup.
2. Choose a drop.
3. Choose a vehicle.
4. Click `Run price test`.

Expected result:

- The results panel shows the selected partner price.
- It also shows masked comparison prices for `Affiliate 1` and `Affiliate 2`.
- OSRM route distance and duration appear in the selected partner result when routing is available.
- The route path is drawn on the map.
- If airport-to-zone pricing exists, the selected airport and selected zone are used.
- If zone-to-zone pricing exists, that configured rule is used.
- If the route does not match a specific rule, distance fallback pricing is used.

### 9. Submit For Approval

1. Click `Submit for approval`.

Expected result:

- Status changes from `Draft` to `Pending review`.
- The Admin Portal can now review that partner.

### 10. Admin Approval Workflow

1. Click `Admin Portal`.
2. Click `Review` for a partner.
3. Click `Approve live`.

Expected result:

- The partner status changes to `Approved live`.
- Returning to the Partner Portal shows the same approved status for the selected partner.

### 11. Admin Reject And Enable/Disable

1. In `Admin Portal`, click `Reject`.
2. Click `Disable partner`.
3. Click it again to enable.

Expected result:

- Reject changes the status to `Rejected`.
- Disable changes the partner badge to `Disabled`.
- Enable changes the partner badge back to `Enabled`.

### 12. Reset Demo Data

1. Click `Reset demo` in the top-right area.

Expected result:

- All local changes are cleared.
- Seed partners, zones, and prices return to the original demo state.

## What To Expect

This is a front-end prototype of the Tracklimo pricing platform. It demonstrates the full workflow without requiring a backend.

Working behavior:

- Data persists in the same browser through `localStorage`.
- Pricing can be edited interactively.
- Zone creation and editing works through Leaflet Draw.
- Multiple airports in one city are priced independently against every zone.
- Place search uses Nominatim.
- Route distance, duration, and geometry use OSRM.
- Admin approval status is connected to the partner workflow.
- The test module calculates prices from configured rules.

Prototype limits:

- There is no real login yet.
- There is no PostgreSQL database yet.
- Nominatim public service does not support autocomplete, so explicit search is used.
- Public OSM/Nominatim/OSRM services are suitable for demos and modest use; production should use compliant providers or self-hosting.
- Affiliate prices are simulated and masked.
- Approval actions are stored locally, not on a backend server.

## Production Expectations

Before production, this prototype should be connected to:

- Authentication and role permissions.
- Backend pricing APIs.
- PostgreSQL storage.
- Self-hosted or provider-backed Nominatim for production geocoding and autocomplete.
- Self-hosted or provider-backed OSRM for production routing.
- Audit logs for admin approval, rejection, enable, and disable actions.
