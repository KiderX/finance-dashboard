#!/usr/bin/env python3
"""
Visa Cal Excel → normalised CSV converter.

Usage:
    python normalizer.py <path/to/file.xlsx>
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta

import pandas as pd

EXCEL_EPOCH = datetime(1899, 12, 30)

CATEGORY_MAP = {
    'אופנה':               'בגדים ואופנה',
    'אנרגיה':              'רכב',
    'ביטוח ופיננסים':      'ביטוח',
    'חינוך':               'חינוך',
    'מוסדות':              'הוצאות שטופות',
    'מזון ומשקאות':        'מזון',
    'מזון מהיר':           'מסעדות',
    'מסעדות':              'מסעדות',
    'משחקי מזל':           'פנאי ובילוי',
    'פנאי בילוי':          'פנאי ובילוי',
    'ריהוט ובית':          'בית',
    'רכב ותחבורה':         'רכב',
    'רפואה ובריאות':       'בריאות',
    'שונות':               'שונות',
    'תיירות':              'תיירות',
    'תקשורת ומחשבים':      'תקשורת',
}

OUTPUT_COLS = ['תאריך', 'שם בית עסק', 'סכום חיוב', 'קטגוריה', 'סוג עסקה', 'הערות', 'חודש', 'מקור כרטיס']


def excel_serial_to_date(serial):
    try:
        return EXCEL_EPOCH + timedelta(days=int(float(serial)))
    except (ValueError, TypeError):
        return None


def parse_date(value):
    if pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value
    try:
        f = float(value)
        if f > 40000:
            return excel_serial_to_date(f)
    except (ValueError, TypeError):
        pass
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d.%m.%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(str(value).strip(), fmt)
        except ValueError:
            pass
    return None


def find_col(df, *candidates):
    for col in df.columns:
        for cand in candidates:
            if cand in str(col).strip():
                return col
    return None


def normalize_sheet(df, sheet_name):
    date_col     = find_col(df, 'תאריך עסקה', 'תאריך')
    merchant_col = find_col(df, 'שם בית עסק', 'בית עסק')
    # Prefer סכום חיוב over סכום עסקה
    amount_col   = find_col(df, 'סכום חיוב') or find_col(df, 'סכום עסקה', 'סכום')
    type_col     = find_col(df, 'סוג עסקה', 'סוג')
    branch_col   = find_col(df, 'ענף')
    notes_col    = find_col(df, 'הערות')

    if not all([date_col, merchant_col, amount_col]):
        print(f'  ⚠ גיליון "{sheet_name}": עמודות חובה חסרות — מדלג.')
        return []

    rows = []
    for _, row in df.iterrows():
        raw_amt = row.get(amount_col)
        if pd.isna(raw_amt):
            continue
        try:
            amount = float(raw_amt)
        except (ValueError, TypeError):
            continue
        if amount == 0:
            continue

        date_obj = parse_date(row.get(date_col))
        if date_obj is None:
            continue

        merchant = str(row.get(merchant_col, '')).strip()
        if not merchant or merchant.lower() == 'nan':
            continue

        branch   = str(row.get(branch_col, '') if branch_col else '').strip()
        branch   = '' if branch.lower() == 'nan' else branch
        category = CATEGORY_MAP.get(branch, 'שונות')

        txn_type = str(row.get(type_col, '') if type_col else '').strip()
        txn_type = '' if txn_type.lower() == 'nan' else txn_type

        notes = str(row.get(notes_col, '') if notes_col else '').strip()
        notes = '' if notes.lower() == 'nan' else notes

        rows.append({
            'תאריך':       date_obj.strftime('%d/%m/%Y'),
            'שם בית עסק':  merchant,
            'סכום חיוב':   amount,
            'קטגוריה':     category,
            'סוג עסקה':    txn_type,
            'הערות':       notes,
            'חודש':        date_obj.strftime('%m/%Y'),
            'מקור כרטיס':  sheet_name,
        })
    return rows


def find_header_row(df_raw):
    """Return the row index that contains the column headers."""
    for i, row in df_raw.iterrows():
        row_str = ' '.join(str(v) for v in row if not pd.isna(v))
        if 'תאריך' in row_str or 'שם בית עסק' in row_str:
            return i
    return None


def main():
    parser = argparse.ArgumentParser(description='Normaliser for Visa Cal Excel exports')
    parser.add_argument('file', help='Path to the Cal Excel file (.xlsx or .xls)')
    args = parser.parse_args()

    input_path = Path(args.file)
    if not input_path.exists():
        print(f'שגיאה: הקובץ לא נמצא: {input_path}')
        sys.exit(1)

    if input_path.suffix.lower() not in ('.xlsx', '.xls'):
        print('שגיאה: הקובץ חייב להיות Excel (.xlsx / .xls)')
        sys.exit(1)

    print(f'\nמעבד: {input_path.name}')
    print('=' * 55)

    try:
        xl = pd.ExcelFile(input_path, engine='openpyxl')
    except Exception as exc:
        print(f'שגיאה בפתיחת הקובץ: {exc}')
        sys.exit(1)

    all_rows = []
    for sheet_name in xl.sheet_names:
        print(f'\nגיליון: {sheet_name}')
        try:
            df_raw = xl.parse(sheet_name, header=None)
            header_idx = find_header_row(df_raw)
            if header_idx is None:
                print('  ⚠ לא נמצאה שורת כותרת — מדלג.')
                continue
            df = xl.parse(sheet_name, header=header_idx)
            df.columns = [str(c).strip() for c in df.columns]
            rows = normalize_sheet(df, sheet_name)
            print(f'  ✓ {len(rows)} עסקאות')
            all_rows.extend(rows)
        except Exception as exc:
            print(f'  שגיאה: {exc}')

    if not all_rows:
        print('\n⚠ לא נמצאו עסקאות. בדוק את מבנה הקובץ.')
        sys.exit(1)

    result = pd.DataFrame(all_rows, columns=OUTPUT_COLS)
    result = result.sort_values(
        'תאריך',
        key=lambda s: pd.to_datetime(s, format='%d/%m/%Y', errors='coerce')
    )

    # ── Preview ──────────────────────────────────────────
    print('\n' + '=' * 55)
    print('תצוגה מקדימה — 10 שורות ראשונות:')
    print('=' * 55)
    preview = result.head(10)
    for col in ['תאריך', 'שם בית עסק', 'סכום חיוב', 'קטגוריה']:
        max_w = max(len(col), preview[col].astype(str).str.len().max()) + 2
        print(f'{col:<{max_w}}', end='')
    print()
    print('-' * 60)
    for _, row in preview.iterrows():
        for col in ['תאריך', 'שם בית עסק', 'סכום חיוב', 'קטגוריה']:
            max_w = max(len(col), preview[col].astype(str).str.len().max()) + 2
            print(f'{str(row[col]):<{max_w}}', end='')
        print()

    # ── Save ─────────────────────────────────────────────
    most_common_month = result['חודש'].mode()[0].replace('/', '_')
    output_path = input_path.parent / f'transactions_{most_common_month}.csv'
    result.to_csv(output_path, index=False, encoding='utf-8-sig')

    total_amount = result['סכום חיוב'].sum()
    print('\n' + '=' * 55)
    print(f'סה"כ עסקאות : {len(result)}')
    print(f'סה"כ סכום   : ₪{total_amount:,.2f}')
    print(f'קובץ נשמר   : {output_path}')
    print('=' * 55 + '\n')


if __name__ == '__main__':
    main()
