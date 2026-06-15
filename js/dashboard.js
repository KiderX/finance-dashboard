'use strict';

let currentMonth = '';
let _txData = [];
let _currentTransactions = [];
let _allIncomeData  = null;
let _allAllocData   = null;
let _pickerYear     = new Date().getFullYear();

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

// Income sheet: חודש(0) | משכורת ראשונה(1) | משכורת שנייה(2) | בונוסים(3) | ESPP(4) | הכנסות נוספות(5) | סה"כ(6) | הערות(7)
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
  const headers  = data[0];
  const monthIdx = headers.indexOf('חודש');
  if (monthIdx === -1) return [];
  return data.slice(1).filter(row => row[monthIdx] === monthStr);
}

// ── Render income panel (display only — editing via modal) ──
function renderIncome(incomeRow) {
  const tbody = document.getElementById('income-table-body');
  tbody.innerHTML = '';
  let total = 0;

  INCOME_LABELS.forEach((label, idx) => {
    const value = incomeRow ? parseFloat(incomeRow[idx + 1] || 0) : 0;
    const v = isNaN(value) ? 0 : value;
    total += v;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${label}</td>
      <td class="amount-positive income-display-val" data-col="${idx + 1}" data-value="${v}">${formatShekel(v)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('income-total-cell').textContent = formatShekel(total);
  window._dashIncome = total;
  updateProfitStats();
}

// ── Income edit modal ────────────────────────────────────────
function openIncomeModal() {
  const tbody  = document.getElementById('income-table-body');
  const fields = document.getElementById('income-modal-fields');
  if (!fields) return;

  fields.innerHTML = '';
  let total = 0;

  INCOME_LABELS.forEach((label, idx) => {
    const cell = tbody.querySelector(`[data-col="${idx + 1}"]`);
    const v    = parseFloat(cell?.dataset.value || '0') || 0;
    total += v;

    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `
      <label for="income-modal-inp-${idx}">${escHtml(label)}</label>
      <input type="number" id="income-modal-inp-${idx}" class="income-modal-inp"
             data-idx="${idx}" value="${v || ''}" placeholder="0" step="0.01" />`;
    fields.appendChild(div);
  });

  document.getElementById('income-modal-month').textContent  = formatMonthHebrew(currentMonth);
  document.getElementById('income-modal-total').textContent  = formatShekel(total);
  document.getElementById('income-modal-msg').innerHTML      = '';

  fields.querySelectorAll('.income-modal-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      let t = 0;
      fields.querySelectorAll('.income-modal-inp').forEach(i => { t += parseFloat(i.value || 0); });
      document.getElementById('income-modal-total').textContent = formatShekel(t);
    });
  });

  document.getElementById('income-modal').classList.add('open');
  fields.querySelector('.income-modal-inp')?.focus();
}

async function saveIncomeFromModal() {
  const btn = document.getElementById('save-income-modal');
  const msg = document.getElementById('income-modal-msg');
  btn.disabled = true; btn.textContent = 'שומר...';

  try {
    const values = Array.from(document.querySelectorAll('.income-modal-inp')).map(i => parseFloat(i.value || 0));
    const total  = values.reduce((a, b) => a + b, 0);
    const row    = [currentMonth, ...values, total, ''];
    const rowNum = SheetsAPI.findMonthRow(_allIncomeData, currentMonth);

    if (rowNum === -1) {
      await SheetsAPI.appendRows(CONFIG.SHEETS.INCOME, [row]);
    } else {
      await SheetsAPI.updateRange(CONFIG.SHEETS.INCOME, `A${rowNum}:H${rowNum}`, [row]);
    }

    document.getElementById('income-modal').classList.remove('open');
    await loadMonth(currentMonth);
  } catch (err) {
    msg.innerHTML = `<div class="error-msg">${err.message}</div>`;
    btn.disabled = false; btn.textContent = 'שמור ✓';
  }
}

// ── Category normalization ───────────────────────────────────
function normalizeCategory(merchant, rawCat) {
  let cat = CONFIG.LEGACY_CATEGORY_MAP[rawCat] || rawCat;
  for (const [pattern, mappedCat] of CONFIG.MERCHANT_CATEGORY_MAP) {
    if ((merchant || '').includes(pattern)) { cat = mappedCat; break; }
  }
  return cat;
}

// ── Click-to-expand: transactions under a sub-category ────────
function toggleCategoryDetails(catName, triggerTr, tbody) {
  const existing = Array.from(tbody.querySelectorAll('.cat-detail-row'))
    .filter(r => r.dataset.forCat === catName);
  const icon = triggerTr.querySelector('.cat-expand-icon');
  if (existing.length > 0) {
    existing.forEach(r => r.remove());
    triggerTr.classList.remove('cat-expanded');
    if (icon) icon.textContent = '▸';
    return;
  }
  triggerTr.classList.add('cat-expanded');
  if (icon) icon.textContent = '▾';

  const txns = _currentTransactions
    .filter(row => normalizeCategory(row[1], row[3]) === catName)
    .sort((a, b) => {
      const p = d => { const [dd,mm,yyyy] = (d||'').split('/'); return new Date(yyyy, mm-1, dd); };
      return p(b[0]) - p(a[0]);
    });

  let afterEl = triggerTr;
  txns.forEach(row => {
    const [date, merchant, amount] = row;
    const amt = parseFloat(amount || 0);
    const tr  = document.createElement('tr');
    tr.className      = 'cat-detail-row';
    tr.dataset.forCat = catName;
    tr.innerHTML = `
      <td class="cat-detail-cell">└ ${escHtml(merchant||'')} <span class="cat-detail-date">${escHtml(date||'')}</span></td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'} cat-detail-amount">${formatShekel(amt)}</td>`;
    afterEl.after(tr);
    afterEl = tr;
  });
}

// ── Render expenses — collapsed to group headers by default ───
function renderExpenses(transactions) {
  _currentTransactions = transactions;

  const catTotals = {};
  transactions.forEach(row => {
    const cat = normalizeCategory(row[1], row[3]);
    catTotals[cat] = (catTotals[cat] || 0) + parseFloat(row[2] || 0);
  });

  const tbody = document.getElementById('expenses-table-body');
  tbody.innerHTML = '';
  let grandTotal = 0;
  const shownCats = new Set();

  CONFIG.CATEGORY_GROUPS.forEach(group => {
    const directTotal   = group.subs.reduce((s, c) => s + (catTotals[c] || 0), 0);
    const subGroupTotal = (group.subGroups || []).reduce((s, sg) =>
      s + sg.subs.reduce((s2, c) => s2 + (catTotals[c] || 0), 0), 0);
    const groupTotal = directTotal + subGroupTotal;
    if (groupTotal === 0) return;
    grandTotal += groupTotal;

    // Group header — visible, clickable to expand/collapse children
    const headerTr = document.createElement('tr');
    headerTr.className = 'category-group-header cat-clickable';
    headerTr.innerHTML = `
      <td>${escHtml(group.name)} <span class="cat-expand-icon" style="opacity:0.5;">▸</span></td>
      <td class="${groupTotal < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(groupTotal)}</td>`;
    tbody.appendChild(headerTr);

    // Collect all child rows for this group (for bulk show/hide)
    const groupChildRows = [];

    // Direct sub-category rows — hidden by default
    group.subs.forEach(sub => {
      shownCats.add(sub);
      const amt = catTotals[sub] || 0;
      if (amt === 0) return;
      const tr = document.createElement('tr');
      tr.className       = 'category-sub-row cat-clickable';
      tr.dataset.cat     = sub;
      tr.style.display   = 'none';
      tr.innerHTML = `
        <td style="padding-right:24px;">${escHtml(sub)} <span class="cat-expand-icon">▸</span></td>
        <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>`;
      tr.addEventListener('click', () => toggleCategoryDetails(sub, tr, tbody));
      tbody.appendChild(tr);
      groupChildRows.push(tr);
    });

    // Sub-groups — header hidden by default
    (group.subGroups || []).forEach(sg => {
      const sgTotal = sg.subs.reduce((s, c) => s + (catTotals[c] || 0), 0);
      if (sgTotal === 0) return;

      const sgTr = document.createElement('tr');
      sgTr.className    = 'category-subgroup-header cat-clickable';
      sgTr.style.display = 'none';
      sgTr.innerHTML = `
        <td style="padding-right:24px;">${escHtml(sg.name)} <span class="cat-expand-icon">▸</span></td>
        <td class="${sgTotal < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(sgTotal)}</td>`;
      tbody.appendChild(sgTr);
      groupChildRows.push(sgTr);

      // Sub-group items — hidden until sub-group header clicked
      const subItems = [];
      sg.subs.forEach(sub => {
        shownCats.add(sub);
        const amt = catTotals[sub] || 0;
        if (amt === 0) return;
        const tr = document.createElement('tr');
        tr.className      = 'category-sub-row cat-clickable';
        tr.dataset.cat    = sub;
        tr.style.display  = 'none';
        tr.innerHTML = `
          <td style="padding-right:48px;">${escHtml(sub)} <span class="cat-expand-icon">▸</span></td>
          <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>`;
        tr.addEventListener('click', () => toggleCategoryDetails(sub, tr, tbody));
        tbody.appendChild(tr);
        subItems.push(tr);
      });

      sgTr.addEventListener('click', () => {
        const icon   = sgTr.querySelector('.cat-expand-icon');
        const isOpen = subItems.some(r => r.style.display !== 'none');
        subItems.forEach(r => { r.style.display = isOpen ? 'none' : ''; });
        if (icon) icon.textContent = isOpen ? '▸' : '▾';
        sgTr.classList.toggle('cat-expanded', !isOpen);
        if (isOpen) {
          subItems.forEach(r => {
            Array.from(tbody.querySelectorAll('.cat-detail-row'))
              .filter(d => d.dataset.forCat === r.dataset.cat)
              .forEach(d => d.remove());
            r.classList.remove('cat-expanded');
            const ri = r.querySelector('.cat-expand-icon');
            if (ri) ri.textContent = '▸';
          });
        }
      });
    });

    // Group header toggle — show/hide all direct children and sub-group headers
    headerTr.addEventListener('click', () => {
      const icon   = headerTr.querySelector('.cat-expand-icon');
      const isOpen = groupChildRows.some(r => r.style.display !== 'none');
      groupChildRows.forEach(r => { r.style.display = isOpen ? 'none' : ''; });
      if (icon) icon.textContent = isOpen ? '▸' : '▾';
      headerTr.classList.toggle('cat-expanded', !isOpen);
      if (isOpen) {
        // Collapse all sub-content when closing group
        groupChildRows.forEach(r => {
          if (r.dataset?.cat) {
            Array.from(tbody.querySelectorAll('.cat-detail-row'))
              .filter(d => d.dataset.forCat === r.dataset.cat)
              .forEach(d => d.remove());
          }
          r.classList.remove('cat-expanded');
          const ri = r.querySelector('.cat-expand-icon');
          if (ri) ri.textContent = '▸';
        });
      }
    });
  });

  // Legacy / ungrouped categories
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
  document.getElementById('stat-expenses').textContent       = formatShekel(grandTotal);
  window._dashExpenses = grandTotal;
  updateProfitStats();
  renderIncomeExpensesBar('income-expense-chart', [currentMonth], [window._dashIncome || 0], [grandTotal]);

  // Render category donut using parent groups only — clean & uncluttered
  const donutLabels = [], donutValues = [];
  CONFIG.CATEGORY_GROUPS.forEach(group => {
    const total = group.subs.reduce((s, c) => s + (catTotals[c] || 0), 0) +
      (group.subGroups || []).reduce((s, sg) =>
        s + sg.subs.reduce((s2, c) => s2 + (catTotals[c] || 0), 0), 0);
    if (total > 0) { donutLabels.push(group.name); donutValues.push(total); }
  });
  if (donutLabels.length && typeof renderCategoryDonut === 'function') {
    renderCategoryDonut('category-donut-chart', donutLabels, donutValues, 'category-donut-legend');
  }
}

// ── Stats calculations ────────────────────────────────────────
function updateProfitStats() {
  const income   = window._dashIncome   || 0;
  const expenses = window._dashExpenses || 0;
  const profit   = income - expenses;
  const rate     = income > 0 ? (profit / income * 100) : 0;

  const profitEl = document.getElementById('stat-profit');
  if (profitEl) {
    profitEl.textContent = formatShekel(profit);
    profitEl.className   = 'card-value ' + (profit >= 0 ? 'income' : 'expense');
  }

  const rateEl = document.getElementById('stat-savings-rate');
  if (rateEl) {
    rateEl.textContent = rate.toFixed(1) + '%';
    rateEl.className   = 'card-value ' + (rate >= 20 ? 'income' : rate >= 10 ? 'accent' : 'expense');
  }

  const allocEl = document.getElementById('profit-to-allocate');
  if (allocEl) allocEl.textContent = formatShekel(profit);
}

// ── Transactions table ────────────────────────────────────────
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
    const [date, merchant, amount, rawCategory, type, notes, , , , hash] = row;
    const amt      = parseFloat(amount || 0);
    const category = normalizeCategory(merchant, rawCategory);
    const fullIdx  = _txData.findIndex((r, i) => i > 0 && r[9] === hash);
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = fullIdx;
    tr.dataset.hash     = hash || '';
    tr.innerHTML = `
      <td>${escHtml(date||'')}</td>
      <td>${escHtml(merchant||'')}</td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>
      <td>${escHtml(category||'')}</td>
      <td class="text-muted">${escHtml(type||'')}</td>
      <td class="text-muted">${escHtml(notes||'')}</td>
      <td class="write-only">
        <button class="btn btn-sm btn-outline-danger delete-txn-btn" title="מחק עסקה">מחק</button>
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
        await SheetsAPI.deleteRow(getTxSheet(parseInt(currentMonth.split('/')[1])), rowIdx);
        await loadMonth(currentMonth);
      } catch (err) {
        alert('שגיאה: ' + err.message);
        btn.disabled = false; btn.textContent = '✕';
      }
    })
  );
}

// ── Allocation panel ──────────────────────────────────────────
function renderAllocation(allocationRow) {
  const tbody = document.getElementById('allocation-tbody');
  // Sheet: חודש(0) רווח(1) עו"ש(2) קרן כספית(3) השקעות(4) אחר(5) סה"כ(6) הערות(7)
  tbody.querySelectorAll('.allocation-display-val').forEach((span, i) => {
    const val = allocationRow ? (parseFloat(allocationRow[i + 2] || 0) || 0) : 0;
    span.textContent    = formatShekel(val);
    span.dataset.value  = val;
  });
  updateAllocationTotal();
}

function updateAllocationTotal() {
  let total = 0;
  document.querySelectorAll('#allocation-tbody .allocation-display-val').forEach(span => {
    total += parseFloat(span.dataset.value || '0') || 0;
  });
  document.getElementById('allocation-total-cell').textContent = formatShekel(total);
}

// ── Allocation edit modal ─────────────────────────────────────
const ALLOC_LABELS = ['עו"ש', 'קרן כספית', 'השקעות', 'אחר'];

function openAllocationModal() {
  const tbody  = document.getElementById('allocation-tbody');
  const fields = document.getElementById('allocation-modal-fields');
  if (!fields) return;

  fields.innerHTML = '';
  let total = 0;

  tbody.querySelectorAll('.allocation-display-val').forEach((span, i) => {
    const v = parseFloat(span.dataset.value || '0') || 0;
    total += v;

    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `
      <label for="alloc-modal-inp-${i}">${escHtml(ALLOC_LABELS[i])}</label>
      <input type="number" id="alloc-modal-inp-${i}" class="alloc-modal-inp"
             data-row="${i}" value="${v || ''}" placeholder="0" step="0.01" />`;
    fields.appendChild(div);
  });

  const profit = (window._dashIncome || 0) - (window._dashExpenses || 0);
  document.getElementById('allocation-modal-month').textContent  = formatMonthHebrew(currentMonth);
  document.getElementById('allocation-modal-profit').textContent = formatShekel(profit);
  document.getElementById('allocation-modal-total').textContent  = formatShekel(total);
  document.getElementById('allocation-modal-msg').innerHTML      = '';

  fields.querySelectorAll('.alloc-modal-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      let t = 0;
      fields.querySelectorAll('.alloc-modal-inp').forEach(i => { t += parseFloat(i.value || 0); });
      document.getElementById('allocation-modal-total').textContent = formatShekel(t);
    });
  });

  document.getElementById('allocation-modal').classList.add('open');
  fields.querySelector('.alloc-modal-inp')?.focus();
}

async function saveAllocationFromModal() {
  const btn = document.getElementById('save-allocation-modal');
  const msg = document.getElementById('allocation-modal-msg');
  btn.disabled = true; btn.textContent = 'שומר...';

  try {
    const values = Array.from(document.querySelectorAll('.alloc-modal-inp')).map(i => parseFloat(i.value || 0));
    const total  = values.reduce((a, b) => a + b, 0);
    const profit = (window._dashIncome || 0) - (window._dashExpenses || 0);
    const row    = [currentMonth, profit, ...values, total, ''];
    const rowNum = SheetsAPI.findMonthRow(_allAllocData, currentMonth);

    if (rowNum === -1) {
      await SheetsAPI.appendRows(CONFIG.SHEETS.PROFIT_ALLOCATION, [row]);
    } else {
      await SheetsAPI.updateRange(CONFIG.SHEETS.PROFIT_ALLOCATION, `A${rowNum}:H${rowNum}`, [row]);
    }

    document.getElementById('allocation-modal').classList.remove('open');
    await loadMonth(currentMonth);
  } catch (err) {
    msg.innerHTML = `<div class="error-msg">${err.message}</div>`;
    btn.disabled = false; btn.textContent = 'שמור ✓';
  }
}

// ── Month picker ──────────────────────────────────────────────
function buildMonthPicker() {
  const grid  = document.getElementById('month-picker-grid');
  const pyrEl = document.getElementById('picker-yr');
  if (!grid || !pyrEl) return;

  grid.innerHTML  = '';
  pyrEl.textContent = _pickerYear;

  const [curMM, curYYYY] = currentMonth ? currentMonth.split('/').map(Number) : [0, 0];

  HEBREW_MONTHS.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className   = 'month-picker-btn';
    btn.textContent = name.slice(0, 3);
    if (_pickerYear === curYYYY && i + 1 === curMM) btn.classList.add('active');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const mm = String(i + 1).padStart(2, '0');
      closeMonthPicker();
      loadMonth(`${mm}/${_pickerYear}`);
    });
    grid.appendChild(btn);
  });
}

function openMonthPicker() {
  if (currentMonth) _pickerYear = parseInt(currentMonth.split('/')[1]) || new Date().getFullYear();
  buildMonthPicker();
  document.getElementById('month-picker')?.classList.remove('hidden');
}

function closeMonthPicker() {
  document.getElementById('month-picker')?.classList.add('hidden');
}

// ── Manual entry ──────────────────────────────────────────────
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
    const txYear = parseInt((month || currentMonth).split('/')[1]) || new Date().getFullYear();
    await SheetsAPI.ensureYearTab(txYear);
    await SheetsAPI.appendRows(getTxSheet(txYear), [[
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
      const countEl = document.getElementById('dash-manual-added-count');
      const prev    = parseInt(countEl.dataset.count || '0', 10) + 1;
      countEl.dataset.count = prev;
      countEl.textContent   = `✓ נוספו ${prev} עסקאות`;
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

// ── Load month ────────────────────────────────────────────────
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
  window._dashIncome   = 0;
  window._dashExpenses = 0;

  try {
    const year = parseInt(monthStr.split('/')[1]);
    await SheetsAPI.ensureYearTab(year);
    const batch = await SheetsAPI.batchGet([
      CONFIG.SHEETS.INCOME,
      getTxSheet(year),
      CONFIG.SHEETS.PROFIT_ALLOCATION,
    ]);
    const [incomeData, txData, allocData] = batch.valueRanges.map(vr => vr.values || []);

    _txData         = txData;
    _allIncomeData  = incomeData;
    _allAllocData   = allocData;

    const incomeRow     = findRowForMonth(incomeData, monthStr);
    const transactions  = filterTransactionsByMonth(txData, monthStr);
    const allocationRow = findRowForMonth(allocData, monthStr);

    renderIncome(incomeRow);
    renderExpenses(transactions);
    renderTransactions(transactions);
    renderAllocation(allocationRow);

    document.getElementById('stat-income').textContent = formatShekel(window._dashIncome || 0);

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    errorDiv.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hamburger').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));

  const email = await AuthManager.init();
  if (!email) return;
  document.getElementById('user-email').textContent = email;

  await SheetsAPI.migrateTransactionsIfNeeded().catch(() => {});
  loadCustomCategories();

  // Month navigation
  document.getElementById('prev-month').addEventListener('click', () => loadMonth(shiftMonth(currentMonth, -1)));
  document.getElementById('next-month').addEventListener('click', () => loadMonth(shiftMonth(currentMonth, +1)));

  // Month picker popup
  document.getElementById('month-display')?.addEventListener('click', e => {
    e.stopPropagation();
    const picker = document.getElementById('month-picker');
    if (picker?.classList.contains('hidden')) openMonthPicker();
    else closeMonthPicker();
  });
  document.getElementById('picker-prev-yr')?.addEventListener('click', e => {
    e.stopPropagation(); _pickerYear--; buildMonthPicker();
  });
  document.getElementById('picker-next-yr')?.addEventListener('click', e => {
    e.stopPropagation(); _pickerYear++; buildMonthPicker();
  });
  document.addEventListener('click', e => {
    const picker = document.getElementById('month-picker');
    if (picker && !picker.classList.contains('hidden') && !picker.contains(e.target)) closeMonthPicker();
  });

  // Income modal
  document.getElementById('edit-income-btn').addEventListener('click', openIncomeModal);
  document.getElementById('cancel-income-modal').addEventListener('click', () => {
    document.getElementById('income-modal').classList.remove('open');
  });
  document.getElementById('save-income-modal').addEventListener('click', saveIncomeFromModal);
  document.getElementById('income-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('income-modal')) document.getElementById('income-modal').classList.remove('open');
  });

  // Allocation modal
  document.getElementById('edit-allocation-btn').addEventListener('click', openAllocationModal);
  document.getElementById('cancel-allocation-modal').addEventListener('click', () => {
    document.getElementById('allocation-modal').classList.remove('open');
  });
  document.getElementById('save-allocation-modal').addEventListener('click', saveAllocationFromModal);
  document.getElementById('allocation-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('allocation-modal')) document.getElementById('allocation-modal').classList.remove('open');
  });

  // Manual entry modal
  document.getElementById('add-txn-btn').addEventListener('click', openManualEntryModal);
  document.getElementById('dash-save-manual-btn').addEventListener('click', () => saveManualEntry(true));
  document.getElementById('dash-save-add-more-btn').addEventListener('click', () => saveManualEntry(false));
  document.getElementById('dash-cancel-manual-btn').addEventListener('click', async () => {
    document.getElementById('dash-manual-modal').classList.remove('open');
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
