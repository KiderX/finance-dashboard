/**
 * @fileoverview Application configuration constants.
 * Contains Google OAuth and Sheets API settings.
 * IMPORTANT: Only the client_id is stored here — never the client_secret.
 */

'use strict';

// ── localStorage keys ───────────────────────────────────────────────────────
const CFG_KEYS = {
  SPREADSHEET_ID: 'finance_spreadsheet_id',
  CLIENT_ID:      'finance_client_id',
  EMAILS:         'finance_allowed_emails',
};

/** Returns true when all required config values are present in localStorage */
function isConfigured() {
  return !!(
    localStorage.getItem(CFG_KEYS.SPREADSHEET_ID) &&
    localStorage.getItem(CFG_KEYS.CLIENT_ID) &&
    JSON.parse(localStorage.getItem(CFG_KEYS.EMAILS) || '[]').length > 0
  );
}

/** Persists config to localStorage */
function saveConfig({ spreadsheetId, clientId, emails }) {
  localStorage.setItem(CFG_KEYS.SPREADSHEET_ID, spreadsheetId.trim());
  localStorage.setItem(CFG_KEYS.CLIENT_ID,      clientId.trim());
  localStorage.setItem(CFG_KEYS.EMAILS,         JSON.stringify(emails.map(e => e.trim()).filter(Boolean)));
}

/** Wipes config from localStorage */
function clearConfig() {
  Object.values(CFG_KEYS).forEach(k => localStorage.removeItem(k));
}

/** @type {Object} Global application configuration — values stored in localStorage */
const CONFIG = {
  get SPREADSHEET_ID() { return localStorage.getItem(CFG_KEYS.SPREADSHEET_ID) || ''; },
  get CLIENT_ID()      { return localStorage.getItem(CFG_KEYS.CLIENT_ID)      || ''; },
  get ALLOWED_EMAILS() { return JSON.parse(localStorage.getItem(CFG_KEYS.EMAILS) || '[]'); },

  /** OAuth scope for full read+write access */
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets email',

  /** OAuth scope for read-only access */
  SCOPES_READONLY: 'https://www.googleapis.com/auth/spreadsheets.readonly email',

  /** Google Sheets API v4 base URL */
  SHEETS_API_BASE: 'https://sheets.googleapis.com/v4/spreadsheets',

  /** Sheet tab names (must match exactly what is in the Google Sheet) */
  SHEETS: {
    INCOME: 'Income',
    MONTHLY_SUMMARY: 'MonthlySummary',
    PROFIT_ALLOCATION: 'Allocation',
    NET_WORTH: 'NetWorth',
    ESPP: 'ESPP',
    AUDIT_LOG: 'AuditLog',
    DASHBOARD: 'Dashboard',
  },

  /** Expense categories grouped by parent — drives both the dashboard hierarchy and dropdown optgroups */
  CATEGORY_GROUPS: [
    {
      name: 'הוצאות שוטפות',
      subs: ['שכר דירה', 'וועד בית', 'ארנונה', 'חשמל', 'מים וביוב', 'אינטרנט וכבלים', 'ביטוח חיים', 'ביטוח', 'כלב', 'כושר'],
      subGroups: [{ name: 'מנויים', subs: ['מנויים - אפל', 'מנויים - גוגל', 'מנויים נוספים'] }],
    },
    {
      name: 'רכב',
      subs: ['ביטוח רכב', 'מימון רכב', 'דלק', 'טיפולים', 'תיקונים', 'חניה', 'תחבורה'],
    },
    {
      name: 'פנאי',
      subs: ['חופשות', 'מתנות', 'בזבוזים', 'ביט ופייבוקס'],
    },
    {
      name: 'אוכל',
      subs: ['מזון ומשקאות', 'מסעדות'],
    },
    {
      name: 'כללי',
      subs: ['בריאות', 'חינוך', 'שונות'],
    },
  ],

  /** Flat list derived from CATEGORY_GROUPS — kept in sync below; custom cats are pushed here */
  CATEGORIES: [],

  /**
   * Merchant-name patterns → category override.
   * Checked in order; first match wins. Takes precedence over both the Cal
   * branch category and LEGACY_CATEGORY_MAP so unambiguous payees always land
   * in the right bucket regardless of how Cal tagged them.
   * Each entry: [substring_to_match, target_category]
   */
  MERCHANT_CATEGORY_MAP: [
    // ── הוצאות שוטפות ──────────────────────────────────────
    ['חברת החשמל',      'חשמל'],
    ['מי נתניה',        'מים וביוב'],
    ['מי-נתניה',        'מים וביוב'],
    ['ארנונה',          'ארנונה'],
    ['עיריית',          'ארנונה'],
    ['ועד הבית',        'וועד בית'],
    ['ועד-הבית',        'וועד בית'],
    ['ועד בית',         'וועד בית'],
    ['שכר דירה',        'שכר דירה'],
    ['דמי שכירות',      'שכר דירה'],
    ["הג'ונגליה",       'כלב'],
    ["ג'ונגליה",        'כלב'],
    ['גז ישראל',        'חשמל'],
    ['חברת גז',         'חשמל'],
    // ── מנויים ─────────────────────────────────────────────
    ['APPLE.COM',       'מנויים - אפל'],
    ['APPLE COM',       'מנויים - אפל'],
    ['Google YouTube',  'מנויים - גוגל'],
    ['GOOGLE',          'מנויים - גוגל'],
    ['Netflix',         'מנויים נוספים'],
    ['NETFLIX',         'מנויים נוספים'],
    ['Prime Video',     'מנויים נוספים'],
    ['PRIME VIDEO',     'מנויים נוספים'],
    ['Spotify',         'מנויים נוספים'],
    ['SPOTIFY',         'מנויים נוספים'],
    ['איתוראן',         'מנויים נוספים'],
    // ── כושר ───────────────────────────────────────────────
    ['FREE-FIT',        'כושר'],
    ['פיטנס',           'כושר'],
    ['GYM',             'כושר'],
    // ── תקשורת ─────────────────────────────────────────────
    ['סלקום',           'אינטרנט וכבלים'],
    ['פלאפון',          'אינטרנט וכבלים'],
    ['הוט',             'אינטרנט וכבלים'],
    ['yes ',            'אינטרנט וכבלים'],
    ['partner',         'אינטרנט וכבלים'],
    ['Partner',         'אינטרנט וכבלים'],
    // ── רכב ────────────────────────────────────────────────
    ['Gett',            'תחבורה'],
    ['GETT',            'תחבורה'],
    ['גט ',             'תחבורה'],
    ['פנגו',            'חניה'],
    ['PANGO',           'חניה'],
    ['חניון',           'חניה'],
    // ── פנאי ───────────────────────────────────────────────
    ['AIRBNB',          'חופשות'],
    ['airbnb',          'חופשות'],
    ['BIT',             'ביט ופייבוקס'],
    ['ביי-מי',          'מתנות'],
    ['שוברי מתנה',      'מתנות'],
  ],

  /** Maps old/legacy category names to current sub-category names for display normalization */
  LEGACY_CATEGORY_MAP: {
    'כלב והוצאותיו':  'כלב',
    'הוצאות בון':     'כלב',
    'הוצאות שטופות':  'שונות',
    'רכב':            'שונות',
    'מזון':           'מזון ומשקאות',
    'פנאי ובילוי':    'בזבוזים',
    'בית':            'שונות',
    'תיירות':         'חופשות',
    'תקשורת':         'אינטרנט וכבלים',  // merchant rules override for Apple/Google/Netflix
    'בגדים ואופנה':   'בזבוזים',
    'ריהוט ובית':     'שונות',
  },
};

/** Returns the year-partitioned transaction sheet name, e.g. "transactions_2026" */
function getTxSheet(year) {
  return `transactions_${year}`;
}

CONFIG.CATEGORIES = CONFIG.CATEGORY_GROUPS.flatMap(g => [
  ...g.subs,
  ...(g.subGroups || []).flatMap(sg => sg.subs),
]);
