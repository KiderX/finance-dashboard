'use strict';

const UploadState = {
  step: 1,
  fileNames: [],
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

// ── Custom categories ─────────────────────────────────────
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

function handleCatChange(select, rowIdx) {
  if (select.value !== '__new__') {
    if (rowIdx !== null) UploadState.rows[rowIdx]['קטגוריה'] = select.value;
    return;
  }
  const name = prompt('שם הקטגוריה החדשה:');
  if (name && name.trim()) {
    addCustomCategory(name.trim());
    // Refresh every category select in the preview
    document.querySelectorAll('.cat-select').forEach(s => {
      const cur = s === select ? name.trim() : s.value;
      s.innerHTML = buildCategoryOptions(cur);
      s.value = cur;
    });
    if (rowIdx !== null) UploadState.rows[rowIdx]['קטגוריה'] = name.trim();
  } else {
    // Revert to previous value
    const prev = rowIdx !== null ? (UploadState.rows[rowIdx]['קטגוריה'] || CONFIG.CATEGORIES[0]) : CONFIG.CATEGORIES[0];
    select.innerHTML = buildCategoryOptions(prev);
    select.value = prev;
  }
}

// Strip invisible Unicode direction/BOM marks that Israeli bank exports embed in Hebrew text
function stripMarks(s) {
  return String(s).replace(/[‎‏‪-‮﻿ ]/g, '').trim();
}

// ── Cal normalization ─────────────────────────────────────
const CAL_CATEGORY_MAP = {
  'אופנה':             'בזבוזים',
  'אנרגיה':            'דלק',
  'ביטוח ופיננסים':    'ביטוח',
  'חינוך':             'חינוך',
  'מוסדות':            'שונות',
  'מזון ומשקאות':      'מזון ומשקאות',
  'מזון מהיר':         'מסעדות',
  'מסעדות':            'מסעדות',
  'משחקי מזל':         'בזבוזים',
  'פנאי בילוי':        'בזבוזים',
  'ריהוט ובית':        'שונות',
  'רכב ותחבורה':       'תחבורה',
  'רפואה ובריאות':     'בריאות',
  'שונות':             'שונות',
  'תיירות':            'חופשות',
  'תקשורת ומחשבים':    'אינטרנט וכבלים',
};

function parseCalDate(val) {
  if (val instanceof Date) {
    const d = val;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  // Excel serial (roughly 1900–2200 era)
  if (!isNaN(n) && n > 40000 && n < 70000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  // D/M/YY or DD/MM/YYYY
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) y = '20' + y;
    return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
  }
  return s;
}

function parseCalAmount(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[₪$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Scan first rows for a Cal header line. Uses stripMarks to handle invisible Unicode
// direction markers that Israeli banks embed in Hebrew text.
function findCalHeaderRow(rows) {
  const limit = Math.min(rows.length, 30);
  // Primary: row containing תאריך AND (סכום OR ענף)
  for (let i = 0; i < limit; i++) {
    const joined = rows[i].map(c => stripMarks(String(c))).join(' ');
    if (joined.includes('תאריך') && (joined.includes('סכום') || joined.includes('ענף'))) {
      return i;
    }
  }
  // Fallback: row containing תאריך AND שם — catches variant header formats
  for (let i = 0; i < limit; i++) {
    const joined = rows[i].map(c => stripMarks(String(c))).join(' ');
    if (joined.includes('תאריך') && joined.includes('שם')) {
      return i;
    }
  }
  return -1;
}

function isCalFormat(headers) {
  const clean = headers.map(h => stripMarks(h));
  return clean.some(h => h.includes('ענף') || h.includes('תאריך עסקה') || h.includes('תאריך')) &&
         clean.some(h => h.includes('סכום') || h.includes('שם בית'));
}

// Transform a raw 2D Cal sheet into normalized row objects ready for preview/upload
function normalizeCal2D(data2d, headerIdx, sourceName) {
  const rawHeaders = data2d[headerIdx].map(h =>
    stripMarks(String(h)).replace(/\n/g, ' ')
  );
  function colIdx(...candidates) {
    for (const cand of candidates) {
      const i = rawHeaders.findIndex(h => h.includes(cand));
      if (i !== -1) return i;
    }
    return -1;
  }

  const dateIdx     = colIdx('תאריך עסקה', 'תאריך');
  const merchantIdx = colIdx('שם בית עסק', 'בית עסק', 'שם');
  const amountIdx   = colIdx('סכום חיוב', 'חיוב');
  const typeIdx     = colIdx('סוג עסקה', 'סוג');
  const branchIdx   = colIdx('ענף');
  const notesIdx    = colIdx('הערות');

  if (dateIdx === -1 || merchantIdx === -1 || amountIdx === -1) {
    return [];
  }

  const rows = [];
  for (let i = headerIdx + 1; i < data2d.length; i++) {
    const row = data2d[i];
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

    const merchant = String(row[merchantIdx] || '').trim();
    // Skip totals rows (empty merchant or a purely numeric value)
    if (!merchant || !isNaN(parseFloat(merchant))) continue;

    const amount = parseCalAmount(row[amountIdx]);
    if (amount === null || amount === 0) continue;

    const date = parseCalDate(row[dateIdx]);
    if (!date) continue;

    const branch = String(branchIdx !== -1 ? (row[branchIdx] || '') : '').trim();
    let category = CAL_CATEGORY_MAP[branch] || 'שונות';
    // Merchant-name override: specific payees take precedence over Cal branch
    for (const [pattern, mappedCat] of CONFIG.MERCHANT_CATEGORY_MAP) {
      if (merchant.includes(pattern)) { category = mappedCat; break; }
    }
    const txnType  = String(typeIdx !== -1 ? (row[typeIdx] || '') : '').trim();
    const notes    = String(notesIdx !== -1 ? (row[notesIdx] || '') : '').trim();
    // "DD/MM/YYYY" → month = "MM/YYYY"
    const month    = `${date.substring(3, 5)}/${date.substring(6)}`;

    rows.push({
      'תאריך':      date,
      'שם בית עסק': merchant,
      'סכום חיוב':  String(amount),
      'קטגוריה':    category,
      'סוג עסקה':   txnType,
      'הערות':      notes,
      'חודש':       month,
      'מקור כרטיס': sourceName,
      'פוצל':       'FALSE',
    });
  }
  return rows;
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

// Split text into logical CSV lines, keeping \n inside quoted fields intact
function splitIntoLogicalLines(text) {
  const lines = [];
  let current = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQ = !inQ; current += ch; }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n' && !inQ) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function parseCSV(text) {
  const clean = text.replace(/^﻿/, '');
  const lines = splitIntoLogicalLines(clean);
  if (lines.length < 2) throw new Error('הקובץ ריק או אינו תקין');

  const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const headers = parseCSVLine(lines[0], delim).map(h =>
    h.replace(/^﻿/, '').replace(/\n/g, ' ').trim()
  );
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

// Flexible column lookup — matches exact name or partial containment
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

// ── File processors ───────────────────────────────────────
async function processExcelFile(file) {
  if (typeof XLSX === 'undefined') {
    throw new Error('ספריית Excel לא טעונה — נסה לרענן את הדף.');
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const allRows = [];
  const diag    = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    // Build string version for header detection (strip marks, convert dates to ISO)
    const strData = data.map(r => r.map(c => {
      if (c instanceof Date) return c.toISOString();
      return stripMarks(String(c === null || c === undefined ? '' : c));
    }));

    const headerIdx = findCalHeaderRow(strData);
    diag.push(`${sheetName}:${data.length}r/h@${headerIdx}`);

    if (headerIdx === -1) continue;

    const rows = normalizeCal2D(data, headerIdx, sheetName);
    allRows.push(...rows);
  }

  if (allRows.length === 0) {
    throw new Error(
      `לא נמצאו עסקאות בקובץ. פירוט: ${diag.join(' | ')}. ` +
      `פתח את קונסול הדפדפן (F12 ← Console) ושלח את הפלט.`
    );
  }

  return allRows;
}

async function processCsvFile(file) {
  const text = await file.text();
  const clean = text.replace(/^﻿/, '');
  const lines = splitIntoLogicalLines(clean);
  if (lines.length < 2) return [];

  const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const data2d = lines.map(l => parseCSVLine(l, delim).map(v => v.trim()));
  const strData = data2d.map(r => r.map(c => String(c)));

  const headerIdx = findCalHeaderRow(strData);
  if (headerIdx !== -1) {
    const headers = strData[headerIdx].map(h => h.replace(/\n/g, ' ').trim());
    if (isCalFormat(headers)) {
      return normalizeCal2D(data2d, headerIdx, file.name);
    }
  }

  // Already-normalized CSV (e.g. output from normalizer.py)
  const rows = parseCSV(text);
  return rows;
}

async function processOneFile(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') return processExcelFile(file);
  if (ext === 'csv') return processCsvFile(file);
  throw new Error(`סוג קובץ לא נתמך: .${ext}`);
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
  el.innerHTML = `<div class="error-msg">${escHtml(msg)}</div>`;
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
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => {
    if (input.files.length > 0) handleFiles(input.files);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  const zone  = document.getElementById('upload-zone');
  zone.querySelector('.upload-zone-text').textContent = 'מעבד קבצים...';

  document.getElementById('upload-error').innerHTML = '';

  const allRows   = [];
  const errors    = [];
  const warnings  = [];
  const names     = [];

  for (const file of files) {
    try {
      const rows = await processOneFile(file);
      if (rows.length > 0) {
        allRows.push(...rows);
        names.push(file.name);
      } else {
        warnings.push(`${file.name}: לא נמצאו עסקאות`);
      }
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  // Reset drop zone text
  zone.querySelector('.upload-zone-text').textContent =
    'גרור לכאן קבצי Excel / CSV של Cal';

  if (allRows.length === 0) {
    showError(
      (errors.length > 0 ? errors.join('\n') : '') +
      (warnings.length > 0 ? '\n' + warnings.join('\n') : '') ||
      'לא נמצאו עסקאות בקבצים שנבחרו'
    );
    return;
  }

  if (warnings.length > 0 || errors.length > 0) {
    const msgs = [...warnings, ...errors].join(' | ');
    const el = document.getElementById('upload-error');
    el.innerHTML = `<div class="error-msg" style="background:rgba(243,156,18,0.15);border-color:var(--accent);">${escHtml(msgs)}</div>`;
  }

  UploadState.rows      = allRows;
  UploadState.fileNames = names;
  renderPreview(allRows);
  setStep(2);
}

// ── Step 2: Preview table ─────────────────────────────────
function renderPreview(rows) {
  const tbody = document.getElementById('preview-tbody');
  document.getElementById('preview-count').textContent = `${rows.length} עסקאות`;

  const total = rows.reduce((sum, row) => {
    const amtRaw = getCol(row, 'סכום חיוב', 'סכום עסקה', 'סכום');
    return sum + (parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0);
  }, 0);
  document.getElementById('preview-total').textContent = formatShekel(total);

  tbody.innerHTML = '';

  rows.forEach((row, idx) => {
    const date     = getCol(row, 'תאריך', 'תאריך עסקה');
    const merchant = getCol(row, 'שם בית עסק', 'בית עסק');
    const amtRaw   = getCol(row, 'סכום חיוב', 'סכום עסקה', 'סכום');
    const amt      = parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0;
    const category = getCol(row, 'קטגוריה') || '';
    const txnType  = getCol(row, 'סוג עסקה', 'סוג');
    const notes    = getCol(row, 'הערות');
    const source   = getCol(row, 'מקור כרטיס');
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td>${escHtml(date)}</td>
      <td>${escHtml(merchant)}${source ? `<br><small class="text-muted" style="font-size:0.7rem;">${escHtml(source)}</small>` : ''}</td>
      <td class="${amt < 0 ? 'amount-positive' : 'amount-negative'}">${formatShekel(amt)}</td>
      <td>
        <select class="input-inline cat-select" data-idx="${idx}">
          ${buildCategoryOptions(category)}
        </select>
      </td>
      <td class="text-muted">${escHtml(txnType)}</td>
      <td>
        <input type="text" class="input-inline notes-input" data-idx="${idx}"
               value="${escHtml(notes)}" placeholder="הערות" />
      </td>
      <td>
        <button class="btn btn-sm btn-outline split-btn" data-idx="${idx}">פצל</button>
        <button class="btn btn-sm btn-danger rm-btn" data-idx="${idx}" title="מחק שורה">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.cat-select').forEach(sel =>
    sel.addEventListener('change', e => handleCatChange(e.target, +e.target.dataset.idx)));
  tbody.querySelectorAll('.notes-input').forEach(inp =>
    inp.addEventListener('input', e => { UploadState.rows[+e.target.dataset.idx]['הערות'] = e.target.value; }));
  tbody.querySelectorAll('.split-btn').forEach(btn =>
    btn.addEventListener('click', e => openSplitModal(+e.target.dataset.idx)));
  tbody.querySelectorAll('.rm-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      UploadState.rows.splice(+e.target.dataset.idx, 1);
      renderPreview(UploadState.rows);
    }));
}

// ── Step 3: Duplicate detection ───────────────────────────
async function runDuplicateCheck() {
  const btn = document.getElementById('check-dupes-btn');
  btn.disabled = true; btn.textContent = 'בודק...';

  try {
    const firstMonth = UploadState.rows[0]?.['חודש'] || '';
    const txYear     = parseInt(firstMonth.split('/')[1]) || new Date().getFullYear();
    await SheetsAPI.ensureYearTab(txYear);
    const existing = await SheetsAPI.getRange(getTxSheet(txYear), 'A:J');
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
  if (detected) {
    const [mm, yyyy] = detected.split('/'); // app format MM/YYYY → <input type="month"> wants YYYY-MM
    input.value = (mm && yyyy) ? `${yyyy}-${mm}` : '';
  }
}

// ── Step 5: Upload ────────────────────────────────────────
async function doUpload() {
  const btn    = document.getElementById('upload-btn');
  const msgDiv = document.getElementById('upload-result');
  btn.disabled = true; btn.textContent = 'מעלה...';
  msgDiv.innerHTML = '';

  try {
    const monthRaw = document.getElementById('month-select').value.trim(); // YYYY-MM from <input type="month">
    if (!monthRaw) throw new Error('יש לבחור חודש');
    const [my, mm] = monthRaw.split('-');
    const month = `${mm}/${my}`;

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

    const uploadYear = parseInt(month.split('/')[1]);
    await SheetsAPI.ensureYearTab(uploadYear);
    await SheetsAPI.appendRows(getTxSheet(uploadYear), toUpload);

    // Audit log
    const totalAmt = toUpload.reduce((s, r) => s + parseFloat(r[2] || 0), 0);
    const fileLabel = UploadState.fileNames.join(', ') || 'העלאה ידנית';
    await SheetsAPI.appendRows(CONFIG.SHEETS.AUDIT_LOG, [[
      new Date().toLocaleString('he-IL'),
      fileLabel,
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
    msgDiv.innerHTML = `<div class="error-msg">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'העלה לגוגל שיטס ▶';
  }
}

// ── Manual entry modal ────────────────────────────────────
function openManualEntryModal() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  document.getElementById('manual-date').value     = `${yyyy}-${mm}-${dd}`;
  document.getElementById('manual-merchant').value = '';
  document.getElementById('manual-amount').value   = '';
  document.getElementById('manual-notes').value    = '';
  const catSel = document.getElementById('manual-category');
  catSel.innerHTML = buildCategoryOptions(CONFIG.CATEGORIES[0]);
  document.getElementById('manual-modal').classList.add('open');
  document.getElementById('manual-merchant').focus();
}

function saveManualEntry() {
  const dateRaw  = document.getElementById('manual-date').value.trim();
  const merchant = document.getElementById('manual-merchant').value.trim();
  const amtRaw   = document.getElementById('manual-amount').value.trim();
  const category = document.getElementById('manual-category').value;
  const notes    = document.getElementById('manual-notes').value.trim();

  if (!dateRaw || !merchant || !amtRaw) {
    alert('יש למלא תאריך, שם בית עסק וסכום');
    return;
  }
  const amount = parseFloat(amtRaw.replace(/[₪,\s]/g, ''));
  if (isNaN(amount)) { alert('סכום לא תקין'); return; }

  const isoParts = dateRaw.split('-'); // <input type="date"> gives YYYY-MM-DD
  const date  = isoParts.length === 3 ? `${isoParts[2]}/${isoParts[1]}/${isoParts[0]}` : dateRaw;
  const month = date.length >= 10 ? `${date.substring(3, 5)}/${date.substring(6)}` : '';

  const row = {
    'תאריך':      date,
    'שם בית עסק': merchant,
    'סכום חיוב':  String(amount),
    'קטגוריה':    category,
    'סוג עסקה':   'ידני',
    'הערות':      notes,
    'חודש':       month,
    'מקור כרטיס': 'הזנה ידנית',
    'פוצל':       'FALSE',
  };

  UploadState.rows.push(row);
  UploadState.fileNames = [...new Set([...UploadState.fileNames, 'הזנה ידנית'])];
  document.getElementById('manual-modal').classList.remove('open');
  renderPreview(UploadState.rows);
  if (UploadState.step < 2) setStep(2);
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

  loadCustomCategories();
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

  // Manual entry modal
  document.getElementById('add-manual-btn').addEventListener('click', openManualEntryModal);
  document.getElementById('add-manual-btn-2').addEventListener('click', openManualEntryModal);
  document.getElementById('save-manual-btn').addEventListener('click', saveManualEntry);
  document.getElementById('cancel-manual-btn').addEventListener('click', () =>
    document.getElementById('manual-modal').classList.remove('open'));
  document.getElementById('manual-category').addEventListener('change', e => {
    if (e.target.value === '__new__') {
      const name = prompt('שם הקטגוריה החדשה:');
      if (name && name.trim()) {
        addCustomCategory(name.trim());
        e.target.innerHTML = buildCategoryOptions(name.trim());
        e.target.value = name.trim();
      } else {
        e.target.value = CONFIG.CATEGORIES[0];
      }
    }
  });
});
