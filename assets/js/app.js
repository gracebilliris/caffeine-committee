import { MARTIN_PLACE, isConfigured } from "./config.js";
import { subscribeRatings, addRating } from "./db.js";
import { initMap, renderMarkers, onMapClick, onRateCafe, setPin, flyTo } from "./map.js";
import { renderCharts, renderTeamChart } from "./charts.js";

const SUB_KEYS = ["taste", "price", "vibes", "service"];

// FUTURE (Option B): replace the free-text "team" tag with real teams.
// Steps would be:
//   1. Add Supabase Auth (magic link or Google).
//   2. New tables: teams, team_members. Add team_id (uuid) to ratings.
//   3. RLS: ratings.select can stay public, but writes require auth.user.id
//      to be a member of the row's team_id.
//   4. Replace the localStorage name/team with current_user.profile,
//      and the pill bar with the user's joined teams.
// For now we keep the lightweight self-identified `team` text field —
// good enough for an internal CBD coffee crew.

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
  team: $("team"),
  teamOptions: $("team-options"),
  teamFilterSection: $("team-filter-section"),
  teamPills: $("team-pills"),
  chartTeamsCard: $("chart-teams-card"),
  comment: $("comment"),
  submitBtn: $("submit-btn"),
  status: $("form-status"),
  leaderboardBody: document.querySelector("#leaderboard tbody"),
  leaderboardHead: document.querySelector("#leaderboard thead"),
  configWarning: $("config-warning"),
};

const state = {
  ratings: [],          // all ratings (unfiltered)
  cafes: [],            // grouped from filtered ratings
  allCafes: [],         // grouped from all ratings (for cafe suggester)
  sortKey: "avg",
  sortDir: "desc",
  teamFilter: "all",    // "all" or a team name
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
    const teamTag = r.team ? ` · <strong>${escapeHtml(r.team)}</strong>` : "";
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

const savedTeam = localStorage.getItem("cc_team");
if (savedTeam) els.team.value = savedTeam;
els.team.addEventListener("change", () => {
  localStorage.setItem("cc_team", els.team.value.trim());
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
      els.searchResults.hidden = true;
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
  const team = els.team.value.trim();
  const comment = els.comment.value.trim();

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
    await addRating({ cafe_name, address, lat, lng, rating, by, team: team || null, comment, ...subs });
    localStorage.setItem("cc_name", by);
    if (team) localStorage.setItem("cc_team", team);
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
  const counts = new Map();
  for (const r of allRatings) {
    const t = (r.team || "").trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const teams = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // Populate the datalist for the form input.
  els.teamOptions.innerHTML = teams.map(([t]) => `<option value="${escapeHtml(t)}">`).join("");

  if (!teams.length) {
    els.teamFilterSection.hidden = true;
    els.chartTeamsCard.hidden = true;
    return;
  }
  els.teamFilterSection.hidden = false;

  els.teamPills.innerHTML = "";
  const pills = [["all", allRatings.length], ...teams];
  for (const [name, count] of pills) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "team-pill" + (state.teamFilter === name ? " active" : "");
    pill.innerHTML = `${name === "all" ? "All teams" : escapeHtml(name)} <span class="count">${count}</span>`;
    pill.addEventListener("click", () => {
      state.teamFilter = name;
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
    : allRatingsCache.filter((r) => (r.team || "").trim() === state.teamFilter);

  state.ratings = filtered;
  state.cafes = groupCafes(filtered);
  state.allCafes = groupCafes(allRatingsCache);

  renderTeamPills(allRatingsCache);
  renderMarkers(state.cafes);
  renderHeroStats();
  renderPodium();
  renderRecent();
  renderLeaderboard();
  renderCharts(state.cafes, state.ratings, 2);
  renderTeamChart(allRatingsCache, els.chartTeamsCard);
}

// ---------- Boot ----------
initMap();

if (!isConfigured()) {
  els.configWarning.hidden = false;
  allRatingsCache = [];
  rerenderAll();
} else {
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
