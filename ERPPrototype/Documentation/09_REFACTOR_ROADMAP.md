# 09 — Refactor Roadmap

**Foundation baseline:** E6C  
**Current stable checkpoint:** E6F  
**Goal:** تقليل تأثير تعديل ميزة على غيرها، بدون Rewrite كامل وبدون تغيير سلوك مقصود.

## Rules for Every Phase

1. Git checkpoint قبل التعديل.
2. ملف/مسؤولية واحدة قدر الإمكان.
3. لا Feature جديدة داخل Refactor.
4. لا Performance claim بدون قياس.
5. Build + Regression checklist.
6. Rollback فورًا عند كسر ميزة.
7. تحديث Current Implementation وKnown Issues وDecisions عند الحاجة.
8. شرح بسيط للمستخدم مع مثال بعد كل خطوة.

## Phase 0 — Freeze and Characterize

### Work

- تثبيت E6C في Git tag/commit.
- تسجيل hashes.
- تشغيل Regression Checklist كاملة.
- تسجيل أداء 3,000 صف.
- حفظ تقرير baseline.

### Why

لا نستطيع إثبات أن Refactor لم يغير السلوك بدون أرقام واختبارات قبل التعديل.

### Exit gate — COMPLETED 2026-07-27

- Clean/Rebuild and local run: PASS.
- Core regression checks: PASS.
- Console errors after E6F: zero.
- Provisional two-run performance baseline recorded.
- Strict three-run median deferred by explicit user decision.

## Phase 1 — Extract Diagnostics

### Work

- نقل performance observation/reporting خارج Grid core.
- الحفاظ على query flags الحالية.
- لا لمس keyboard أو lifecycle.

### Risk

منخفض نسبيًا.

### Tests

فتح الصفحة في Off/Baseline/Deep والتأكد أن الشيت نفسه لم يتغير.

## Phase 2 — Centralize Lifecycle Cleanup

### Work

- دالة واحدة لإنشاء state الأساسي.
- دالة واحدة لتنظيف listeners/timers/RAF.
- دالة واحدة لتدمير Tabulator.
- تستخدمها initialize وdestroy وتغيير السنة.

### Risk

متوسط/مرتفع لأن lifecycle يمس كل المميزات.

### Tests

الأسهم، السنة عدة مرات، resize، copy/paste، no duplicate events.

## Phase 3 — Extract Resize and Viewport

### Work

- نقل logical row anchor restore.
- مالك واحد لـresize listener/timer/RAF.
- interface صغير مع Lifecycle.

### Tests

صف 1,500/2,500، تصغير/تكبير متكرر، كل الأسهم، السنة.

## Phase 4 — Extract Navigation

### Work

- vertical frame gate.
- ArrowUp correction.
- horizontal navigation.
- active-cell tracking.

### Rule

المسار الرأسي مشترك، والاختلاف الاتجاهي يبقى فقط للدليل المثبت.

### Tests

long ArrowDown/ArrowUp، quick edit، Enter، editors، no stuck keys.

## Phase 5 — Extract Validation and Dirty Tracking

### Work

- validation index.
- affected-row validation.
- duplicate identity index.
- dirty/deleted state.
- validation navigator.

### Tests

كل أنواع الخطأ، duplicate، save/no-save، moved year.

## Phase 6 — Extract Clipboard and History

### Work

- matrix copy/paste.
- range clear.
- cell transactions.
- Undo/Redo ownership.

### Tests

paste كبير، undo once، redo، Arabic/date normalization، filter interaction.

## Phase 7 — Extract Structural Rows

### Work

- insert/delete/structural undo.
- بعدها فقط تحسين `setData` إلى incremental operations إذا أثبت القياس الحاجة.

### Risk

مرتفع لأن DisplayOrder والـTemporary Ids والحفظ مترابطة.

### Tests

insert/delete across selection، save، move year، undo/redo، 3,000 rows timing.

## Phase 8 — Host and Adapter Cleanup

### Work

- Blazor يستدعي `workOrdersGridHost` فقط.
- direct Tabulator calls تتركز في Adapter قدر الإمكان.
- الاسم القديم `tabulatorTest` يمكن إبقاؤه alias مؤقتًا لتقليل المخاطرة.

## Phase 9 — Return to Fatigue Root Cause

بعد استقرار الحدود:

- قياس أي Module يتدهور.
- اختبار Table instance recreation كمُميّز تشخيصي فقط.
- تحديد هل السبب renderer internals أو event/state accumulation.
- مقارنة upgrade/test of Tabulator in isolated branch if justified.
- قبول حل فقط إذا غير ملحوظ ويحافظ على البيانات والتحديد والتاريخ.

## Suggested Milestones

| Milestone | Meaning |
|---|---|
| M0 | **Complete:** E6F stable checkpoint, tests and provisional baseline recorded |
| M1 | Diagnostics separated |
| M2 | Lifecycle + Resize separated |
| M3 | Navigation separated |
| M4 | Validation/Clipboard/History separated |
| M5 | Structural operations separated and measured |
| M6 | Fatigue fix proven |
| M7 | 10k strategy decided |

## What We Do Not Optimize Yet

- Warehouse/invoice modules.
- Advanced dashboards.
- Microservices.
- Large design-system rewrite.
- Automatic renderer recovery before root-cause isolation.
- Renaming every legacy symbol in the same change.

## Simple Example

سنفك الملف الكبير مثل نقل محتويات مخزن: ننقل رفًا واحدًا، نعد القطع، ونتأكد أن العمل مستمر، ثم ننتقل للرف التالي. لا نفرغ المخزن كله في الشارع ثم نحاول ترتيب كل شيء مرة واحدة.
