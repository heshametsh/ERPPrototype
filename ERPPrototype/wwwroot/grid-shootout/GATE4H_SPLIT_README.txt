RevoGrid Community — Gate 4H — Split Focus Fix

Why Gate 4G was inconclusive:
- Its own snapshot showed "before Split = null".
- Clicking the external Split button could move focus out of RevoGrid before the
  click handler called getSelectedRange().
- ERP Preserve then saved/restored null, so that failure did not prove resize
  itself breaks selection.

Gate 4H:
1) Cache the verified Basket logical range when the user selects Basket.
2) Capture that range on pointerdown, before button focus can change.
3) Prevent the Split button from stealing focus during Native phase, isolating
   the resize/layout effect itself.
4) If Native still fails, ERP Preserve restores the cached logical range with
   the public setCellsFocus API after layout settles.

No prior passed ERP tests are repeated.
No Work Orders production files are modified.
