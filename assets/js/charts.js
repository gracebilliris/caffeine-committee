const charts = {};

const PALETTE = {
  red:   "#d33",
  amber: "#e0a526",
  green: "#2a9d3f",
  coffee: "#6f4e37",
  cream:  "#c9a27a",
  blue:   "#5b8def",
};

function colorForAvg(avg) {
  if (avg < 5) return PALETTE.red;
  if (avg <= 7) return PALETTE.amber;
  return PALETTE.green;
}

// Vertical gradient helper for canvas bars.
function makeGradient(ctx, area, from, to) {
  if (!area) return from;
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

// Lighten a hex color by mixing with white.
function lighten(hex, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function applyGlobalDefaults() {
  if (Chart.__ccDefaultsApplied) return;
  Chart.__ccDefaultsApplied = true;

  const css = getComputedStyle(document.documentElement);
  const text = css.getPropertyValue("--pico-color").trim() || "#373c44";
  const muted = css.getPropertyValue("--pico-muted-color").trim() || "#73828c";
  const border = css.getPropertyValue("--pico-muted-border-color").trim() || "#dfe3eb";

  Chart.defaults.font.family =
    'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = text;
  Chart.defaults.borderColor = border;

  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(40, 30, 25, 0.92)";
  Chart.defaults.plugins.tooltip.titleColor = "#fff";
  Chart.defaults.plugins.tooltip.bodyColor = "#fff";
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.tooltip.titleFont = { weight: "600" };
  Chart.defaults.plugins.legend.labels.color = muted;
}

function destroy(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function truncate(s, n = 22) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function renderTopCafes(cafes, minCount = 2) {
  applyGlobalDefaults();
  destroy("top");
  const el = document.getElementById("chart-top");
  if (!el) return;

  const top = cafes
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  const values = top.map((c) => +c.avg.toFixed(2));
  const colors = top.map((c) => colorForAvg(c.avg));

  charts.top = new Chart(el, {
    type: "bar",
    data: {
      labels: top.map((c) => truncate(c.cafe_name)),
      datasets: [{
        label: "Avg rating",
        data: values,
        backgroundColor: (ctx) => {
          const c = colors[ctx.dataIndex] ?? PALETTE.green;
          return makeGradient(ctx.chart.ctx, ctx.chart.chartArea, lighten(c, 0.25), c);
        },
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.8,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 24 } },
      scales: {
        x: {
          min: 0, max: 10,
          grid: { color: "rgba(120,120,120,0.08)" },
          ticks: { stepSize: 2 },
        },
        y: { grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const cafe = top[ctx.dataIndex];
              return ` ${cafe.avg.toFixed(2)} / 10  ·  ${cafe.count} ratings`;
            },
          },
        },
      },
      animation: { duration: 600, easing: "easeOutQuart" },
    },
    plugins: [valueLabelPlugin({ axis: "x", suffix: "" })],
  });
}

export function renderDistribution(ratings) {
  applyGlobalDefaults();
  destroy("dist");
  const el = document.getElementById("chart-dist");
  if (!el) return;

  // 11 buckets: 0, 1, 2 ... 10 (round to nearest integer).
  const buckets = Array.from({ length: 11 }, () => 0);
  for (const r of ratings) {
    const b = Math.max(0, Math.min(10, Math.round(r.rating)));
    buckets[b] += 1;
  }
  const total = buckets.reduce((s, n) => s + n, 0);
  const avg = total
    ? ratings.reduce((s, r) => s + r.rating, 0) / total
    : null;

  charts.dist = new Chart(el, {
    type: "bar",
    data: {
      labels: buckets.map((_, i) => String(i)),
      datasets: [{
        label: "Ratings",
        data: buckets,
        backgroundColor: (ctx) => {
          const i = ctx.dataIndex;
          const base = i < 5 ? PALETTE.red : i <= 7 ? PALETTE.amber : PALETTE.green;
          return makeGradient(ctx.chart.ctx, ctx.chart.chartArea, lighten(base, 0.35), base);
        },
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.92,
        categoryPercentage: 0.92,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Score" } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: "rgba(120,120,120,0.08)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Score: ${items[0].label}`,
            label: (ctx) => {
              const pct = total ? ((ctx.parsed.y / total) * 100).toFixed(0) : 0;
              return ` ${ctx.parsed.y} rating${ctx.parsed.y === 1 ? "" : "s"} (${pct}%)`;
            },
          },
        },
        annotationLine: avg != null ? { avg } : null,
      },
      animation: { duration: 600, easing: "easeOutQuart" },
    },
    plugins: [valueLabelPlugin({ axis: "y" }), avgLinePlugin()],
  });
}

// Vertical dashed line at the average score (custom plugin).
function avgLinePlugin() {
  return {
    id: "ccAvgLine",
    afterDatasetsDraw(chart) {
      const opt = chart.options.plugins.annotationLine;
      if (!opt || opt.avg == null) return;
      const x = chart.scales.x.getPixelForValue(opt.avg);
      const { top, bottom } = chart.chartArea;
      const { ctx } = chart;
      ctx.save();
      ctx.strokeStyle = "rgba(111,78,55,0.7)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      const label = `avg ${opt.avg.toFixed(1)}`;
      ctx.font = "600 11px " + Chart.defaults.font.family;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(111,78,55,0.95)";
      ctx.beginPath();
      const r = 4, h = 18;
      const lx = Math.min(Math.max(x - w / 2, chart.chartArea.left), chart.chartArea.right - w);
      ctx.roundRect(lx, top - h - 2, w, h, r);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + w / 2, top - h / 2 - 2);
      ctx.restore();
    },
  };
}

// ---------- Sub-rating radar (taste/price/vibes/service) ----------
const SUB_KEYS = ["taste", "price", "vibes", "service"];

export function renderSubRatingRadar(ratings, cardEl) {
  applyGlobalDefaults();
  destroy("radar");
  const el = document.getElementById("chart-radar");
  if (!el) return;

  const sums = { taste: 0, price: 0, vibes: 0, service: 0 };
  const counts = { taste: 0, price: 0, vibes: 0, service: 0 };
  for (const r of ratings) {
    for (const k of SUB_KEYS) {
      const v = r[k];
      if (Number.isFinite(v) && v > 0) { sums[k] += v; counts[k] += 1; }
    }
  }
  const totalSub = SUB_KEYS.reduce((s, k) => s + counts[k], 0);
  if (cardEl) cardEl.hidden = totalSub === 0;
  if (totalSub === 0) return;

  const values = SUB_KEYS.map((k) => counts[k] ? +(sums[k] / counts[k]).toFixed(2) : 0);

  charts.radar = new Chart(el, {
    type: "radar",
    data: {
      labels: SUB_KEYS.map((k) => k[0].toUpperCase() + k.slice(1)),
      datasets: [{
        label: "Team average (1–5)",
        data: values,
        fill: true,
        backgroundColor: "rgba(224, 165, 38, 0.25)",
        borderColor: PALETTE.amber,
        borderWidth: 2,
        pointBackgroundColor: PALETTE.coffee,
        pointBorderColor: "#fff",
        pointHoverRadius: 6,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 5,
          ticks: { stepSize: 1, backdropColor: "transparent", color: "rgba(120,120,120,0.6)" },
          grid: { color: "rgba(120,120,120,0.15)" },
          angleLines: { color: "rgba(120,120,120,0.15)" },
          pointLabels: { font: { size: 12, weight: "600" } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const k = SUB_KEYS[ctx.dataIndex];
              return ` ${ctx.parsed.r.toFixed(2)} / 5  ·  ${counts[k]} rating${counts[k] === 1 ? "" : "s"}`;
            },
          },
        },
      },
      animation: { duration: 700, easing: "easeOutQuart" },
    },
  });
}

// ---------- Activity over time ----------
export function renderActivity(ratings) {
  applyGlobalDefaults();
  destroy("activity");
  const el = document.getElementById("chart-activity");
  if (!el) return;

  const DAYS = 30;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const labels = [];
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(d);
    days.push({ key: d.toISOString().slice(0, 10), count: 0, sum: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));

  for (const r of ratings) {
    const s = r.created_at?.seconds;
    if (!s) continue;
    const d = new Date(s * 1000);
    d.setHours(0, 0, 0, 0);
    const k = d.toISOString().slice(0, 10);
    const i = idx.get(k);
    if (i == null) continue;
    days[i].count += 1;
    days[i].sum   += r.rating;
  }
  const counts = days.map((d) => d.count);
  const avgs   = days.map((d) => d.count ? +(d.sum / d.count).toFixed(2) : null);

  const fmt = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" });

  charts.activity = new Chart(el, {
    type: "bar",
    data: {
      labels: labels.map((d) => fmt.format(d)),
      datasets: [
        {
          type: "bar",
          label: "Ratings/day",
          data: counts,
          backgroundColor: (ctx) =>
            makeGradient(ctx.chart.ctx, ctx.chart.chartArea, lighten(PALETTE.coffee, 0.55), PALETTE.coffee),
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: "yCount",
          order: 2,
        },
        {
          type: "line",
          label: "Avg score",
          data: avgs,
          borderColor: PALETTE.amber,
          backgroundColor: "rgba(224,165,38,0.18)",
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: PALETTE.amber,
          pointBorderColor: "#fff",
          spanGaps: true,
          yAxisID: "yAvg",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        yCount: {
          beginAtZero: true,
          position: "left",
          ticks: { precision: 0, color: PALETTE.coffee },
          grid: { color: "rgba(120,120,120,0.08)" },
          title: { display: true, text: "Ratings", color: PALETTE.coffee },
        },
        yAvg: {
          beginAtZero: true,
          max: 10,
          position: "right",
          ticks: { color: PALETTE.amber },
          grid: { display: false },
          title: { display: true, text: "Avg score", color: PALETTE.amber },
        },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "circle" },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === "Ratings/day")
                return ` ${ctx.parsed.y} rating${ctx.parsed.y === 1 ? "" : "s"}`;
              return ctx.parsed.y == null ? null : ` Avg ${ctx.parsed.y.toFixed(2)} / 10`;
            },
          },
        },
      },
      animation: { duration: 600, easing: "easeOutQuart" },
    },
  });
}

export function renderProlificRaters(ratings) {
  applyGlobalDefaults();
  destroy("raters");
  const el = document.getElementById("chart-raters");
  if (!el) return;

  const counts = new Map();
  for (const r of ratings) {
    const name = (r.by || "Anonymous").trim() || "Anonymous";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  charts.raters = new Chart(el, {
    type: "bar",
    data: {
      labels: sorted.map(([n]) => truncate(n, 14)),
      datasets: [{
        label: "Ratings submitted",
        data: sorted.map(([, c]) => c),
        backgroundColor: (ctx) =>
          makeGradient(ctx.chart.ctx, ctx.chart.chartArea, PALETTE.cream, PALETTE.coffee),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 16 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} rating${ctx.parsed.y === 1 ? "" : "s"}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: "rgba(120,120,120,0.08)" },
        },
      },
      animation: { duration: 600, easing: "easeOutQuart" },
    },
    plugins: [valueLabelPlugin({ axis: "y" })],
  });
}

export function renderTeamChart(ratings, cardEl, teamNameById) {
  applyGlobalDefaults();
  destroy("teams");
  const el = document.getElementById("chart-teams");
  if (!el) return;

  // Aggregate avg + count per team_id.
  const map = new Map();
  for (const r of ratings) {
    const id = r.team_id;
    if (!id) continue;
    const e = map.get(id) ?? { sum: 0, n: 0 };
    e.sum += r.rating; e.n += 1;
    map.set(id, e);
  }
  const resolve = teamNameById || ((id) => id);
  const teams = [...map.entries()]
    .map(([id, { sum, n }]) => ({ name: resolve(id) || "Unknown team", avg: sum / n, count: n }))
    .sort((a, b) => b.avg - a.avg);

  if (cardEl) cardEl.hidden = teams.length === 0;
  if (!teams.length) return;

  charts.teams = new Chart(el, {
    type: "bar",
    data: {
      labels: teams.map((t) => t.name),
      datasets: [{
        label: "Avg rating",
        data: teams.map((t) => +t.avg.toFixed(2)),
        backgroundColor: (ctx) =>
          makeGradient(ctx.chart.ctx, ctx.chart.chartArea, lighten(PALETTE.coffee, 0.4), PALETTE.coffee),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 24 } },
      scales: {
        x: { min: 0, max: 10, grid: { color: "rgba(120,120,120,0.08)" } },
        y: { grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const t = teams[ctx.dataIndex];
              return ` ${t.avg.toFixed(2)} / 10  ·  ${t.count} ratings`;
            },
          },
        },
      },
      animation: { duration: 600, easing: "easeOutQuart" },
    },
    plugins: [valueLabelPlugin({ axis: "x" })],
  });
}
function valueLabelPlugin({ axis = "y", suffix = "" } = {}) {
  return {
    id: "ccValueLabel",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const ds = chart.getDatasetMeta(0);
      if (!ds) return;
      ctx.save();
      ctx.fillStyle = Chart.defaults.color;
      ctx.font = "600 11px " + Chart.defaults.font.family;
      ds.data.forEach((bar, i) => {
        const raw = chart.data.datasets[0].data[i];
        if (raw == null || raw === 0) return;
        const txt = (typeof raw === "number" && !Number.isInteger(raw))
          ? raw.toFixed(1) + suffix
          : raw + suffix;
        if (axis === "x") {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(" " + txt, bar.x + 4, bar.y);
        } else {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(txt, bar.x, bar.y - 4);
        }
      });
      ctx.restore();
    },
  };
}

export function renderCharts(cafes, ratings, minCount = 2) {
  renderTopCafes(cafes, minCount);
  renderDistribution(ratings);
  renderSubRatingRadar(ratings, document.getElementById("chart-radar-card"));
  renderActivity(ratings);
  renderProlificRaters(ratings);
}
