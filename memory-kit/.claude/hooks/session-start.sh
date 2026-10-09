#!/usr/bin/env bash
# بيشتغل أول كل شات: يسجّل نقطة البداية (عشان نعرف إيه اتغيّر في الشات)،
# وينبّه لو القصة أو القواعد ما اتراجعتش من فترة طويلة.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

state=".claude/.memory-state"
mkdir -p "$state"
git rev-parse HEAD > "$state/session-start-head" 2>/dev/null || : > "$state/session-start-head"
rm -f "$state/checked"

limit=20
for f in memory/STORY.md memory/RULES.md; do
  [ -f "$f" ] || continue
  last=$(git log -1 --format=%H -- "$f" 2>/dev/null)
  [ -n "$last" ] || continue
  n=$(git rev-list --count "$last"..HEAD 2>/dev/null || echo 0)
  if [ "$n" -gt "$limit" ]; then
    echo "تنبيه ذاكرة: $f ما اتعدّلش من $n commit. قبل أي شغل كبير اتأكد إنه لسه صح، ولو لقيته قديم اقترح على المستخدم تحديثه."
  fi
done
exit 0
