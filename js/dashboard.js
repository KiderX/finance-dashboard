'use strict';

let currentMonth = '';

// Income sheet column layout (0-indexed):
// חודש(0) | משכורת ראשונה(1) | משכורת שנייה(2) | בונוסים(3) | ESPP(4) | הכנסות נוספות(5) | סה"כ(6) | הערות(7)
const INCOME_LABELS = ['משכורת ראשונה', 'משכורת שנייה', 'בונוסים', 'ESPP', 'הכנסות נוספות'];

function getCurrentMonthStr() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function shiftMonth(monthStr, delta) {
  const [mm, yyyy] = monthStr.split('/').map(Number);
  const d = new Date(yyyy, mm - 1 + delta, 1);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function findRowForMonth(sheetData, monthStr) {
  if (!sheetData || sheetData.length < 2) return null;
  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][0] === monthStr) return sheetData[i];
  }
  return null;
}

function filterTransactionsByMonth(data, monthStr) {
  if (!data || data.length < 2) return [];
  const headers = data[0];
  const monthIdx = headers.indexOf('חודש');
  if (monthIdx === -1) return [];
  return data.slice(1).filter(row => row[monthIdx] === monthStr);
}

// ── Render income panel ───────────────────────────────────
function renderIncome(incomeRow) {
  const tbody = document.getElementById('income-table-body');
  tbody.innerHTML = '';
  let total = 0;

  INCOME_LABELS.forEach((label, idx) => {
    const value = incomeRow ? parseFloat(incomeRow[idx + 1] || 0) : 0;
    total += isNaN(value) ? 0 : value;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${label}</td>
      <td class="amount-positive">${formatShekel(value)}</td>
      <td class="write-only">
        <input type="number" class="input-inline income-input" data-col="${idx + 1}" value="${value || ''}" placeholder="0" />
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('income-total-cell').textContent = formatShekel(total);
  window._dashIncome = total;

  tbody.querySelectorAll('.income-input').forEach(inp => {
    inp.addEventListener('input', () => {
      let t = 0;
      tbody.querySelectorAll('.income-input').forEach(i => { t += parseFloat(i.value || 0); });
      document.getElementById('income-total-cell').textContent = formatShekel(t);
      window._dashIncome = t;
      updateProfitStats();
    });
  });

  updateProfitStats();
}

// ── Save income ───────────────────────────────────────────
async function saveIncome(allIncomeData) {
  const btn = document.getElementById('save-income-btn');
  const msg = document.getElementById('income-save-msg');
  btn.disabled = true; btn.textContent = 'שומר...';

  try {
    const values = Array.from(document.querySelectorAll('.income-input')).map(i => parseFloat(i.value || 0));
    const total  = values.reduce((a, b) => a + b, 0);
    const row    = [currentMonth, ...values, total, ''];
    const rowNum = SheetsAPI.findMonthRow(allIncomeData, currentMonth);

    if (rowNum === -1) {
      await SheetsAPI.appendRows(CONFIG.SHEETS.INCOME, [row]);
    } else {
      await SheetsAPI.updateRange(CONFIG.SHEETS.INCOME, `A${rowNum}:H${rowNum}`, [row]);
    }

    window._dashIncome = total;
    document.getElementById('income-total-cell').textContent = formatShekel(total);
    document.getElementById('stat-income').textContent = formatShekel(total);
    updateProfitStats();
    msg.innerHTML = '<div class="success-msg">נשמר ✓</div>';
    setTimeout(() => { msg.innerHTML = ''; }, 3000);
  } catch (err) {
    msg.innerHTML = `<div class="error-msg">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'שמור';
  }
}

// ── Render expenses by category ───────────────────────────
function renderExpenses(transactions) {
  // Tally every category that appears in the actual data — not filtered by CONFIG.CATEGORIES,
  // so old rows with renamed categories (e.g. 'רכב', 'הוצאות שטופות') still show up.
  const catTotals = {};
  transactions.forEach(row => {
    const amount = parseFloat(row[2] || 0);
    const cat    = row[3] || 'שונות';
    catTotals[cat] = (catTotals[cat] || 0) + amount;
  });

  const tbody = document.getElementById('expenses-table-body');
  tbody.innerHTML = '';
  let total = 0;

  // Show categories in CONFIG.CATEGORIES order first, then any legacy categories from old data
  const ordered = [
    ...CONFIG.CATEGORIES.filter(c => catTotals[c]),
    ...Object.keys(catTotals).filter(c => !CONFIG.CATEGORIES.includes(c)),
  ];

  ordered.forEach(cat => {
    const amt = catTotals[cat] || 0;
    if (amt === 0) return;
    total += amt;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escHtml(cat)}</td><td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('expenses-total-cell').textContent = formatShekel(total);
  document.getElementById('stat-expenses').textContent = formatShekel(total);
  window._dashExpenses = total;
  updateProfitStats();

  renderIncomeExpensesBar(
    'income-expense-chart',
    [currentMonth],
    [window._dashIncome || 0],
    [total]
  );
}

// ── Stats calculations ────────────────────────────────────
function updateProfitStats() {
  const income   = window._dashIncome   || 0;
  const expenses = window._dashExpenses || 0;
  const profit   = income - expenses;
  const rate     = income > 0 ? (profit / income * 100) : 0;

  const profitEl = document.getElementById('stat-profit');
  if (profitEl) {
    profitEl.textContent  = formatShekel(profit);
    profitEl.className    = 'card-value ' + (profit >= 0 ? 'income' : 'expense');
  }

  const rateEl = document.getElementById('stat-savings-rate');
  if (rateEl) {
    rateEl.textContent = rate.toFixed(1) + '%';
    rateEl.className   = 'card-value ' + (rate >= 20 ? 'income' : rate >= 10 ? 'accent' : 'expense');
  }

  const allocEl = document.getElementById('profit-to-allocate');
  if (allocEl) allocEl.textContent = formatShekel(profit);
}

// ── Transactions table ────────────────────────────────────
function renderTransactions(transactions) {
  const tbody  = document.getElementById('transactions-table-body');
  const badge  = document.getElementById('transaction-count');
  tbody.innerHTML = '';

  if (transactions.length === 0) {
    badge.textContent = '0 עסקאות';
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">אין עסקאות לחודש זה</td></tr>';
    return;
  }

  const total = transactions.reduce((s, r) => s + parseFloat(r[2] || 0), 0);
  badge.textContent = `${transactions.length} עסקאות | סה"כ: ${formatShekel(total)}`;

  transactions.forEach(row => {
    const [date, merchant, amount, category, type, notes] = row;
    const amt = parseFloat(amount || 0);
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(date||'')}</td>
      <td>${escHtml(merchant||'')}</td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>
      <td><span class="badge badge-info">${escHtml(category||'')}</span></td>
      <td class="text-muted">${escHtml(type||'')}</td>
      <td class="text-muted">${escHtml(notes||'')}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Allocation panel ──────────────────────────────────────
function renderAllocation(allocationRow) {
  const inputs = Array.from(document.querySelectorAll('.allocation-input'));
  // Sheet: חודש(0) רווח(1) עו"ש(2) קרן כספית(3) השקעות(4) אחר(5) סה"כ(6) הערות(7)
  inputs.forEach((inp, i) => {
    inp.value = allocationRow ? (parseFloat(allocationRow[i + 2] || 0) || '') : '';
  });
  updateAllocationTotal();
  inputs.forEach(inp => inp.addEventListener('input', updateAllocationTotal));
}

function updateAllocationTotal() {
  let total = 0;
  document.querySelectorAll('.allocation-input').forEach(i => { total += parseFloat(i.value || 0); });
  document.getElementById('allocation-total-cell').textContent = formatShekel(total);
}

async function saveAllocation(allAllocationData) {
  const btn = document.getElementById('save-allocation-btn');
  const msg = document.getElementById('allocation-save-msg');
  btn.disabled = true; btn.textContent = 'שומר...';

  try {
    const values = Array.from(document.querySelectorAll('.allocation-input')).map(i => parseFloat(i.value || 0));
    const total  = values.reduce((a, b) => a + b, 0);
    const profit = (window._dashIncome || 0) - (window._dashExpenses || 0);
    const row    = [currentMonth, profit, ...values, total, ''];
    const rowNum = SheetsAPI.findMonthRow(allAllocationData, currentMonth);

    if (rowNum === -1) {
      await SheetsAPI.appendRows(CONFIG.SHEETS.PROFIT_ALLOCATION, [row]);
    } else {
      await SheetsAPI.updateRange(CONFIG.SHEETS.PROFIT_ALLOCATION, `A${rowNum}:H${rowNum}`, [row]);
    }

    msg.innerHTML = '<div class="success-msg">נשמר ✓</div>';
    setTimeout(() => { msg.innerHTML = ''; }, 3000);
  } catch (err) {
    msg.innerHTML = `<div class="error-msg">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'שמור';
  }
}

// ── Manual entry ─────────────────────────────────────────
function generateHash(date, merchant, amount) {
  const str = `${date}_${merchant}_${amount}`;
  try { return btoa(unescape(encodeURIComponent(str))); } catch (_) { return btoa(str); }
}

function loadCustomCategories() {
  const saved = JSON.parse(localStorage.getItem('customCategories') || '[]');
  saved.forEach(cat => { if (!CONFIG.CATEGORIES.includes(cat)) CONFIG.CATEGORIES.push(cat); });
}

function addCustomCategory(name) {
  if (!name || CONFIG.CATEGORIES.includes(name)) return;
  CONFIG.CATEGORIES.push(name);
  const saved = JSON.parse(localStorage.getItem('customCategories') || '[]');
  saved.push(name);
  localStorage.setItem('customCategories', JSON.stringify(saved));
}

function buildCategoryOptions(selected) {
  return CONFIG.CATEGORIES.map(c =>
    `<option value="${escHtml(c)}" ${c === selected ? 'selected' : ''}>${escHtml(c)}</option>`
  ).join('') + `<option value="__new__">＋ קטגוריה חדשה...</option>`;
}

function openManualEntryModal() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  document.getElementById('dash-manual-date').value     = `${dd}/${mm}/${today.getFullYear()}`;
  document.getElementById('dash-manual-merchant').value = '';
  document.getElementById('dash-manual-amount').value   = '';
  document.getElementById('dash-manual-notes').value    = '';
  document.getElementById('dash-manual-category').innerHTML = buildCategoryOptions(CONFIG.CATEGORIES[0]);
  document.getElementById('dash-manual-modal').classList.add('open');
  document.getElementById('dash-manual-merchant').focus();
}

async function saveManualEntry() {
  const btn      = document.getElementById('dash-save-manual-btn');
  const dateVal  = document.getElementById('dash-manual-date').value.trim();
  const merchant = document.getElementById('dash-manual-merchant').value.trim();
  const amtStr   = document.getElementById('dash-manual-amount').value.trim();
  const category = document.getElementById('dash-manual-category').value;
  const notes    = document.getElementById('dash-manual-notes').value.trim();

  if (!dateVal || !merchant || !amtStr) { alert('יש למלא תאריך, שם ביצ עסק וסכום'); return; }
  const amount = parseFloat(amtStr.replace(/[₪,\s]/g, ''));
  if (isNaN(amount)) { alert('סכום לא תקין'); return; }

  // Normalise date to DD/MM/YYYY if user typed D/M/YYYY
  const parts = dateVal.split('/');
  const date  = parts.length === 3
    ? `${parts[0].padStart(2,'0')}/${parts[1].padStart(2,'0')}/${parts[2]}`
    : dateVal;
  const month = date.length >= 10 ? `${date.substring(3,5)}/${date.substring(6)}` : currentMonth;
  const hash  = generateHash(date, merchant, amount);

  btn.disabled = true; btn.textContent = 'שומר...';
  try {
    await SheetsAPI.appendRows(CONFIG.SHEETS.TRANSACTIONS, [[
      date, merchant, amount, category, 'ידני', notes, month, 'הזנה ידנית', 'FALSE', hash,
    ]]);
    await SheetsAPI.appendRows(CONFIG.SHEETS.AUDIT_LOG, [[
      new Date().toLocaleString('he-IL'), 'הזנה ידנית', 1, amount,
      AuthManager.getUserEmail(), 0,
    ]]);
    document.getElementById('dash-manual-modal').classList.remove('open');
    await loadMonth(currentMonth);
  } catch (err) {
    alert('שגיאה: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'הוסף עסקה ▶';
  }
}

// ── Load month ────────────────────────────────────────────
async function loadMonth(monthStr) {
  currentMonth = monthStr;
  document.getElementById('month-display').textContent = monthStr;

  const loading  = document.getElementById('loading');
  const content  = document.getElementById('content');
  const errorDiv = document.getElementById('error-container');

  loading.classList.remove('hidden');
  content.classList.add('hidden');
  errorDiv.innerHTML = '';
  window._dashIncome = 0;
  window._dashExpenses = 0;

  try {
    const [incomeData, txData, allocData] = await Promise.all([
      SheetsAPI.getSheet(CONFIG.SHEETS.INCOME),
      SheetsAPI.getSheet(CONFIG.SHEETS.TRANSACTIONS),
      SheetsAPI.getSheet(CONFIG.SHEETS.PROFIT_ALLOCATION),
    ]);

    const incomeRow     = findRowForMonth(incomeData, monthStr);
    const transactions  = filterTransactionsByMonth(txData, monthStr);
    const allocationRow = findRowForMonth(allocData, monthStr);

    renderIncome(incomeRow);
    renderExpenses(transactions);
    renderTransactions(transactions);
    renderAllocation(allocationRow);

    document.getElementById('stat-income').textContent = formatShekel(window._dashIncome || 0);

    document.getElementById('save-income-btn').onclick     = () => saveIncome(incomeData);
    document.getElementById('save-allocation-btn').onclick = () => saveAllocation(allocData);

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    errorDiv.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hamburger').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));

  const email = await AuthManager.init();
  if (!email) return;
  document.getElementById('user-email').textContent = email;

  loadCustomCategories();

  document.getElementById('prev-month').addEventListener('click', () => loadMonth(shiftMonth(currentMonth, -1)));
  document.getElementById('next-month').addEventListener('click', () => loadMonth(shiftMonth(currentMonth, +1)));

  document.getElementById('add-txn-btn').addEventListener('click', openManualEntryModal);
  document.getElementById('dash-save-manual-btn').addEventListener('click', saveManualEntry);
  document.getElementById('dash-cancel-manual-btn').addEventListener('click', () =>
    document.getElementById('dash-manual-modal').classList.remove('open'));
  document.getElementById('dash-manual-category').addEventListener('change', e => {
    if (e.target.value !== '__new__') return;
    const name = prompt('שם הקטגוריה החדשה:');
    if (name && name.trim()) {
      addCustomCategory(name.trim());
      e.target.innerHTML = buildCategoryOptions(name.trim());
      e.target.value = name.trim();
    } else {
      e.target.value = CONFIG.CATEGORIES[0];
    }
  });

  await loadMonth(getCurrentMonthStr());
});
