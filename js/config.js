/**
 * @fileoverview Application configuration constants.
 * Contains Google OAuth and Sheets API settings.
 * IMPORTANT: Only the client_id is stored here — never the client_secret.
 */

'use strict';

/** @type {Object} Global application configuration */
const CONFIG = {
  /** Google Spreadsheet ID (the long string in the sheet URL) */
  SPREADSHEET_ID: '1FNS_3q1Pr4YogTl0z-0Jke3l7fNBDHd3MZLGWOxWC6s',

  /** Only this email is allowed to log in with full write access */
  ALLOWED_EMAIL: 'matandayan81@gmail.com',

  /** Emails allowed in read-only mode (empty = only ALLOWED_EMAIL in readonly too) */
  READONLY_ALLOWED_EMAILS: [],

  /** Google OAuth 2.0 Client ID (safe to expose in frontend) */
  CLIENT_ID: '620598056888-3skoat2urtmpk57t37vb4i0tmrg3m6a9.apps.googleusercontent.com',

  /** OAuth scope for full read+write access */
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

  /** OAuth scope for read-only access */
  SCOPES_READONLY: 'https://www.googleapis.com/auth/spreadsheets.readonly',

  /** Google Sheets API v4 base URL */
  SHEETS_API_BASE: 'https://sheets.googleapis.com/v4/spreadsheets',

  /** Sheet tab names (must match exactly what is in the Google Sheet) */
  SHEETS: {
    TRANSACTIONS: 'Transactions',
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
      subs: [
        'שכר דירה', 'וועד בית', 'ארנונה', 'חשמל', 'מים וביוב',
        'אינטרנט וכבלים', 'ביטוח חיים', 'ביטוח', 'כלב והוצאותיו',
        'כושר', 'מנויים - אפל', 'מנויים - גוגל', 'מנויים נוספים',
      ],
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
    ['גז ישראל',        'חשמל'],
    ['חברת גז',         'חשמל'],
  ],

  /** Maps old/legacy category names to current sub-category names for display normalization */
  LEGACY_CATEGORY_MAP: {
    'הוצאות שטופות':  'שונות',
    'רכב':            'שונות',
    'מזון':           'מזון ומשקאות',
    'פנאי ובילוי':    'בזבוזים',
    'בית':            'שונות',
    'תיירות':         'חופשות',
    'תקשורת':         'אינטרנט וכבלים',
    'בגדים ואופנה':   'בזבוזים',
  },
};

CONFIG.CATEGORIES = CONFIG.CATEGORY_GROUPS.flatMap(g => g.subs);
