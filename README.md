# Personal Finance Dashboard

Hebrew RTL personal finance tracker: Python normalizer + Google Sheets data store + GitHub Pages dashboard.

---

## Architecture

```
Visa Cal Excel → normalizer.py → CSV → upload.html → Google Sheet ← dashboard.html
```

---

## Part 1 — Google Cloud Setup

### 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com
2. Click **Select a project → New project**
3. Name it `Finance Dashboard` and click **Create**

### 2. Enable APIs

1. In the left menu go to **APIs & Services → Library**
2. Search for **Google Sheets API** → Enable
3. Search for **Google Drive API** → Enable

### 3. Configure OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → Create
3. Fill in:
   - App name: `Finance Dashboard`
   - User support email: your Gmail
   - Developer contact: your Gmail
4. Click **Save and Continue** through Scopes (add nothing yet)
5. Under **Test users** → Add Users → enter your Gmail → Save

### 4. Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `Finance Dashboard`
4. Under **Authorized JavaScript origins** add:
   - `https://YOUR_GITHUB_USERNAME.github.io`
   - `http://localhost:8080` (for local testing)
5. Click **Create** and copy the **Client ID**

### 5. Update config.js

Open `js/config.js` and fill in:

```js
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_GOOGLE_SHEET_ID',   // from the Sheet URL
  ALLOWED_EMAIL:  'your@gmail.com',
  CLIENT_ID:      'PASTE_CLIENT_ID_HERE.apps.googleusercontent.com',
  ...
};
```

---

## Part 2 — Google Sheet Setup

### Create the spreadsheet

1. Go to https://sheets.google.com → create a new sheet
2. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_IS_THE_ID**/edit`
3. Paste it into `SPREADSHEET_ID` in `js/config.js`

### Create these tabs (exact names, Hebrew):

| Tab name | Columns |
|---|---|
| `עסקאות` | תאריך \| שם בית עסק \| סכום חיוב \| קטגוריה \| סוג עסקה \| הערות \| חודש \| מקור כרטיס \| פוצל \| מזהה ייחודי |
| `הכנסות` | חודש \| משכורת ראשונה \| משכורת שנייה \| בונוסים \| ESPP \| הכנסות נוספות \| סה"כ הכנסות \| הערות |
| `סיכום חודשי` | חודש \| סה"כ הוצאות \| סה"כ הכנסות \| רווח \| אחוז חיסכון |
| `פיזור רווחים` | חודש \| רווח \| עו"ש \| קרן כספית \| השקעות \| אחר \| סה"כ מוקצה \| הערות |
| `מעקב עושר` | חודש \| תיק השקעות \| קרן כספית \| חסכונות \| סה"כ שווי נקי |
| `ESPP` | תאריך מכירה \| מחיר מכירה \| כמות מניות \| סכום ברוטו \| מס \| סכום נטו \| הערות |
| `לוג העלאות` | תאריך העלאה \| שם קובץ \| מספר עסקאות \| סכום כולל \| משתמש \| כפילויות שנדחו |
| `דשבורד` | (ריק — לשימוש עתידי) |

> **Tip:** Row 1 in every tab is the header row. Data starts from row 2.

---

## Part 3 — Python Normalizer

### Install dependencies

```bash
cd finance-dashboard/normalizer
pip install -r requirements.txt
```

### Run on a Cal Excel export

```bash
python normalizer.py "/path/to/cal_export.xlsx"
```

The script will:
1. Read all sheets in the file and merge them
2. Convert Excel date serials to DD/MM/YYYY
3. Map Cal categories to personal categories
4. Print a 10-row preview
5. Save `transactions_MM_YYYY.csv` in the same folder as the input file

### Upload the CSV

1. Open the dashboard at your GitHub Pages URL
2. Go to **העלאת נתונים** (Upload)
3. Drop the CSV file onto the upload zone
4. Review and edit categories if needed
5. The app checks for duplicates automatically
6. Select the month and confirm upload

---

## Part 4 — Deploy to GitHub Pages

### First time

```bash
cd finance-dashboard
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/finance-dashboard.git
git push -u origin main
```

Then in the GitHub repo:
1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**, branch: `main`, folder: `/ (root)`
3. Click **Save**
4. Your site will be live at `https://YOUR_USERNAME.github.io/finance-dashboard/`

### Subsequent updates

```bash
git add .
git commit -m "update"
git push
```

---

## Part 5 — Local Testing

Serve the files with any static server:

```bash
# Python
python -m http.server 8080

# Node.js (npx)
npx serve .
```

Then open `http://localhost:8080` in your browser.

> **Note:** Google OAuth requires an `https://` origin or `http://localhost`. Make sure `http://localhost:8080` is in the **Authorized JavaScript origins** list in Google Cloud Console.

---

## Usage Guide

### Monthly Dashboard (`dashboard.html`)
- Use the **◀ ▶** arrows to navigate between months
- **הכנסות panel:** Click the field in the Edit column, type the amount, press **שמור**
- **פיזור רווחים panel:** Enter how much went to each bucket after seeing your monthly profit, press **שמור**

### Upload (`upload.html`)
1. Run `normalizer.py` on the Cal Excel file first
2. Drop the resulting CSV into the upload zone
3. Fix any wrong categories in the preview table
4. Use the **פצל** (Split) button on any row to split it across categories
5. Click **בדוק כפילויות** — duplicates are highlighted in red and skipped
6. Enter the month and click **העלה**

### Read-Only Mode
Share the URL with `?readonly=true` appended:
```
https://YOUR_USERNAME.github.io/finance-dashboard/dashboard.html?readonly=true
```
All write controls are hidden in this mode.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "הגישה נדחתה" on login | Check `ALLOWED_EMAIL` in `config.js` matches your Google account |
| "שגיאת API: 403" | Sheet not shared with your OAuth app, or Drive API not enabled |
| "שגיאת API: 401" | Token expired — sign out and sign in again |
| OAuth popup doesn't appear | Make sure your domain is in Authorized JavaScript Origins in Google Cloud |
| Dates show as numbers in CSV | Run `normalizer.py` — it converts Excel date serials automatically |
| Categories wrong after upload | Edit them in the preview table before clicking Upload |
