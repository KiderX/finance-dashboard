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
    TRANSACTIONS: 'עסקאות',
    INCOME: 'הכנסות',
    MONTHLY_SUMMARY: 'סיכום חודשי',
    PROFIT_ALLOCATION: 'פיזור רווחים',
    NET_WORTH: 'מעקב עושר',
    ESPP: 'ESPP',
    AUDIT_LOG: 'לוג העלאות',
    DASHBOARD: 'דשבורד',
  },

  /** Expense categories (order matters — matches UI display order) */
  CATEGORIES: [
    'הוצאות שטופות',
    'רכב',
    'פנאי ובילוי',
    'בית',
    'מזון',
    'מסעדות',
    'בריאות',
    'תקשורת',
    'תיירות',
    'בגדים ואופנה',
    'ביטוח',
    'חינוך',
    'שונות',
  ],
};
