import { MARTIN_PLACE, isConfigured } from "./config.js";
import { subscribeRatings, addRating } from "./db.js";
import { initMap, renderMarkers, onMapClick, onRateCafe, setPin, flyTo } from "./map.js";
import { renderCharts } from "./charts.js";

const $ = (id) => document.getElementById(id);

const els = {
  form: $("rating-form"),
  cafeName: $("cafe_name"),
  addressQuery: $("address_query"),
  searchBtn: $("search-btn"),
  searchResults: $("search-results"),
  address: $("address"),
  lat: $("lat"),
  lng: $("lng"),
  rating: $("rating"),
  ratingRange: $("rating_range"),
  ratingOut: $("rating_out"),
  by: $("by"),
  comment: $("comment"),
  submitBtn: $("submit-btn"),
  status: $("form-status"),
  minRatingsToggle: $("min-ratings-toggle"),
  leaderboardBody: document.querySelector("#leaderboard tbody"),
  leaderboardHead: document.querySelector("#leaderboard thead"),
  configWarning: $("config-warning"),
};

const state = {
  ratings: [],
  cafes: [],
  sortKey: "avg",
  sortDir: "desc",
  minRatings: false,
};

// ---------- Hero stat cards ----------
function renderHeroStats() {
  const { ratings, cafes } = state;
  const total = ratings.length;
  const avg = total ? ratings.reduce((s, r) => s + r.rating, 0) / total : null;
  const champ = [...cafes].filter((c) => c.count >= 2).sort((a, b) => b.avg - a.avg)[0]
              ?? [...cafes].sort((a, b) => b.avg - a.avg)[0];

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-cafes").textContent = cafes.length;
  document.getElementById("stat-avg").textContent = avg == null ? "—" : avg.toFixed(1);
  document.getElementById("stat-top").textContent = champ
    ? `${champ.cafe_name} · ${champ.avg.toFixed(1)}`
    : "—";
}

// ---------- Top 3 podium ----------
function renderPodium() {
  const top3 = [...state.cafes]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  const slots = [
    document.querySelector('.podium-slot[data-rank="1"]'),
    document.querySelector('.podium-slot[data-rank="2"]'),
    document.querySelector('.podium-slot[data-rank="3"]'),
  ];
  slots.forEach((slot, i) => {
    if (!slot) return;
    const cafe = top3[i];
    const nameEl = slot.querySelector(".podium-name");
    const scoreEl = slot.querySelector(".podium-score");
    const countEl = slot.querySelector(".podium-count");
    if (cafe) {
      nameEl.textContent = cafe.cafe_name;
      scoreEl.textContent = cafe.avg.toFixed(1);
      countEl.textContent = `${cafe.count} rating${cafe.count === 1 ? "" : "s"}`;
      slot.style.cursor = "pointer";
      slot.onclick = () => flyTo(cafe.lat, cafe.lng, 17);
    } else {
      nameEl.textContent = "—";
      scoreEl.textContent = "—";
      countEl.textContent = "Need 2+ ratings";
      slot.style.cursor = "default";
      slot.onclick = null;
    }
  });
}

// ---------- Recent ratings feed ----------
function renderRecent() {
  const list = document.getElementById("recent-list");
  list.innerHTML = "";
  const recent = state.ratings.slice(0, 8);
  if (!recent.length) {
    list.innerHTML = '<p class="muted">No ratings yet — be the first to rate a cafe!</p>';
    return;
  }
  for (const r of recent) {
    const klass = r.rating < 5 ? "is-red" : r.rating <= 7 ? "is-amber" : "is-green";
    const card = document.createElement("div");
    card.className = `recent-card ${klass}`;
    card.innerHTML = `
      <div class="recent-head">
        <span class="recent-cafe">${escapeHtml(r.cafe_name)}</span>
        <span class="recent-rating">${r.rating.toFixed(1)}</span>
      </div>
      <div class="recent-meta">by ${escapeHtml(r.by)} · ${fmtAgo(r.created_at?.seconds)}</div>
      ${r.comment ? `<div class="recent-comment">“${escapeHtml(r.comment)}”</div>` : ""}
    `;
    card.addEventListener("click", () => flyTo(r.lat, r.lng, 17));
    list.appendChild(card);
  }
}

function showStatus(msg, kind) {
  els.status.hidden = false;
  els.status.textContent = msg;
  els.status.className = `status ${kind ?? ""}`;
  if (kind === "ok") {
    setTimeout(() => { els.status.hidden = true; }, 3000);
  }
}

// ---------- Rating slider <-> number sync ----------
els.ratingRange.addEventListener("input", () => {
  els.rating.value = els.ratingRange.value;
  els.ratingOut.textContent = Number(els.ratingRange.value).toFixed(1);
});
els.rating.addEventListener("input", () => {
  const v = Math.max(0, Math.min(10, Number(els.rating.value) || 0));
  els.ratingRange.value = v;
  els.ratingOut.textContent = v.toFixed(1);
});

// ---------- localStorage name memory ----------
const savedName = localStorage.getItem("cc_name");
if (savedName) els.by.value = savedName;
els.by.addEventListener("change", () => {
  localStorage.setItem("cc_name", els.by.value.trim());
});

// ---------- Nominatim search ----------
async function searchCafe(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!r.ok) throw new Error("Search failed");
  return r.json();
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  const r = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!r.ok) return null;
  return r.json();
}

els.searchBtn.addEventListener("click", async () => {
  const q = els.addressQuery.value.trim();
  if (!q) return;
  els.searchBtn.setAttribute("aria-busy", "true");
  els.searchResults.innerHTML = "";
  els.searchResults.hidden = true;
  try {
    const results = await searchCafe(q);
    if (!results.length) {
      showStatus("No matches found.", "err");
      return;
    }
    for (const r of results) {
      const li = document.createElement("li");
      li.textContent = r.display_name;
      li.addEventListener("click", () => {
        pickResult(r);
        els.searchResults.hidden = true;
      });
      els.searchResults.appendChild(li);
    }
    els.searchResults.hidden = false;
  } catch (e) {
    showStatus(e.message, "err");
  } finally {
    els.searchBtn.removeAttribute("aria-busy");
  }
});

function pickResult(r) {
  const lat = Number(r.lat), lng = Number(r.lon);
  els.address.value = r.display_name;
  els.lat.value = lat;
  els.lng.value = lng;
  if (!els.cafeName.value && r.namedetails?.name) {
    els.cafeName.value = r.namedetails.name;
  }
  setPin(lat, lng);
  flyTo(lat, lng);
}

// ---------- Map click → reverse geocode ----------
onMapClick(async (lat, lng) => {
  els.lat.value = lat;
  els.lng.value = lng;
  const r = await reverseGeocode(lat, lng);
  if (r?.display_name) els.address.value = r.display_name;
});

// ---------- Form submit ----------
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isConfigured()) {
    showStatus("Supabase not configured — see assets/js/config.js.", "err");
    return;
  }
  const cafe_name = els.cafeName.value.trim();
  const address = els.address.value.trim();
  const lat = Number(els.lat.value);
  const lng = Number(els.lng.value);
  const rating = Number(els.rating.value);
  const by = els.by.value.trim();
  const comment = els.comment.value.trim();

  if (!cafe_name || !by) { showStatus("Cafe name and your name are required.", "err"); return; }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showStatus("Pick a location: search or click the map.", "err"); return;
  }
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    showStatus("Rating must be between 0 and 10.", "err"); return;
  }

  els.submitBtn.setAttribute("aria-busy", "true");
  try {
    await addRating({ cafe_name, address, lat, lng, rating, by, comment });
    localStorage.setItem("cc_name", by);
    showStatus("Thanks! Rating saved.", "ok");
    els.cafeName.value = "";
    els.comment.value = "";
  } catch (err) {
    showStatus(err.message || "Could not save rating.", "err");
  } finally {
    els.submitBtn.removeAttribute("aria-busy");
  }
});

// ---------- Group ratings into cafes ----------
function groupCafes(ratings) {
  const keyOf = (r) => `${r.cafe_name}|${Number(r.lat).toFixed(4)}|${Number(r.lng).toFixed(4)}`;
  const map = new Map();
  for (const r of ratings) {
    if (typeof r.lat !== "number" || typeof r.lng !== "number") continue;
    const k = keyOf(r);
    if (!map.has(k)) {
      map.set(k, { key: k, cafe_name: r.cafe_name, address: r.address, lat: r.lat, lng: r.lng, ratings: [] });
    }
    map.get(k).ratings.push(r);
  }
  return [...map.values()].map((c) => ({
    ...c,
    avg: c.ratings.reduce((s, r) => s + r.rating, 0) / c.ratings.length,
    count: c.ratings.length,
    last: Math.max(...c.ratings.map((r) => r.created_at?.seconds ?? 0)),
  }));
}

// ---------- Distance ----------
function distKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- Leaderboard ----------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtAgo(seconds) {
  if (!seconds) return "—";
  const ms = Date.now() - seconds * 1000;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function renderLeaderboard() {
  const tbody = els.leaderboardBody;
  tbody.innerHTML = "";

  let rows = state.cafes.map((c) => ({
    ...c,
    dist: distKm(MARTIN_PLACE, { lat: c.lat, lng: c.lng }),
  }));
  if (state.minRatings) rows = rows.filter((r) => r.count >= 2);

  const dir = state.sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const k = state.sortKey;
    if (k === "cafe") return a.cafe_name.localeCompare(b.cafe_name) * dir;
    if (k === "dist") return (a.dist - b.dist) * dir;
    if (k === "last") return (a.last - b.last) * dir;
    if (k === "count") return (a.count - b.count) * dir;
    return (a.avg - b.avg) * dir;
  });

  rows.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(c.cafe_name)}</td>
      <td>${c.avg.toFixed(1)}</td>
      <td>${c.count}</td>
      <td>${fmtAgo(c.last)}</td>
      <td>${c.dist.toFixed(2)} km</td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => flyTo(c.lat, c.lng, 17));
    tbody.appendChild(tr);
  });

  // sort indicators
  els.leaderboardHead.querySelectorAll("th").forEach((th) => {
    if (th.dataset.sort === state.sortKey) {
      th.setAttribute("data-sort-active", "true");
      th.setAttribute("data-sort-dir", state.sortDir === "asc" ? "▲" : "▼");
    } else {
      th.removeAttribute("data-sort-active");
      th.removeAttribute("data-sort-dir");
    }
  });
}

els.leaderboardHead.addEventListener("click", (e) => {
  const th = e.target.closest("th");
  if (!th?.dataset.sort || th.dataset.sort === "rank") return;
  const key = th.dataset.sort;
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = key === "cafe" || key === "dist" ? "asc" : "desc";
  }
  renderLeaderboard();
});

els.minRatingsToggle.addEventListener("change", () => {
  state.minRatings = els.minRatingsToggle.checked;
  renderLeaderboard();
  renderCharts(state.cafes, state.ratings, state.minRatings ? 2 : 1);
});

// ---------- Rate-this-cafe button in popups ----------
onRateCafe((cafe) => {
  els.cafeName.value = cafe.cafe_name;
  els.address.value = cafe.address || "";
  els.lat.value = cafe.lat;
  els.lng.value = cafe.lng;
  setPin(cafe.lat, cafe.lng);
  els.cafeName.scrollIntoView({ behavior: "smooth", block: "center" });
  els.rating.focus();
});

// ---------- Boot ----------
initMap();

if (!isConfigured()) {
  els.configWarning.hidden = false;
  renderHeroStats();
  renderPodium();
  renderRecent();
  renderLeaderboard();
  renderCharts([], [], 1);
} else {
  subscribeRatings(
    (ratings) => {
      state.ratings = ratings;
      state.cafes = groupCafes(ratings);
      renderMarkers(state.cafes);
      renderHeroStats();
      renderPodium();
      renderRecent();
      renderLeaderboard();
      renderCharts(state.cafes, state.ratings, state.minRatings ? 2 : 1);
    },
    (err) => {
      console.error(err);
      showStatus(`Live updates failed: ${err.message}`, "err");
    },
  );
}
