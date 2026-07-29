# Tracklimo Pricing Platform Notes

## Product shape

The app is split into two working surfaces:

- Fleet Partner Portal: partners select a city and airport, manage service zones, choose vehicle categories, configure route pricing, test prices, and submit pricing for review.
- Admin Portal: admins review every partner, see configured coverage, approve or reject pricing, and enable or disable partners.

## Pricing model

The pricing engine supports three rule families:

- Airport to zone: airport pickup or drop with a saved service zone.
- Zone to zone: fixed pricing between two configured zones.
- By distance: fallback pricing when a route does not match a zone rule.

For cities with multiple airports, airport-to-zone prices are stored separately for every airport and every zone. Zone-to-zone prices are created once zones exist, so partners can price famous city routes independently of airport transfers.

The demo keeps these records in browser `localStorage`. In production, the same shape should live behind API modules for authentication, city, airport, zone, pricing, approval, and testing.

## Production integrations

- Keep Leaflet for interactive map display and Leaflet Draw for zone geometry editing.
- Use OpenStreetMap-derived tiles through a usage-policy-compliant provider or self-hosted tile stack.
- Use self-hosted or provider-backed Nominatim for production place search, geocoding, reverse geocoding, and autocomplete.
- Use self-hosted or provider-backed OSRM for route paths, distance, and duration.
- Store users, partners, cities, airports, zones, vehicle categories, prices, and approval history in PostgreSQL.
- Add role-based authentication for fleet partner and admin accounts.
- Move the quote calculator into a backend pricing engine so live bookings and test quotes use the same business rules.
- Add audit logs for approval, rejection, enable, and disable actions.
