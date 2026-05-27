const charts = {};

function destroy(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

export function renderTopCafes(cafes, minCount = 2) {
  destroy("top");
  const ctx = document.getElementById("chart-top");
  if (!ctx) return;

  const top = cafes
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  charts.top = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map((c) => c.cafe_name),
      datasets: [{
        label: "Avg rating",
        data: top.map((c) => +c.avg.toFixed(2)),
        backgroundColor: "#2a9d3f",
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { min: 0, max: 10 } },
      plugins: { legend: { display: false } },
    },
  });
}

export function renderDistribution(ratings) {
  destroy("dist");
  const ctx = document.getElementById("chart-dist");
  if (!ctx) return;

  const buckets = new Array(10).fill(0);
  const labels = [];
  for (let i = 0; i < 10; i++) labels.push(`${i}–${i + 1}`);

  for (const r of ratings) {
    const idx = Math.min(9, Math.max(0, Math.floor(r.rating)));
    buckets[idx]++;
  }

  charts.dist = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Ratings",
        data: buckets,
        backgroundColor: "#e0a526",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

export function renderProlificRaters(ratings) {
  destroy("raters");
  const ctx = document.getElementById("chart-raters");
  if (!ctx) return;

  const counts = new Map();
  for (const r of ratings) {
    const name = (r.by || "Anonymous").trim() || "Anonymous";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  charts.raters = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(([n]) => n),
      datasets: [{
        label: "Ratings submitted",
        data: sorted.map(([, c]) => c),
        backgroundColor: "#5b8def",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

export function renderCharts(cafes, ratings, minCount = 2) {
  renderTopCafes(cafes, minCount);
  renderDistribution(ratings);
  renderProlificRaters(ratings);
}
