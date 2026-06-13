'use strict';

const UploadState = {
  step: 1,
  file: null,
  rows: [],
  duplicates: new Set(),
  existingHashes: new Set(),
};

// ── Helpers ───────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateHash(date, merchant, amount) {
  const str = `${date}_${merchant}_${amount}`;
  try { return btoa(unescape(encodeURIComponent(str))); }
  catch (_) { return btoa(str); }
}

// ── CSV parser ────────────────────────────────────────────
function parseCSVLine(line, delimiter = ',') {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delimiter && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  // Strip BOM — pandas utf-8-sig adds ﻿ at start of file
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('הקובץ ריק או אינו תקין');

  // Auto-detect delimiter: semicolons are common in Israeli/European Excel exports
  const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  // Strip BOM again from first header in case it survived (belt-and-suspenders)
  const headers = parseCSVLine(lines[0], delim).map(h => h.replace(/^﻿/, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i], delim);
    if (vals.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// Flexible column lookup — matches exact name, partial containment, or BOM-prefixed variant.
// Accepts multiple candidate names in priority order (e.g. normalizer name first, raw Cal name second).
function getCol(row, ...candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    if (row[cand] !== undefined && row[cand] !== '') return row[cand];
    const match = keys.find(k => {
      const norm = k.replace(/^﻿/, '').trim();
      return norm === cand || norm.includes(cand);
    });
    if (match && row[match] !== '') return row[match];
  }
  return '';
}

// ── Step management ───────────────────────────────────────
function setStep(n) {
  UploadState.step = n;
  for (let i = 1; i <= 5; i++) {
    const stepEl    = document.getElementById(`step-${i}`);
    const contentEl = document.getElementById(`step-content-${i}`);
    if (stepEl) {
      stepEl.classList.remove('active', 'done');
      if (i < n) stepEl.classList.add('done');
      if (i === n) stepEl.classList.add('active');
    }
    if (contentEl) contentEl.classList.toggle('hidden', i !== n);
  }
}

function showError(msg) {
  const el = document.getElementById('upload-error');
  el.innerHTML = `<div class="error-msg">${msg}</div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Step 1: File handling ─────────────────────────────────
function initUploadZone() {
  const zone  = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0]); });
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('יש להעלות קובץ CSV בלבד. הרץ תחילה את normalizer.py על קובץ ה-Excel.');
    return;
  }
  UploadState.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = parseCSV(e.target.result);
      if (rows.length === 0) {
        showError('הקובץ אינו מכיל עסקאות. ודא שהרצת את normalizer.py וקובץ ה-CSV תקין.');
        return;
      }
      // Check we can find at least a date or merchant column
      const sample = rows[0];
      const hasDate     = !!getCol(sample, 'תאריך', 'תאריך עסקה');
      const hasMerchant = !!getCol(sample, 'שם בית עסק', 'בית עסק');
      const hasAmount   = !!getCol(sample, 'סכום חיוב', 'סכום עסקה', 'סכום');
      if (!hasDate && !hasMerchant && !hasAmount) {
        const found = Object.keys(sample).join(', ');
        showError(`לא ניתן לזהות עמודות עסקאות. עמודות שנמצאו: ${found}. ודא שהרצת את normalizer.py.`);
        return;
      }
      UploadState.rows = rows;
      renderPreview(rows);
      setStep(2);
    } catch (err) {
      showError(err.message);
    }
  };
  reader.onerror = () => showError('שגיאה בקריאת הקובץ');
  reader.readAsText(file, 'utf-8');
}

// ── Step 2: Preview table ─────────────────────────────────
function renderPreview(rows) {
  const tbody = document.getElementById('preview-tbody');
  tbody.innerHTML = '';
  document.getElementById('preview-count').textContent = `${rows.length} עסקאות`;

  rows.forEach((row, idx) => {
    const date     = getCol(row, 'תאריך', 'תאריך עסקה');
    const merchant = getCol(row, 'שם בית עסק', 'בית עסק');
    const amtRaw   = getCol(row, 'סכום חיוב', 'סכום עסקה', 'סכום');
    const amt      = parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0;
    const category = getCol(row, 'קטגוריה') || '';
    const txnType  = getCol(row, 'סוג עסקה', 'סוג');
    const notes    = getCol(row, 'הערות');
    const tr  = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td>${escHtml(date)}</td>
      <td>${escHtml(merchant)}</td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>
      <td>
        <select class="input-inline cat-select" data-idx="${idx}">
          ${CONFIG.CATEGORIES.map(c =>
            `<option value="${c}" ${c === category ? 'selected' : ''}>${c}</option>`
          ).join('')}
        </select>
      </td>
      <td class="text-muted">${escHtml(txnType)}</td>
      <td>
        <input type="text" class="input-inline notes-input" data-idx="${idx}"
               value="${escHtml(notes)}" placeholder="הערות" />
      </td>
      <td>
        <button class="btn btn-sm btn-outline split-btn" data-idx="${idx}">פצל</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.cat-select').forEach(sel =>
    sel.addEventListener('change', e => { UploadState.rows[+e.target.dataset.idx]['קטגוריה'] = e.target.value; }));
  tbody.querySelectorAll('.notes-input').forEach(inp =>
    inp.addEventListener('input', e => { UploadState.rows[+e.target.dataset.idx]['הערות'] = e.target.value; }));
  tbody.querySelectorAll('.split-btn').forEach(btn =>
    btn.addEventListener('click', e => openSplitModal(+e.target.dataset.idx)));
}

// ── Step 3: Duplicate detection ───────────────────────────
async function runDuplicateCheck() {
  const btn = document.getElementById('check-dupes-btn');
  btn.disabled = true; btn.textContent = 'בודק...';

  try {
    const existing = await SheetsAPI.getRange(CONFIG.SHEETS.TRANSACTIONS, 'A:J');
    UploadState.existingHashes = new Set(
      existing.slice(1).map(r => r[9]).filter(Boolean)
    );

    UploadState.duplicates = new Set();
    const tbody = document.getElementById('preview-tbody');

    UploadState.rows.forEach((row, idx) => {
      const amtRaw = getCol(row, 'סכום חיוב', 'סכום עסקה', 'סכום');
      const hash = generateHash(
        getCol(row, 'תאריך', 'תאריך עסקה'),
        getCol(row, 'שם בית עסק', 'בית עסק'),
        parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0
      );
      if (UploadState.existingHashes.has(hash)) {
        UploadState.duplicates.add(idx);
        const tr = tbody.querySelector(`tr[data-idx="${idx}"]`);
        if (tr) {
          tr.classList.add('row-duplicate');
          const firstTd = tr.querySelector('td');
          if (firstTd) firstTd.insertAdjacentHTML('afterbegin', '<span class="dupe-label">כפול</span>');
        }
      }
    });

    const n = UploadState.duplicates.size;
    document.getElementById('dupe-count').innerHTML = n > 0
      ? `<span class="text-danger">נמצאו ${n} כפילויות — הן לא יועלו</span>`
      : '<span class="text-success">לא נמצאו כפילויות ✓</span>';

    setStep(3);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'בדוק כפילויות והמשך ▶';
  }
}

// ── Step 4: Month select ──────────────────────────────────
function initMonthSelect() {
  const detected = UploadState.rows[0]?.['חודש'] || '';
  const input    = document.getElementById('month-select');
  if (detected) input.value = detected;
}

// ── Step 5: Upload ────────────────────────────────────────
async function doUpload() {
  const btn     = document.getElementById('upload-btn');
  const msgDiv  = document.getElementById('upload-result');
  btn.disabled  = true; btn.textContent = 'מעלה...';
  msgDiv.innerHTML = '';

  try {
    const month = document.getElementById('month-select').value.trim();
    if (!month || !/^\d{2}\/\d{4}$/.test(month)) throw new Error('יש להזין חודש בפורמט MM/YYYY');

    const toUpload = UploadState.rows
      .filter((_, idx) => !UploadState.duplicates.has(idx))
      .map(row => {
        const date     = getCol(row, 'תאריך', 'תאריך עסקה');
        const merchant = getCol(row, 'שם בית עסק', 'בית עסק');
        const amtRaw   = getCol(row, 'סכום חיוב', 'סכום עסקה', 'סכום');
        const amount   = parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0;
        const category = getCol(row, 'קטגוריה') || 'שונות';
        const txnType  = getCol(row, 'סוג עסקה', 'סוג');
        const notes    = getCol(row, 'הערות');
        const source   = getCol(row, 'מקור כרטיס');
        const split    = getCol(row, 'פוצל') || 'FALSE';
        const hash     = generateHash(date, merchant, amount);
        return [date, merchant, amount, category, txnType, notes, month, source, split, hash];
      });

    if (toUpload.length === 0) throw new Error('אין עסקאות חדשות להעלאה (כל העסקאות כבר קיימות)');

    await SheetsAPI.appendRows(CONFIG.SHEETS.TRANSACTIONS, toUpload);

    // Audit log
    const totalAmt = toUpload.reduce((s, r) => s + parseFloat(r[2] || 0), 0);
    await SheetsAPI.appendRows(CONFIG.SHEETS.AUDIT_LOG, [[
      new Date().toLocaleString('he-IL'),
      UploadState.file?.name || 'CSV',
      toUpload.length,
      totalAmt,
      AuthManager.getUserEmail(),
      UploadState.duplicates.size,
    ]]);

    document.getElementById('success-summary').innerHTML = `
      <p class="text-muted">הועלו <strong>${toUpload.length}</strong> עסקאות לחודש <strong>${month}</strong></p>
      <p class="text-muted">סה"כ: <strong class="text-danger">${formatShekel(totalAmt)}</strong></p>`;

    setStep(5);
  } catch (err) {
    msgDiv.innerHTML = `<div class="error-msg">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'העלה לגוגל שיטס ▶';
  }
}

// ── Split modal ───────────────────────────────────────────
let splitIdx = -1;

function openSplitModal(idx) {
  splitIdx = idx;
  const row   = UploadState.rows[idx];
  const total = parseFloat(row['סכום חיוב'] || 0);
  document.getElementById('split-merchant').textContent = row['שם בית עסק'];
  document.getElementById('split-total').textContent    = formatShekel(total);

  const container = document.getElementById('split-rows-container');
  container.innerHTML = '';
  addSplitRow(container, Math.abs(total) / 2);
  addSplitRow(container, Math.abs(total) / 2);
  refreshSplitRemaining();

  document.getElementById('split-modal').classList.add('open');
}

function addSplitRow(container, amount) {
  const div = document.createElement('div');
  div.className = 'd-flex gap-8 mb-8 split-row-item align-center';
  div.innerHTML = `
    <select class="split-cat" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px;font-family:Heebo;">
      ${CONFIG.CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>
    <input type="number" class="split-amt" value="${amount.toFixed(2)}"
           style="width:110px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px;text-align:right;font-family:Heebo;" />
    <button class="btn btn-danger btn-sm rm-split">✕</button>`;
  div.querySelector('.split-amt').addEventListener('input', refreshSplitRemaining);
  div.querySelector('.rm-split').addEventListener('click', () => { div.remove(); refreshSplitRemaining(); });
  container.appendChild(div);
}

function refreshSplitRemaining() {
  const total = Math.abs(parseFloat(UploadState.rows[splitIdx]?.['סכום חיוב'] || 0));
  const used  = Array.from(document.querySelectorAll('.split-amt')).reduce((s, i) => s + parseFloat(i.value || 0), 0);
  const rem   = total - used;
  const el    = document.getElementById('split-remaining');
  el.textContent = formatShekel(rem);
  el.className   = Math.abs(rem) < 0.01 ? 'text-success' : 'text-accent';
}

function confirmSplit() {
  const original = UploadState.rows[splitIdx];
  const isNeg    = parseFloat(original['סכום חיוב'] || 0) < 0;

  const parts = Array.from(document.querySelectorAll('.split-row-item')).map(div => ({
    cat: div.querySelector('.split-cat').value,
    amt: parseFloat(div.querySelector('.split-amt').value || 0),
  }));

  if (parts.some(p => !p.amt)) { alert('יש להזין סכום לכל שורה'); return; }

  const newRows = parts.map(p => ({
    ...original,
    'קטגוריה':   p.cat,
    'סכום חיוב': String(isNeg ? -p.amt : p.amt),
    'פוצל':       'TRUE',
  }));

  UploadState.rows.splice(splitIdx, 1, ...newRows);
  renderPreview(UploadState.rows);
  document.getElementById('split-modal').classList.remove('open');
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hamburger').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));

  const email = await AuthManager.init();
  if (!email) return;
  document.getElementById('user-email').textContent = email;

  initUploadZone();
  setStep(1);

  document.getElementById('check-dupes-btn').addEventListener('click', runDuplicateCheck);
  document.getElementById('proceed-to-month-btn').addEventListener('click', () => { initMonthSelect(); setStep(4); });
  document.getElementById('upload-btn').addEventListener('click', doUpload);
  document.getElementById('add-split-row-btn').addEventListener('click', () => {
    addSplitRow(document.getElementById('split-rows-container'), 0);
    refreshSplitRemaining();
  });
  document.getElementById('confirm-split-btn').addEventListener('click', confirmSplit);
  document.getElementById('cancel-split-btn').addEventListener('click', () =>
    document.getElementById('split-modal').classList.remove('open'));
  document.getElementById('restart-btn').addEventListener('click', () => window.location.reload());
});
