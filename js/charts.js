/**
 * @fileoverview Chart.js rendering helpers for the finance dashboard.
 * All charts use the dark design system and Hebrew labels with ₪ formatting.
 */

'use strict';

/** Chart colour constants matching the design system */
const CHART_COLORS = {
  income: '#2ecc71',
  expense: '#e74c3c',
  accent: '#f39c12',
  primary: '#1a5276',
  muted: '#95a5a6',
  cardBg: '#1c2b3a',
  text: '#ecf0f1',
  allocation: ['#2ecc71', '#3498db', '#9b59b6', '#f39c12', '#1abc9c'],
};

/** Savings rate colour thresholds */
const SAVINGS_THRESHOLDS = {
  good: 20,
  warn: 10,
};

/**
 * Formats a number as Israeli Shekel currency.
 * @param {number} value - Numeric amount.
 * @returns {string} Formatted string like ₪1,234.56
 */
function formatShekel(value) {
  return (
    '₪' +
    Math.abs(value).toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Returns the colour for a savings rate percentage.
 * @param {number} rate - Savings rate as a percentage (0–100).
 * @returns {string} CSS colour string.
 */
function savingsRateColor(rate) {
  if (rate >= SAVINGS_THRESHOLDS.good) return CHART_COLORS.income;
  if (rate >= SAVINGS_THRESHOLDS.warn) return CHART_COLORS.accent;
  return CHART_COLORS.expense;
}

/**
 * Shared default options for all charts.
 * @returns {Object} Chart.js options object.
 */
function defaultOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: CHART_COLORS.text,
          font: { family: 'Heebo', size: 13 },
        },
      },
      tooltip: {
        bodyFont: { family: 'Heebo' },
        titleFont: { family: 'Heebo' },
      },
    },
  };
}

/**
 * Destroys an existing Chart instance on a canvas (if any) before creating a new one.
 * @param {string} canvasId - The id of the <canvas> element.
 * @returns {HTMLCanvasElement} The canvas element.
 */
function prepareCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) throw new Error(`Canvas "${canvasId}" לא נמצא`);
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  return canvas;
}

/**
 * Renders a grouped bar chart comparing income and expenses.
 * @param {string} canvasId - Target <canvas> element id.
 * @param {string[]} months - Array of month labels (MM/YYYY).
 * @param {number[]} incomeData - Income totals per month.
 * @param {number[]} expenseData - Expense totals per month.
 * @returns {Chart} The created Chart.js instance.
 */
function renderIncomeExpensesBar(canvasId, months, incomeData, expenseData) {
  const canvas = prepareCanvas(canvasId);
  const opts = defaultOptions();
  opts.scales = {
    x: {
      ticks: { color: CHART_COLORS.text, font: { family: 'Heebo' } },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
    y: {
      ticks: {
        color: CHART_COLORS.text,
        font: { family: 'Heebo' },
        callback: (v) => formatShekel(v),
      },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
  };
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `${ctx.dataset.label}: ${formatShekel(ctx.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'הכנסות',
          data: incomeData,
          backgroundColor: CHART_COLORS.income,
          borderRadius: 6,
        },
        {
          label: 'הוצאות',
          data: expenseData,
          backgroundColor: CHART_COLORS.expense,
          borderRadius: 6,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Renders a donut chart for profit allocation breakdown.
 * @param {string} canvasId - Target <canvas> element id.
 * @param {string[]} labels - Allocation category labels.
 * @param {number[]} data - Amounts per category.
 * @returns {Chart} The created Chart.js instance.
 */
function renderCategoryDonut(canvasId, labels, data) {
  const canvas = prepareCanvas(canvasId);
  const opts = defaultOptions();
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `${ctx.label}: ${formatShekel(ctx.parsed)}`,
  };
  opts.cutout = '60%';

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: CHART_COLORS.allocation,
          borderColor: CHART_COLORS.cardBg,
          borderWidth: 3,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Renders a line chart showing savings rate per month.
 * Points are colour-coded: green (>20%), yellow (10-20%), red (<10%).
 * @param {string} canvasId - Target <canvas> element id.
 * @param {string[]} months - Month labels.
 * @param {number[]} rates - Savings rate percentages (0–100).
 * @returns {Chart} The created Chart.js instance.
 */
function renderSavingsRateLine(canvasId, months, rates) {
  const canvas = prepareCanvas(canvasId);
  const opts = defaultOptions();
  opts.scales = {
    x: {
      ticks: { color: CHART_COLORS.text, font: { family: 'Heebo' } },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        color: CHART_COLORS.text,
        font: { family: 'Heebo' },
        callback: (v) => `${v}%`,
      },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
  };
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `חיסכון: ${ctx.parsed.y.toFixed(1)}%`,
  };

  const pointColors = rates.map((r) => savingsRateColor(r));

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'אחוז חיסכון',
          data: rates,
          borderColor: CHART_COLORS.accent,
          backgroundColor: 'rgba(243,156,18,0.15)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 6,
          pointHoverRadius: 8,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Renders a line chart showing total net worth over time.
 * @param {string} canvasId - Target <canvas> element id.
 * @param {string[]} months - Month labels.
 * @param {number[]} values - Net worth totals per month.
 * @returns {Chart} The created Chart.js instance.
 */
function renderNetWorthLine(canvasId, months, values) {
  const canvas = prepareCanvas(canvasId);
  const opts = defaultOptions();
  opts.scales = {
    x: {
      ticks: { color: CHART_COLORS.text, font: { family: 'Heebo' } },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
    y: {
      ticks: {
        color: CHART_COLORS.text,
        font: { family: 'Heebo' },
        callback: (v) => formatShekel(v),
      },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
  };
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `שווי נקי: ${formatShekel(ctx.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'שווי נקי כולל',
          data: values,
          borderColor: CHART_COLORS.income,
          backgroundColor: 'rgba(46,204,113,0.15)',
          pointBackgroundColor: CHART_COLORS.income,
          pointRadius: 5,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Renders a bar chart of ESPP net income by sale date.
 * @param {string} canvasId - Target <canvas> element id.
 * @param {string[]} dates - Sale date labels.
 * @param {number[]} amounts - Net amounts per sale.
 * @returns {Chart} The created Chart.js instance.
 */
function renderESPPBar(canvasId, dates, amounts) {
  const canvas = prepareCanvas(canvasId);
  const opts = defaultOptions();
  opts.scales = {
    x: {
      ticks: { color: CHART_COLORS.text, font: { family: 'Heebo' } },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
    y: {
      ticks: {
        color: CHART_COLORS.text,
        font: { family: 'Heebo' },
        callback: (v) => formatShekel(v),
      },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
  };
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `סכום נטו: ${formatShekel(ctx.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'ESPP נטו',
          data: amounts,
          backgroundColor: CHART_COLORS.accent,
          borderRadius: 6,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Renders a stacked area chart for net worth breakdown by asset type.
 * @param {string} canvasId - Target <canvas> element id.
 * @param {string[]} months - Month labels.
 * @param {number[]} portfolio - Portfolio values per month.
 * @param {number[]} cashFund - Cash fund values per month.
 * @param {number[]} savings - Savings values per month.
 * @returns {Chart} The created Chart.js instance.
 */
function renderNetWorthStackedArea(canvasId, months, portfolio, cashFund, savings) {
  const canvas = prepareCanvas(canvasId);
  const opts = defaultOptions();
  opts.scales = {
    x: {
      ticks: { color: CHART_COLORS.text, font: { family: 'Heebo' } },
      grid: { color: 'rgba(44,62,80,0.8)' },
      stacked: true,
    },
    y: {
      stacked: true,
      ticks: {
        color: CHART_COLORS.text,
        font: { family: 'Heebo' },
        callback: (v) => formatShekel(v),
      },
      grid: { color: 'rgba(44,62,80,0.8)' },
    },
  };
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `${ctx.dataset.label}: ${formatShekel(ctx.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'תיק השקעות',
          data: portfolio,
          backgroundColor: 'rgba(52,152,219,0.6)',
          borderColor: '#3498db',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'קרן כספית',
          data: cashFund,
          backgroundColor: 'rgba(46,204,113,0.6)',
          borderColor: CHART_COLORS.income,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'חסכונות',
          data: savings,
          backgroundColor: 'rgba(155,89,182,0.6)',
          borderColor: '#9b59b6',
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: opts,
  });
}
