# Personal Finance Dashboard

Hebrew RTL personal finance tracker: Python normalizer + Google Sheets data store + GitHub Pages dashboard.

---

## Architecture

```
Visa Cal Excel → normalizer.py → CSV → upload.html → Google Sheet ← dashboard.html
```

No server, no database. All data lives in your Google Sheet. The website is a read/write layer only.

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

Both APIs are required. Sheets API reads and writes transaction data. Drive API manages who has access to your sheet.

### 3. Configure OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → Create
3. Fill in:
   - App name: `Finance Dashboard`
   - User support email: your Gmail
   - Developer contact: your Gmail
4. Click **Save and Continue**
5. On the **Scopes** page click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
6. Save and continue
7. Under **Test users** → Add Users → enter your own Gmail → Save
8. Back on the OAuth consent screen summary, click **Publish App** → confirm

> **Why publish?** By default Google keeps your app in "Testing" mode, which requires you to manually add every user to the Test Users list above. Publishing removes that restriction — from then on you manage users entirely from the app's Settings panel (Part 4). Publishing does not mean Google reviews or approves your app; it just lifts the testing restriction instantly.
>
> **Side effect:** New users will see a one-time Google warning saying the app is "unverified." They click **Advanced → Go to Finance Dashboard (unsafe)** to continue. This is expected for personal apps that haven't gone through Google's formal verification process — it does not mean anything is wrong.

### 4. Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `Finance Dashboard`
4. Under **Authorized JavaScript origins** add:
   - `https://YOUR_GITHUB_USERNAME.github.io`
   - `http://localhost:8080` (for local testing)
5. Click **Create** and copy the **Client ID** (ends in `.apps.googleusercontent.com`)

> Do **not** copy the Client Secret — it is not used and must never go into the code.

### 5. Create an API Key

1. Still in **APIs & Services → Credentials**, click **Create Credentials → API Key**
2. Copy the key (starts with `AIzaSy...`)
3. Optionally click **Edit API Key** → restrict it to **Google Picker API** and your GitHub Pages domain for safety

> The API Key is not sensitive — it is safe to store in the browser. It is used only to open the Google Drive file picker when selecting your spreadsheet during first-time setup.

---

## Part 2 — Google Sheet Setup

### Create the spreadsheet

1. Go to https://sheets.google.com → create a new blank spreadsheet
2. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_ID`**`/edit`

### Create these tabs (exact names — English and Hebrew)

| Tab name | Purpose |
|---|---|
| `transactions_2026` | Transactions for 2026 (app creates this automatically) |
| `transactions_2027` | Transactions for 2027 (app creates this automatically) |
| `Income` | Monthly income rows |
| `MonthlySummary` | Auto-calculated monthly totals |
| `Allocation` | Monthly profit allocation (checking, funds, investments) |
| `NetWorth` | Monthly net worth snapshots |
| `ESPP` | ESPP sale records |
| `AuditLog` | Upload history log |

> **Transaction tabs are created automatically** by the app the first time you upload or view a year. You only need to create the other tabs manually.

### Column headers for each tab

**`Income`**
```
חודש | משכורת ראשונה | משכורת שנייה | בונוסים | ESPP | הכנסות נוספות | סה"כ הכנסות | הערות
```

**`MonthlySummary`**
```
חודש | סה"כ הוצאות | סה"כ הכנסות | רווח | אחוז חיסכון
```

**`Allocation`**
```
חודש | רווח | עו"ש | קרן כספית | השקעות | אחר | סה"כ מוקצה | הערות
```

**`NetWorth`**
```
חודש | תיק השקעות | קרן כספית | חסכונות | סה"כ שווי נקי
```

**`ESPP`**
```
תאריך מכירה | מחיר מכירה | כמות מניות | סכום ברוטו | מס | סכום נטו | הערות
```

**`AuditLog`**
```
תאריך העלאה | שם קובץ | מספר עסקאות | סכום כולל | משתמש | כפילויות שנדחו
```

> Row 1 in every tab is the header row. Data starts from row 2.

---

## Part 3 — First-Time App Setup

No personal data is stored in the code. When you open the app for the first time it shows a **setup page** where you enter your credentials. They are saved in your browser's localStorage only — they never go into the source code or git history.

### Steps

1. Deploy the app to GitHub Pages (see Part 6)
2. Open `https://YOUR_USERNAME.github.io/finance-dashboard/`
3. You will be redirected to `setup.html` automatically
4. Enter:
   - **OAuth Client ID** — from Google Cloud Console
   - **API Key** — from Google Cloud Console (the `AIzaSy...` key)
   - **Your email address** — the Gmail you log in with
5. Click **שמור והתחל**
6. You will be redirected to the login page — click **התחבר עם Google** and sign in
7. After login, a **Google Drive Picker** appears — select your spreadsheet from the list
8. Done — you land on the dashboard

The Picker is how the app gets `drive.file` permission on your specific spreadsheet, which is what allows it to manage sharing permissions when you add or remove users.

> The setup page only appears on a browser that has never been configured. If you clear localStorage, you will see it again.

---

## Part 4 — Adding Users (Family Members / Accountant)

The app has a built-in user management system. You manage all users from the **Settings** panel (gear icon in the navbar).

### Adding a user

1. Open any dashboard page and click the gear icon (⚙) in the top bar
2. Switch to the **משתמשים** tab
3. Enter the person's Gmail address
4. Choose their permission level:
   - **עריכה** — can upload transactions, edit income, manage allocations
   - **צפייה** — read-only access
5. Click **הזמן**

Two things happen automatically:
- The person is added to the Google Sheet's sharing permissions via Drive API
- An **invite link** is copied to your clipboard

### Sending the invite link

Paste the link from your clipboard and send it to the person (WhatsApp, email, etc.).

When they open the link:
- The app detects the invite parameters in the URL
- Their browser is configured automatically (Sheet ID + Client ID + allowed emails)
- They are redirected straight to the login page

They still need to click **התחבר עם Google** and sign in with the Gmail you entered.

> **Prerequisite:** The person's Gmail must also be added as a Test User in Google Cloud Console (Part 1, Step 3) while your app is in Testing mode.

### Removing a user

In the **משתמשים** settings tab, click the **✕** next to any email. This:
- Removes them from the app's allow list on your browser
- Revokes their Google Sheet sharing permission via Drive API

They will no longer be able to log in or access the sheet.

---

## Part 5 — Python Normalizer

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
2. Use the `סכום חיוב` column only (never `סכום עסקה`)
3. Convert Excel date serials to DD/MM/YYYY
4. Map Cal categories (`ענף`) to personal categories
5. Print a 10-row preview
6. Save `transactions_MM_YYYY.csv` in the same folder as the input file

### Upload the CSV

1. Open the dashboard → **העלאת נתונים** (Upload page)
2. Drop the CSV file onto the upload zone
3. Review the transaction table — edit categories if needed
4. Use **פצל** on any row to split it across multiple categories
5. Click **בדוק כפילויות** — duplicates are highlighted and will be skipped
6. Select the month and click **העלה**

---

## Part 6 — Deploy to GitHub Pages

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

## Part 7 — Local Testing

Serve the files with any static server:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

Then open `http://localhost:8080` in your browser.

> Google OAuth requires an `https://` origin or `http://localhost`. Make sure `http://localhost:8080` is in the **Authorized JavaScript origins** list in Google Cloud Console.

---

## Usage Guide

### Monthly Dashboard (`dashboard.html`)
- Use the **◀ ▶** arrows to navigate between months
- **הכנסות panel:** Click any income field, type the amount, press **שמור**
- **פיזור רווחים panel:** Enter how much went to each bucket after seeing your monthly profit, press **שמור**

### Yearly Dashboard (`yearly.html`)
- Shows all 12 months side by side
- Includes recurring expense detection (הוראות קבע)
- Charts: income vs expenses, savings rate %, year-over-year comparison

### Upload (`upload.html`)
1. Run `normalizer.py` on the Cal Excel file first
2. Drop the resulting CSV into the upload zone
3. Fix any wrong categories in the preview table
4. Use the **פצל** (Split) button on any row to split it across categories
5. Duplicates are detected and highlighted automatically
6. Select the month and click **העלה**

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
| Redirected to setup.html immediately | Normal on first visit — fill in your Sheet ID, Client ID, and email |
| "הגישה נדחתה" on login | Your Gmail is not in the app's allowed email list. Open Settings → משתמשים on a device that is already configured and add yourself |
| "לא ניתן לאמת את פרטי המשתמש" | The `email` scope is missing. Go to Google Cloud → OAuth consent screen → Scopes and add `userinfo.email` |
| "שגיאת API: 403" on Drive operations | Google Drive API is not enabled, or the logged-in account doesn't have editor access to the sheet |
| "שגיאת API: 403" on Sheets operations | Sheet not shared, or Sheets API not enabled |
| "שגיאת API: 401" | Token expired — sign out and sign in again |
| OAuth popup doesn't appear | Your domain is not in Authorized JavaScript Origins in Google Cloud Console |
| Invite link shows setup page instead of login | The invite URL was truncated. Make sure you copied the full link including the `#invite=...` part |
| New user gets "הגישה נדחתה" after using invite link | They need to be added as a Test User in Google Cloud Console → OAuth consent screen → Test users |
| Dates show as numbers in the CSV | Run `normalizer.py` — it converts Excel date serials to DD/MM/YYYY automatically |
| Categories wrong after upload | Edit them in the preview table before clicking העלה |
| Drive permission error when adding a user | Make sure you're logged in as the sheet owner, and that the Drive API is enabled in Google Cloud |
