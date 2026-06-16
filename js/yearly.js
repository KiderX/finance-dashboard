'use strict';

let currentYear = new Date().getFullYear();

const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function monthsOfYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/${year}`);
}

function buildMap(sheetData) {
  const map = {};
  if (!sheetData || sheetData.length < 2) return map;
  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][0]) map[sheetData[i][0]] = sheetData[i];
  }
  return map;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Yearly summary table ──────────────────────────────────
function renderYearlySummaryTable(months, income, expenses, profit, savingsRate) {
  const tbody = document.getElementById('yearly-summary-tbody');
  tbody.innerHTML = '';
  let totI = 0, totE = 0, totP = 0;

  months.forEach((m, i) => {
    totI += income[i]; totE += expenses[i]; totP += profit[i];
    const rc = savingsRate[i] >= 20 ? 'rate-good' : savingsRate[i] >= 10 ? 'rate-warn' : 'rate-bad';
    const pc = profit[i] >= 0 ? 'amount-positive' : 'amount-negative';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${MONTH_NAMES[i]}</td>
      <td class="amount-positive">${formatShekel(income[i])}</td>
      <td class="amount-negative">${formatShekel(expenses[i])}</td>
      <td class="${pc}">${formatShekel(profit[i])}</td>
      <td class="${rc}">${savingsRate[i].toFixed(1)}%</td>`;
    tbody.appendChild(tr);
  });

  const avgRate = totI > 0 ? (totP / totI * 100) : 0;
  const tfoot = document.querySelector('#yearly-summary-table tfoot tr');
  if (tfoot) {
    const rc = avgRate >= 20 ? 'rate-good' : avgRate >= 10 ? 'rate-warn' : 'rate-bad';
    const pc = totP >= 0 ? 'amount-positive' : 'amount-negative';
    tfoot.innerHTML = `
      <td>סה"כ שנתי</td>
      <td class="amount-positive">${formatShekel(totI)}</td>
      <td class="amount-negative">${formatShekel(totE)}</td>
      <td class="${pc}">${formatShekel(totP)}</td>
      <td class="${rc}">${avgRate.toFixed(1)}%</td>`;
  }
}

// ── YoY table ─────────────────────────────────────────────
function renderYoYTable(income, expenses, prevIncome, prevExpenses) {
  const tbody = document.getElementById('yoy-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  document.getElementById('yoy-income-cur').textContent  = `הכנסות ${currentYear}`;
  document.getElementById('yoy-expense-cur').textContent = `הוצאות ${currentYear}`;
  document.getElementById('yoy-income-prev').textContent  = `הכנסות ${currentYear - 1}`;
  document.getElementById('yoy-expense-prev').textContent = `הוצאות ${currentYear - 1}`;

  MONTH_NAMES.forEach((name, i) => {
    const dI = income[i] - prevIncome[i];
    const dE = expenses[i] - prevExpenses[i];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${name}</td>
      <td class="amount-positive">${formatShekel(income[i])}</td>
      <td class="amount-negative">${formatShekel(expenses[i])}</td>
      <td class="amount-positive">${formatShekel(prevIncome[i])}</td>
      <td class="amount-negative">${formatShekel(prevExpenses[i])}</td>
      <td class="${dI >= 0 ? 'amount-positive' : 'amount-negative'}">${dI >= 0 ? '+' : ''}${formatShekel(dI)}</td>
      <td class="${dE <= 0 ? 'amount-positive' : 'amount-negative'}">${dE > 0 ? '+' : ''}${formatShekel(dE)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Recurring detection ───────────────────────────────────
function detectRecurring(txData, year) {
  const tbody = document.getElementById('recurring-tbody');
  if (!tbody) return;

  if (!txData || txData.length < 2) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding:24px;">אין נתונים</td></tr>';
    return;
  }

  const headers = txData[0];
  const merchantIdx = headers.indexOf('שם בית עסק');
  const monthIdx    = headers.indexOf('חודש');
  const amountIdx   = headers.indexOf('סכום חיוב');

  const merchantData = {};
  txData.slice(1).forEach(row => {
    const month = row[monthIdx] || '';
    if (!month.endsWith(`/${year}`)) return;
    const merchant = row[merchantIdx] || '';
    const amount   = parseFloat(row[amountIdx] || 0);
    if (!merchantData[merchant]) merchantData[merchant] = { months: new Set(), amounts: [] };
    merchantData[merchant].months.add(month);
    merchantData[merchant].amounts.push(amount);
  });

  const recurring = Object.entries(merchantData)
    .filter(([, v]) => v.months.size >= 3)
    .map(([merchant, v]) => {
      const avg = v.amounts.reduce((a, b) => a + b, 0) / v.amounts.length;
      return { merchant, months: v.months.size, avg };
    })
    .sort((a, b) => b.months - a.months);

  tbody.innerHTML = '';
  if (recurring.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding:24px;">לא זוהו הוראות קבע</td></tr>';
    return;
  }

  recurring.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(item.merchant)}</td>
      <td class="text-muted">${item.months} חודשים</td>
      <td class="amount-negative">${formatShekel(item.avg)} / חודש</td>`;
    tbody.appendChild(tr);
  });
}

// ── ESPP yearly summary ────────────────────────────────────
// Sourced from the הכנסות (Income) sheet's ESPP column — there's no
// dedicated ESPP entry page anymore, so this is a read-only rollup.
function renderESPPSummary(incomeMap, months, year) {
  const container  = document.getElementById('espp-summary');
  const chartWrap  = document.getElementById('espp-yearly-chart-wrap');
  const legendRow  = document.getElementById('espp-yearly-legend');
  if (!container) return;

  function showEmpty(msg) {
    if (legendRow) legendRow.style.display = 'none';
    if (chartWrap) chartWrap.style.display = 'none';
    container.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:140px;margin-bottom:0;';
    container.innerHTML = `<p class="text-muted" style="font-size:0.88rem;text-align:center;">${msg}</p>`;
  }

  function restoreLayout() {
    if (legendRow) legendRow.style.display = '';
    if (chartWrap) chartWrap.style.display = '';
    container.style.cssText = 'margin-bottom:12px;';
  }

  // Income sheet: חודש(0) | משכורת ראשונה(1) | משכורת שנייה(2) | בונוסים(3) | ESPP(4) | ...
  const now   = new Date();
  const curYM = now.getFullYear() * 12 + now.getMonth();

  const amounts = months.map(m => {
    const [mm, yyyy] = m.split('/').map(Number);
    if (yyyy * 12 + (mm - 1) > curYM) return 0; // month hasn't happened yet — ignore stale/leftover sheet data
    const r = incomeMap[m];
    return r ? parseFloat(r[4] || 0) : 0;
  });
  const totalESPP   = amounts.reduce((s, a) => s + a, 0);
  const monthsCount = amounts.filter(a => a > 0).length;

  if (totalESPP === 0) {
    showEmpty(`אין נתוני ESPP ב-${year}`);
    return;
  }

  restoreLayout();

  container.innerHTML = `
    <div class="d-flex gap-16" style="flex-wrap:wrap;">
      <div><div class="text-muted" style="font-size:0.8rem;">חודשים</div><strong>${monthsCount}</strong></div>
      <div><div class="text-muted" style="font-size:0.8rem;">סה"כ ESPP</div><strong class="text-success">${formatShekel(totalESPP)}</strong></div>
    </div>`;

  renderESPPBar('espp-yearly-chart', MONTH_NAMES, amounts);
}

// ── Main load ─────────────────────────────────────────────
async function loadYearly() {
  const loading  = document.getElementById('loading');
  const content  = document.getElementById('content');
  const errorDiv = document.getElementById('error-container');

  loading.classList.remove('hidden');
  content.classList.add('hidden');
  errorDiv.innerHTML = '';
  document.getElementById('year-display').textContent = currentYear;

  try {
    const [summaryData, allocData, txData, incomeData] = await Promise.all([
      SheetsAPI.getSheet(CONFIG.SHEETS.MONTHLY_SUMMARY),
      SheetsAPI.getSheet(CONFIG.SHEETS.PROFIT_ALLOCATION),
      SheetsAPI.getSheet(getTxSheet(currentYear)),
      SheetsAPI.getSheet(CONFIG.SHEETS.INCOME),
    ]);

    const months   = monthsOfYear(currentYear);
    const prevMonths = monthsOfYear(currentYear - 1);

    const summaryMap = buildMap(summaryData);
    const incomeMap  = buildMap(incomeData);

    // סיכום חודשי: חודש(0) סה"כ הוצאות(1) סה"כ הכנסות(2) רווח(3) אחוז חיסכון(4) [+categories...]
    // If summary sheet is empty, derive from income + transaction data
    const incomeArr = months.map(m => {
      const r = incomeMap[m];
      return r ? parseFloat(r[6] || 0) : 0;
    });

    const expenseArr = months.map(m => {
      const r = summaryMap[m];
      if (r) return parseFloat(r[1] || 0);
      // Fallback: sum transactions for this month
      if (!txData || txData.length < 2) return 0;
      const headers = txData[0];
      const monthIdx = headers.indexOf('חודש');
      const amtIdx   = headers.indexOf('סכום חיוב');
      if (monthIdx === -1) return 0;
      return txData.slice(1)
        .filter(row => row[monthIdx] === m)
        .reduce((s, row) => s + parseFloat(row[amtIdx] || 0), 0);
    });

    const profitArr = months.map((_, i) => incomeArr[i] - expenseArr[i]);
    const rateArr   = months.map((_, i) =>
      incomeArr[i] > 0 ? Math.max(0, Math.min(100, profitArr[i] / incomeArr[i] * 100)) : 0
    );

    const prevIncomeArr = prevMonths.map(m => {
      const r = incomeMap[m];
      return r ? parseFloat(r[6] || 0) : 0;
    });
    const prevExpenseArr = prevMonths.map(m => {
      const r = summaryMap[m];
      return r ? parseFloat(r[1] || 0) : 0;
    });

    // Allocation donut totals
    // Sheet: חודש(0) רווח(1) עו"ש(2) קרן כספית(3) השקעות(4) אחר(5) סה"כ(6)
    const allocTotals = [0, 0, 0, 0];
    const monthSet = new Set(months);
    if (allocData && allocData.length > 1) {
      for (let i = 1; i < allocData.length; i++) {
        const r = allocData[i];
        if (!monthSet.has(r[0])) continue;
        for (let j = 0; j < 4; j++) allocTotals[j] += parseFloat(r[j + 2] || 0);
      }
    }

    // KPI strip
    const totalIncome   = incomeArr.reduce((a, b) => a + b, 0);
    const totalExpenses = expenseArr.reduce((a, b) => a + b, 0);
    const totalProfit   = profitArr.reduce((a, b) => a + b, 0);
    const avgSavings    = totalIncome > 0 ? (totalProfit / totalIncome * 100) : 0;

    const kpiInc = document.getElementById('kpi-total-income');
    const kpiExp = document.getElementById('kpi-total-expenses');
    const kpiPro = document.getElementById('kpi-total-profit');
    const kpiSav = document.getElementById('kpi-avg-savings');
    if (kpiInc) kpiInc.textContent = formatShekel(totalIncome);
    if (kpiExp) kpiExp.textContent = formatShekel(totalExpenses);
    if (kpiPro) {
      kpiPro.textContent = formatShekel(totalProfit);
      kpiPro.className   = 'card-value ' + (totalProfit >= 0 ? 'income' : 'expense');
    }
    if (kpiSav) {
      kpiSav.textContent = avgSavings.toFixed(1) + '%';
      kpiSav.className   = 'card-value ' + (avgSavings >= 20 ? 'income' : avgSavings >= 10 ? 'accent' : 'expense');
    }

    const yearLabel = document.getElementById('yearly-chart-year');
    if (yearLabel) yearLabel.textContent = currentYear;

    renderYearlySummaryTable(months, incomeArr, expenseArr, profitArr, rateArr);
    renderIncomeExpensesBar('yearly-income-expense-chart', MONTH_NAMES, incomeArr, expenseArr);
    renderSavingsRateLine('savings-rate-chart', MONTH_NAMES, rateArr);
    renderCategoryDonut('allocation-donut-chart', ['עו"ש', 'קרן כספית', 'השקעות', 'אחר'], allocTotals, 'allocation-donut-legend');
    renderYoYTable(incomeArr, expenseArr, prevIncomeArr, prevExpenseArr);
    detectRecurring(txData, currentYear);
    renderESPPSummary(incomeMap, months, currentYear);

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    errorDiv.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const sidebarEl   = document.getElementById('sidebar');
  const overlayEl   = document.getElementById('sidebar-overlay');
  const closeSidebar = () => { sidebarEl.classList.remove('open'); overlayEl.classList.remove('show'); };
  document.getElementById('hamburger').addEventListener('click', () => {
    sidebarEl.classList.add('open');
    overlayEl.classList.add('show');
  });
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
  overlayEl.addEventListener('click', closeSidebar);

  const email = await AuthManager.init();
  if (!email) return;
  document.getElementById('user-email').textContent = email;

  document.getElementById('prev-year').addEventListener('click', () => { currentYear--; loadYearly(); });
  document.getElementById('next-year').addEventListener('click', () => { currentYear++; loadYearly(); });

  await loadYearly();
});
