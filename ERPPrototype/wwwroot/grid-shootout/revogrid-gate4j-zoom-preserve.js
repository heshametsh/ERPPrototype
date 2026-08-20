import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

const ROWS=100000;
let grid, data=[], columns=[];
let stage="loading";
let baseDpr=null, cachedSelection=null, zoomStep=0, resizeTimer=null, processingZoom=false;
const tests={}, actions=[], notes=[];
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const twoFrames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const now=()=>performance.now();

const zoomTargets=[
  {ratio:.90,label:"90%"},
  {ratio:.80,label:"80%"},
  {ratio:.67,label:"67%"},
  {ratio:1.00,label:"100%"}
];

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
function headerAction(e){
  for(const n of e?.composedPath?.()||[]){
    if(n?.dataset?.erpHeaderAction)return n.dataset.erpHeaderAction;
  }
  return null;
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
function logicalColIndex(prop){return columns.findIndex(c=>String(c.prop)===String(prop));}
function visualColIndex(prop){
  const x=logicalColIndex(prop);
  return grid?.rtl ? columns.length-1-x : x;
}
function rangeX(r){return r?.x??r?.start?.x??null}
function rangeY(r){return r?.y??r?.start?.y??null}
function rangeX1(r){return r?.x1??r?.end?.x??rangeX(r)}
function rangeY1(r){return r?.y1??r?.end?.y??rangeY(r)}
function normalizeRange(r){
  if(!r)return null;
  return {x:rangeX(r),y:rangeY(r),x1:rangeX1(r),y1:rangeY1(r)};
}
function isWholeBasket(r){
  const x=visualColIndex("basket");
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
function updateDpr(){
  $("currentDpr").textContent=devicePixelRatio.toFixed(3);
  $("baseDpr").textContent=baseDpr==null?"—":baseDpr.toFixed(3);
}
function rangeText(r){return r?`x=${r.x}, y=${r.y} → x1=${r.x1}, y1=${r.y1}`:"null";}
function renderSnapshot(target,ratio,before,after0,after250,after750){
  $("snapshot").innerHTML=
    `Target: <b>${target}</b><br>`+
    `Ratio: <b>${ratio.toFixed(3)}</b><br>`+
    `قبل Restore: ${isWholeBasket(before)?"✅":"❌"} ${rangeText(before)}<br>`+
    `بعد Restore فورًا: ${isWholeBasket(after0)?"✅":"❌"} ${rangeText(after0)}<br>`+
    `250ms: ${isWholeBasket(after250)?"✅":"❌"} ${rangeText(after250)}<br>`+
    `750ms: ${isWholeBasket(after750)?"✅":"❌"} ${rangeText(after750)}`;
}
async function selectBasket(){
  const x=visualColIndex("basket");
  await grid.setCellsFocus({x,y:0},{x,y:ROWS-1});
  grid.focus({preventScroll:true});
  await twoFrames();
  const r=normalizeRange(await grid.getSelectedRange());
  if(isWholeBasket(r)){
    cachedSelection={...r};
    notes.push({at:Date.now(),type:"selection-cached",range:cachedSelection});
    return true;
  }
  return false;
}
function bindGridEvents(){
  grid.addEventListener("beforeheaderclick",e=>{
    if(headerAction(e?.detail?.originalEvent)!=="select")return;
    const prop=e?.detail?.column?.prop;
    if(String(prop)!=="basket")return;
    e.preventDefault?.();
    e.detail?.originalEvent?.preventDefault?.();
    queueMicrotask(async()=>{
      const ok=await selectBasket();
      notes.push({at:Date.now(),type:"header-select",ok,range:normalizeRange(await grid.getSelectedRange())});
      if(stage==="select"&&ok){
        setTest("selection","pass","Basket اتحفظ كـRange كامل على 100,000 صف.");
        setTest("zoom","running","غيّر Zoom إلى 90% بنفسك.");
        stage="zoom";
        instruction("غيّر Zoom المتصفح إلى 90% بنفسك.","بعدها الصفحة سترجع Basket تلقائيًا بعد استقرار العرض.");
      }
    });
  });
  grid.addEventListener("beforesorting",e=>e.preventDefault?.());
}
async function capture100(){
  baseDpr=devicePixelRatio;
  updateDpr();
  $("capture100").hidden=true;
  setTest("start","pass",`تم تثبيت DPR البداية = ${baseDpr.toFixed(3)}.`);
  setTest("selection","running","اضغط اسم Basket في الهيدر.");
  stage="select";
  instruction("اضغط اسم Basket في الهيدر مرة واحدة.","بعدها لن تعيد تحديده أثناء أي Zoom.");
  notes.push({at:Date.now(),type:"base-captured",dpr:baseDpr,width:innerWidth,height:innerHeight});
}
async function processZoomTarget(){
  if(stage!=="zoom"||processingZoom||baseDpr==null||!cachedSelection||zoomStep>=zoomTargets.length)return;

  const target=zoomTargets[zoomStep];
  const ratio=devicePixelRatio/baseDpr;
  updateDpr();

  // Wait until the requested level is actually reached.
  if(Math.abs(ratio-target.ratio)>.065)return;

  processingZoom=true;
  const s=now();

  // Let browser zoom/layout/ResizeObserver settle before ERP re-applies the logical range.
  await wait(260);

  const before=normalizeRange(await grid.getSelectedRange());

  await grid.setCellsFocus(
    {x:cachedSelection.x,y:cachedSelection.y},
    {x:cachedSelection.x1,y:cachedSelection.y1}
  );
  await twoFrames();

  const after0=normalizeRange(await grid.getSelectedRange());
  await wait(250);
  const after250=normalizeRange(await grid.getSelectedRange());
  await wait(500);
  const after750=normalizeRange(await grid.getSelectedRange());

  const ok=isWholeBasket(after0)&&isWholeBasket(after250)&&isWholeBasket(after750);

  renderSnapshot(target.label,ratio,before,after0,after250,after750);

  notes.push({
    at:Date.now(),
    type:"zoom-preserve",
    target:target.label,
    ratio,
    dpr:devicePixelRatio,
    before,
    after0,
    after250,
    after750,
    ok
  });
  record(`zoom-preserve-${target.label}`,s,ok,`before=${rangeText(before)}; after750=${rangeText(after750)}`);

  if(!ok){
    setTest("zoom","fail",`ERP Preserve لم يثبت Basket عند ${target.label}.`);
    stage="done";
    $("export").disabled=false;
    $("final").className="final fail";
    $("final").textContent="النتيجة: Zoom Preserve فشل — صدّر JSON.";
    instruction("الاختبار وقف ❌. صدّر JSON وابعتلي الملف.");
    processingZoom=false;
    return;
  }

  // Keep the restored logical range as the new verified checkpoint.
  cachedSelection={...after750};
  zoomStep++;

  if(zoomStep===zoomTargets.length){
    setTest("zoom","pass","90→80→67→100: ERP Preserve رجع Basket وثبته في كل مستوى.");
    stage="done";
    $("export").disabled=false;
    $("final").className="final pass";
    $("final").textContent="النتيجة: Zoom Native يفقد التحديد، لكن ERP Preserve يعيده بثبات.";
    instruction("الاختبار خلص ✅. صدّر JSON وابعتلي الملف.");
  }else{
    instruction(`نجح ${target.label} ✅. دلوقتي غيّر Zoom إلى ${zoomTargets[zoomStep].label}.`,
      "لا تعيد تحديد Basket؛ الـERP يحتفظ بنفس Range.");
  }

  processingZoom=false;
}
function exportJson(){
  const payload={
    at:new Date().toISOString(),
    gate:"RevoGrid Community Gate 4J — Zoom Preserve Focused",
    version:"4.25.2",
    rows:ROWS,
    rtl:true,
    stage,
    baseDpr,
    zoomStep,
    cachedSelection,
    tests,
    actions,
    notes,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    userAgent:navigator.userAgent
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`grid-gate4j-zoom-preserve-${Date.now()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
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
  grid.rtl=true;
  $("grid").replaceChildren(grid);
  bindGridEvents();
  await twoFrames();

  setTest("start","running","اضبط Zoom المتصفح 100% ثم اضغط «ثبت بداية 100%».");
  setTest("selection","pending","يبدأ بعد تثبيت 100%.");
  setTest("zoom","pending","يبدأ بعد حفظ Basket.");
  stage="capture";
  $("capture100").hidden=false;
  instruction("اضبط Zoom المتصفح على 100% أولًا.","بعدها اضغط «ثبت بداية 100%».");
  updateDpr();
}
$("capture100").addEventListener("click",()=>capture100().catch(console.error));
$("restart").addEventListener("click",()=>location.reload());
$("export").addEventListener("click",exportJson);

window.addEventListener("resize",()=>{
  updateDpr();
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>processZoomTarget().catch(console.error),180);
});

init().catch(err=>{
  console.error(err);
  $("final").className="final fail";
  $("final").textContent=`Initialization failed: ${err?.message||err}`;
});
