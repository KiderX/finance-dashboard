/**
 * @fileoverview Google Sheets API v4 wrapper.
 * All calls use fetch() with Bearer token from AuthManager.
 * No data is cached — every call hits the live API.
 */

'use strict';

/**
 * Google Sheets API client singleton.
 */
const SheetsAPI = (() => {
  // Cache numeric sheetId per tab name — populated on first deleteRow / initializeSpreadsheet.
  // Invalidated when new sheets are created so the next call re-fetches.
  let _sheetIdCache = null;

  async function fetchSheetIds() {
    if (_sheetIdCache) return _sheetIdCache;
    const res  = await fetch(`${baseUrl()}?fields=sheets.properties(sheetId,title)`, { headers: authHeaders() });
    const data = await handleResponse(res);
    _sheetIdCache = {};
    (data.sheets || []).forEach(s => { _sheetIdCache[s.properties.title] = s.properties.sheetId; });
    return _sheetIdCache;
  }

  /**
   * Builds the base URL for a spreadsheet.
   * @returns {string} Base URL for the configured spreadsheet.
   */
  function baseUrl() {
    return `${CONFIG.SHEETS_API_BASE}/${CONFIG.SPREADSHEET_ID}`;
  }

  /**
   * Returns authorization headers using the current Bearer token.
   * @returns {Object} Headers object.
   * @throws {Error} If no valid token is available.
   */
  function authHeaders() {
    const token = AuthManager.getToken();
    if (!token) {
      throw new Error('אין אסימון גישה תקין. יש להתחבר מחדש.');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Handles API response errors with Hebrew messages.
   * @param {Response} response - Fetch response object.
   * @returns {Promise<Object>} Parsed JSON body.
   * @throws {Error} If the response is not OK.
   */
  async function handleResponse(response) {
    if (!response.ok) {
      let message = `שגיאת API: ${response.status}`;
      try {
        const err = await response.json();
        if (err.error && err.error.message) {
          message = `שגיאת Google Sheets: ${err.error.message}`;
        }
      } catch (_) {
        // Keep the default message
      }
      throw new Error(message);
    }
    return response.json();
  }

  /**
   * Encodes a sheet name for use in a URL (handles Hebrew and spaces).
   * @param {string} sheetName - Raw sheet tab name.
   * @returns {string} URL-encoded sheet name.
   */
  function encodeSheetName(sheetName) {
    return encodeURIComponent(sheetName);
  }

  /**
   * Reads a range of cells from a sheet.
   * @param {string} sheetName - The tab name (e.g., 'עסקאות').
   * @param {string} range - A1 notation range (e.g., 'A1:J100').
   * @returns {Promise<string[][]>} 2D array of cell values.
   */
  async function getRange(sheetName, range) {
    const url = `${baseUrl()}/values/${encodeSheetName(sheetName)}!${range}`;
    const response = await fetch(url, { headers: authHeaders() });
    const data = await handleResponse(response);
    return data.values || [];
  }

  /**
   * Reads all data from a sheet tab.
   * @param {string} sheetName - The tab name.
   * @returns {Promise<string[][]>} 2D array of all cell values.
   */
  async function getSheet(sheetName) {
    const url = `${baseUrl()}/values/${encodeSheetName(sheetName)}`;
    const response = await fetch(url, { headers: authHeaders() });
    const data = await handleResponse(response);
    return data.values || [];
  }

  /**
   * Appends rows to a sheet (after the last row with data).
   * @param {string} sheetName - The tab name.
   * @param {Array<Array<string|number|boolean>>} rows - Rows to append.
   * @returns {Promise<Object>} API response body.
   */
  async function appendRows(sheetName, rows) {
    const url =
      `${baseUrl()}/values/${encodeSheetName(sheetName)}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ values: rows }),
    });
    return handleResponse(response);
  }

  /**
   * Updates a specific range of cells.
   * @param {string} sheetName - The tab name.
   * @param {string} range - A1 notation range to update.
   * @param {Array<Array<string|number|boolean>>} values - 2D array of new values.
   * @returns {Promise<Object>} API response body.
   */
  async function updateRange(sheetName, range, values) {
    const url =
      `${baseUrl()}/values/${encodeSheetName(sheetName)}!${range}` +
      `?valueInputOption=USER_ENTERED`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ values }),
    });
    return handleResponse(response);
  }

  /**
   * Batch-fetches multiple ranges in a single API call.
   * @param {string[]} ranges - Array of fully-qualified range strings
   *   (e.g., ["עסקאות!A:J", "הכנסות!A:H"]).
   * @returns {Promise<Object>} Raw batch response with valueRanges array.
   */
  async function batchGet(ranges) {
    const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `${baseUrl()}/values:batchGet?${params}`;
    const response = await fetch(url, { headers: authHeaders() });
    return handleResponse(response);
  }

  /**
   * Converts a sheet's 2D values array into an array of plain objects.
   * The first row is treated as headers.
   * @param {string[][]} values - Raw 2D array from Sheets API.
   * @returns {Object[]} Array of row objects keyed by header name.
   */
  function valuesToObjects(values) {
    if (!values || values.length < 2) return [];
    const [headers, ...rows] = values;
    return rows.map((row) => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] !== undefined ? row[i] : '';
      });
      return obj;
    });
  }

  /**
   * Finds the row number (1-indexed) of a specific month in a sheet.
   * Assumes column A contains month strings in MM/YYYY format.
   * @param {string[][]} values - Raw sheet values.
   * @param {string} month - Month string to search for (MM/YYYY).
   * @returns {number} 1-indexed row number, or -1 if not found.
   */
  function findMonthRow(values, month) {
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === month) return i + 1; // +1 for 1-indexed
    }
    return -1;
  }

  const TX_HEADERS = ['תאריך','שם בית עסק','סכום חיוב','קטגוריה','סוג עסקה','הערות','חודש','מקור כרטיס','פוצל','מזהה ייחודי'];

  /**
   * Ensures a year-partitioned transaction tab exists, creating it with headers if not.
   * @param {number} year - e.g. 2026
   */
  async function ensureYearTab(year) {
    const ids  = await fetchSheetIds();
    const name = getTxSheet(year);
    if (ids[name] !== undefined) return;
    await fetch(`${baseUrl()}:batchUpdate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name } } }] }),
    }).then(r => handleResponse(r));
    _sheetIdCache = null;
    await updateRange(name, 'A1', [TX_HEADERS]);
  }

  /**
   * One-time migration: if the old "Transactions" tab has data and no year tab exists yet,
   * copies rows into the correct transactions_YYYY tabs and leaves the old tab untouched.
   */
  async function migrateTransactionsIfNeeded() {
    const ids = await fetchSheetIds();
    if (!ids['Transactions']) return;
    const hasYearTab = Object.keys(ids).some(k => /^transactions_\d{4}$/.test(k));
    if (hasYearTab) return;

    const data = await getSheet('Transactions');
    if (data.length < 2) return;

    const headers  = data[0];
    const monthIdx = headers.indexOf('חודש');
    if (monthIdx === -1) return;

    const byYear = {};
    data.slice(1).forEach(row => {
      const parts = (row[monthIdx] || '').split('/');
      const year  = parts[1];
      if (!year || !/^\d{4}$/.test(year)) return;
      (byYear[year] = byYear[year] || []).push(row);
    });

    for (const [year, rows] of Object.entries(byYear)) {
      await ensureYearTab(Number(year));
      await appendRows(getTxSheet(Number(year)), rows);
    }
  }

  /**
   * Creates all required sheet tabs and writes headers.
   * Safe to call on an already-initialized spreadsheet — skips existing tabs.
   * @returns {Promise<number>} Number of new tabs created.
   */
  async function initializeSpreadsheet() {
    const SHEET_DEFS = [
      { name: CONFIG.SHEETS.INCOME,            headers: ['חודש','משכורת ראשונה','משכורת שנייה','בונוסים','ESPP','הכנסות נוספות','סה"כ הכנסות','הערות'] },
      { name: CONFIG.SHEETS.MONTHLY_SUMMARY,   headers: ['חודש','סה"כ הוצאות','סה"כ הכנסות','רווח','אחוז חיסכון'] },
      { name: CONFIG.SHEETS.PROFIT_ALLOCATION, headers: ['חודש','רווח','עו"ש','קרן כספית','השקעות','אחר','סה"כ מוקצה','הערות'] },
      { name: CONFIG.SHEETS.NET_WORTH,         headers: ['חודש','תיק השקעות','קרן כספית','חסכונות','סה"כ שווי נקי'] },
      { name: CONFIG.SHEETS.ESPP,              headers: ['תאריך מכירה','מחיר מכירה','כמות מניות','סכום ברוטו','מס','סכום נטו','הערות'] },
      { name: CONFIG.SHEETS.AUDIT_LOG,         headers: ['תאריך העלאה','שם קובץ','מספר עסקאות','סכום כולל','משתמש','כפילויות שנדחו'] },
      { name: CONFIG.SHEETS.DASHBOARD,         headers: [] },
    ];

    // Find which tabs already exist (also primes the sheetId cache)
    const ids      = await fetchSheetIds();
    const existing = new Set(Object.keys(ids));

    // Create only missing tabs
    const missing = SHEET_DEFS.filter(s => !existing.has(s.name));
    if (missing.length > 0) {
      const res = await fetch(`${baseUrl()}:batchUpdate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ requests: missing.map(s => ({ addSheet: { properties: { title: s.name } } })) }),
      });
      await handleResponse(res);
      _sheetIdCache = null; // new sheets added — invalidate so next deleteRow re-fetches
    }

    // Write headers to all tabs (safe — only overwrites row 1)
    const headerRanges = SHEET_DEFS
      .filter(s => s.headers.length > 0)
      .map(s => ({ range: `${s.name}!A1`, values: [s.headers] }));

    if (headerRanges.length > 0) {
      const res = await fetch(`${baseUrl()}/values:batchUpdate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: headerRanges }),
      });
      await handleResponse(res);
    }

    // Ensure the current year's transaction tab exists
    await ensureYearTab(new Date().getFullYear());

    return missing.length;
  }

  /**
   * Deletes a single row from a sheet by its 0-based index in the sheet data.
   * Index 0 = header row, index 1 = first data row, etc.
   * @param {string} sheetName - The tab name.
   * @param {number} rowIndex - 0-based row index (including header).
   * @returns {Promise<Object>} API response body.
   */
  async function deleteRow(sheetName, rowIndex) {
    const ids     = await fetchSheetIds();
    const sheetId = ids[sheetName];
    if (sheetId === undefined) throw new Error(`גיליון לא נמצא: ${sheetName}`);

    const res = await fetch(`${baseUrl()}:batchUpdate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        }],
      }),
    });
    return handleResponse(res);
  }

  // Public API
  return {
    getRange,
    getSheet,
    appendRows,
    updateRange,
    batchGet,
    valuesToObjects,
    findMonthRow,
    deleteRow,
    initializeSpreadsheet,
    ensureYearTab,
    migrateTransactionsIfNeeded,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  // Apply saved colour theme immediately (before paint to avoid flash)
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');

  // Inject sidebar collapse button (desktop hamburger)
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    const colBtn = document.createElement('button');
    colBtn.id        = 'sidebar-collapse-btn';
    colBtn.className = 'sidebar-collapse-btn';
    colBtn.setAttribute('aria-label', 'כווץ/הרחב סרגל צד');

    const sidebarIsCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarIsCollapsed) {
      document.body.classList.add('sidebar-collapsed-mode');
      colBtn.textContent = '›';  // RTL: › = "open/expand"
    } else {
      colBtn.textContent = '‹';  // RTL: ‹ = "collapse"
    }

    const logoEl = sidebar.querySelector('.sidebar-logo');
    if (logoEl) logoEl.appendChild(colBtn);

    colBtn.addEventListener('click', () => {
      const nowCollapsed = !document.body.classList.contains('sidebar-collapsed-mode');
      document.body.classList.toggle('sidebar-collapsed-mode', nowCollapsed);
      colBtn.textContent = nowCollapsed ? '›' : '‹';
      localStorage.setItem('sidebarCollapsed', nowCollapsed);
    });
  }

  // Inject theme toggle button next to settings gear
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    const themeBtn = document.createElement('button');
    themeBtn.id          = 'theme-toggle-btn';
    themeBtn.className   = 'btn btn-outline theme-toggle-btn';
    themeBtn.title       = 'עבור בין מצב כהה/בהיר';
    themeBtn.textContent = savedTheme === 'light' ? '☀️' : '🌙';
    settingsBtn.parentNode.insertBefore(themeBtn, settingsBtn);

    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
        themeBtn.textContent = '🌙';
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        themeBtn.textContent = '☀️';
      }
    });
  }

  // Inject settings modal (works on every page that loads sheets.js)
  const overlay = document.createElement('div');
  overlay.id        = 'settings-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-title">הגדרות</div>

      <div class="form-group mt-4 mb-0">
        <label style="font-size:0.78rem;color:var(--text-muted);">מזהה גיליון</label>
        <div style="font-size:0.8rem;word-break:break-all;color:var(--text-muted);margin-top:4px;">${CONFIG.SPREADSHEET_ID}</div>
      </div>

      <hr style="border-color:var(--border);margin:20px 0;" />

      <div class="mb-0">
        <div style="font-weight:600;margin-bottom:6px;">הגדרה ראשונית של הגיליון</div>
        <p class="text-muted" style="font-size:0.83rem;margin-bottom:12px;">יוצר לשוניות חסרות וכותרות. <strong>לא מוחק נתונים קיימים.</strong></p>
        <button class="btn btn-outline w-full" id="settings-setup-btn">הגדר גיליון</button>
        <div id="settings-setup-msg" class="mt-8"></div>
      </div>

      <div class="modal-actions mt-20">
        <button class="btn btn-outline" id="settings-close-btn">סגור</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const open  = () => overlay.classList.add('open');
  const close = () => overlay.classList.remove('open');

  const triggerBtn = document.getElementById('settings-btn');
  if (triggerBtn) triggerBtn.addEventListener('click', open);
  document.getElementById('settings-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('settings-setup-btn').addEventListener('click', async () => {
    const btn = document.getElementById('settings-setup-btn');
    const msg = document.getElementById('settings-setup-msg');
    btn.disabled = true; btn.textContent = 'מגדיר...';
    msg.innerHTML = '';
    try {
      const count = await SheetsAPI.initializeSpreadsheet();
      const text  = count > 0 ? `✓ נוצרו ${count} לשוניות בהצלחה` : '✓ הגיליון כבר מוגדר';
      msg.innerHTML = `<div class="success-msg">${text}</div>`;
      btn.textContent = '✓ הוגדר';
    } catch (err) {
      msg.innerHTML = `<div class="error-msg">${err.message}</div>`;
      btn.textContent = 'הגדר גיליון';
      btn.disabled = false;
    }
  });
});
