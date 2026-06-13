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

  /**
   * Creates all required sheet tabs and writes headers.
   * Safe to call on an already-initialized spreadsheet — skips existing tabs.
   * @returns {Promise<number>} Number of new tabs created.
   */
  async function initializeSpreadsheet() {
    const SHEET_DEFS = [
      { name: CONFIG.SHEETS.TRANSACTIONS,      headers: ['תאריך','שם בית עסק','סכום חיוב','קטגוריה','סוג עסקה','הערות','חודש','מקור כרטיס','פוצל','מזהה ייחודי'] },
      { name: CONFIG.SHEETS.INCOME,            headers: ['חודש','משכורת ראשונה','משכורת שנייה','בונוסים','ESPP','הכנסות נוספות','סה"כ הכנסות','הערות'] },
      { name: CONFIG.SHEETS.MONTHLY_SUMMARY,   headers: ['חודש','סה"כ הוצאות','סה"כ הכנסות','רווח','אחוז חיסכון'] },
      { name: CONFIG.SHEETS.PROFIT_ALLOCATION, headers: ['חודש','רווח','עו"ש','קרן כספית','השקעות','אחר','סה"כ מוקצה','הערות'] },
      { name: CONFIG.SHEETS.NET_WORTH,         headers: ['חודש','תיק השקעות','קרן כספית','חסכונות','סה"כ שווי נקי'] },
      { name: CONFIG.SHEETS.ESPP,              headers: ['תאריך מכירה','מחיר מכירה','כמות מניות','סכום ברוטו','מס','סכום נטו','הערות'] },
      { name: CONFIG.SHEETS.AUDIT_LOG,         headers: ['תאריך העלאה','שם קובץ','מספר עסקאות','סכום כולל','משתמש','כפילויות שנדחו'] },
      { name: CONFIG.SHEETS.DASHBOARD,         headers: [] },
    ];

    // Find which tabs already exist
    const metaRes = await fetch(`${baseUrl()}?fields=sheets.properties.title`, { headers: authHeaders() });
    const meta = await handleResponse(metaRes);
    const existing = new Set((meta.sheets || []).map(s => s.properties.title));

    // Create only missing tabs
    const missing = SHEET_DEFS.filter(s => !existing.has(s.name));
    if (missing.length > 0) {
      const res = await fetch(`${baseUrl()}:batchUpdate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ requests: missing.map(s => ({ addSheet: { properties: { title: s.name } } })) }),
      });
      await handleResponse(res);
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

    return missing.length;
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
    initializeSpreadsheet,
  };
})();

async function handleSetup(btn) {
  btn.disabled = true;
  btn.textContent = 'מגדיר...';
  try {
    const count = await SheetsAPI.initializeSpreadsheet();
    btn.textContent = count > 0 ? `✓ נוצרו ${count} גיליונות` : '✓ כבר מוגדר';
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    btn.textContent = '⚙️ הגדרת גיליון';
    btn.disabled = false;
    alert('שגיאה: ' + err.message);
  }
}
