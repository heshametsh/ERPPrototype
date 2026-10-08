// All visible Arabic text lives here, so wording can change without touching screens.
export const ar = {
  app: { title: 'نظام إدارة أوامر العمل' },
  auth: {
    title: 'تسجيل الدخول',
    userName: 'اسم المستخدم',
    password: 'كلمة المرور',
    login: 'دخول',
    logout: 'خروج',
    invalid: 'اسم المستخدم أو كلمة المرور غلط',
    locked: 'الحساب اتقفل مؤقتًا بعد محاولات كتير. جرب بعد 15 دقيقة',
  },
  workOrders: {
    title: 'أوامر العمل',
    year: 'السنة',
    addRow: 'إضافة صف',
    save: 'حفظ',
    saved: 'تم الحفظ',
    unsaved: '{{count}} صف لم يُحفظ',
    nothingToSave: 'مفيش تغييرات',
    saveFailed: 'الحفظ ما تمش',
    confirmYearMove: 'فيه أوامر هتتنقل لسنة تانية بسبب تاريخ الإسناد. تأكيد النقل؟',
    columns: {
      number: 'رقم أمر العمل',
      workTypeCode: 'نوع العمل',
      assignmentDate: 'تاريخ الإسناد',
      value: 'قيمة أمر العمل',
      partialAmount: 'المستخلص الجزئي',
      remainingAmount: 'المتبقي',
      basket: 'السلة',
    },
  },
} as const
