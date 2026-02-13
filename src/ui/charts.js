import { getCssVar } from "../utils/core.js";
import { getNamedSubscore } from "../config/constants.js";

export function renderCharts(result, state, ui) {
  if (
    typeof Chart === "undefined" ||
    !ui.languageChart ||
    !ui.importanceChart ||
    !ui.subscoreRadarChart ||
    !ui.activityChart
  ) {
    return;
  }

  const chartColors = [
    getCssVar("--chart-1"),
    getCssVar("--chart-2"),
    getCssVar("--chart-3"),
    getCssVar("--chart-4"),
    getCssVar("--chart-5"),
    getCssVar("--chart-6")
  ];

  const axisColor = getCssVar("--muted");
  const borderColor = getCssVar("--border");

  const languageEntries = Object.entries(result.languageTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const languageLabels = languageEntries.map(([label]) => label);
  const languageValues = languageEntries.map(([, value]) => value);
  const hasLanguageData = languageLabels.length > 0;

  const languageData = {
    labels: hasLanguageData ? languageLabels : ["No data"],
    datasets: [{
      data: hasLanguageData ? languageValues : [1],
      backgroundColor: hasLanguageData ? chartColors : [borderColor],
      borderWidth: 1,
      borderColor
    }]
  };

  destroyChart(state.charts.language);
  state.charts.language = new Chart(ui.languageChart, {
    type: "doughnut",
    data: languageData,
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: axisColor }
        }
      }
    }
  });

  const importanceRepos = result.rankedRepos.slice(0, 10);
  destroyChart(state.charts.importance);
  state.charts.importance = new Chart(ui.importanceChart, {
    type: "bar",
    data: {
      labels: importanceRepos.map((repo) => repo.name),
      datasets: [{
        label: "Importance",
        data: importanceRepos.map((repo) => repo.importance),
        backgroundColor: chartColors[0],
        borderColor: chartColors[1],
        borderWidth: 1
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: axisColor },
          grid: { color: borderColor }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: axisColor },
          grid: { color: borderColor }
        }
      },
      plugins: {
        legend: {
          labels: { color: axisColor }
        }
      }
    }
  });

  const radarLabels = Object.keys(result.subscores).map((key) => getNamedSubscore(key));
  const radarValues = Object.values(result.subscores);

  destroyChart(state.charts.subscoreRadar);
  state.charts.subscoreRadar = new Chart(ui.subscoreRadarChart, {
    type: "radar",
    data: {
      labels: radarLabels,
      datasets: [{
        label: "Portfolio Dimensions",
        data: radarValues,
        backgroundColor: `${chartColors[0]}40`,
        borderColor: chartColors[0],
        borderWidth: 2,
        pointBackgroundColor: chartColors[1]
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { color: axisColor, backdropColor: "transparent" },
          angleLines: { color: borderColor },
          grid: { color: borderColor },
          pointLabels: { color: axisColor }
        }
      },
      plugins: {
        legend: {
          labels: { color: axisColor }
        }
      }
    }
  });

  const bucketLabels = ["0-30d", "31-90d", "91-180d", "181d+"];
  const bucketValues = [
    result.metrics.activityBuckets.updated30d,
    result.metrics.activityBuckets.updated31to90d,
    result.metrics.activityBuckets.updated91to180d,
    result.metrics.activityBuckets.updated181plus
  ];

  destroyChart(state.charts.activity);
  state.charts.activity = new Chart(ui.activityChart, {
    type: "bar",
    data: {
      labels: bucketLabels,
      datasets: [{
        label: "Repo Count",
        data: bucketValues,
        backgroundColor: [chartColors[1], chartColors[2], chartColors[3], chartColors[4]],
        borderWidth: 1,
        borderColor
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: axisColor },
          grid: { color: borderColor }
        },
        y: {
          beginAtZero: true,
          ticks: { color: axisColor, precision: 0 },
          grid: { color: borderColor }
        }
      },
      plugins: {
        legend: {
          labels: { color: axisColor }
        }
      }
    }
  });
}

function destroyChart(chart) {
  if (chart) {
    chart.destroy();
  }
}
