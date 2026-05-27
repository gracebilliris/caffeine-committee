import { MARTIN_PLACE, DEFAULT_ZOOM } from "./config.js";

let map = null;
let markerLayer = null;
let pinMarker = null;
const callbacks = { onMapClick: null, onRateCafe: null };

export function initMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true })
    .setView([MARTIN_PLACE.lat, MARTIN_PLACE.lng], DEFAULT_ZOOM);

  // CartoDB "Voyager" — clean, modern, readable.
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    },
  ).addTo(map);

  // Office marker (Martin Place) — small, subdued.
  const officeIcon = L.divIcon({
    className: "cc-office-icon",
    html: '<div style="background:#1d1916;color:#fff;font-size:.7rem;padding:2px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25);">🏢 50 Martin Place</div>',
    iconSize: [0, 0],
    iconAnchor: [50, 12],
  });
  L.marker([MARTIN_PLACE.lat, MARTIN_PLACE.lng], { icon: officeIcon, interactive: false }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  map.on("click", (e) => {
    setPin(e.latlng.lat, e.latlng.lng);
    callbacks.onMapClick?.(e.latlng.lat, e.latlng.lng);
  });

  return map;
}

export function onMapClick(fn) { callbacks.onMapClick = fn; }
export function onRateCafe(fn) { callbacks.onRateCafe = fn; }

const pinIcon = () => L.divIcon({
  className: "cc-pin-wrap",
  html: `<div class="cc-pin">
    <svg viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e0a526"/>
          <stop offset="100%" stop-color="#6f4e37"/>
        </linearGradient>
      </defs>
      <path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="url(#pg)"/>
      <circle cx="18" cy="18" r="7" fill="#fff"/>
      <text x="18" y="22" text-anchor="middle" font-size="11">☕</text>
    </svg>
  </div>`,
  iconSize: [36, 48],
  iconAnchor: [18, 46],
  popupAnchor: [0, -42],
});

export function setPin(lat, lng) {
  if (!map) return;
  if (pinMarker) {
    pinMarker.setLatLng([lat, lng]);
  } else {
    pinMarker = L.marker([lat, lng], { icon: pinIcon(), draggable: true }).addTo(map);
    pinMarker.on("dragend", () => {
      const { lat, lng } = pinMarker.getLatLng();
      callbacks.onMapClick?.(lat, lng);
    });
  }
}

export function flyTo(lat, lng, zoom = 17) {
  if (!map) return;
  map.flyTo([lat, lng], zoom, { duration: 0.6 });
}

function colorForAvg(avg) {
  if (avg < 5) return "#d33";
  if (avg <= 7) return "#e0a526";
  return "#2a9d3f";
}

function radiusForCount(count) {
  return Math.min(8 + count * 2, 22);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function renderMarkers(cafes) {
  if (!markerLayer) return;
  markerLayer.clearLayers();

  for (const cafe of cafes) {
    const marker = L.circleMarker([cafe.lat, cafe.lng], {
      radius: radiusForCount(cafe.count),
      color: colorForAvg(cafe.avg),
      fillColor: colorForAvg(cafe.avg),
      fillOpacity: 0.7,
      weight: 2,
    });

    const recent = [...cafe.ratings]
      .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
      .slice(0, 3)
      .filter((r) => r.comment);

    const commentsHtml = recent.length
      ? `<ul class="comments">${recent
          .map((r) => `<li><strong>${escapeHtml(r.by)}</strong> (${r.rating.toFixed(1)}): ${escapeHtml(r.comment)}</li>`)
          .join("")}</ul>`
      : "";

    const html = `
      <div class="popup-cafe">
        <h4>${escapeHtml(cafe.cafe_name)}</h4>
        <div><span class="avg">${cafe.avg.toFixed(1)}</span> / 10
          <small>(${cafe.count} rating${cafe.count === 1 ? "" : "s"})</small></div>
        ${commentsHtml}
        <button type="button" data-cafe-key="${escapeHtml(cafe.key)}">Rate this cafe</button>
      </div>`;

    marker.bindPopup(html);
    marker.on("popupopen", (e) => {
      const btn = e.popup.getElement().querySelector("button[data-cafe-key]");
      if (btn) {
        btn.addEventListener("click", () => callbacks.onRateCafe?.(cafe), { once: true });
      }
    });

    marker.addTo(markerLayer);
  }
}
