'use strict';

let currentMonth = '';
let _txData = [];  // full transactions sheet data — used for row-index lookups when deleting

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

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

function formatMonthHebrew(monthStr) {
  const [mm, yyyy] = monthStr.split('/').map(Number);
  return `${HEBREW_MONTHS[mm - 1]} ${yyyy}`;
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
      <td>
        <span class="amount-positive income-display-val">${formatShekel(value)}</span>
        <input type="number" class="income-input write-only" data-col="${idx + 1}" value="${value || ''}" placeholder="0" />
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
  const catTotals = {};
  transactions.forEach(row => {
    const merchant = row[1] || '';
    const amount   = parseFloat(row[2] || 0);
    const rawCat   = row[3] || 'שונות';
    let cat = CONFIG.LEGACY_CATEGORY_MAP[rawCat] || rawCat;
    // Merchant-name override: unambiguous payees always win over stored category
    for (const [pattern, mappedCat] of CONFIG.MERCHANT_CATEGORY_MAP) {
      if (merchant.includes(pattern)) { cat = mappedCat; break; }
    }
    catTotals[cat] = (catTotals[cat] || 0) + amount;
  });

  const tbody = document.getElementById('expenses-table-body');
  tbody.innerHTML = '';
  let grandTotal = 0;
  const shownCats = new Set();

  // Render each parent group as a bold header followed by indented sub-category rows
  CONFIG.CATEGORY_GROUPS.forEach(group => {
    const groupTotal = group.subs.reduce((sum, sub) => sum + (catTotals[sub] || 0), 0);
    if (groupTotal === 0) return;
    grandTotal += groupTotal;

    const headerTr = document.createElement('tr');
    headerTr.className = 'category-group-header';
    headerTr.innerHTML = `
      <td>${escHtml(group.name)}</td>
      <td class="${groupTotal < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(groupTotal)}</td>`;
    tbody.appendChild(headerTr);

    group.subs.forEach(sub => {
      shownCats.add(sub);
      const amt = catTotals[sub] || 0;
      if (amt === 0) return;
      const tr = document.createElement('tr');
      tr.className = 'category-sub-row';
      tr.innerHTML = `
        <td>${escHtml(sub)}</td>
        <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>`;
      tbody.appendChild(tr);
    });
  });

  // Legacy / ungrouped categories from existing sheet data
  Object.keys(catTotals).forEach(cat => {
    if (shownCats.has(cat) || catTotals[cat] === 0) return;
    const amt = catTotals[cat];
    grandTotal += amt;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(cat)}</td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('expenses-total-cell').textContent = formatShekel(grandTotal);
  document.getElementById('stat-expenses').textContent = formatShekel(grandTotal);
  window._dashExpenses = grandTotal;
  updateProfitStats();

  renderIncomeExpensesBar('income-expense-chart', [currentMonth], [window._dashIncome || 0], [grandTotal]);
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
  const tbody = document.getElementById('transactions-table-body');
  const badge = document.getElementById('transaction-count');
  tbody.innerHTML = '';

  if (transactions.length === 0) {
    badge.textContent = '0 עסקאות';
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:24px;">אין עסקאות לחודש זה</td></tr>';
    return;
  }

  const total = transactions.reduce((s, r) => s + parseFloat(r[2] || 0), 0);
  badge.textContent = `${transactions.length} עסקאות | סה"כ: ${formatShekel(total)}`;

  transactions.forEach(row => {
    const [date, merchant, amount, category, type, notes, , , , hash] = row;
    const amt = parseFloat(amount || 0);
    // Find the row's 0-based index in the full sheet data (including header row at index 0)
    const fullIdx = _txData.findIndex((r, i) => i > 0 && r[9] === hash);
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = fullIdx;
    tr.dataset.hash     = hash || '';
    tr.innerHTML = `
      <td>${escHtml(date||'')}</td>
      <td>${escHtml(merchant||'')}</td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>
      <td><span class="badge badge-info">${escHtml(category||'')}</span></td>
      <td class="text-muted">${escHtml(type||'')}</td>
      <td class="text-muted">${escHtml(notes||'')}</td>
      <td class="write-only">
        <button class="btn btn-danger btn-sm delete-txn-btn" title="מחק עסקה">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.delete-txn-btn').forEach(btn =>
    btn.addEventListener('click', async e => {
      const tr       = e.target.closest('tr');
      const rowIdx   = parseInt(tr.dataset.rowIndex, 10);
      const merchant = tr.querySelector('td').nextElementSibling.textContent;
      if (!confirm(`למחוק את העסקה "${merchant}"?`)) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        await SheetsAPI.deleteRow(CONFIG.SHEETS.TRANSACTIONS, rowIdx);
        await loadMonth(currentMonth);
      } catch (err) {
        alert('שגיאה: ' + err.message);
        btn.disabled = false; btn.textContent = '✕';
      }
    })
  );
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
  const allSubs = new Set(CONFIG.CATEGORY_GROUPS.flatMap(g => g.subs));
  let html = CONFIG.CATEGORY_GROUPS.map(group => {
    const opts = group.subs.map(c =>
      `<option value="${escHtml(c)}" ${c === selected ? 'selected' : ''}>${escHtml(c)}</option>`
    ).join('');
    return `<optgroup label="${escHtml(group.name)}">${opts}</optgroup>`;
  }).join('');
  const extras = CONFIG.CATEGORIES.filter(c => !allSubs.has(c));
  if (extras.length > 0) {
    html += `<optgroup label="— אחר —">${extras.map(c =>
      `<option value="${escHtml(c)}" ${c === selected ? 'selected' : ''}>${escHtml(c)}</option>`
    ).join('')}</optgroup>`;
  }
  html += `<option value="__new__">＋ קטגוריה חדשה...</option>`;
  return html;
}

function openManualEntryModal() {
  // Pre-fill date: today's day in the currently viewed month
  const today  = new Date();
  const [mm, yyyy] = currentMonth.split('/');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('dash-manual-date').value     = `${dd}/${mm}/${yyyy}`;
  document.getElementById('dash-manual-merchant').value = '';
  document.getElementById('dash-manual-amount').value   = '';
  document.getElementById('dash-manual-notes').value    = '';
  document.getElementById('dash-manual-category').innerHTML = buildCategoryOptions(CONFIG.CATEGORIES[0]);
  document.getElementById('dash-manual-added-count').textContent = '';
  document.getElementById('dash-manual-modal').classList.add('open');
  document.getElementById('dash-manual-merchant').focus();
}

async function saveManualEntry(closeAfter) {
  const btnSave  = document.getElementById('dash-save-manual-btn');
  const btnMore  = document.getElementById('dash-save-add-more-btn');
  const dateVal  = document.getElementById('dash-manual-date').value.trim();
  const merchant = document.getElementById('dash-manual-merchant').value.trim();
  const amtStr   = document.getElementById('dash-manual-amount').value.trim();
  const category = document.getElementById('dash-manual-category').value;
  const notes    = document.getElementById('dash-manual-notes').value.trim();

  if (!dateVal || !merchant || !amtStr) { alert('יש למלא תאריך, שם בית עסק וסכום'); return; }
  const amount = parseFloat(amtStr.replace(/[₪,\s]/g, ''));
  if (isNaN(amount)) { alert('סכום לא תקין'); return; }

  const parts = dateVal.split('/');
  const date  = parts.length === 3
    ? `${parts[0].padStart(2,'0')}/${parts[1].padStart(2,'0')}/${parts[2]}`
    : dateVal;
  const month = date.length >= 10 ? `${date.substring(3,5)}/${date.substring(6)}` : currentMonth;
  const hash  = generateHash(date, merchant, amount);

  btnSave.disabled = true; btnMore.disabled = true;
  btnSave.textContent = 'שומר...';
  try {
    await SheetsAPI.appendRows(CONFIG.SHEETS.TRANSACTIONS, [[
      date, merchant, amount, category, 'ידני', notes, month, 'הזנה ידנית', 'FALSE', hash,
    ]]);
    await SheetsAPI.appendRows(CONFIG.SHEETS.AUDIT_LOG, [[
      new Date().toLocaleString('he-IL'), 'הזנה ידנית', 1, amount,
      AuthManager.getUserEmail(), 0,
    ]]);

    if (closeAfter) {
      document.getElementById('dash-manual-modal').classList.remove('open');
      await loadMonth(currentMonth);
    } else {
      // Keep modal open, reset fields, show success indicator
      const countEl = document.getElementById('dash-manual-added-count');
      const prev    = parseInt(countEl.dataset.count || '0', 10) + 1;
      countEl.dataset.count   = prev;
      countEl.textContent     = `✓ נוספו ${prev} עסקאות`;
      document.getElementById('dash-manual-merchant').value = '';
      document.getElementById('dash-manual-amount').value   = '';
      document.getElementById('dash-manual-notes').value    = '';
      document.getElementById('dash-manual-merchant').focus();
    }
  } catch (err) {
    alert('שגיאה: ' + err.message);
  } finally {
    btnSave.disabled = false; btnMore.disabled = false;
    btnSave.textContent = 'שמור וסגור ✓';
  }
}

// ── Load month ────────────────────────────────────────────
async function loadMonth(monthStr) {
  currentMonth = monthStr;
  localStorage.setItem('lastViewedMonth', monthStr);
  document.getElementById('month-display').textContent = formatMonthHebrew(monthStr);

  const loading  = document.getElementById('loading');
  const content  = document.getElementById('content');
  const errorDiv = document.getElementById('error-container');

  loading.classList.remove('hidden');
  content.classList.add('hidden');
  errorDiv.innerHTML = '';
  window._dashIncome = 0;
  window._dashExpenses = 0;

  try {
    // Single batchGet replaces 3 separate read calls → stays well under quota
    const batch = await SheetsAPI.batchGet([
      CONFIG.SHEETS.INCOME,
      CONFIG.SHEETS.TRANSACTIONS,
      CONFIG.SHEETS.PROFIT_ALLOCATION,
    ]);
    const [incomeData, txData, allocData] = batch.valueRanges.map(vr => vr.values || []);

    _txData = txData;  // store for delete row lookups

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
  document.getElementById('dash-save-manual-btn').addEventListener('click', () => saveManualEntry(true));
  document.getElementById('dash-save-add-more-btn').addEventListener('click', () => saveManualEntry(false));
  document.getElementById('dash-cancel-manual-btn').addEventListener('click', async () => {
    document.getElementById('dash-manual-modal').classList.remove('open');
    // If entries were saved while modal was open, reload to reflect them
    if (parseInt(document.getElementById('dash-manual-added-count').dataset.count || '0', 10) > 0) {
      await loadMonth(currentMonth);
    }
  });
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

  const savedMonth = localStorage.getItem('lastViewedMonth');
  await loadMonth(savedMonth || getCurrentMonthStr());
});
