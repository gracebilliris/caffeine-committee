import { MARTIN_PLACE, isConfigured } from "./config.js";
import { subscribeRatings, addRating } from "./db.js";
import { initMap, renderMarkers, onMapClick, onRateCafe, setPin, flyTo } from "./map.js";
import { renderCharts, renderTeamChart } from "./charts.js";
import {
  initAuth, getAuthState, onAuthChange,
  requestOtpCode, verifyOtpCode, signOut,
} from "./auth.js";
import {
  initTeams, getTeamsState, onTeamsChange,
  createTeam, joinByCode, leaveTeam, teamById,
} from "./teams.js";

const SUB_KEYS = ["taste", "price", "vibes", "service"];

const $ = (id) => document.getElementById(id);

const els = {
  form: $("rating-form"),
  cafeName: $("cafe_name"),
  cafeSuggestions: $("cafe-suggestions"),
  addressQuery: $("address_query"),
  searchResults: $("search-results"),
  address: $("address"),
  lat: $("lat"),
  lng: $("lng"),
  rating: $("rating"),
  ratingRange: $("rating_range"),
  ratingOut: $("rating_out"),
  by: $("by"),
  teamSelect: $("team_select"),
  teamHint: $("team-hint"),
  teamFilterSection: $("team-filter-section"),
  teamPills: $("team-pills"),
  chartTeamsCard: $("chart-teams-card"),
  comment: $("comment"),
  submitBtn: $("submit-btn"),
  status: $("form-status"),
  leaderboardBody: document.querySelector("#leaderboard tbody"),
  leaderboardHead: document.querySelector("#leaderboard thead"),
  configWarning: $("config-warning"),
  // Auth
  authArea: $("auth-area"),
  authDialog: $("auth-dialog"),
  authForm: $("auth-form"),
  authEmail: $("auth-email"),
  authCode: $("auth-code"),
  authCodeLabel: $("auth-code-label"),
  authSubmit: $("auth-submit"),
  authResend: $("auth-resend"),
  authStatus: $("auth-status"),
  // Teams
  myTeamsSection: $("my-teams-section"),
  myTeamsList: $("my-teams-list"),
  createTeamBtn: $("create-team-btn"),
  joinTeamBtn: $("join-team-btn"),
  teamDialog: $("team-dialog"),
  teamDialogTitle: $("team-dialog-title"),
  teamForm: $("team-form"),
  teamNameLabel: $("team-name-label"),
  teamCodeLabel: $("team-code-label"),
  teamName: $("team-name"),
  teamCode: $("team-code"),
  teamSubmit: $("team-submit"),
  teamStatus: $("team-status"),
};

const state = {
  ratings: [],
  cafes: [],
  allCafes: [],
  sortKey: "avg",
  sortDir: "desc",
  teamFilter: "all",   // "all" or a team_id
};

// ---------- Hero stat cards ----------
function renderHeroStats() {
  const { ratings, cafes } = state;
  const total = ratings.length;
  const avg = total ? ratings.reduce((s, r) => s + r.rating, 0) / total : null;
  const champ = [...cafes].sort((a, b) => b.avg - a.avg)[0];

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
    .filter((c) => c.count >= 1)
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
      countEl.textContent = "No ratings yet";
      slot.style.cursor = "default";
      slot.onclick = null;
    }
  });
}

// ---------- Recent ratings feed ----------
function subBarsHtml(r) {
  const rows = SUB_KEYS
    .filter((k) => Number.isFinite(r[k]) && r[k] > 0)
    .map((k) => {
      const pct = (r[k] / 5) * 100;
      return `<div class="sub-bar"><span>${k[0].toUpperCase() + k.slice(1)}</span>
        <span class="track"><span class="fill" style="width:${pct}%"></span></span></div>`;
    });
  return rows.length ? `<div class="sub-bars">${rows.join("")}</div>` : "";
}

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
    const teamName = r.team_id ? (teamById(r.team_id)?.name ?? null) : null;
    const teamTag = teamName ? ` · <strong>${escapeHtml(teamName)}</strong>` : "";
    card.innerHTML = `
      <div class="recent-head">
        <span class="recent-cafe">${escapeHtml(r.cafe_name)}</span>
        <span class="recent-rating">${r.rating.toFixed(1)}</span>
      </div>
      <div class="recent-meta">by ${escapeHtml(r.by)}${teamTag} · ${fmtAgo(r.created_at?.seconds)}</div>
      ${r.comment ? `<div class="recent-comment">“${escapeHtml(r.comment)}”</div>` : ""}
      ${subBarsHtml(r)}
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

// ---------- localStorage name + team memory ----------
const savedName = localStorage.getItem("cc_name");
if (savedName) els.by.value = savedName;
els.by.addEventListener("change", () => {
  localStorage.setItem("cc_name", els.by.value.trim());
});

// ---------- Star-rating pickers (taste/price/vibes/service) ----------
const subValues = { taste: 0, price: 0, vibes: 0, service: 0 };

function buildStars() {
  for (const row of document.querySelectorAll(".sub-row")) {
    const key = row.dataset.sub;
    const container = row.querySelector(".stars");
    container.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.value = i;
      btn.setAttribute("aria-label", `${key} ${i} of 5`);
      btn.textContent = "★";
      btn.addEventListener("click", () => {
        // Click same star → clear; otherwise set.
        subValues[key] = subValues[key] === i ? 0 : i;
        paintStars(row, subValues[key]);
      });
      container.appendChild(btn);
    }
    const clear = document.createElement("span");
    clear.className = "clear";
    clear.textContent = "(tap to clear)";
    container.appendChild(clear);
  }
}
function paintStars(row, value) {
  row.querySelectorAll("button").forEach((b, i) => {
    b.classList.toggle("on", i < value);
  });
}
function resetStars() {
  for (const k of SUB_KEYS) {
    subValues[k] = 0;
    const row = document.querySelector(`.sub-row[data-sub="${k}"]`);
    if (row) paintStars(row, 0);
  }
}
buildStars();

// ---------- Geocoding (Photon - free, no key, OSM-based but POI-aware) ----------
// Photon results format: { features: [{ geometry: { coordinates: [lon, lat] }, properties: {...} }] }
function formatPhotonLabel(p) {
  const name = p.name;
  const parts = [
    [p.housenumber, p.street].filter(Boolean).join(" "),
    p.suburb || p.district,
    p.city || p.county,
    p.country,
  ].filter(Boolean);
  return name ? `${name} — ${parts.join(", ")}` : parts.join(", ");
}

// Australia-wide search with distance-based ranking from 50 Martin Place.

function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function searchCafe(q) {
  // Two parallel queries: one biased to Martin Place (POIs first), one Nominatim
  // for broader cafe coverage. Merge + dedupe + sort by distance.
  const photonUrl =
    `https://photon.komoot.io/api/?lang=en&limit=15`
    + `&lat=${MARTIN_PLACE.lat}&lon=${MARTIN_PLACE.lng}`
    + `&q=${encodeURIComponent(q)}`;

  // Nominatim is excellent for named POIs (cafes, restaurants). Bias with viewbox.
  const vb = [
    MARTIN_PLACE.lng - 0.5, MARTIN_PLACE.lat - 0.5,
    MARTIN_PLACE.lng + 0.5, MARTIN_PLACE.lat + 0.5,
  ].join(",");
  const nomUrl =
    `https://nominatim.openstreetmap.org/search?format=json&limit=10`
    + `&countrycodes=au&addressdetails=1&namedetails=1`
    + `&viewbox=${vb}&bounded=0`
    + `&q=${encodeURIComponent(q)}`;

  const [photon, nom] = await Promise.allSettled([
    fetch(photonUrl).then((r) => r.ok ? r.json() : { features: [] }),
    fetch(nomUrl, { headers: { "Accept-Language": "en" } })
      .then((r) => r.ok ? r.json() : []),
  ]);

  const out = [];
  if (photon.status === "fulfilled") {
    for (const f of (photon.value.features || [])) {
      const lat = f.geometry.coordinates[1], lon = f.geometry.coordinates[0];
      out.push({
        lat, lon,
        display_name: formatPhotonLabel(f.properties),
        name: f.properties.name,
        osm_value: f.properties.osm_value,
        _src: "photon",
      });
    }
  }
  if (nom.status === "fulfilled") {
    for (const f of nom.value) {
      const lat = Number(f.lat), lon = Number(f.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({
        lat, lon,
        display_name: f.display_name,
        name: f.namedetails?.name || f.name || null,
        osm_value: f.type,
        _src: "nominatim",
      });
    }
  }

  // Dedupe by ~30m proximity + identical name.
  const seen = [];
  const dedup = [];
  for (const r of out) {
    const dup = seen.find((s) =>
      (s.name || "") === (r.name || "")
      && Math.abs(s.lat - r.lat) < 0.0003
      && Math.abs(s.lon - r.lon) < 0.0003,
    );
    if (dup) continue;
    seen.push(r);
    r._dist = haversineKm(MARTIN_PLACE, { lat: r.lat, lng: r.lon });
    dedup.push(r);
  }

  return dedup
    .filter((r) => r._dist <= 4000) // anywhere in Australia
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 8);
}

async function reverseGeocode(lat, lng) {
  const url = `https://photon.komoot.io/reverse?lang=en&lat=${lat}&lon=${lng}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const f = data.features?.[0];
  if (!f) return null;
  return { display_name: formatPhotonLabel(f.properties), name: f.properties.name };
}

// ---------- Debounce helper ----------
function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Address autocomplete (Nominatim, debounced) ----------
let lastAddressQuery = "";

async function runAddressSearch(q) {
  if (q === lastAddressQuery) return;
  lastAddressQuery = q;
  if (q.length < 3) {
    els.searchResults.hidden = true;
    els.searchResults.innerHTML = "";
    return;
  }
  els.addressQuery.setAttribute("aria-busy", "true");
  try {
    const results = await searchCafe(q);
    els.searchResults.innerHTML = "";
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "no-results";
      li.innerHTML = `<span>No matches found for "${escapeHtml(q)}".</span>
        <small class="muted">Try the street address, or click the map to drop a pin.</small>`;
      els.searchResults.appendChild(li);
      els.searchResults.hidden = false;
      return;
    }
    for (const r of results) {
      const li = document.createElement("li");
      const dist = r._dist < 1
        ? `${Math.round(r._dist * 1000)} m`
        : `${r._dist.toFixed(1)} km`;
      li.innerHTML = `<span>${escapeHtml(r.display_name)}</span>
        <small class="muted">${dist}</small>`;
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
    els.addressQuery.removeAttribute("aria-busy");
  }
}

els.addressQuery.addEventListener("input", debounce(() => {
  runAddressSearch(els.addressQuery.value.trim());
}, 350));

els.addressQuery.addEventListener("blur", () => {
  setTimeout(() => { els.searchResults.hidden = true; }, 150);
});
els.addressQuery.addEventListener("focus", () => {
  if (els.searchResults.children.length) els.searchResults.hidden = false;
});

// ---------- Cafe name suggester (match existing cafes) ----------
function renderCafeSuggestions(query) {
  const q = query.trim().toLowerCase();
  els.cafeSuggestions.innerHTML = "";
  if (q.length < 2 || !state.allCafes.length) {
    els.cafeSuggestions.hidden = true;
    return;
  }
  const matches = state.allCafes
    .filter((c) => c.cafe_name.toLowerCase().includes(q))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (!matches.length) { els.cafeSuggestions.hidden = true; return; }

  for (const c of matches) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${escapeHtml(c.cafe_name)}</span>
      <span class="badge">${c.avg.toFixed(1)}</span>
      <span class="hint">${c.count} rating${c.count === 1 ? "" : "s"}</span>
    `;
    li.title = "Use this existing cafe (keeps ratings averaged together)";
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      els.cafeName.value = c.cafe_name;
      els.address.value = c.address || "";
      els.lat.value = c.lat;
      els.lng.value = c.lng;
      setPin(c.lat, c.lng);
      flyTo(c.lat, c.lng, 17);
      els.cafeSuggestions.hidden = true;
    });
    els.cafeSuggestions.appendChild(li);
  }
  els.cafeSuggestions.hidden = false;
}

els.cafeName.addEventListener("input", () => renderCafeSuggestions(els.cafeName.value));
els.cafeName.addEventListener("blur", () => {
  setTimeout(() => { els.cafeSuggestions.hidden = true; }, 150);
});
els.cafeName.addEventListener("focus", () => renderCafeSuggestions(els.cafeName.value));

function pickResult(r) {
  const lat = Number(r.lat), lng = Number(r.lon);
  els.address.value = r.display_name;
  els.lat.value = lat;
  els.lng.value = lng;
  if (!els.cafeName.value && r.name) {
    els.cafeName.value = r.name;
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
  const team_id = els.teamSelect.value || null;
  const comment = els.comment.value.trim();

  const { user, profile } = getAuthState();
  if (!user) { showStatus("Sign in to submit a rating.", "err"); openAuthDialog(); return; }
  if (!cafe_name || !by) { showStatus("Cafe name and your name are required.", "err"); return; }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showStatus("Pick a location: search or click the map.", "err"); return;
  }
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    showStatus("Rating must be between 0 and 10.", "err"); return;
  }

  const subs = {};
  for (const k of SUB_KEYS) if (subValues[k] > 0) subs[k] = subValues[k];

  els.submitBtn.setAttribute("aria-busy", "true");
  try {
    await addRating(
      { cafe_name, address, lat, lng, rating, by, comment, ...subs },
      { userId: user.id, teamId: team_id },
    );
    localStorage.setItem("cc_name", by);
    if (team_id) localStorage.setItem("cc_team_id", team_id);
    showStatus("Thanks! Rating saved.", "ok");
    els.cafeName.value = "";
    els.comment.value = "";
    resetStars();
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
  return [...map.values()].map((c) => {
    const subs = {};
    for (const k of SUB_KEYS) {
      const vals = c.ratings.map((r) => r[k]).filter((v) => Number.isFinite(v) && v > 0);
      subs[k] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    }
    return {
      ...c,
      avg: c.ratings.reduce((s, r) => s + r.rating, 0) / c.ratings.length,
      count: c.ratings.length,
      last: Math.max(...c.ratings.map((r) => r.created_at?.seconds ?? 0)),
      subs,
    };
  });
}

// ---------- Team filter pills ----------
function renderTeamPills(allRatings) {
  const { teams } = getTeamsState();
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const counts = new Map();
  for (const r of allRatings) {
    const id = r.team_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .map(([id, n]) => ({ id, name: teamMap.get(id)?.name ?? "Unknown team", n }))
    .sort((a, b) => b.n - a.n);

  if (!entries.length) {
    els.teamFilterSection.hidden = true;
    els.chartTeamsCard.hidden = true;
    return;
  }
  els.teamFilterSection.hidden = false;

  els.teamPills.innerHTML = "";
  const pills = [{ id: "all", name: "All teams", n: allRatings.length }, ...entries];
  for (const p of pills) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "team-pill" + (state.teamFilter === p.id ? " active" : "");
    pill.innerHTML = `${escapeHtml(p.name)} <span class="count">${p.n}</span>`;
    pill.addEventListener("click", () => {
      state.teamFilter = p.id;
      rerenderAll();
    });
    els.teamPills.appendChild(pill);
  }
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
    const klass = c.avg < 5 ? "is-red" : c.avg <= 7 ? "is-amber" : "is-green";
    const pct = Math.max(0, Math.min(100, (c.avg / 10) * 100));
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(c.cafe_name)}</td>
      <td>
        <span class="lb-avg">
          <span class="lb-avg-num">${c.avg.toFixed(1)}</span>
          <span class="lb-avg-track"><span class="lb-avg-fill ${klass}" style="width:${pct}%"></span></span>
        </span>
      </td>
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

// ---------- Render orchestration ----------
let allRatingsCache = [];

function rerenderAll() {
  const filtered = state.teamFilter === "all"
    ? allRatingsCache
    : allRatingsCache.filter((r) => r.team_id === state.teamFilter);

  state.ratings = filtered;
  state.cafes = groupCafes(filtered);
  state.allCafes = groupCafes(allRatingsCache);

  renderTeamPills(allRatingsCache);
  renderMarkers(state.cafes);
  renderHeroStats();
  renderPodium();
  renderRecent();
  renderLeaderboard();
  renderCharts(state.cafes, state.ratings, 1);
  renderTeamChart(allRatingsCache, els.chartTeamsCard, (id) => teamById(id)?.name);
}

// ---------- Auth UI ----------
// Two-step OTP flow: 1) email -> Supabase sends 6-digit code; 2) verify code.
let pendingEmail = null;

function setAuthMode(mode) {
  // mode: "request" | "verify"
  if (mode === "request") {
    pendingEmail = null;
    els.authEmail.disabled = false;
    els.authEmail.required = true;
    els.authCodeLabel.hidden = true;
    els.authCode.required = false;
    els.authCode.value = "";
    els.authSubmit.textContent = "Send code";
    els.authResend.hidden = true;
  } else {
    els.authEmail.disabled = true;
    els.authEmail.required = false;
    els.authCodeLabel.hidden = false;
    els.authCode.required = true;
    els.authSubmit.textContent = "Verify code";
    els.authResend.hidden = false;
  }
}

function openAuthDialog() {
  els.authStatus.hidden = true;
  els.authForm.reset();
  setAuthMode("request");
  els.authDialog.showModal();
}

els.authDialog.addEventListener("click", (e) => {
  if (e.target.matches("[data-close]") || e.target === els.authDialog) els.authDialog.close();
});
els.teamDialog.addEventListener("click", (e) => {
  if (e.target.matches("[data-close]") || e.target === els.teamDialog) els.teamDialog.close();
});

els.authResend.addEventListener("click", () => {
  els.authStatus.hidden = true;
  setAuthMode("request");
  els.authEmail.focus();
});

els.authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.authSubmit.setAttribute("aria-busy", "true");
  try {
    if (!pendingEmail) {
      const email = els.authEmail.value.trim();
      if (!email) return;
      await requestOtpCode(email);
      pendingEmail = email;
      setAuthMode("verify");
      els.authStatus.hidden = false;
      els.authStatus.className = "status ok";
      els.authStatus.textContent = `We emailed a 6-digit code to ${email}. Enter it above.`;
      els.authCode.focus();
    } else {
      const code = els.authCode.value.trim();
      if (!/^\d{6,10}$/.test(code)) {
        els.authStatus.hidden = false;
        els.authStatus.className = "status err";
        els.authStatus.textContent = "Enter the numeric code from your email.";
        return;
      }
      await verifyOtpCode(pendingEmail, code);
      els.authStatus.hidden = false;
      els.authStatus.className = "status ok";
      els.authStatus.textContent = "Signed in!";
      setTimeout(() => els.authDialog.close(), 600);
    }
  } catch (err) {
    els.authStatus.hidden = false;
    els.authStatus.className = "status err";
    els.authStatus.textContent = err.message || "Sign-in failed.";
  } finally {
    els.authSubmit.removeAttribute("aria-busy");
  }
});

function renderAuthArea() {
  const { user, profile } = getAuthState();
  els.authArea.innerHTML = "";
  if (!user) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary";
    btn.textContent = "Sign in";
    btn.addEventListener("click", openAuthDialog);
    els.authArea.appendChild(btn);
    return;
  }
  const display = profile?.display_name || user.email;
  const initials = display.slice(0, 2).toUpperCase();
  const chip = document.createElement("div");
  chip.className = "auth-chip";
  chip.innerHTML = `<span class="avatar">${escapeHtml(initials)}</span>
    <span>${escapeHtml(display)}</span>
    <button type="button" class="secondary outline" id="sign-out-btn">Sign out</button>`;
  els.authArea.appendChild(chip);
  chip.querySelector("#sign-out-btn").addEventListener("click", () => signOut());
}

// ---------- Teams UI ----------
function openTeamDialog(mode) {
  els.teamForm.reset();
  els.teamStatus.hidden = true;
  els.teamDialog.dataset.mode = mode;
  if (mode === "create") {
    els.teamDialogTitle.textContent = "Create team";
    els.teamNameLabel.hidden = false;
    els.teamCodeLabel.hidden = true;
    els.teamSubmit.textContent = "Create";
  } else {
    els.teamDialogTitle.textContent = "Join team";
    els.teamNameLabel.hidden = true;
    els.teamCodeLabel.hidden = false;
    els.teamSubmit.textContent = "Join";
  }
  els.teamDialog.showModal();
}

els.createTeamBtn.addEventListener("click", () => {
  if (!getAuthState().user) { openAuthDialog(); return; }
  openTeamDialog("create");
});
els.joinTeamBtn.addEventListener("click", () => {
  if (!getAuthState().user) { openAuthDialog(); return; }
  openTeamDialog("join");
});

els.teamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mode = els.teamDialog.dataset.mode;
  els.teamSubmit.setAttribute("aria-busy", "true");
  try {
    if (mode === "create") {
      const t = await createTeam(els.teamName.value);
      els.teamStatus.hidden = false;
      els.teamStatus.className = "status ok";
      els.teamStatus.textContent = `Team "${t.name}" created. Share code: ${t.join_code}`;
    } else {
      const t = await joinByCode(els.teamCode.value);
      els.teamStatus.hidden = false;
      els.teamStatus.className = "status ok";
      els.teamStatus.textContent = `Joined "${t.name}".`;
    }
    setTimeout(() => els.teamDialog.close(), 1200);
  } catch (err) {
    els.teamStatus.hidden = false;
    els.teamStatus.className = "status err";
    els.teamStatus.textContent = err.message || "Could not complete action.";
  } finally {
    els.teamSubmit.removeAttribute("aria-busy");
  }
});

function renderMyTeams() {
  const { user } = getAuthState();
  const { teams, myMemberships } = getTeamsState();

  if (!user) {
    els.myTeamsSection.hidden = true;
    return;
  }
  els.myTeamsSection.hidden = false;

  const mine = teams.filter((t) => myMemberships.includes(t.id));
  els.myTeamsList.innerHTML = "";

  if (!mine.length) {
    els.myTeamsList.innerHTML = '<p class="muted">You haven\'t joined any teams yet.</p>';
  } else {
    for (const t of mine) {
      const card = document.createElement("div");
      card.className = "team-card";
      card.innerHTML = `
        <div>
          <div class="team-card-name">${escapeHtml(t.name)}</div>
          <code class="team-card-code" title="Click to copy">${escapeHtml(t.join_code)}</code>
        </div>
        <button type="button" class="team-leave" title="Leave team">Leave</button>
      `;
      card.querySelector(".team-card-code").addEventListener("click", async (e) => {
        try {
          await navigator.clipboard.writeText(t.join_code);
          e.target.textContent = "copied!";
          setTimeout(() => { e.target.textContent = t.join_code; }, 1200);
        } catch {}
      });
      card.querySelector(".team-leave").addEventListener("click", async () => {
        if (!confirm(`Leave "${t.name}"?`)) return;
        try { await leaveTeam(t.id); } catch (err) { alert(err.message); }
      });
      els.myTeamsList.appendChild(card);
    }
  }

  // Update the form's team selector with the user's joined teams.
  const prev = els.teamSelect.value;
  els.teamSelect.innerHTML = '<option value="">No team</option>';
  for (const t of mine) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    els.teamSelect.appendChild(opt);
  }
  const savedTeamId = localStorage.getItem("cc_team_id");
  if (mine.some((t) => t.id === prev)) els.teamSelect.value = prev;
  else if (savedTeamId && mine.some((t) => t.id === savedTeamId)) els.teamSelect.value = savedTeamId;

  els.teamSelect.disabled = mine.length === 0;
  els.teamHint.textContent = mine.length
    ? "Tag this rating with your team."
    : "Join or create a team to tag this rating.";
}

// ---------- Boot ----------
initMap();

if (!isConfigured()) {
  els.configWarning.hidden = false;
  allRatingsCache = [];
  rerenderAll();
} else {
  initAuth().then(() => {
    renderAuthArea();
    initTeams().then(renderMyTeams);
  });
  onAuthChange(() => { renderAuthArea(); renderMyTeams(); rerenderAll(); });
  onTeamsChange(() => { renderMyTeams(); rerenderAll(); });

  subscribeRatings(
    (ratings) => {
      allRatingsCache = ratings;
      rerenderAll();
    },
    (err) => {
      console.error(err);
      showStatus(`Live updates failed: ${err.message}`, "err");
    },
  );
}
