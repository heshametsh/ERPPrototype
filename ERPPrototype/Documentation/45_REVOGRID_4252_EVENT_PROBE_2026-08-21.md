# RevoGrid 4.25.2 Event Probe

Route:
`/work-orders-revogrid-event-probe`

Purpose:
Verify the actual runtime event flow of RevoGrid Community 4.25.2 before
building ERP dirty/save/history logic.

This page is additive and does NOT modify Gate 5A or /work-orders.

Manual test:
1. Click "ابدأ تسجيل جديد".
2. Edit one cell manually and commit the edit.
3. Cell Edit should become PASS.
4. Paste a small 2x2 region manually.
5. Paste 2x2 should become PASS.
6. Click "تنزيل التقرير" and upload the generated JSON to ChatGPT.

No Save operation exists in this probe. All edits are browser-local and
disappear on refresh.

Source reviewed before creating this probe:
- tag requested: v4.25.2
- checkout HEAD reported by user: d06ea5b
- package.json inside that tag: 4.25.1
- runtime under test: CDN package @revolist/revogrid@4.25.2
- src/components/revoGrid/revo-grid.tsx:1057-1090
- src/components/overlay/revogr-overlay-selection.tsx:854-879
- src/components/overlay/selection.utils.ts:31-42
- src/services/data.provider.ts:124-147
- src/components/clipboard/revogr-clipboard.tsx:98-146

The probe intentionally observes beforeedit, afteredit, beforepaste,
beforepasteapply, clipboardrangepaste, beforerangeedit and afterpasteapply.
It does not copy any RevoGrid source code into ERP.
