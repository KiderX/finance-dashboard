/**
 * @fileoverview Chart.js rendering helpers for the finance dashboard.
 * All charts use the fintech dark design system and Hebrew labels with ₪ formatting.
 */

'use strict';

/** Chart colour constants matching the design system */
const CHART_COLORS = {
  income:     '#10b981',
  expense:    '#f43f5e',
  accent:     '#00d4ff',
  primary:    '#0ea5e9',
  violet:     '#7c3aed',
  muted:      '#64748b',
  cardBg:     'rgba(10, 18, 35, 0.92)',
  text:       '#f1f5f9',
  grid:       'rgba(255, 255, 255, 0.05)',
  allocation: ['#10b981', '#0ea5e9', '#7c3aed', '#f59e0b', '#00d4ff'],
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
  if (rate >= SAVINGS_THRESHOLDS.warn) return '#f59e0b';
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
    animation: { duration: 600, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: {
          color: CHART_COLORS.text,
          font: { family: 'Heebo', size: 12, weight: '500' },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: CHART_COLORS.cardBg,
        titleColor: CHART_COLORS.text,
        bodyColor: '#94a3b8',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        titleFont: { family: 'Heebo', weight: 'bold', size: 13 },
        bodyFont: { family: 'Heebo', size: 12 },
        displayColors: true,
        boxPadding: 4,
      },
    },
  };
}

/**
 * Shared scale configuration for x and y axes.
 * @param {Function} [yFormatter] - Optional tick formatter for the y-axis.
 * @returns {Object} Chart.js scales config.
 */
function defaultScales(yFormatter) {
  const axisStyle = {
    ticks: { color: CHART_COLORS.muted, font: { family: 'Heebo', size: 11 } },
    grid:  { color: CHART_COLORS.grid },
    border: { display: false },
  };

  const scales = {
    x: { ...axisStyle },
    y: {
      ...axisStyle,
      ticks: {
        ...axisStyle.ticks,
        callback: yFormatter || ((v) => v),
      },
    },
  };

  return scales;
}

/**
 * Creates a vertical gradient fill for line charts.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {string} colorHex - Top color (rgba start).
 * @param {number} [height=200] - Gradient height in px.
 * @returns {CanvasGradient}
 */
function makeGradient(ctx, colorHex, height = 200) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  // Convert hex to rgb for rgba
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  gradient.addColorStop(0,   `rgba(${r},${g},${b},0.22)`);
  gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.06)`);
  gradient.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  return gradient;
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
  const opts   = defaultOptions();
  opts.scales  = defaultScales((v) => formatShekel(v));
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
          borderRadius: 8,
          borderSkipped: false,
        },
        {
          label: 'הוצאות',
          data: expenseData,
          backgroundColor: CHART_COLORS.expense,
          borderRadius: 8,
          borderSkipped: false,
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
  const opts   = defaultOptions();
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `${ctx.label}: ${formatShekel(ctx.parsed)}`,
  };
  opts.cutout = '62%';

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: CHART_COLORS.allocation,
          borderColor: 'rgba(3, 7, 18, 0.8)',
          borderWidth: 3,
          hoverOffset: 6,
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
  const ctx    = canvas.getContext('2d');
  const opts   = defaultOptions();

  opts.scales = defaultScales((v) => `${v}%`);
  opts.scales.y.min = 0;
  opts.scales.y.max = 100;
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `חיסכון: ${ctx.parsed.y.toFixed(1)}%`,
  };

  const pointColors = rates.map((r) => savingsRateColor(r));
  const gradient    = makeGradient(ctx, '#00d4ff', 260);

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'אחוז חיסכון',
          data: rates,
          borderColor: CHART_COLORS.accent,
          backgroundColor: gradient,
          pointBackgroundColor: pointColors,
          pointBorderColor: '#030712',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
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
  const ctx    = canvas.getContext('2d');
  const opts   = defaultOptions();

  opts.scales = defaultScales((v) => formatShekel(v));
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => `שווי נקי: ${formatShekel(ctx.parsed.y)}`,
  };

  const gradient = makeGradient(ctx, '#10b981', 340);

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'שווי נקי כולל',
          data: values,
          borderColor: CHART_COLORS.income,
          backgroundColor: gradient,
          pointBackgroundColor: CHART_COLORS.income,
          pointBorderColor: '#030712',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
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
  const opts   = defaultOptions();

  opts.scales = defaultScales((v) => formatShekel(v));
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
          borderRadius: 8,
          borderSkipped: false,
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
  const opts   = defaultOptions();

  opts.scales = defaultScales((v) => formatShekel(v));
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
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
          backgroundColor: 'rgba(14, 165, 233, 0.5)',
          borderColor: CHART_COLORS.primary,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
        {
          label: 'קרן כספית',
          data: cashFund,
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderColor: CHART_COLORS.income,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
        {
          label: 'חסכונות',
          data: savings,
          backgroundColor: 'rgba(124, 58, 237, 0.5)',
          borderColor: CHART_COLORS.violet,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
      ],
    },
    options: opts,
  });
}
