const STORAGE_KEY = "tracklimoPricingPlatformState";
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";

const palette = ["#f1b93f", "#3aa7a3", "#86c55f", "#2d6cdf", "#d66f4d", "#8d6fd1"];
const searchCache = new Map();
let lastNominatimRequestAt = 0;

const seedState = {
  currentView: "partner",
  selectedPartnerId: "royal",
  selectedCityId: "delhi",
  selectedAirportId: "del-igi",
  pricingTab: "airportZone",
  adminPartnerId: "royal",
  vehicleCategories: [
    { id: "sedan", name: "Sedan" },
    { id: "suv", name: "SUV" },
    { id: "premium", name: "Premium" },
    { id: "van", name: "Van" },
  ],
  cities: [
    {
      id: "delhi",
      name: "Delhi NCR",
      center: { lat: 28.6139, lng: 77.209 },
      zoom: 10,
      airports: [
        { id: "del-igi", name: "Indira Gandhi International", lat: 28.5562, lng: 77.1 },
        { id: "ghz-hdn", name: "Hindon Airport", lat: 28.7077, lng: 77.3589 },
      ],
    },
    {
      id: "mumbai",
      name: "Mumbai",
      center: { lat: 19.076, lng: 72.8777 },
      zoom: 11,
      airports: [
        { id: "bom-t2", name: "Chhatrapati Shivaji T2", lat: 19.0896, lng: 72.8656 },
        { id: "bom-t1", name: "Mumbai Domestic T1", lat: 19.0928, lng: 72.8567 },
      ],
    },
    {
      id: "bengaluru",
      name: "Bengaluru",
      center: { lat: 12.9716, lng: 77.5946 },
      zoom: 10,
      airports: [{ id: "blr-kia", name: "Kempegowda International", lat: 13.1986, lng: 77.7066 }],
    },
  ],
  partners: [
    {
      id: "royal",
      name: "Royal Miles Fleet",
      enabled: true,
      approvalStatus: "draft",
      activeVehicles: ["sedan", "suv", "premium"],
      cities: {
        delhi: {
          zones: [
            polygonZone("aerocity", "Aerocity", "#f1b93f", [
              [28.5628, 77.111],
              [28.5531, 77.1322],
              [28.5388, 77.1252],
              [28.5429, 77.099],
            ]),
            polygonZone("gurugram", "Gurugram Cyber Hub", "#3aa7a3", [
              [28.5085, 77.075],
              [28.49, 77.116],
              [28.464, 77.101],
              [28.474, 77.055],
            ]),
            polygonZone("noida", "Noida Sector 62", "#86c55f", [
              [28.644, 77.342],
              [28.615, 77.392],
              [28.589, 77.372],
              [28.607, 77.322],
            ]),
          ],
          prices: {},
        },
        mumbai: {
          zones: [
            polygonZone("bandra", "Bandra Kurla Complex", "#2d6cdf", [
              [19.076, 72.855],
              [19.065, 72.878],
              [19.049, 72.866],
              [19.058, 72.842],
            ]),
          ],
          prices: {},
        },
      },
    },
    {
      id: "cityline",
      name: "Cityline Transfers",
      enabled: true,
      approvalStatus: "pending",
      activeVehicles: ["sedan", "suv", "van"],
      cities: {
        delhi: {
          zones: [
            polygonZone("cp", "Connaught Place", "#2d6cdf", [
              [28.642, 77.204],
              [28.638, 77.23],
              [28.623, 77.227],
              [28.624, 77.205],
            ]),
            polygonZone("dwarka", "Dwarka", "#d66f4d", [
              [28.61, 77.015],
              [28.586, 77.072],
              [28.552, 77.052],
              [28.57, 76.995],
            ]),
          ],
          prices: {},
        },
      },
    },
  ],
};

let state = null;
let map = null;
let drawnItems = null;
let drawControl = null;
let airportLayerGroup = null;
let routeLayer = null;
let suppressMapRefit = false;
let pendingZoneDraft = null;

function polygonZone(id, name, color, pairs) {
  return {
    id,
    name,
    color,
    geometryType: "polygon",
    geometry: { latlngs: pairs.map(([lat, lng]) => ({ lat, lng })) },
  };
}

function hydrateState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  let nextState;
  try {
    nextState = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(seedState));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    nextState = JSON.parse(JSON.stringify(seedState));
  }
  migrateState(nextState);
  nextState.partners.forEach((partner) => {
    Object.keys(partner.cities).forEach((cityId) => seedPrices(partner, cityId, nextState));
  });
  return nextState;
}

function migrateState(nextState) {
  nextState.currentView ||= "partner";
  nextState.selectedPartnerId ||= "royal";
  nextState.selectedCityId ||= "delhi";
  nextState.selectedAirportId ||= getFallbackAirportId(nextState);
  nextState.pricingTab ||= "airportZone";
  nextState.adminPartnerId ||= nextState.selectedPartnerId;
  nextState.vehicleCategories ||= JSON.parse(JSON.stringify(seedState.vehicleCategories));
  nextState.cities ||= JSON.parse(JSON.stringify(seedState.cities));
  nextState.partners ||= JSON.parse(JSON.stringify(seedState.partners));

  if (!nextState.cities.some((city) => city.id === nextState.selectedCityId)) {
    nextState.selectedCityId = nextState.cities[0].id;
  }
  const selectedCity = nextState.cities.find((city) => city.id === nextState.selectedCityId);
  if (!selectedCity.airports.some((airport) => airport.id === nextState.selectedAirportId)) {
    nextState.selectedAirportId = selectedCity.airports[0].id;
  }
  if (!nextState.partners.some((partner) => partner.id === nextState.selectedPartnerId)) {
    nextState.selectedPartnerId = nextState.partners[0].id;
  }
  if (!nextState.partners.some((partner) => partner.id === nextState.adminPartnerId)) {
    nextState.adminPartnerId = nextState.selectedPartnerId;
  }

  nextState.partners.forEach((partner) => {
    partner.activeVehicles ||= ["sedan"];
    partner.cities ||= {};
    Object.entries(partner.cities).forEach(([cityId, config]) => {
      const city = nextState.cities.find((item) => item.id === cityId);
      config.zones = (config.zones || []).map((zone, index) => normalizeZone(zone, city, index));
      if (!config.prices) config.prices = {};
    });
  });
}

function getFallbackAirportId(nextState) {
  const city = nextState.cities?.find((item) => item.id === nextState.selectedCityId) || nextState.cities?.[0] || seedState.cities[0];
  return city.airports[0].id;
}

function normalizeZone(zone, city, index) {
  if (zone.geometryType && zone.geometry) return zone;
  if (Array.isArray(zone.path) && zone.path.length >= 3) {
    return {
      id: zone.id,
      name: zone.name,
      color: zone.color || palette[index % palette.length],
      geometryType: "polygon",
      geometry: { latlngs: zone.path },
    };
  }
  const center = city?.center || { lat: 28.6139, lng: 77.209 };
  const offset = 0.035 + index * 0.025;
  return polygonZone(zone.id, zone.name, zone.color || palette[index % palette.length], [
    [center.lat + offset, center.lng - offset],
    [center.lat + offset, center.lng + offset],
    [center.lat - offset, center.lng + offset],
    [center.lat - offset, center.lng - offset],
  ]);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getPartner(id = state?.selectedPartnerId, currentState = state) {
  const activeState = currentState || seedState;
  return activeState.partners.find((partner) => partner.id === id);
}

function getCity(id = state?.selectedCityId, currentState = state) {
  const activeState = currentState || seedState;
  return activeState.cities.find((city) => city.id === id);
}

function getCityConfig(partner = getPartner(), cityId = state?.selectedCityId, currentState = state) {
  const activePartner = partner || getPartner(undefined, currentState);
  const activeState = currentState || seedState;
  if (!activePartner.cities[cityId]) {
    activePartner.cities[cityId] = { zones: [], prices: {} };
    seedPrices(activePartner, cityId, activeState);
  }
  return activePartner.cities[cityId];
}

function getAirport(id = state?.selectedAirportId) {
  return getCity().airports.find((airport) => airport.id === id);
}

function seedPrices(partner, cityId, currentState = state) {
  const city = getCity(cityId, currentState);
  const config = partner.cities[cityId];
  if (!config.prices.airportZone) config.prices.airportZone = {};
  if (!config.prices.zoneZone) config.prices.zoneZone = {};
  if (!config.prices.distance) config.prices.distance = {};

  city.airports.forEach((airport, airportIndex) => {
    config.zones.forEach((zone, zoneIndex) => {
      const key = airportZoneKey(airport.id, zone.id);
      if (!config.prices.airportZone[key]) config.prices.airportZone[key] = {};
      partner.activeVehicles.forEach((vehicleId, vehicleIndex) => {
        config.prices.airportZone[key][vehicleId] ||= 1300 + airportIndex * 220 + zoneIndex * 300 + vehicleIndex * 420;
      });
    });
  });

  config.zones.forEach((fromZone, fromIndex) => {
    config.zones.forEach((toZone, toIndex) => {
      if (fromZone.id === toZone.id) return;
      const key = zoneZoneKey(fromZone.id, toZone.id);
      if (!config.prices.zoneZone[key]) config.prices.zoneZone[key] = {};
      partner.activeVehicles.forEach((vehicleId, vehicleIndex) => {
        config.prices.zoneZone[key][vehicleId] ||= 900 + Math.abs(fromIndex - toIndex) * 260 + vehicleIndex * 350;
      });
    });
  });

  ["0-10", "11-25", "26-50", "51+"].forEach((bucket, bucketIndex) => {
    if (!config.prices.distance[bucket]) config.prices.distance[bucket] = {};
    partner.activeVehicles.forEach((vehicleId, vehicleIndex) => {
      config.prices.distance[bucket][vehicleId] ||= 550 + bucketIndex * 620 + vehicleIndex * 300;
    });
  });
}

function airportZoneKey(airportId, zoneId) {
  return `${airportId}:${zoneId}`;
}

function zoneZoneKey(fromZoneId, toZoneId) {
  return `${fromZoneId}:${toZoneId}`;
}

function render() {
  renderNavigation();
  renderPartnerControls();
  renderMapPanel();
  renderPricingEditor();
  renderTester();
  renderAdmin();
  renderStatus();
  saveState();
}

function renderNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.currentView);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(`${state.currentView}View`).classList.add("active");
  if (map) setTimeout(() => map.invalidateSize(), 0);
}

function renderStatus() {
  const status = getPartner().approvalStatus;
  const pill = document.getElementById("approvalStatus");
  pill.className = `status-pill ${status}`;
  pill.textContent = statusLabels[status];
}

const statusLabels = {
  draft: "Draft",
  pending: "Pending review",
  approved: "Approved live",
  rejected: "Rejected",
};

function renderPartnerControls() {
  const partner = getPartner();
  const city = getCity();
  fillSelect("partnerSelect", state.partners, state.selectedPartnerId);
  fillSelect("citySelect", state.cities, state.selectedCityId);
  fillSelect("airportSelect", city.airports, state.selectedAirportId);

  document.getElementById("airportList").innerHTML = city.airports
    .map((airport) => {
      const selected = airport.id === state.selectedAirportId ? " selected" : "";
      return `<button class="airport-card${selected}" data-airport-id="${airport.id}" type="button"><strong>${airport.name}</strong><span>${airport.lat.toFixed(4)}, ${airport.lng.toFixed(4)}</span></button>`;
    })
    .join("");

  document.querySelectorAll(".airport-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAirportId = button.dataset.airportId;
      suppressMapRefit = true;
      render();
      focusAirport();
    });
  });

  const vehicleOptions = document.getElementById("vehicleOptions");
  vehicleOptions.innerHTML = state.vehicleCategories
    .map((vehicle) => {
      const checked = partner.activeVehicles.includes(vehicle.id) ? "checked" : "";
      return `<label class="chip"><input type="checkbox" value="${vehicle.id}" ${checked} />${vehicle.name}</label>`;
    })
    .join("");

  vehicleOptions.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked && !partner.activeVehicles.includes(input.value)) {
        partner.activeVehicles.push(input.value);
      } else if (!input.checked) {
        partner.activeVehicles = partner.activeVehicles.filter((id) => id !== input.value);
      }
      seedPrices(partner, state.selectedCityId);
      partner.approvalStatus = "draft";
      render();
    });
  });
}

function fillSelect(id, rows, selectedId) {
  const select = document.getElementById(id);
  select.innerHTML = rows.map((row) => `<option value="${row.id}">${row.name}</option>`).join("");
  select.value = selectedId;
}

function renderMapPanel() {
  const partner = getPartner();
  const config = getCityConfig(partner);
  seedPrices(partner, state.selectedCityId);
  initializeLeafletMap();
  syncLeafletMap();
  renderZoneList(config);
}

function initializeLeafletMap() {
  if (map) return;
  if (!window.L) {
    document.getElementById("mapNotice").innerHTML = `<strong>Map libraries unavailable</strong><span>Leaflet or Leaflet Draw failed to load from the CDN.</span>`;
    return;
  }
  if (!L.Control?.Draw || !L.Draw?.Event) {
    document.getElementById("mapNotice").innerHTML = `<strong>Drawing tools unavailable</strong><span>Leaflet loaded, but Leaflet Draw did not. Check your internet connection or CDN access.</span>`;
    return;
  }

  const city = getCity();
  map = L.map("leafletMap", {
    center: [city.center.lat, city.center.lng],
    zoom: city.zoom,
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  airportLayerGroup = L.layerGroup().addTo(map);
  drawnItems = new L.FeatureGroup().addTo(map);
  drawControl = new L.Control.Draw({
    position: "topleft",
    draw: {
      polyline: false,
      circlemarker: false,
      polygon: { allowIntersection: false, showArea: true },
      rectangle: true,
      circle: true,
      marker: true,
    },
    edit: {
      featureGroup: drawnItems,
      selectedPathOptions: { maintainColor: true, opacity: 0.55 },
    },
  });
  map.addControl(drawControl);

  const handleZoneCreated = async (event) => {
    const zone = await zoneFromLayer(event.layer, event.layerType);
    if (!zone) return;
    getCityConfig().zones.push(zone);
    getPartner().approvalStatus = "draft";
    seedPrices(getPartner(), state.selectedCityId);
    render();
  };

  const handleZoneEdited = (event) => {
    event.layers.eachLayer((layer) => persistLayerGeometry(layer));
    getPartner().approvalStatus = "draft";
    render();
  };

  const handleZoneDeleted = (event) => {
    const removedIds = [];
    event.layers.eachLayer((layer) => {
      if (layer._zoneId) removedIds.push(layer._zoneId);
    });
    removeZones(removedIds);
  };

  map.on("draw:created", handleZoneCreated);
  map.on("draw:edited", handleZoneEdited);
  map.on("draw:deleted", handleZoneDeleted);

  document.getElementById("mapNotice").classList.add("hidden");
}

function syncLeafletMap() {
  if (!map || !drawnItems) return;
  const city = getCity();
  if (!suppressMapRefit) {
    map.setView([city.center.lat, city.center.lng], city.zoom);
  }
  suppressMapRefit = false;
  syncAirportMarkers();
  syncZoneLayers();
  setTimeout(() => map.invalidateSize(), 0);
}

function syncAirportMarkers() {
  airportLayerGroup.clearLayers();
  getCity().airports.forEach((airport) => {
    const marker = L.marker([airport.lat, airport.lng], {
      title: airport.name,
      alt: airport.name,
    }).bindPopup(`<strong>${airport.name}</strong><br>${airport.lat.toFixed(4)}, ${airport.lng.toFixed(4)}`);
    marker.on("click", () => {
      state.selectedAirportId = airport.id;
      suppressMapRefit = true;
      render();
      focusAirport();
    });
    marker.addTo(airportLayerGroup);
  });
}

function syncZoneLayers() {
  drawnItems.clearLayers();
  getCityConfig().zones.forEach((zone) => {
    const layer = layerFromZone(zone);
    if (!layer) return;
    layer._zoneId = zone.id;
    layer.bindPopup(`<strong>${zone.name}</strong><br>${humanGeometryType(zone.geometryType)}`);
    drawnItems.addLayer(layer);
  });
}

function layerFromZone(zone) {
  const pathOptions = {
    color: zone.color,
    fillColor: zone.color,
    fillOpacity: 0.22,
    weight: 3,
  };
  if (zone.geometryType === "circle") {
    return L.circle([zone.geometry.center.lat, zone.geometry.center.lng], {
      ...pathOptions,
      radius: zone.geometry.radius,
    });
  }
  if (zone.geometryType === "marker") {
    return L.marker([zone.geometry.lat, zone.geometry.lng]);
  }
  return L[zone.geometryType](
    zone.geometry.latlngs.map((point) => [point.lat, point.lng]),
    pathOptions
  );
}

async function promptForZoneName(defaultName) {
  const modal = document.getElementById("zoneNameModal");
  const input = document.getElementById("zoneNameInput");
  const confirmButton = document.getElementById("zoneNameConfirm");
  const cancelButton = document.getElementById("zoneNameCancel");

  if (!modal || !input || !confirmButton || !cancelButton) {
    return window.prompt("Zone name", defaultName) || defaultName || "New zone";
  }

  return new Promise((resolve) => {
    const finish = (value) => {
      modal.classList.add("hidden");
      confirmButton.onclick = null;
      cancelButton.onclick = null;
      input.onkeydown = null;
      resolve(value);
    };

    input.value = defaultName || "";
    modal.classList.remove("hidden");
    input.focus();
    input.select();

    confirmButton.onclick = () => finish(input.value.trim() || defaultName || "New zone");
    cancelButton.onclick = () => finish(null);
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(input.value.trim() || defaultName || "New zone");
      }
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    };
    modal.onclick = (event) => {
      if (event.target === modal) finish(null);
    };
  });
}

async function zoneFromLayer(layer, layerType) {
  const center = getLayerCenter(layer);
  const reverseName = center ? await reverseGeocode(center.lat, center.lng) : "";
  const config = getCityConfig();
  const zoneNumber = config.zones.length + 1;
  const fallbackName = `${humanGeometryType(layerType)} Zone ${zoneNumber}`;
  const name = await promptForZoneName(reverseName || fallbackName);
  if (!name) return null;
  const zone = {
    id: `zone-${Date.now()}`,
    name: name.trim(),
    color: palette[zoneNumber % palette.length],
    geometryType: layerType,
    geometry: geometryFromLayer(layer, layerType),
  };
  return zone;
}

function persistLayerGeometry(layer) {
  const zone = getCityConfig().zones.find((item) => item.id === layer._zoneId);
  if (!zone) return;
  zone.geometry = geometryFromLayer(layer, zone.geometryType);
}

function geometryFromLayer(layer, layerType) {
  if (layerType === "circle") {
    const center = layer.getLatLng();
    return {
      center: { lat: center.lat, lng: center.lng },
      radius: layer.getRadius(),
    };
  }
  if (layerType === "marker") {
    const point = layer.getLatLng();
    return { lat: point.lat, lng: point.lng };
  }
  const rawLatlngs = layer.getLatLngs()[0] || [];
  const latlngs = Array.isArray(rawLatlngs[0]) ? rawLatlngs[0] : rawLatlngs;
  return {
    latlngs: latlngs.map((point) => ({ lat: point.lat, lng: point.lng })),
  };
}

function getLayerCenter(layer) {
  if (layer.getBounds) {
    const center = layer.getBounds().getCenter();
    return { lat: center.lat, lng: center.lng };
  }
  if (layer.getLatLng) {
    const point = layer.getLatLng();
    return { lat: point.lat, lng: point.lng };
  }
  return null;
}

function getZoneCenter(zone) {
  if (zone.geometryType === "circle") return zone.geometry.center;
  if (zone.geometryType === "marker") return { lat: zone.geometry.lat, lng: zone.geometry.lng };
  const points = zone.geometry.latlngs || [];
  const total = points.reduce((sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }), { lat: 0, lng: 0 });
  return points.length ? { lat: total.lat / points.length, lng: total.lng / points.length } : getCity().center;
}

function humanGeometryType(type) {
  const labels = {
    polygon: "Polygon",
    rectangle: "Rectangle",
    circle: "Circle",
    marker: "Marker",
  };
  return labels[type] || "Zone";
}

function renderZoneList(config) {
  document.getElementById("zoneList").innerHTML = config.zones.length
    ? config.zones
        .map((zone) => {
          const detail = zone.geometryType === "circle"
            ? `${Math.round(zone.geometry.radius)} m radius`
            : `${humanGeometryType(zone.geometryType)} geometry`;
          return `
            <div class="zone-row">
              <div class="zone-name"><span class="zone-swatch" style="background:${zone.color}"></span><span>${zone.name}<small>${detail}</small></span></div>
              <button class="ghost-button rename-zone" data-zone-id="${zone.id}" type="button">Rename</button>
              <button class="icon-button remove-zone" data-zone-id="${zone.id}" type="button" aria-label="Remove ${zone.name}">x</button>
            </div>
          `;
        })
        .join("")
    : `<p class="muted">No zones yet. Use the Leaflet Draw toolbar on the map to create a polygon, rectangle, circle, or marker.</p>`;

  document.querySelectorAll(".rename-zone").forEach((button) => {
    button.addEventListener("click", () => renameZone(button.dataset.zoneId));
  });
  document.querySelectorAll(".remove-zone").forEach((button) => {
    button.addEventListener("click", () => removeZones([button.dataset.zoneId]));
  });
}

function renderPricingEditor() {
  const partner = getPartner();
  const city = getCity();
  const config = getCityConfig(partner);
  seedPrices(partner, state.selectedCityId);

  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.pricingTab === state.pricingTab);
  });

  const vehicles = partner.activeVehicles.map((id) => state.vehicleCategories.find((vehicle) => vehicle.id === id));
  let rows = "";

  if (!vehicles.length) {
    rows = `<p class="muted">Select at least one vehicle category to edit pricing.</p>`;
  } else if (state.pricingTab === "airportZone") {
    rows = city.airports
      .flatMap((airport) =>
        config.zones.map((zone) => {
          const key = airportZoneKey(airport.id, zone.id);
          return `
            <div class="price-row airport-zone">
              <div class="price-label">${airport.name}</div>
              <div class="price-label">${zone.name}</div>
              ${vehicles.map((vehicle) => priceInput("airportZone", key, vehicle)).join("")}
            </div>
          `;
        })
      )
      .join("");
  } else if (state.pricingTab === "zoneZone") {
    rows = config.zones
      .flatMap((fromZone) =>
        config.zones
          .filter((toZone) => toZone.id !== fromZone.id)
          .map((toZone) => {
            const key = zoneZoneKey(fromZone.id, toZone.id);
            return `
              <div class="price-row zone-zone">
                <div class="price-label">${fromZone.name}</div>
                <div class="price-label">${toZone.name}</div>
                ${vehicles.map((vehicle) => priceInput("zoneZone", key, vehicle)).join("")}
              </div>
            `;
          })
      )
      .join("");
  } else {
    rows = Object.keys(config.prices.distance)
      .map((bucket) => {
        return `
          <div class="price-row distance">
            <div class="price-label">${bucket} km</div>
            ${vehicles.map((vehicle) => priceInput("distance", bucket, vehicle)).join("")}
          </div>
        `;
      })
      .join("");
  }

  document.getElementById("pricingEditor").innerHTML = `
    <p class="pricing-note">${state.pricingTab === "airportZone" ? "Every airport in this city gets its own price to every created zone." : "Created zones can be priced against each other for famous routes."}</p>
    <div class="price-grid">${rows || `<p class="muted">Create zones to configure this pricing type.</p>`}</div>
  `;

  document.querySelectorAll("[data-price-path]").forEach((input) => {
    input.addEventListener("input", () => {
      const [type, routeKey, vehicleId] = input.dataset.pricePath.split("|");
      config.prices[type][routeKey][vehicleId] = Number(input.value || 0);
      partner.approvalStatus = "draft";
      renderStatus();
      saveState();
    });
  });
}

function priceInput(type, routeKey, vehicle) {
  const value = getCityConfig().prices[type][routeKey]?.[vehicle.id] ?? 0;
  return `
    <label class="price-input-wrap">
      <span>${vehicle.name}</span>
      <input data-price-path="${type}|${routeKey}|${vehicle.id}" type="number" min="0" value="${value}" />
    </label>
  `;
}

function renderTester() {
  const partner = getPartner();
  const config = getCityConfig(partner);
  const airportLocations = getCity().airports.map((airport) => ({ id: `airport:${airport.id}`, name: airport.name }));
  const zoneLocations = config.zones.map((zone) => ({ id: `zone:${zone.id}`, name: zone.name }));
  const locations = [...airportLocations, ...zoneLocations];
  fillSelect("testPickup", locations, document.getElementById("testPickup").value || airportLocations[0]?.id);
  fillSelect("testDrop", locations, document.getElementById("testDrop").value || zoneLocations[0]?.id || airportLocations[0]?.id);

  const vehicles = partner.activeVehicles.map((id) => state.vehicleCategories.find((vehicle) => vehicle.id === id));
  fillSelect("testVehicle", vehicles.length ? vehicles : state.vehicleCategories.slice(0, 1), document.getElementById("testVehicle").value || vehicles[0]?.id || "sedan");
}

function renderAdmin() {
  const partnerTable = document.getElementById("partnerTable");
  partnerTable.innerHTML = state.partners
    .map((partner) => {
      const cityCount = Object.keys(partner.cities).length;
      return `
        <div class="table-row ${partner.id === state.adminPartnerId ? "selected" : ""}">
          <div>
            <strong>${partner.name}</strong>
            <div class="muted small">${statusLabels[partner.approvalStatus] || "Draft"}</div>
          </div>
          <span>${cityCount} cities</span>
          <span class="mini-pill ${partner.enabled ? "enabled" : "disabled"}">${partner.enabled ? "Enabled" : "Disabled"}</span>
          <button class="ghost-button review-partner" data-partner-id="${partner.id}" type="button">Review</button>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".review-partner").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminPartnerId = button.dataset.partnerId;
      renderAdmin();
      saveState();
    });
  });

  const selectedPartner = state.partners.find((partner) => partner.id === state.adminPartnerId) || state.partners[0];
  state.adminPartnerId = selectedPartner.id;
  const zoneCount = Object.values(selectedPartner.cities).reduce((total, city) => total + city.zones.length, 0);
  const cityCards = Object.entries(selectedPartner.cities)
    .map(([cityId, config]) => {
      const city = state.cities.find((item) => item.id === cityId);
      const zoneSummary = config.zones.length ? config.zones.map((zone) => zone.name).join(", ") : "No zones created yet";
      const pricingRows = Object.keys(config.prices.airportZone || {}).length + Object.keys(config.prices.zoneZone || {}).length;
      return `
        <div class="admin-city-card">
          <div class="admin-city-head">
            <strong>${city?.name || cityId}</strong>
            <span class="mini-pill ${selectedPartner.enabled ? "enabled" : "disabled"}">${config.zones.length} zones</span>
          </div>
          <p class="muted small">${zoneSummary}</p>
          <div class="muted small">Airport/zone rows: ${pricingRows}</div>
        </div>
      `;
    })
    .join("");

  document.getElementById("reviewTitle").textContent = selectedPartner.name;
  document.getElementById("adminReview").innerHTML = `
    <div class="metric-grid">
      <div class="metric"><span>Status</span><strong>${statusLabels[selectedPartner.approvalStatus]}</strong></div>
      <div class="metric"><span>Zones</span><strong>${zoneCount}</strong></div>
      <div class="metric"><span>Vehicles</span><strong>${selectedPartner.activeVehicles.length}</strong></div>
      <div class="metric"><span>Cities</span><strong>${Object.keys(selectedPartner.cities).length}</strong></div>
    </div>
    <div class="admin-section">
      <h3>Served cities</h3>
      ${cityCards || '<p class="muted">No city coverage has been configured yet.</p>'}
    </div>
    <p class="muted">Approve submitted pricing to make it live, reject it for partner changes, or disable the partner from serving live prices.</p>
    <div class="review-actions">
      <button class="primary-button" id="approvePartner" type="button">Approve live</button>
      <button class="danger-button" id="rejectPartner" type="button">Reject</button>
      <button class="ghost-button" id="togglePartner" type="button">${selectedPartner.enabled ? "Disable partner" : "Enable partner"}</button>
    </div>
  `;

  document.getElementById("approvePartner").addEventListener("click", () => {
    selectedPartner.approvalStatus = "approved";
    render();
  });
  document.getElementById("rejectPartner").addEventListener("click", () => {
    selectedPartner.approvalStatus = "rejected";
    render();
  });
  document.getElementById("togglePartner").addEventListener("click", () => {
    selectedPartner.enabled = !selectedPartner.enabled;
    render();
  });
}

function renameZone(zoneId) {
  const zone = getCityConfig().zones.find((item) => item.id === zoneId);
  const name = prompt("Zone name", zone.name);
  if (!name || !name.trim()) return;
  zone.name = name.trim();
  getPartner().approvalStatus = "draft";
  render();
}

function removeZones(zoneIds) {
  const partner = getPartner();
  const config = getCityConfig(partner);
  config.zones = config.zones.filter((zone) => !zoneIds.includes(zone.id));
  zoneIds.forEach((zoneId) => {
    Object.keys(config.prices.airportZone).forEach((key) => {
      if (key.endsWith(`:${zoneId}`)) delete config.prices.airportZone[key];
    });
    Object.keys(config.prices.zoneZone).forEach((key) => {
      if (key.includes(zoneId)) delete config.prices.zoneZone[key];
    });
  });
  partner.approvalStatus = "draft";
  render();
}

async function runPriceTest() {
  const pickup = document.getElementById("testPickup").value;
  const drop = document.getElementById("testDrop").value;
  const vehicleId = document.getElementById("testVehicle").value;
  const quote = calculateQuote(pickup, drop, vehicleId);
  const route = await calculateRoute(pickup, drop);
  renderRoute(route);

  const routeNote = route
    ? `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min by OSRM`
    : "Route unavailable, pricing fallback shown";
  const comparisons = [
    { name: getPartner().name, price: quote, note: `Your configured price. ${routeNote}` },
    { name: "Affiliate 1", price: Math.round(quote * 1.08), note: "Masked market comparison" },
    { name: "Affiliate 2", price: Math.round(quote * 0.96), note: "Masked market comparison" },
  ];
  document.getElementById("quoteResults").innerHTML = comparisons
    .map(
      (row) => `
        <div class="quote-row">
          <div><strong>${row.name}</strong><small>${row.note}</small></div>
          <strong>${formatMoney(row.price)}</strong>
        </div>
      `
    )
    .join("");
}

function calculateQuote(pickup, drop, vehicleId) {
  const config = getCityConfig();
  const from = parseLocation(pickup);
  const to = parseLocation(drop);
  if (from.type === "airport" && to.type === "zone") {
    return config.prices.airportZone[airportZoneKey(from.id, to.id)]?.[vehicleId] || fallbackDistancePrice(vehicleId);
  }
  if (to.type === "airport" && from.type === "zone") {
    return config.prices.airportZone[airportZoneKey(to.id, from.id)]?.[vehicleId] || fallbackDistancePrice(vehicleId);
  }
  if (from.type === "zone" && to.type === "zone" && from.id !== to.id) {
    return config.prices.zoneZone[zoneZoneKey(from.id, to.id)]?.[vehicleId] || fallbackDistancePrice(vehicleId);
  }
  return fallbackDistancePrice(vehicleId);
}

async function calculateRoute(pickup, drop) {
  const from = resolveLocationCenter(parseLocation(pickup));
  const to = resolveLocationCenter(parseLocation(drop));
  if (!from || !to || (from.lat === to.lat && from.lng === to.lng)) return null;

  const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return data.routes[0];
  } catch {
    return null;
  }
}

function renderRoute(route) {
  if (!map) return;
  if (routeLayer) {
    routeLayer.remove();
    routeLayer = null;
  }
  if (!route?.geometry?.coordinates) return;
  const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  routeLayer = L.polyline(latlngs, {
    color: "#17211b",
    weight: 5,
    opacity: 0.74,
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
}

function parseLocation(value) {
  const [type, id] = value.split(":");
  return { type, id };
}

function resolveLocationCenter(location) {
  if (location.type === "airport") {
    const airport = getCity().airports.find((item) => item.id === location.id);
    return airport ? { lat: airport.lat, lng: airport.lng } : null;
  }
  const zone = getCityConfig().zones.find((item) => item.id === location.id);
  return zone ? getZoneCenter(zone) : null;
}

function fallbackDistancePrice(vehicleId) {
  return getCityConfig().prices.distance["11-25"]?.[vehicleId] || 0;
}

async function searchPlaces() {
  const input = document.getElementById("placeSearchInput");
  const query = input.value.trim();
  if (!query) return;

  const resultsElement = document.getElementById("placeResults");
  resultsElement.innerHTML = `<p class="muted">Searching OpenStreetMap...</p>`;

  const results = await nominatimSearch(query);
  if (!results.length) {
    resultsElement.innerHTML = `<p class="muted">No places found.</p>`;
    return;
  }

  resultsElement.innerHTML = results
    .map(
      (place, index) => `
        <button class="place-result" data-place-index="${index}" type="button">
          <strong>${place.display_name.split(",")[0]}</strong>
          <span>${place.display_name}</span>
        </button>
      `
    )
    .join("");

  document.querySelectorAll(".place-result").forEach((button) => {
    button.addEventListener("click", () => {
      const place = results[Number(button.dataset.placeIndex)];
      const lat = Number(place.lat);
      const lng = Number(place.lon);
      suppressMapRefit = true;
      map.setView([lat, lng], 15);
      L.marker([lat, lng]).addTo(map).bindPopup(place.display_name).openPopup();
    });
  });
}

async function nominatimSearch(query) {
  const cacheKey = `${state.selectedCityId}:${query.toLowerCase()}`;
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
  await throttleNominatim();
  const city = getCity();
  const viewbox = [
    city.center.lng - 0.8,
    city.center.lat + 0.8,
    city.center.lng + 0.8,
    city.center.lat - 0.8,
  ].join(",");
  const params = new URLSearchParams({
    format: "jsonv2",
    q: `${query}, ${city.name}`,
    limit: "5",
    addressdetails: "1",
    bounded: "0",
    viewbox,
  });
  const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params}`);
  const results = response.ok ? await response.json() : [];
  searchCache.set(cacheKey, results);
  return results;
}

async function reverseGeocode(lat, lng) {
  await throttleNominatim();
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    zoom: "16",
    addressdetails: "1",
  });
  try {
    const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params}`);
    if (!response.ok) return "";
    const result = await response.json();
    return result.name || result.address?.suburb || result.address?.road || "";
  } catch {
    return "";
  }
}

async function throttleNominatim() {
  const elapsed = Date.now() - lastNominatimRequestAt;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastNominatimRequestAt = Date.now();
}

function fitCity() {
  if (!map) return;
  const city = getCity();
  map.setView([city.center.lat, city.center.lng], city.zoom);
}

function focusAirport() {
  if (!map) return;
  const airport = getAirport();
  map.setView([airport.lat, airport.lng], 13);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    state.currentView = button.dataset.view;
    render();
  });
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    state.pricingTab = button.dataset.pricingTab;
    render();
  });
});

document.getElementById("partnerSelect").addEventListener("change", (event) => {
  state.selectedPartnerId = event.target.value;
  state.adminPartnerId = event.target.value;
  render();
});

document.getElementById("citySelect").addEventListener("change", (event) => {
  state.selectedCityId = event.target.value;
  state.selectedAirportId = getCity(event.target.value).airports[0].id;
  getCityConfig();
  render();
});

document.getElementById("airportSelect").addEventListener("change", (event) => {
  state.selectedAirportId = event.target.value;
  suppressMapRefit = true;
  render();
  focusAirport();
});

document.getElementById("fitCity").addEventListener("click", fitCity);
document.getElementById("placeSearchButton").addEventListener("click", searchPlaces);
document.getElementById("placeSearchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPlaces();
});
document.getElementById("runTest").addEventListener("click", runPriceTest);
document.getElementById("submitApproval").addEventListener("click", () => {
  getPartner().approvalStatus = "pending";
  render();
});
document.getElementById("resetData").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state = hydrateState();
  render();
});

state = hydrateState();
render();
