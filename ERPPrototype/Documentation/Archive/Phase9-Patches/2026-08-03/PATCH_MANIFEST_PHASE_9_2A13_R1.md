# Phase 9.2A13-R1 — Basket Tile Correction

Base: Phase 9.2A13 candidate already installed.

## Fixes

- Removes duplicated Arabic labels caused by stacked A12 `::before` and A13 `::after` rules.
- Changes active Basket summaries from one compressed horizontal line to true two-line tiles.
- Wide desktop layout: 4 active Baskets per row; eight active stages render as 4 × 2.
- Basket name is displayed on the first line.
- Second line displays `<count> أمر` and `<amount> متبقي` once only.
- No changes to calculations, active-Basket visibility, search, saving, filtering, Undo/Redo, or database schema.

## Changed file

- `wwwroot/app.css`

## Install

Extract into the folder containing `ERPPrototype.csproj` and replace the file.
Do not run `Update-Database`.

## Verification

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected functional baseline remains:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- Overall PASS

Visual check:

- No `أوامر:`/`أمر` duplication.
- No `المتبقي:`/`متبقي` duplication.
- Active Basket tiles display in two lines and 4 × 2 on a wide screen with eight active stages.
