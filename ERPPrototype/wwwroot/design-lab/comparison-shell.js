(() => {
  "use strict";
  const versions={
    v34:{frame:document.getElementById("frame-v34"),title:"التصميم المعتمد الحالي",subtitle:"v34 — ثابت"},
    v45:{frame:document.getElementById("frame-v45"),title:"تجربة تنظيف محافظ",subtitle:"v45 — v34 كأساس + Responsive صغير مستقل"}
  };
  const buttons=[...document.querySelectorAll("[data-version]")];
  const title=document.getElementById("comparisonTitle"),subtitle=document.getElementById("comparisonSubtitle");
  const bar=document.getElementById("comparisonBar"),close=document.getElementById("comparisonClose"),reopen=document.getElementById("comparisonReopen");
  function activate(value){const safe=versions[value]?value:"v34";for(const [key,item] of Object.entries(versions)){item.frame.classList.toggle("is-active",key===safe);item.frame.setAttribute("aria-hidden",key===safe?"false":"true")}for(const button of buttons){const active=button.dataset.version===safe;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",active?"true":"false")}title.textContent=versions[safe].title;subtitle.textContent=versions[safe].subtitle}
  buttons.forEach(button=>button.addEventListener("click",()=>activate(button.dataset.version)));
  close.addEventListener("click",()=>{bar.classList.add("is-hidden");reopen.classList.remove("is-hidden")});
  reopen.addEventListener("click",()=>{bar.classList.remove("is-hidden");reopen.classList.add("is-hidden")});
  activate("v34");
})();