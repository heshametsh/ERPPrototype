#!/usr/bin/env bash
# "جرس الحزام": لما Claude يخلّص رده، لو ملفات المشروع اتغيرت في الشات ده
# وملفات الذاكرة ما اتلمستش، يوقفه مرة واحدة ويسأله: فيه حاجة تتكتب؟
# بيسأل تاني بس لو حصل commit جديد بعد آخر سؤال (يعني مهمة جديدة خلصت).
input=$(cat)
# لو Claude لسه راجع من تنبيه سابق، ما ننبّهوش تاني (عشان ما يلفّش في دايرة)
echo "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

state=".claude/.memory-state"
mkdir -p "$state"
start=$(cat "$state/session-start-head" 2>/dev/null)
head=$(git rev-parse HEAD 2>/dev/null)

# اتسألنا قبل كده ومفيش commit جديد؟ يبقى ما نزعجش
[ -f "$state/checked" ] && [ "$(cat "$state/checked")" = "$head" ] && exit 0

# الملفات اللي اتغيرت في الشات ده: commits جديدة + تعديلات لسه ما اتحفظتش
changed=$(
  { [ -n "$start" ] && git diff --name-only "$start" HEAD 2>/dev/null
    git status --porcelain 2>/dev/null | sed 's/^...//; s/.* -> //'
  } | sort -u
)

work=$(printf '%s\n' "$changed" | grep -v -e '^memory/' -e '^CLAUDE\.md$' -e '^$')
[ -z "$work" ] && exit 0
printf '%s\n' "$changed" | grep -q -e '^memory/' -e '^CLAUDE\.md$' && exit 0

echo "$head" > "$state/checked"
cat <<'EOF'
{"decision":"block","reason":"مراجعة الذاكرة: ملفات المشروع اتغيرت في الشات ده وملفات memory/ ما اتلمستش. اسأل نفسك سؤال واحد: اتعلمنا حاجة ما تتعرفش من الكود ولا git وهتفرق تاني؟ لو آه: اقترح التعديل على المستخدم بطريقة /update-memory وما تحفظش من غير موافقته. لو لأ: قول في سطر واحد إن مفيش جديد للذاكرة."}
EOF
exit 0
