import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

const ROWS=100000;
let grid, data=[], columns=[];
let stage="loading", nativeCount=0, preserveCount=0;
const tests={}, actions=[], notes=[];
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const twoFrames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const now=()=>performance.now();

function generateRows(count){
  const baskets=["NeedLicense","UnderExecution","InspectionBasket","ModifyEstimate","Engineering","IssueReturn","InvoiceBasket","FinanceBasket"];
  return Array.from({length:count},(_,i)=>({
    id:i+1,
    workOrderNumber:String(233000000+i),
    workTypeCode:[401,402,801,802][i%4],
    assignmentDate:`2026-${String(i%12+1).padStart(2,"0")}-${String(i%28+1).padStart(2,"0")}`,
    workOrderValue:10000+((i*7919)%490000),
    partialAmount:i%4===0?3500:0,
    remainingAmount:6500+((i*7919)%490000),
    basket:baskets[i%baskets.length],
    notes:`ERP row ${i+1}`,
    erpCustom:""
  }));
}
function headerTemplate(h,column){
  return h("span",{class:"erp-header-inner"},[
    h("span",{class:"erp-header-title","data-erp-header-action":"select"},column.name||String(column.prop||"")),
    h("span",{class:"erp-sort-trigger","data-erp-header-action":"sort"},"↕")
  ]);
}
function baseColumns(){
  const common={sortable:true,columnTemplate:headerTemplate};
  return [
    {...common,name:"Work Order",prop:"workOrderNumber",size:150},
    {...common,name:"Work Type",prop:"workTypeCode",size:100},
    {...common,name:"Assignment Date",prop:"assignmentDate",size:135},
    {...common,name:"Work Order Value",prop:"workOrderValue",size:150},
    {...common,name:"Partial Amount",prop:"partialAmount",size:135},
    {...common,name:"Remaining Amount",prop:"remainingAmount",size:150,readonly:true},
    {...common,name:"Basket",prop:"basket",size:170},
    {...common,name:"Notes",prop:"notes",size:260},
    {...common,name:"ERP Custom",prop:"erpCustom",size:170}
  ];
}
function headerAction(e){
  for(const n of e?.composedPath?.()||[]){
    if(n?.dataset?.erpHeaderAction)return n.dataset.erpHeaderAction;
  }
  return null;
}
function colIndex(prop){return columns.findIndex(c=>String(c.prop)===String(prop));}
function rangeX(r){return r?.x??r?.start?.x??null}
function rangeY(r){return r?.y??r?.start?.y??null}
function rangeX1(r){return r?.x1??r?.end?.x??rangeX(r)}
function rangeY1(r){return r?.y1??r?.end?.y??rangeY(r)}
function normalizeRange(r){
  if(!r)return null;
  return {x:rangeX(r),y:rangeY(r),x1:rangeX1(r),y1:rangeY1(r)};
}
function isWholeBasket(r){
  const x=colIndex("basket");
  return x>=0&&rangeX(r)===x&&rangeX1(r)===x&&rangeY(r)===0&&rangeY1(r)===ROWS-1;
}
function setTest(name,status,detail){
  const el=document.querySelector(`[data-test="${name}"]`);
  el.classList.remove("running","pass","fail");
  if(status!=="pending")el.classList.add(status);
  el.querySelector(".badge").textContent=status==="pass"?"✓":status==="fail"?"✕":"…";
  el.querySelector("small").textContent=detail;
  tests[name]={status,detail,at:Date.now()};
}
function instruction(text,sub=""){$("instruction").textContent=text;$("sub").textContent=sub;}
function record(name,s,ok,detail=""){actions.push({at:Date.now(),name,ms:now()-s,ok,detail});}
function rangeText(r){return r?`x=${r.x}, y=${r.y} → x1=${r.x1}, y1=${r.y1}`:"null";}
function renderSamples(samples){
  $("samples").innerHTML=samples.map(s=>`${s.label}: <b>${s.ok?"✅":"❌"}</b> ${rangeText(s.range)}`).join("<br>");
}
async function selectBasket(){
  const x=colIndex("basket");
  await grid.setCellsFocus({x,y:0},{x,y:ROWS-1});
  grid.focus({preventScroll:true});
  await twoFrames();
}
async function sampleSelection(label, delay){
  if(delay)await wait(delay);
  const range=normalizeRange(await grid.getSelectedRange());
  return {label,delay,range,ok:isWholeBasket(range)};
}
async function nativeToggle(){
  const s=now();
  $("grid-card").classList.toggle("half");
  const samples=[];
  samples.push(await sampleSelection("فورًا",0));
  samples.push(await sampleSelection("150ms",150));
  samples.push(await sampleSelection("500ms",350));
  samples.push(await sampleSelection("1000ms",500));
  renderSamples(samples);
  nativeCount++;
  $("nativeCount").textContent=nativeCount;
  const finalOk=samples.at(-1).ok;
  record("native-split-toggle",s,finalOk,JSON.stringify(samples));
  notes.push({at:Date.now(),type:"native-samples",count:nativeCount,samples});

  if(!finalOk){
    setTest("native","fail",`Native فقد التحديد بعد Split عند المحاولة ${nativeCount} حتى بعد 1000ms.`);
    $("nativeToggle").hidden=true;
    stage="preserve-select";
    setTest("preserve","running","حدد Basket مرة أخرى لبدء اختبار حفظ التحديد.");
    instruction("Native ضيّع التحديد فعلًا. اضغط اسم Basket مرة أخرى.","بعدها هنجرب نفس Split لكن الـERP يحفظ ويرجع نفس Range.");
    return;
  }
  setTest("native","running",`${nativeCount}/4 — التحديد موجود بعد 1000ms.`);
  if(nativeCount>=4){
    $("nativeToggle").hidden=true;
    setTest("native","pass","Native حافظ على التحديد 4 مرات.");
    setTest("preserve","pass","غير مطلوب لأن Native نجح.");
    $("export").disabled=false;
    $("final").className="final pass";
    $("final").textContent="النتيجة: Native Split حافظ على Selection بدون تدخل.";
    stage="done";
  }else{
    instruction(`Native ${nativeCount}/4 نجح. اضغط Split / Full مرة أخرى.`);
  }
}
async function preserveToggle(){
  const s=now();
  const before=normalizeRange(await grid.getSelectedRange());
  $("grid-card").classList.toggle("half");

  // Let layout/ResizeObserver settle, then restore the ERP-owned logical range.
  await twoFrames();
  await wait(180);

  let restored=false;
  let mid=normalizeRange(await grid.getSelectedRange());
  if(before){
    await grid.setCellsFocus({x:before.x,y:before.y},{x:before.x1,y:before.y1});
    await twoFrames();
    restored=true;
  }

  const after150=await sampleSelection("بعد Restore",0);
  const after500=await sampleSelection("بعد 500ms",500);
  const after1000=await sampleSelection("بعد 1000ms",500);
  const samples=[
    {label:"قبل Split",range:before,ok:isWholeBasket(before)},
    {label:"قبل Restore",range:mid,ok:isWholeBasket(mid)},
    after150,after500,after1000
  ];
  renderSamples(samples);

  preserveCount++;
  $("preserveCount").textContent=preserveCount;
  const finalOk=after1000.ok;
  record("erp-preserve-split-toggle",s,finalOk,JSON.stringify({restored,samples}));
  notes.push({at:Date.now(),type:"preserve-samples",count:preserveCount,restored,samples});

  if(!finalOk){
    setTest("preserve","fail",`ERP Restore لم يثبت Selection عند المحاولة ${preserveCount}.`);
    $("preserveToggle").hidden=true;
    $("export").disabled=false;
    $("final").className="final fail";
    $("final").textContent="النتيجة: حتى حفظ/استرجاع Selection لم يثبت.";
    stage="done";
    return;
  }

  setTest("preserve","running",`${preserveCount}/4 — Selection رجع وثبت بعد Split.`);
  if(preserveCount>=4){
    $("preserveToggle").hidden=true;
    setTest("preserve","pass","ERP حفظ/استرجاع Selection نجح 4 مرات.");
    $("export").disabled=false;
    $("final").className="final warn";
    $("final").textContent="النتيجة: Native يفقد Selection، لكن ERP Preserve يعيده بثبات عبر API العام.";
    stage="done";
  }else{
    instruction(`Preserve ${preserveCount}/4 نجح. اضغط Split / Full مرة أخرى.`);
  }
}
function bindEvents(){
  grid.addEventListener("beforeheaderclick",e=>{
    if(headerAction(e?.detail?.originalEvent)!=="select")return;
    const prop=e?.detail?.column?.prop;
    if(String(prop)!=="basket")return;
    e.preventDefault?.();
    e.detail?.originalEvent?.preventDefault?.();
    queueMicrotask(async()=>{
      await selectBasket();
      const ok=isWholeBasket(await grid.getSelectedRange());
      notes.push({at:Date.now(),type:"header-select",stage,ok});
      if(!ok)return;
      if(stage==="native-select"){
        stage="native-toggle";
        $("nativeToggle").hidden=false;
        setTest("native","running","Basket محدد. اضغط Native Split / Full.");
        instruction("اضغط «تبديل Split / Full — Native».","الصفحة لن تصلح أي شيء؛ ستراقب فقط لمدة ثانية.");
      }else if(stage==="preserve-select"){
        stage="preserve-toggle";
        $("preserveToggle").hidden=false;
        instruction("اضغط «تبديل Split / Full — مع حفظ التحديد».","إنت تضغط؛ الـERP فقط يحفظ Range ويرجعه بعد تغير العرض.");
      }
    });
  });
  grid.addEventListener("beforesorting",e=>e.preventDefault?.());
}
async function init(){
  data=generateRows(ROWS);
  columns=baseColumns();
  await customElements.whenDefined("revo-grid");
  grid=document.createElement("revo-grid");
  grid.style.width="100%";
  grid.style.height="760px";
  grid.columns=columns;
  grid.source=data;
  grid.range=true;
  grid.resize=true;
  grid.rowHeaders=true;
  grid.rowSize=22;
  $("grid").replaceChildren(grid);
  bindEvents();
  await twoFrames();
  stage="native-select";
  setTest("native","running","اضغط اسم Basket في الهيدر لتحديد العمود كله.");
  setTest("preserve","pending","لن يبدأ إلا إذا Native فشل.");
  instruction("اضغط اسم Basket في الهيدر.","بعدها إنت هتضغط Split / Full بنفسك.");
  $("final").textContent="النتيجة: نختبر Native أولًا.";
}
function exportJson(){
  const payload={
    at:new Date().toISOString(),
    gate:"RevoGrid Community Gate 4G — Split Focused",
    version:"4.25.2",
    rows:ROWS,
    stage,tests,actions,notes,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`grid-gate4g-split-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
$("nativeToggle").addEventListener("click",()=>nativeToggle().catch(console.error));
$("preserveToggle").addEventListener("click",()=>preserveToggle().catch(console.error));
$("restart").addEventListener("click",()=>location.reload());
$("export").addEventListener("click",exportJson);
init().catch(err=>{
  console.error(err);
  $("final").className="final fail";
  $("final").textContent=`Initialization failed: ${err?.message||err}`;
});
