import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

const ROWS=100000;
let grid, data=[], columns=[];
let stage="loading";
let scrollEvents=0, rtlScrollStart=0, rtlTimer=null;
let zoomBaseDpr=null, zoomStep=0, zoomTimer=null;
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
function instruction(text,sub=""){$("instruction").textContent=text;$("sub").textContent=sub;}
function setTest(name,status,detail){
  const el=document.querySelector(`[data-test="${name}"]`);
  el.classList.remove("running","pass","fail");
  if(status!=="pending")el.classList.add(status);
  el.querySelector(".badge").textContent=status==="pass"?"✓":status==="fail"?"✕":"…";
  el.querySelector("small").textContent=detail;
  tests[name]={status,detail,at:Date.now()};
}
function record(name,s,ok,detail=""){actions.push({at:Date.now(),name,ms:now()-s,ok,detail});}
function snapshot(extra=""){
  Promise.resolve(grid?.getSelectedRange?.()).then(r=>{
    const n=normalizeRange(r);
    $("snapshot").innerHTML=
      `RTL: <b>${grid?.rtl?"نعم":"لا"}</b><br>`+
      `Selection: <b>${isWholeBasket(n)?"✅ Basket كامل":"❌ "+JSON.stringify(n)}</b><br>`+
      `DPR: <b>${devicePixelRatio.toFixed(3)}</b>`+
      (extra?`<br>${extra}`:"");
  }).catch(()=>{});
}
async function selectBasket(){
  const x=visualColIndex("basket");
  await grid.setCellsFocus({x,y:0},{x,y:ROWS-1});
  grid.focus({preventScroll:true});
  await twoFrames();
  return isWholeBasket(await grid.getSelectedRange());
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
      notes.push({at:Date.now(),type:"header-select",rtl:!!grid.rtl,ok,range:normalizeRange(await grid.getSelectedRange())});
      snapshot();
      if(stage==="rtl-select"&&ok){
        stage="rtl-scroll";
        rtlScrollStart=scrollEvents;
        setTest("rtl","running","Basket محدد في RTL. اسحب Scroll بقوة لتحت ولفوق.");
        instruction("اسحب Scroll بقوة لتحت وارجع لفوق بإيدك.","الصفحة هتحكم تلقائيًا بعد عدد كافٍ من حركات الـScroll.");
      }
    });
  });
  grid.addEventListener("beforesorting",e=>e.preventDefault?.());
  grid.addEventListener("viewportscroll",()=>{
    scrollEvents++;
    $("scrolls").textContent=scrollEvents;
    if(stage==="rtl-scroll"){
      clearTimeout(rtlTimer);
      rtlTimer=setTimeout(()=>finishRtlScroll().catch(console.error),450);
    }
  });
}
async function createGrid(rtl=false){
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
  grid.rtl=rtl;
  $("grid").replaceChildren(grid);
  bindGridEvents();
  await twoFrames();
}
async function rtlToggle(){
  const s=now();
  $("rtlToggle").hidden=true;
  await createGrid(true);
  const ok=!!grid.rtl;
  record("manual-rtl-toggle",s,ok);
  notes.push({at:Date.now(),type:"rtl-enabled",ok});
  if(!ok){
    setTest("rtl","fail","RTL لم يتفعل.");
    finishFail();
    return;
  }
  stage="rtl-select";
  setTest("rtl","running","RTL اشتغل. اضغط اسم Basket بنفسك.");
  instruction("RTL اشتغل. اضغط اسم Basket في الهيدر.","بعدها اسحب Scroll بقوة.");
  snapshot();
}
async function finishRtlScroll(){
  if(stage!=="rtl-scroll")return;
  const delta=scrollEvents-rtlScrollStart;
  if(delta<25){
    instruction(`كمل Scroll شوية — حصل ${delta}/25 event.`,"اسحب لتحت وارجع لفوق.");
    return;
  }
  const r=normalizeRange(await grid.getSelectedRange());
  const ok=isWholeBasket(r);
  notes.push({at:Date.now(),type:"rtl-scroll-check",delta,range:r,ok});
  snapshot(`RTL scroll events: ${delta}`);
  if(!ok){
    setTest("rtl","fail",`Basket فقد التحديد بعد ${delta} Scroll events في RTL.`);
    finishFail();
    return;
  }

  setTest("rtl","pass",`RTL + ${delta} Scroll events والتحديد ثابت.`);
  stage="zoom";
  zoomBaseDpr=devicePixelRatio;
  zoomStep=0;
  setTest("zoom","running","ابدأ Zoom يدوي: 90% ثم 80% ثم 67% ثم 100%.");
  instruction("غيّر Zoom المتصفح إلى 90% بنفسك.","بعدها 80% → 67% → 100%. لا تعيد تحديد Basket.");
  $("dpr").textContent=devicePixelRatio.toFixed(3);
}
const zoomTargets=[
  {ratio:.90,label:"90%"},
  {ratio:.80,label:"80%"},
  {ratio:.67,label:"67%"},
  {ratio:1.00,label:"100%"}
];
async function checkZoom(){
  if(stage!=="zoom"||!zoomBaseDpr||zoomStep>=zoomTargets.length)return;
  const ratio=devicePixelRatio/zoomBaseDpr;
  const target=zoomTargets[zoomStep];
  $("dpr").textContent=devicePixelRatio.toFixed(3);

  if(Math.abs(ratio-target.ratio)>.065){
    snapshot(`Zoom ratio seen: ${ratio.toFixed(3)} — المطلوب الآن ${target.label}`);
    return;
  }

  await wait(220);
  const r=normalizeRange(await grid.getSelectedRange());
  const ok=isWholeBasket(r);
  notes.push({
    at:Date.now(),
    type:"zoom-seen",
    target:target.label,
    ratio,
    dpr:devicePixelRatio,
    range:r,
    ok
  });
  snapshot(`Zoom ${target.label} — ratio=${ratio.toFixed(3)}`);

  if(!ok){
    setTest("zoom","fail",`Selection اتكسر عند ${target.label}.`);
    finishFail();
    return;
  }

  zoomStep++;
  if(zoomStep===zoomTargets.length){
    setTest("zoom","pass","90→80→67→100 يدويًا وBasket فضل محدد.");
    stage="done";
    $("export").disabled=false;
    $("final").className="final pass";
    $("final").textContent="النتيجة: RTL + Scroll + Zoom نجحوا على 100,000 صف.";
    instruction("الاختبار خلص ✅. صدّر JSON وابعتلي الملف.");
  }else{
    instruction(`تمام ${target.label} ✅. دلوقتي غيّر Zoom إلى ${zoomTargets[zoomStep].label}.`);
  }
}
function finishFail(){
  stage="done";
  $("export").disabled=false;
  $("final").className="final fail";
  $("final").textContent="النتيجة: يوجد FAIL — صدّر JSON وابعتلي الملف.";
}
function exportJson(){
  const payload={
    at:new Date().toISOString(),
    gate:"RevoGrid Community Gate 4I — RTL + Zoom Focused",
    version:"4.25.2",
    rows:ROWS,
    stage,
    tests,actions,notes,
    scrollEvents,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    userAgent:navigator.userAgent
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`grid-gate4i-rtl-zoom-${Date.now()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function init(){
  data=generateRows(ROWS);
  columns=baseColumns();
  await createGrid(false);
  setTest("rtl","running","اضغط «تحويل إلى RTL» بنفسك.");
  setTest("zoom","pending","يبدأ بعد نجاح RTL + Scroll.");
  stage="rtl-ready";
  $("rtlToggle").hidden=false;
  instruction("اضغط «تحويل إلى RTL» بنفسك.","بعدها هتحدد Basket وتسحب Scroll.");
  $("dpr").textContent=devicePixelRatio.toFixed(3);
  snapshot();
}
$("rtlToggle").addEventListener("click",()=>rtlToggle().catch(console.error));
$("restart").addEventListener("click",()=>location.reload());
$("export").addEventListener("click",exportJson);
window.addEventListener("resize",()=>{
  $("dpr").textContent=devicePixelRatio.toFixed(3);
  clearTimeout(zoomTimer);
  zoomTimer=setTimeout(()=>checkZoom().catch(console.error),180);
});
init().catch(err=>{
  console.error(err);
  $("final").className="final fail";
  $("final").textContent=`Initialization failed: ${err?.message||err}`;
});
