# Source File Review

المقصود بكلمة **مراجع** هنا: اتساق استاتيكي وربط منطقي، وليس إثبات تشغيل قبل الـBuild والاختبارات.

## ملفات المشروع والإعدادات

| الملف | الحالة | الملاحظة |
|---|---|---|
| `ERPPrototype.csproj` | مراجع | مشروع Web واحد، net10.0، EF/Identity فقط، لا Syncfusion. Restore/Build مطلوب. |
| `Program.cs` | مراجع | DI، Identity، SQL، Seeder، HTTPS/HSTS/Antiforgery. لا auto-migration. |
| `appsettings.json` | مراجع | لا Connection String أو secrets؛ `AllowedHosts=*` يجب تخصيصه للإنتاج. |
| `appsettings.Development.json` | مراجع | LocalDB للتطوير فقط. |
| `libman.json` | مراجع | يعيد Bootstrap CSS وTabulator 6.5.0. |
| `.gitignore` | مضاف | يمنع bin/obj/.vs/*.user/publish metadata/secrets. |

## Data وDomain

| الملف | الحالة | الملاحظة |
|---|---|---|
| `Data/AppRoles.cs` | مراجع مع فجوة | الأدوار موجودة؛ `ProjectManager` غير مكتمل وتوجد فجوة تسمية مع Project Director الموثق. |
| `Data/ApplicationDbContext.cs` | مراجع | العلاقات Restrict، checks، indexes، RowVersion متسقة مع Snapshot. |
| `Data/ApplicationSeeder.cs` | مراجع | Admin واحد، لا hard-coded credentials، لا ترقية تلقائية لمستخدم عادي. بنية الأقسام ثابتة. |
| `Data/ApplicationUser.cs` | مراجع | FullName/IsActive/MustChangePassword/Branch/Department. |
| `Data/StandardDepartmentTypes.cs` | مراجع | الأقسام الأربعة الثابتة. |
| `Data/UserManagementService.cs` | مراجع لكنه غير مكتمل | إنشاء الحسابات الثابتة فقط؛ لا rename/reset/activate/deactivate بعد. |
| `Data/WorkOrderBuskets.cs` | مراجع مع دين تقني | القيم المعتمدة؛ اسم `Busket` الإملائي قديم ولا يُصلح دون Migration. |
| `Data/WorkOrderService.cs` | مراجع، اختبار أداء مطلوب | server scope، DTO خفيف، delta save، validation، duplicate، RowVersion، year move. |
| `Data/Entities/Branch.cs` | مراجع | كيان بسيط. |
| `Data/Entities/Department.cs` | مراجع | Branch + DepartmentType + WorkOrders. |
| `Data/Entities/DepartmentType.cs` | مراجع | نوع القسم الثابت. |
| `Data/Entities/WorkOrder.cs` | مراجع | الكيان الحالي متوافق مع DbContext/Snapshot. |

## Routing/Layout/Home

| الملف | الحالة | الملاحظة |
|---|---|---|
| `Components/App.razor` | مراجع | يحمل Bootstrap وTabulator مرة واحدة؛ `lang=ar`. |
| `Components/Routes.razor` | مراجع | المستخدم المسجل ذو الدور الخطأ يذهب AccessDenied. |
| `Components/_Imports.razor` | مراجع | لا Syncfusion imports. |
| `Components/Layout/MainLayout.razor` | مراجع | Layout أساسي. |
| `Components/Layout/MainLayout.razor.css` | مراجع | scoped CSS مرتبط. |
| `Components/Layout/NavMenu.razor` | مراجع | روابط حسب الدور؛ لا روابط لصفحات محذوفة. |
| `Components/Layout/NavMenu.razor.css` | مراجع | scoped CSS مرتبط. |
| `Components/Layout/ReconnectModal.razor` | مراجع، اختبار شبكة مطلوب | واجهة إعادة الاتصال. |
| `Components/Layout/ReconnectModal.razor.css` | مراجع | scoped CSS مرتبط. |
| `Components/Layout/ReconnectModal.razor.js` | Syntax PASS | يلزم اختبار disconnect/reconnect فعلي. |
| `Components/Pages/Home.razor` | مراجع | روابط Employee/Admin فقط. |
| `Components/Pages/Home.razor.css` | مراجع | scoped CSS مرتبط. |
| `Components/Pages/Error.razor` | مراجع | صفحة خطأ عامة. |
| `Components/Pages/NotFound.razor` | مراجع | 404 route. |

## Authentication/Account

| الملف | الحالة | الملاحظة |
|---|---|---|
| `Components/Account/IdentityComponentsEndpointRouteBuilderExtensions.cs` | مراجع | Logout فقط، مصرح، LocalRedirect. |
| `Components/Account/IdentityRedirectManager.cs` | مراجع | من قالب Identity، مسارات محلية. |
| `Components/Account/IdentityRevalidatingAuthenticationStateProvider.cs` | مراجع | Security stamp + IsActive كل 30 دقيقة. |
| `Components/Account/Pages/Login.razor` | مراجع، اختبار مطلوب | username login، active check، lockout، MustChangePassword. |
| `Components/Account/Pages/Login.razor.css` | مراجع | scoped CSS مرتبط. |
| `Components/Account/Pages/AccessDenied.razor` | مراجع | صفحة رفض الصلاحية. |
| `Components/Account/Pages/InvalidUser.razor` | مراجع | صفحة حساب غير صالح. |
| `Components/Account/Pages/Lockout.razor` | مراجع | صفحة قفل مؤقت. |
| `Components/Account/Pages/Manage/ChangePassword.razor` | مراجع، اختبار مطلوب | يزيل MustChangePassword ويحدث جلسة الدخول. |
| `Components/Account/Pages/_Imports.razor` | مراجع | ExcludeFromInteractiveRouting للصفحات الحسابية. |
| `Components/Account/Pages/Manage/_Imports.razor` | مراجع | Authorize + ManageLayout. |
| `Components/Account/Shared/ManageLayout.razor` | مراجع | إعدادات حساب مبسطة. |
| `Components/Account/Shared/ManageNavMenu.razor` | مراجع | تغيير كلمة المرور فقط. |
| `Components/Account/Shared/RedirectToAccessDenied.razor` | مضاف ومراجع | يمنع redirect loop للمستخدم المسجل. |
| `Components/Account/Shared/RedirectToLogin.razor` | مراجع | يحفظ return URL. |
| `Components/Account/Shared/StatusMessage.razor` | مراجع | عرض الرسائل. |

## Admin/User Management

| الملف | الحالة | الملاحظة |
|---|---|---|
| `Components/Pages/AdminPanel.razor` | يعمل جزئيًا | branch add/rename + user create/list. يستخدم DbContext مباشرة؛ service layer/audit مطلوب قبل الإنتاج. |
| `Components/Admin/BranchUserForm.razor` | مراجع، جزئي | إنشاء BranchManager/Employee فقط، actor ID يمر إلى service. |
| `Components/Admin/BranchUsersList.razor` | مراجع، جزئي | query واحدة بدل N+1؛ لا أزرار إدارة الحساب بعد. |

## Work Orders / Grid

| الملف | الحالة | الملاحظة |
|---|---|---|
| `Components/Pages/WorkOrders.razor` | مراجع استاتيكيًا، أداء غير ناجح بعد | الصفحة الوحيدة `/work-orders`؛ delta save وconcurrency/year mapping. |
| `Components/Pages/WorkOrders.razor.css` | مراجع | لا CSS يتيم؛ الارتفاع الرقمي الحساس محفوظ. |
| `wwwroot/js/tabulatorTest.js` | Syntax PASS، عالي المخاطر | الملف الأساسي كبير؛ full-sheet work باقٍ في العمليات الهيكلية؛ اختبار 3k/10k مطلوب. |
| `wwwroot/js/tabulatorFilters.js` | Syntax PASS | فلاتر وقيم مخزنة محليًا؛ اختبار browser مطلوب. |
| `wwwroot/app.css` | مراجع | CSS عام؛ لا Syncfusion. |

## Vendor assets

| الملف | الحالة | الملاحظة |
|---|---|---|
| `wwwroot/lib/bootstrap/dist/css/bootstrap.min.css` | احتفاظ | الملف الوحيد المستخدم من Bootstrap، قابل للاستعادة بـLibMan. |
| `wwwroot/lib/tabulator/dist/css/tabulator.min.css` | احتفاظ | vendor minified، ليس مصدرًا مملوكًا للمشروع. |
| `wwwroot/lib/tabulator/dist/js/tabulator.min.js` | احتفاظ | vendor minified، قابل للاستعادة بـLibMan. |
| `wwwroot/images/favicon.svg` | احتفاظ | مستخدم في App. |
| `wwwroot/images/login-background.png` | احتفاظ | مستخدم في Login/Home styling. |

## Migrations

كل ملفات `Migrations/*.cs` وعددها 29 **محتفظ بها** لأنها تاريخ schema مولد من EF Core. تمت مقارنة العلامات الحرجة في `ApplicationDbContextModelSnapshot.cs` مع النموذج الحالي. لا يجوز حذف migrations القديمة التي سبق تطبيقها، حتى عندما تضيف ميزة ثم migration لاحقة تزيلها.

## ملفات المراجعة

| الملف | الغرض |
|---|---|
| `PROJECT_RELEASE_REVIEW_2026-07-25.md` | تقرير القرار والمخاطر والإطلاق. |
| `Documentation/RELEASE_TEST_CHECKLIST.md` | اختبارات Build/Runtime/Security/Performance. |
| `Documentation/REMOVED_FILES_INVENTORY.txt` | كل ملف حُذف من النسخة المرفوعة. |
| `CODE_REVIEW_FILE_MANIFEST.json` | SHA-256 وحجم ملفات النسخة. |
| `STATIC_REVIEW_RESULTS.txt` | نتائج الفحص الآلي الاستاتيكي. |
