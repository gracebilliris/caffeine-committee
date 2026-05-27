import { MARTIN_PLACE, DEFAULT_ZOOM } from "./config.js";

let map = null;
let markerLayer = null;
let pinMarker = null;
const callbacks = { onMapClick: null, onRateCafe: null };

export function initMap() {
  map = L.map("map").setView([MARTIN_PLACE.lat, MARTIN_PLACE.lng], DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  L.marker([MARTIN_PLACE.lat, MARTIN_PLACE.lng], { opacity: 0.6 })
    .addTo(map)
    .bindPopup("50 Martin Place");

  markerLayer = L.layerGroup().addTo(map);

  map.on("click", async (e) => {
    setPin(e.latlng.lat, e.latlng.lng);
    callbacks.onMapClick?.(e.latlng.lat, e.latlng.lng);
  });

  return map;
}

export function onMapClick(fn) { callbacks.onMapClick = fn; }
export function onRateCafe(fn) { callbacks.onRateCafe = fn; }

export function setPin(lat, lng) {
  if (!map) return;
  if (pinMarker) {
    pinMarker.setLatLng([lat, lng]);
  } else {
    pinMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
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
