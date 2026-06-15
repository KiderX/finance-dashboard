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

  // ── Google Drive API — share / unshare the spreadsheet ───────────────────
  async function driveReq(method, path, body) {
    const url  = `https://www.googleapis.com/drive/v3/files/${CONFIG.SPREADSHEET_ID}${path}`;
    const opts = { method, headers: authHeaders() };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    if (res.status === 204) return null;
    return handleResponse(res);
  }

  async function addPermission(email, role = 'writer') {
    return driveReq('POST', '/permissions?sendNotificationEmail=false', {
      type: 'user', role, emailAddress: email,
    });
  }

  async function removePermission(email) {
    const data = await driveReq('GET', '/permissions?fields=permissions(id,emailAddress)', null);
    const perm = (data.permissions || [])
      .find(p => (p.emailAddress || '').toLowerCase() === email.toLowerCase());
    if (!perm) return;
    await driveReq('DELETE', `/permissions/${perm.id}`, null);
  }

  // Public API
  return {
    getRange,
    getSheet,
    appendRows,
    updateRange,
    batchGet,
    findMonthRow,
    deleteRow,
    initializeSpreadsheet,
    ensureYearTab,
    migrateTransactionsIfNeeded,
    addPermission,
    removePermission,
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

  // ── Settings modal ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id        = 'settings-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px;max-height:90vh;overflow-y:auto;">
      <div class="modal-title">הגדרות</div>

      <div class="form-group mt-4 mb-0">
        <label style="font-size:0.78rem;color:var(--text-muted);">מזהה גיליון</label>
        <div style="font-size:0.75rem;word-break:break-all;color:var(--text-muted);margin-top:4px;direction:ltr;unicode-bidi:isolate;">${CONFIG.SPREADSHEET_ID}</div>
      </div>

      <hr style="border-color:var(--border);margin:20px 0;" />

      <!-- User management (owner-only section) -->
      <div class="mb-0" id="settings-users-section">
        <div style="font-weight:600;margin-bottom:10px;">ניהול משתמשים</div>
        <p class="text-muted" style="font-size:0.83rem;margin-bottom:12px;" id="settings-users-desc">
          טוען רשימת משתמשים...
        </p>
        <div id="settings-invite-controls" style="display:none;">
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <input type="email" id="settings-new-email" class="input" placeholder="new@gmail.com"
                   style="flex:1;" dir="ltr" />
            <select id="settings-new-role" class="input" style="width:110px;">
              <option value="writer">עריכה</option>
              <option value="reader">צפייה</option>
            </select>
            <button class="btn btn-primary" id="settings-add-email-btn" style="white-space:nowrap;">הזמן</button>
          </div>
        </div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;">משתמשים קיימים</div>
        <div id="settings-email-list" style="display:flex;flex-direction:column;gap:6px;"></div>
        <div id="settings-users-msg" class="mt-8"></div>
      </div>

      <hr style="border-color:var(--border);margin:20px 0;" />

      <!-- Sheet init -->
      <div class="mb-0">
        <div style="font-weight:600;margin-bottom:6px;">הגדרה ראשונית של הגיליון</div>
        <p class="text-muted" style="font-size:0.83rem;margin-bottom:12px;">יוצר לשוניות חסרות וכותרות. <strong>לא מוחק נתונים קיימים.</strong></p>
        <button class="btn btn-outline w-full" id="settings-setup-btn">הגדר גיליון</button>
        <div id="settings-setup-msg" class="mt-8"></div>
      </div>

      <hr style="border-color:var(--border);margin:20px 0;" />

      <!-- Reconfigure -->
      <div class="mb-0">
        <div style="font-weight:600;margin-bottom:6px;">הגדרה מחדש</div>
        <p class="text-muted" style="font-size:0.83rem;margin-bottom:12px;">נקה את כל ההגדרות ועבור למסך ההגדרה הראשונית.</p>
        <button class="btn btn-outline w-full" id="settings-reconfigure-btn" style="border-color:var(--expense);color:var(--expense);">הגדרה מחדש</button>
      </div>

      <div class="modal-actions mt-20">
        <button class="btn btn-outline" id="settings-close-btn">סגור</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const open  = () => { renderEmailList(); overlay.classList.add('open'); };
  const close = () => overlay.classList.remove('open');

  const triggerBtn = document.getElementById('settings-btn');
  if (triggerBtn) triggerBtn.addEventListener('click', open);
  document.getElementById('settings-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // ── Render permissions list (Drive API) ───────────────────────────────────
  async function renderEmailList() {
    const container   = document.getElementById('settings-email-list');
    const desc        = document.getElementById('settings-users-desc');
    const inviteCtrl  = document.getElementById('settings-invite-controls');
    const currentUser = AuthManager.getUserEmail();
    const myRole      = AuthManager.getUserRole(); // 'owner' | 'writer' | 'reader'
    const isOwner     = myRole === 'owner';

    container.innerHTML = '<p class="text-muted" style="font-size:0.83rem;">טוען...</p>';

    // Only owners can add/remove users
    if (inviteCtrl) inviteCtrl.style.display = isOwner ? '' : 'none';
    if (desc) {
      desc.textContent = isOwner
        ? 'הוסף מייל ולחץ הזמן — הגישה תינתן בגיליון וקישור הגדרה יועתק ללוח.'
        : 'רק הבעלים יכול לנהל משתמשים.';
    }

    let permissions = [];
    try {
      const data = await driveReq('GET', '/permissions?fields=permissions(id,emailAddress,role,displayName)', null);
      permissions = data?.permissions || [];
    } catch (_) {
      container.innerHTML = '<p class="text-muted" style="font-size:0.83rem;">לא ניתן לטעון רשימת משתמשים</p>';
      return;
    }

    container.innerHTML = '';
    if (permissions.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:0.83rem;">אין משתמשים</p>';
      return;
    }

    const ROLE_LABEL = { owner: 'בעלים', writer: 'עריכה', reader: 'צפייה', commenter: 'תגובות' };

    permissions.forEach(p => {
      const email     = p.emailAddress || '';
      const role      = p.role || 'reader';
      const roleLabel = ROLE_LABEL[role] || role;
      const isMe      = email.toLowerCase() === (currentUser || '').toLowerCase();
      const isFileOwner = role === 'owner';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
      row.innerHTML = `
        <span style="flex:1;font-size:0.85rem;direction:ltr;unicode-bidi:isolate;">${email || '—'}</span>
        ${isFileOwner
          ? `<span style="font-size:0.72rem;background:var(--accent);color:#000;padding:2px 8px;border-radius:4px;font-weight:600;">בעלים</span>`
          : `<span style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;">${roleLabel}</span>`}
        ${isMe
          ? `<span style="font-size:0.72rem;color:var(--text-muted);padding:2px 6px;">אני</span>`
          : ''}
        ${(isOwner && !isFileOwner && email)
          ? `<button class="btn btn-sm btn-outline remove-email-btn"
                     style="border-color:var(--expense);color:var(--expense);padding:2px 8px;"
                     data-email="${email}" data-perm-id="${p.id}">✕</button>`
          : ''}`;
      container.appendChild(row);
    });

    container.querySelectorAll('.remove-email-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.email;
        btn.disabled = true; btn.textContent = '...';
        try {
          await SheetsAPI.removePermission(email);
          await renderEmailList();
          showUsersMsg('✓ הגישה הוסרה', false);
        } catch (err) {
          showUsersMsg(`שגיאה: ${err.message}`, true);
          btn.disabled = false; btn.textContent = '✕';
        }
      });
    });
  }

  function showUsersMsg(text, isError) {
    const el = document.getElementById('settings-users-msg');
    el.innerHTML = `<div class="${isError ? 'error-msg' : 'success-msg'}">${text}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 3000);
  }

  function generateInviteLink() {
    const payload = btoa(JSON.stringify({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      clientId:      CONFIG.CLIENT_ID,
    }));
    const base = window.location.href.replace(/[^/]*$/, '');
    return `${base}setup.html#invite=${payload}`;
  }

  // Add-user button — only rendered for owners
  const addEmailBtn = document.getElementById('settings-add-email-btn');
  if (addEmailBtn) {
    addEmailBtn.addEventListener('click', async () => {
      const input = document.getElementById('settings-new-email');
      const email = input.value.trim();
      if (!email || !email.includes('@')) { showUsersMsg('כתובת מייל לא תקינה', true); return; }

      const role = document.getElementById('settings-new-role').value;
      addEmailBtn.disabled = true; addEmailBtn.textContent = 'מוסיף...';
      try {
        await SheetsAPI.addPermission(email, role);
        input.value = '';
        await renderEmailList();
        const link = generateInviteLink();
        navigator.clipboard.writeText(link).then(() => {
          showUsersMsg(`✓ ${email} נוסף לגיליון — קישור הזמנה הועתק ללוח`, false);
        }).catch(() => {
          showUsersMsg(`✓ ${email} נוסף לגיליון`, false);
        });
      } catch (err) {
        showUsersMsg(`שגיאה: ${err.message}`, true);
      } finally {
        addEmailBtn.disabled = false; addEmailBtn.textContent = 'הזמן';
      }
    });
  }

  // ── Sheet init ─────────────────────────────────────────────────────────────
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

  // ── Reconfigure ────────────────────────────────────────────────────────────
  document.getElementById('settings-reconfigure-btn').addEventListener('click', () => {
    if (confirm('פעולה זו תנקה את כל ההגדרות ותעביר אותך למסך ההגדרה הראשונית. להמשיך?')) {
      clearConfig();
      window.location.href = 'setup.html';
    }
  });
});
