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

  const buckets = new Array(10).fill(0);
  const labels = [];
  for (let i = 0; i < 10; i++) labels.push(`${i}–${i + 1}`);

  for (const r of ratings) {
    const idx = Math.min(9, Math.max(0, Math.floor(r.rating)));
    buckets[idx]++;
  }

  const colorForBucket = (i) => (i < 5 ? PALETTE.red : i <= 6 ? PALETTE.amber : PALETTE.green);

  charts.dist = new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Ratings",
        data: buckets,
        backgroundColor: (ctx) => {
          const c = colorForBucket(ctx.dataIndex);
          return makeGradient(ctx.chart.ctx, ctx.chart.chartArea, lighten(c, 0.3), c);
        },
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
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
            title: (items) => `Score ${items[0].label}`,
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

// Draws the numeric value at the end of each bar.
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
  renderProlificRaters(ratings);
}
