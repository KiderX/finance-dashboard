/**
 * @fileoverview Chart.js rendering helpers — Premium Fintech Dark v4.
 * Gold accent (#F59E0B), gradient bar fills, glass tooltips, ultra-subtle grid.
 */

'use strict';

const CHART_COLORS = {
  income:     '#10B981',
  expense:    '#F43F5E',
  accent:     '#F59E0B',
  violet:     '#8B5CF6',
  violetLite: '#A78BFA',
  gold:       '#F59E0B',
  primary:    '#F59E0B',
  muted:      '#64748B',
  cardBg:     'rgba(6, 10, 20, 0.97)',
  text:       '#F1F5F9',
  grid:       'rgba(255, 255, 255, 0.035)',
  allocation: ['#0EA5E9', '#6366F1', '#0D9488', '#7C3AED', '#64748B'],
};

const SAVINGS_THRESHOLDS = { good: 20, warn: 10 };

/**
 * Formats a number as Israeli Shekel currency.
 * @param {number} value
 * @returns {string}
 */
function formatShekel(value) {
  const abs = Math.abs(value).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (value < 0 ? '-' : '') + '₪' + abs;
}

/**
 * Returns the colour for a savings rate percentage.
 * @param {number} rate
 * @returns {string}
 */
function savingsRateColor(rate) {
  if (rate >= SAVINGS_THRESHOLDS.good) return CHART_COLORS.income;
  if (rate >= SAVINGS_THRESHOLDS.warn) return CHART_COLORS.gold;
  return CHART_COLORS.expense;
}

/**
 * Creates a vertical linear gradient for area fills and bar charts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} chartArea - Chart.js chartArea object
 * @param {string} hexColor - Base hex color (e.g. '#10B981')
 * @param {number} [topAlpha=0.9] - Opacity at top
 * @param {number} [bottomAlpha=0.45] - Opacity at bottom
 * @returns {CanvasGradient}
 */
function makeGradient(ctx, chartArea, hexColor, topAlpha = 0.9, bottomAlpha = 0.45) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  grad.addColorStop(0,   `rgba(${r},${g},${b},${topAlpha})`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},${bottomAlpha})`);
  return grad;
}

/**
 * Creates a gradient for area (fill) under line charts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} chartArea
 * @param {string} hexColor
 * @returns {CanvasGradient}
 */
function makeAreaGradient(ctx, chartArea, hexColor) {
  return makeGradient(ctx, chartArea, hexColor, 0.25, 0);
}

/**
 * Shared default Chart.js options (glass tooltip, subtle grid, Heebo font).
 * @returns {Object}
 */
function defaultOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 480, easing: 'easeOutCubic' },
    plugins: {
      legend: {
        labels: {
          color: CHART_COLORS.muted,
          font: { family: 'Heebo', size: 12, weight: '500' },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: CHART_COLORS.cardBg,
        titleColor: CHART_COLORS.text,
        bodyColor:  '#94A3B8',
        borderColor: 'rgba(245, 158, 11, 0.28)',
        borderWidth: 1,
        padding: 13,
        cornerRadius: 14,
        titleFont: { family: 'Heebo', weight: 'bold', size: 13 },
        bodyFont:  { family: 'Heebo', size: 12 },
        displayColors: true,
        boxPadding: 4,
      },
    },
  };
}

/**
 * Shared axis configuration.
 * @param {Function} [yCallback] - Y-axis tick formatter.
 * @returns {Object}
 */
function defaultScales(yCallback) {
  const base = {
    ticks:  { color: CHART_COLORS.muted, font: { family: 'Heebo', size: 11 } },
    grid:   { color: CHART_COLORS.grid },
    border: { display: false },
  };
  return {
    x: { ...base },
    y: { ...base, ticks: { ...base.ticks, callback: yCallback || ((v) => v) } },
  };
}

/**
 * Destroys any existing Chart on a canvas before creating a new one.
 * @param {string} canvasId
 * @returns {HTMLCanvasElement}
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
 * Bars use canvas gradient fills (light → mid shade, top → bottom).
 * @param {string} canvasId
 * @param {string[]} months
 * @param {number[]} incomeData
 * @param {number[]} expenseData
 * @returns {Chart}
 */
function renderIncomeExpensesBar(canvasId, months, incomeData, expenseData) {
  const canvas = prepareCanvas(canvasId);
  const ctx    = canvas.getContext('2d');
  const opts   = defaultOptions();
  opts.scales  = defaultScales((v) => formatShekel(v));
  opts.plugins.legend.display = false;
  opts.plugins.tooltip.callbacks = {
    label: (c) => `${c.dataset.label}: ${formatShekel(c.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'הכנסות',
          data: incomeData,
          backgroundColor: (context) => {
            const { chartArea } = context.chart;
            if (!chartArea) return CHART_COLORS.income;
            return makeGradient(ctx, chartArea, '#10B981', 0.82, 0.42);
          },
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.75,
        },
        {
          label: 'הוצאות',
          data: expenseData,
          backgroundColor: (context) => {
            const { chartArea } = context.chart;
            if (!chartArea) return CHART_COLORS.expense;
            return makeGradient(ctx, chartArea, '#F43F5E', 0.82, 0.42);
          },
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.75,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Injects an HTML legend with glowing dots, category names, and percentages
 * into the given container element.
 * @param {HTMLElement|null} container
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string[]} colors
 */
function buildDonutLegend(container, labels, data, colors) {
  if (!container) return;
  const total = data.reduce((a, b) => a + b, 0);
  container.innerHTML = labels.map((lbl, i) => {
    const color = colors[i % colors.length];
    const pct   = total > 0 ? Math.round((data[i] / total) * 100) + '%' : '0%';
    return `
      <div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${color};box-shadow:0 0 6px 2px ${color}88;"></span>
        <span class="donut-legend-name">${lbl}</span>
        <span class="donut-legend-pct">${pct}</span>
      </div>`;
  }).join('');
}

/**
 * Renders a donut chart for expense category or profit allocation breakdown.
 * Thin seamless ring with per-segment colored glow and center hover label.
 * Tooltip is disabled — hovered segment shows its name + amount inside the ring.
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string} [legendContainerId] - ID of element to inject the side legend into
 * @returns {Chart}
 */
function renderCategoryDonut(canvasId, labels, data, legendContainerId) {
  const canvas = prepareCanvas(canvasId);
  const opts   = defaultOptions();
  opts.plugins.tooltip.enabled = false;  // center text replaces tooltip popup
  opts.plugins.legend.display  = false;  // custom HTML legend replaces Chart.js legend
  opts.cutout    = '76%';
  opts.layout    = { padding: 12 };
  opts.animation = { duration: 800, easing: 'easeOutCubic' };

  /* Shows hovered segment's name + amount inside the center hole (no popup). */
  const centerLabel = {
    id: 'donutCenter',
    afterDraw(chart) {
      const active = chart.getActiveElements();
      if (!active.length) return;
      const { ctx, chartArea: { left, top, width, height } } = chart;
      const cx  = left + width / 2;
      const cy  = top  + height / 2;
      const i   = active[0].index;
      const lbl = chart.data.labels[i];
      const val = chart.data.datasets[0].data[i];
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = '500 10px Heebo, sans-serif';
      ctx.fillStyle    = '#64748B';
      ctx.fillText(lbl, cx, cy - 11);
      ctx.font         = '700 14px Heebo, sans-serif';
      ctx.fillStyle    = '#F1F5F9';
      ctx.fillText(formatShekel(val), cx, cy + 8);
      ctx.restore();
    },
  };

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.allocation,
        borderColor:      'transparent',
        borderWidth:      0,
        borderRadius:     4,
        hoverOffset:      12,
        hoverBorderWidth: 0,
      }],
    },
    options: opts,
    plugins: [centerLabel],
  });

  if (legendContainerId) {
    buildDonutLegend(
      document.getElementById(legendContainerId),
      labels, data, CHART_COLORS.allocation
    );
  }

  return chart;
}

/**
 * Renders a smooth area line chart for monthly savings rate.
 * Line and fill both use a live vertical gradient: green (>20%) → gold (10-20%) → red (<10%).
 * Points are hidden at rest; hover reveals a colour-coded dot.
 * Dashed threshold lines mark the 10% and 20% zone boundaries.
 * @param {string} canvasId
 * @param {string[]} months
 * @param {number[]} rates
 * @returns {Chart}
 */
function renderSavingsRateLine(canvasId, months, rates) {
  const canvas = prepareCanvas(canvasId);
  const opts   = defaultOptions();
  opts.scales  = defaultScales((v) => `${v.toFixed(0)}%`);
  opts.scales.y.min = 0;
  opts.scales.y.suggestedMax = 100;
  opts.animation = { duration: 900, easing: 'easeOutCubic' };
  opts.plugins.legend.display = false;  // replaced by static HTML dot in yearly.html
  opts.plugins.tooltip.callbacks = {
    label: (c) => `חיסכון: ${c.parsed.y.toFixed(1)}%`,
  };

  /*
   * Computes zone-aware gradients for both the line stroke and area fill.
   * Runs on every render so positions stay accurate after resize.
   */
  const zoneGradients = {
    id: 'zoneGradients',
    beforeDraw(chart) {
      const { ctx: c, chartArea, scales: { y } } = chart;
      if (!chartArea || !y) return;
      const { top, bottom } = chartArea;
      const range = (y.max - y.min) || 1;
      const p20   = Math.max(0, Math.min(1, (y.max - 20) / range));
      const p10   = Math.max(0, Math.min(1, (y.max - 10) / range));

      const line = c.createLinearGradient(0, top, 0, bottom);
      line.addColorStop(0,                       '#10B981');
      line.addColorStop(Math.max(0, p20 - 0.06), '#10B981');
      line.addColorStop(Math.min(1, p20 + 0.06), '#F59E0B');
      line.addColorStop(Math.max(0, p10 - 0.06), '#F59E0B');
      line.addColorStop(Math.min(1, p10 + 0.06), '#F43F5E');
      line.addColorStop(1,                        '#F43F5E');

      const fill = c.createLinearGradient(0, top, 0, bottom);
      fill.addColorStop(0,                       'rgba(16,185,129,0.38)');
      fill.addColorStop(Math.max(0, p20 - 0.01), 'rgba(16,185,129,0.28)');
      fill.addColorStop(Math.min(1, p20 + 0.01), 'rgba(245,158,11,0.26)');
      fill.addColorStop(Math.max(0, p10 - 0.01), 'rgba(245,158,11,0.20)');
      fill.addColorStop(Math.min(1, p10 + 0.01), 'rgba(244,63,94,0.28)');
      fill.addColorStop(1,                        'rgba(244,63,94,0.04)');

      chart.data.datasets[0].borderColor    = line;
      chart.data.datasets[0].backgroundColor = fill;
    },
  };

  /* Draws dashed threshold lines at 20% (green) and 10% (red) below the data. */
  const thresholdLines = {
    id: 'thresholdLines',
    beforeDatasetsDraw(chart) {
      const { ctx: c, chartArea, scales: { y } } = chart;
      if (!chartArea || !y) return;
      const { left, right } = chartArea;
      c.save();
      [
        { val: 20, color: 'rgba(16,185,129,0.22)' },
        { val: 10, color: 'rgba(244,63,94,0.22)'  },
      ].forEach(({ val, color }) => {
        const py = y.getPixelForValue(val);
        c.strokeStyle = color;
        c.lineWidth   = 1;
        c.setLineDash([5, 5]);
        c.beginPath();
        c.moveTo(left, py);
        c.lineTo(right, py);
        c.stroke();
      });
      c.restore();
    },
  };

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label:                     'אחוז חיסכון',
        data:                      rates,
        borderColor:               CHART_COLORS.gold,  // overridden by zoneGradients
        backgroundColor:           'transparent',       // overridden by zoneGradients
        borderWidth:               2.5,
        pointRadius:               0,
        pointHoverRadius:          7,
        pointHoverBackgroundColor: rates.map(savingsRateColor),
        pointHoverBorderColor:     '#050B18',
        pointHoverBorderWidth:     2,
        tension:                   0.6,
        fill:                      true,
      }],
    },
    options: opts,
    plugins: [zoneGradients, thresholdLines],
  });
}

/**
 * Renders a line chart showing total net worth over time.
 * @param {string} canvasId
 * @param {string[]} months
 * @param {number[]} values
 * @returns {Chart}
 */
function renderNetWorthLine(canvasId, months, values) {
  const canvas = prepareCanvas(canvasId);
  const ctx    = canvas.getContext('2d');
  const opts   = defaultOptions();
  opts.scales  = defaultScales((v) => formatShekel(v));
  opts.plugins.legend.display = false;
  opts.animation = { duration: 900, easing: 'easeOutCubic' };
  opts.plugins.tooltip.callbacks = {
    label: (c) => `שווי נקי: ${formatShekel(c.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'שווי נקי כולל',
        data: values,
        borderColor: CHART_COLORS.income,
        backgroundColor: (context) => {
          const { chartArea } = context.chart;
          if (!chartArea) return 'rgba(16,185,129,0.18)';
          return makeAreaGradient(ctx, chartArea, '#10B981');
        },
        borderWidth: 3,
        pointBackgroundColor: CHART_COLORS.income,
        pointBorderColor: '#050B18',
        pointBorderWidth: 2,
        pointRadius: 4,        // always visible — anchors each month's real value on the curve
        pointHoverRadius: 7,
        tension: 0.3,
        cubicInterpolationMode: 'monotone', // never dips/rises between two equal or flat points
        fill: true,
      }],
    },
    options: opts,
  });
}

/**
 * Renders a bar chart of ESPP income by month.
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {number[]} amounts
 * @returns {Chart}
 */
function renderESPPBar(canvasId, labels, amounts) {
  const canvas = prepareCanvas(canvasId);
  const ctx    = canvas.getContext('2d');
  const opts   = defaultOptions();
  opts.scales  = defaultScales((v) => formatShekel(v));
  opts.plugins.legend.display = false;
  opts.plugins.tooltip.callbacks = {
    label: (c) => `סכום נטו: ${formatShekel(c.parsed.y)}`,
  };

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'ESPP',
          data: amounts,
          backgroundColor: (context) => {
            const { chartArea } = context.chart;
            if (!chartArea) return CHART_COLORS.gold;
            return makeGradient(ctx, chartArea, '#F59E0B', 0.9, 0.5);
          },
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Renders a stacked area chart for net worth breakdown by asset type.
 * @param {string} canvasId
 * @param {string[]} months
 * @param {number[]} portfolio
 * @param {number[]} cashFund
 * @param {number[]} savings
 * @returns {Chart}
 */
function renderNetWorthStackedArea(canvasId, months, portfolio, cashFund, savings) {
  const canvas = prepareCanvas(canvasId);
  const opts   = defaultOptions();
  opts.scales  = defaultScales((v) => formatShekel(v));
  opts.plugins.legend.display = false; // replaced by the clickable glowing-dot legend in the page
  opts.plugins.tooltip.callbacks = {
    label: (c) => `${c.dataset.label}: ${formatShekel(c.parsed.y)}`,
  };

  // Each dataset shows its own CUMULATIVE total (not stacked on top of each other).
  // Datasets are ordered largest→smallest so smaller areas remain visible in front.
  const lineDataset = (label, data, color, alphaTop, alphaBot) => ({
    label,
    data,
    borderColor: color,
    backgroundColor: (ctx) => {
      const { chartArea } = ctx.chart;
      if (!chartArea) return color.replace(')', `, ${alphaTop})`).replace('rgb', 'rgba');
      const c   = ctx.chart.ctx;
      const hex = color.replace('rgb(', '').replace(')', '').split(',').map(Number);
      const g   = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, `rgba(${hex},${alphaTop})`);
      g.addColorStop(1, `rgba(${hex},${alphaBot})`);
      return g;
    },
    borderWidth: 2,
    pointBackgroundColor: color,
    pointBorderColor: '#050B18',
    pointBorderWidth: 2,
    pointRadius: 3,         // always visible — anchors each month's real value on the curve
    pointHoverRadius: 6,
    pointStyle: 'circle',  // forces legend to show a dot, not a filled-area rectangle
    tension: 0.3,
    cubicInterpolationMode: 'monotone', // never dips/rises between two equal or flat points
    fill: true,
  });

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        lineDataset('תיק השקעות', portfolio, 'rgb(14, 165, 233)',  0.50, 0.08),
        lineDataset('קרן כספית',  cashFund,  'rgb(16, 185, 129)', 0.55, 0.12),
        lineDataset('חסכונות',    savings,   'rgb(139, 92, 246)', 0.60, 0.15),
      ],
    },
    options: opts,
  });
}
