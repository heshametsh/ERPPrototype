import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

const ROWS = 100000;
const BULK = 5000;
const DELETE_COUNT = 1000;
const PERF_LIMIT = 400;

let grid;
let data = [];
let gridColumns = [];
let idIndex = new Map();
let pendingEdit = null;
let stage = "loading";
let readonlyEditStart = 0;
let readonlyAfterEdit = 0;
let readonlyOriginal = null;
let initialDpr = window.devicePixelRatio;
let zoomSeen = new Set([roundDpr(initialDpr)]);
let zoomLeftInitial = false;
let zoomFailed = false;
let resizeTimer = null;
let longTasks = [];
let lastFrame = performance.now();
let frameGaps = [];
let scrollEvents = 0;

const baseline = new Map();
const dirty = new Set();
const undoStack = [];
const redoStack = [];
const tests = {};
const actions = [];
const notes = [];

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const twoFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const cloneColumns = cols => cols.map(c => ({...c}));
const keyOf = (id, prop) => `${id}::${String(prop)}`;

function roundDpr(v){ return Math.round(v * 100) / 100; }
function now(){ return performance.now(); }
function record(name, started, ok, detail=""){ actions.push({at:Date.now(),name,ms:now()-started,ok,detail}); }

function generateRows(count){
  const baskets=["NeedLicense","UnderExecution","InspectionBasket","ModifyEstimate","Engineering","IssueReturn","InvoiceBasket","FinanceBasket"];
  return Array.from({length:count},(_,i)=>{
    const value=10000+((i*7919)%490000); const partial=i%4===0?Math.round(value*.35):0;
    return {id:i+1,workOrderNumber:String(233000000+i),workTypeCode:[401,402,801,802][i%4],assignmentDate:`2026-${String(i%12+1).padStart(2,"0")}-${String(i%28+1).padStart(2,"0")}`,workOrderValue:value,partialAmount:partial,remainingAmount:value-partial,basket:baskets[i%8],notes:`ERP row ${i+1}`};
  });
}

function rebuildIndex(){ idIndex = new Map(data.map((row,i)=>[row.id,i])); }
function rowById(id){ const i=idIndex.get(id); return i==null?null:data[i]; }
function colIndex(prop){ return gridColumns.findIndex(c=>String(c.prop)===String(prop)); }
function visualColIndex(prop){ const x=colIndex(prop); return grid?.rtl ? gridColumns.length-1-x : x; }
function rangeX(r){return r?.x??r?.start?.x??null} function rangeY(r){return r?.y??r?.start?.y??null} function rangeX1(r){return r?.x1??r?.end?.x??rangeX(r)} function rangeY1(r){return r?.y1??r?.end?.y??rangeY(r)}
function isWholeBasket(r){ const x=visualColIndex("basket"); return x>=0&&rangeX(r)===x&&rangeX1(r)===x&&rangeY(r)===0&&rangeY1(r)===data.length-1; }

function headerTemplate(h,column){
  const glyph=column?.order==="asc"?"↑":column?.order==="desc"?"↓":"↕";
  return h("span",{class:"erp-header-inner"},[
    h("span",{class:"erp-header-title","data-erp-header-action":"select",title:"تحديد العمود كله"},column.name||String(column.prop||"")),
    h("span",{class:"erp-sort-trigger","data-erp-header-action":"sort",title:"Sort"},glyph)
  ]);
}
function headerAction(e){ for(const n of e?.composedPath?.()||[]){ if(n?.dataset?.erpHeaderAction)return n.dataset.erpHeaderAction; } return null; }

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
  ];
}

function instruction(text,sub=""){ $("instruction").textContent=text; $("sub").textContent=sub; }
function setTest(name,status,detail=""){
  const el=document.querySelector(`[data-test="${name}"]`); if(!el)return;
  el.classList.remove("running","pass","fail"); if(status!=="pending")el.classList.add(status);
  el.querySelector(".badge").textContent=status==="pass"?"✓":status==="fail"?"✕":"…";
  if(detail)el.querySelector("small").textContent=detail;
  tests[name]={status,detail,at:Date.now()}; renderFinal();
}
function renderMetrics(){
  $("dirty").textContent=dirty.size.toLocaleString(); $("undo").textContent=undoStack.length; $("redo").textContent=redoStack.length; $("rows").textContent=data.length.toLocaleString();
  const worst=longTasks.length?Math.max(...longTasks.map(x=>x.duration)):0; $("long").textContent=`${worst.toFixed(0)}ms`;
  $("heap").textContent=performance.memory?`${(performance.memory.usedJSHeapSize/1048576).toFixed(0)}MB`:"n/a";
}
function renderFinal(){
  const names=["historySave","bulkHistory","readonly","deleteRestore","customColumns","split","rtl","zoom"];
  const s=names.map(n=>tests[n]?.status||"pending"); const f=$("final"); f.classList.remove("pass","fail");
  if(s.every(x=>x==="pass")){f.textContent="النتيجة النهائية: PASS — RevoGrid Community عدى ERP Gate 4.";f.classList.add("pass");$("export").disabled=false;}
  else if(s.some(x=>x==="fail")){f.textContent="النتيجة النهائية: يوجد FAIL — صدّر JSON.";f.classList.add("fail");$("export").disabled=false;}
  else f.textContent="النتيجة النهائية: الاختبار مستمر.";
}

function ensureBaseline(id,prop,before){ const k=keyOf(id,prop); if(!baseline.has(k))baseline.set(k,before); }
function refreshDirty(id,prop){ const row=rowById(id); if(!row)return; const k=keyOf(id,prop); const saved=baseline.get(k); if(Object.is(row[prop],saved))dirty.delete(k); else dirty.add(k); }
function pushHistory(op){ undoStack.push(op); redoStack.length=0; renderMetrics(); }
function clearHistory(){ undoStack.length=0; redoStack.length=0; renderMetrics(); }
function saveBaseline(){ for(const k of [...dirty]){ const [idText,prop]=k.split("::"); const row=rowById(Number(idText)); if(row)baseline.set(k,row[prop]); } dirty.clear(); renderMetrics(); }

async function applyCellOp(op,dir){
  const useAfter=dir==="redo";
  for(const d of op.deltas){ const row=rowById(d.id); if(!row)continue; row[d.prop]=useAfter?d.after:d.before; refreshDirty(d.id,d.prop); }
  const first=op.deltas[0]; if(first){ const i=idIndex.get(first.id); const c=colIndex(first.prop); if(i!=null&&c>=0) await grid.setDataAt({row:i,col:c,val:rowById(first.id)[first.prop],rowType:"rgRow",colType:"rgCol"}); }
}
async function applyRowsOp(op,dir){
  if((op.action==="delete"&&dir==="undo")||(op.action==="insert"&&dir==="redo")){ data.splice(op.index,0,...op.rows); }
  else { data.splice(op.index,op.rows.length); }
  rebuildIndex(); grid.source=data; await twoFrames();
}
async function applyColumnsOp(op,dir){ gridColumns=cloneColumns(dir==="undo"?op.before:op.after); await grid.updateColumns(gridColumns); await twoFrames(); }
async function doUndo(){ const op=undoStack.pop(); if(!op)return false; const started=now(); if(op.kind==="cells")await applyCellOp(op,"undo"); else if(op.kind==="rows")await applyRowsOp(op,"undo"); else if(op.kind==="columns")await applyColumnsOp(op,"undo"); redoStack.push(op); renderMetrics(); record(`undo-${op.kind}`,started,true); return true; }
async function doRedo(){ const op=redoStack.pop(); if(!op)return false; const started=now(); if(op.kind==="cells")await applyCellOp(op,"redo"); else if(op.kind==="rows")await applyRowsOp(op,"redo"); else if(op.kind==="columns")await applyColumnsOp(op,"redo"); undoStack.push(op); renderMetrics(); record(`redo-${op.kind}`,started,true); return true; }

async function createGrid(rtl=false){
  await customElements.whenDefined("revo-grid");
  grid=document.createElement("revo-grid"); grid.style.width="100%"; grid.style.height="760px"; grid.columns=gridColumns; grid.source=data; grid.range=true; grid.useClipboard={rangeFill:true}; grid.resize=true; grid.rowHeaders=true; grid.rowSize=22; grid.rtl=rtl;
  $("grid").replaceChildren(grid); bindGridEvents(); await twoFrames();
}
function bindGridEvents(){
  grid.addEventListener("viewportscroll",()=>scrollEvents++);
  grid.addEventListener("beforeheaderclick",e=>{ if(headerAction(e?.detail?.originalEvent)!=="select")return; const prop=e?.detail?.column?.prop; if(prop==null)return; e.preventDefault?.(); e.detail?.originalEvent?.preventDefault?.(); queueMicrotask(()=>selectWholeColumn(prop)); });
  grid.addEventListener("beforeedit",e=>{
    const d=e.detail||{}; if(stage==="edit-wait"&&String(d.prop)==="notes") pendingEdit={id:d.model?.id,prop:String(d.prop),before:d.model?.[d.prop],after:d.val,rowIndex:d.rowIndex};
  });
  grid.addEventListener("afteredit",e=>{
    const d=e.detail||{}; if(String(d.prop)==="remainingAmount")readonlyAfterEdit++;
    if(stage!=="edit-wait"||!pendingEdit||String(d.prop)!=="notes")return;
    const p=pendingEdit; pendingEdit=null; if(p.id==null)return;
    const row=rowById(p.id); const after=row?.[p.prop]; ensureBaseline(p.id,p.prop,p.before); refreshDirty(p.id,p.prop); pushHistory({kind:"cells",deltas:[{id:p.id,prop:p.prop,before:p.before,after}]});
    stage="edit-undo"; setTest("historySave","running",`التعديل اتسجل وDirty=${dirty.size}. اضغط Ctrl+Z.`); instruction("اضغط Ctrl+Z مرة واحدة.","هنرجّع التعديل قبل Save.");
  });
  grid.addEventListener("beforeeditstart",e=>{ if(String(e?.detail?.prop)==="remainingAmount")readonlyEditStart++; });
}
async function selectWholeColumn(prop){ const x=visualColIndex(prop); await grid.setCellsFocus({x,y:0},{x,y:data.length-1}); grid.focus({preventScroll:true}); await twoFrames(); return isWholeBasket(await grid.getSelectedRange()); }

async function start(){
  $("start").disabled=true; clearHistory(); stage="edit-wait"; setTest("historySave","running","مستني تعديل خلية Notes.");
  await grid.scrollToRow(10); await grid.setCellsFocus({x:visualColIndex("notes"),y:10},{x:visualColIndex("notes"),y:10}); grid.focus({preventScroll:true});
  instruction("غيّر خلية Notes المحددة لأي قيمة واضغط Enter.","بعدها الاختبار هيطلب منك Ctrl+Z وCtrl+Y.");
}

async function handleHistoryKey(kind){
  if(kind==="undo")await doUndo(); else await doRedo();
  if(stage==="edit-undo"&&kind==="undo"){
    const op=redoStack.at(-1); const d=op?.deltas?.[0]; const row=d?rowById(d.id):null;
    const ok=dirty.size===0 && !!d && Object.is(row?.[d.prop],d.before); if(!ok){setTest("historySave","fail",`بعد Undo Dirty=${dirty.size}`);return;}
    stage="edit-redo"; instruction("تمام. اضغط Ctrl+Y مرة واحدة.");
  } else if(stage==="edit-redo"&&kind==="redo"){
    const op=undoStack.at(-1); const d=op?.deltas?.[0]; const row=d?rowById(d.id):null;
    if(dirty.size!==1 || !d || !Object.is(row?.[d.prop],d.after)){setTest("historySave","fail",`بعد Redo Dirty=${dirty.size}`);return;}
    stage="edit-save"; $("save").hidden=false; instruction("Redo رجّع التعديل. اضغط «Save تجريبي».","الحفظ هنا Baseline داخل المتصفح فقط لاختبار منطق الـHistory.");
  } else if(stage==="postsave-undo"&&kind==="undo"){
    const op=redoStack.at(-1); const d=op?.deltas?.[0]; const row=d?rowById(d.id):null;
    if(dirty.size!==1 || !d || !Object.is(row?.[d.prop],d.before)){setTest("historySave","fail",`Undo بعد Save لم يعمل: Dirty=${dirty.size}`);return;}
    stage="postsave-redo"; instruction("Undo بعد Save نجح ✅. اضغط Ctrl+Y.");
  } else if(stage==="postsave-redo"&&kind==="redo"){
    const op=undoStack.at(-1); const d=op?.deltas?.[0]; const row=d?rowById(d.id):null; const ok=dirty.size===0 && !!d && Object.is(row?.[d.prop],d.after); setTest("historySave",ok?"pass":"fail",ok?"Save + Undo/Redo بعد Save نجح.":`Dirty=${dirty.size}`);
    if(ok){ clearHistory(); stage="bulk-ready"; $("bulk").hidden=false; instruction("اختبار 1 خلص. اضغط «جهّز History لـ5000»."); }
  } else if(stage==="bulk-undo"&&kind==="undo"){
    const op=redoStack.at(-1); const valuesOk=!!op?.deltas?.length && op.deltas.every(d=>Object.is(rowById(d.id)?.[d.prop],d.before));
    if(dirty.size!==0 || !valuesOk){setTest("bulkHistory","fail",`Undo ترك Dirty=${dirty.size} أو قيم غير صحيحة`);return;}
    stage="bulk-redo"; instruction("5000 تغيير رجعوا بـCtrl+Z واحد ✅. اضغط Ctrl+Y.");
  } else if(stage==="bulk-redo"&&kind==="redo"){
    const op=undoStack.at(-1); const valuesOk=!!op?.deltas?.length && op.deltas.every(d=>Object.is(rowById(d.id)?.[d.prop],d.after));
    const ok=dirty.size===BULK && valuesOk; setTest("bulkHistory",ok?"pass":"fail",ok?`Redo رجع ${BULK.toLocaleString()} تغيير كعملية واحدة.`:`Dirty=${dirty.size} أو قيم غير صحيحة`);
    if(ok){ saveBaseline(); clearHistory(); await beginReadonly(); }
  } else if(stage==="delete-undo"&&kind==="undo"){
    const op=redoStack.at(-1); const idsOk=!!op?.rows?.length && data[op.index]?.id===op.rows[0].id && data[op.index+op.rows.length-1]?.id===op.rows.at(-1).id;
    if(data.length!==ROWS || !idsOk){setTest("deleteRestore","fail",`بعد Undo rows=${data.length} أو IDs غير صحيحة`);return;}
    stage="delete-redo"; instruction("Undo رجع الـ1000 صف ✅. اضغط Ctrl+Y.");
  } else if(stage==="delete-redo"&&kind==="redo"){
    const op=undoStack.at(-1); const idsGone=!!op?.rows?.length && !op.rows.some(r=>idIndex.has(r.id));
    if(data.length!==ROWS-DELETE_COUNT || !idsGone){setTest("deleteRestore","fail",`بعد Redo rows=${data.length} أو بعض IDs مازالت موجودة`);return;}
    stage="delete-final-undo"; instruction("Redo حذفهم تاني ✅. اضغط Ctrl+Z مرة أخيرة عشان نختم والـ100k يرجعوا.");
  } else if(stage==="delete-final-undo"&&kind==="undo"){
    const ok=data.length===ROWS; setTest("deleteRestore",ok?"pass":"fail",ok?"100k→99k→100k→99k→100k نجح.":`rows=${data.length}`);
    if(ok){clearHistory(); stage="columns-ready"; $("columns").hidden=false; instruction("اختبار الصفوف خلص. اضغط «اختبر Custom Columns».");}
  } else if(stage==="column-undo"&&kind==="undo"){
    const cols=await grid.getColumns(); const ok=!cols.some(c=>String(c.prop)==="erpCustom"); if(!ok){setTest("customColumns","fail","Undo لم يزيل العمود.");return;}
    stage="column-redo"; instruction("Undo شال العمود ✅. اضغط Ctrl+Y.");
  } else if(stage==="column-redo"&&kind==="redo"){
    const cols=await grid.getColumns(); const ok=cols.some(c=>String(c.prop)==="erpCustom"); setTest("customColumns",ok?"pass":"fail",ok?"20 دورة + Add/Undo/Redo نجحوا.":"Redo لم يرجع العمود.");
    if(ok){clearHistory(); stage="split-ready"; $("split").hidden=false; instruction("Custom Columns خلصت. اضغط «شغّل Split Stress».");}
  }
}

async function bulkHistory(){
  $("bulk").hidden=true; const started=now(); const deltas=[]; for(let i=1000;i<1000+BULK;i++){const row=data[i],before=row.notes,after=`G4-BULK-${i}`;ensureBaseline(row.id,"notes",before);row.notes=after;refreshDirty(row.id,"notes");deltas.push({id:row.id,prop:"notes",before,after});}
  pushHistory({kind:"cells",deltas}); record("bulk-apply-5000",started,true,`dirty=${dirty.size}`); stage="bulk-undo"; setTest("bulkHistory","running",`${BULK.toLocaleString()} تغيير اتسجلوا كعملية واحدة. اضغط Ctrl+Z.`); instruction("اضغط Ctrl+Z مرة واحدة. لازم يرجّع الـ5000 كلهم.");
}

async function beginReadonly(){
  stage="readonly-wait"; readonlyEditStart=0; readonlyAfterEdit=0; readonlyOriginal=data[10].remainingAmount; setTest("readonly","running","Remaining Amount متحدد. اضغط Enter مرة واحدة.");
  await grid.scrollToRow(10); await grid.setCellsFocus({x:visualColIndex("remainingAmount"),y:10},{x:visualColIndex("remainingAmount"),y:10}); grid.focus({preventScroll:true}); instruction("اضغط Enter مرة واحدة على Remaining Amount المحددة.","لو Readonly صحيح، Editor مش هيفتح والقيمة مش هتتغير.");
}
async function verifyReadonly(){
  await wait(800); const same=data[10].remainingAmount===readonlyOriginal; const ok=same&&readonlyEditStart===0&&readonlyAfterEdit===0; setTest("readonly",ok?"pass":"fail",ok?"Readonly منع فتح/حفظ Editor.":`editStart=${readonlyEditStart}, afterEdit=${readonlyAfterEdit}, same=${same}`);
  if(ok){stage="delete-ready";$("delete").hidden=false;instruction("Readonly نجح. اضغط «احذف 1000 للاختبار».");}
}

async function deleteRows(){
  $("delete").hidden=true; clearHistory(); const started=now(); const index=20000; const rows=data.splice(index,DELETE_COUNT); rebuildIndex(); grid.source=data; await twoFrames(); pushHistory({kind:"rows",action:"delete",index,rows}); const ok=data.length===ROWS-DELETE_COUNT; record("delete-1000",started,ok,`rows=${data.length}`); setTest("deleteRestore",ok?"running":"fail",ok?"تم حذف 1000. اضغط Ctrl+Z.":`rows=${data.length}`); if(ok){stage="delete-undo";instruction("اضغط Ctrl+Z عشان ترجع الـ1000 صف.");}
}

async function customColumns(){
  $("columns").hidden=true; clearHistory(); const started=now(); const base=cloneColumns(gridColumns.filter(c=>String(c.prop)!=="erpCustom"));
  for(let i=0;i<20;i++){
    const p=`tempG4_${i}`; const add=[...base,{name:`Temp ${i}`,prop:p,size:120}]; await grid.updateColumns(add); await grid.updateColumns([...base,{name:`Temp ${i} renamed`,prop:p,size:155}]); await grid.updateColumns(base);
  }
  const before=cloneColumns(base); const after=[...cloneColumns(base),{name:"ERP Custom",prop:"erpCustom",size:140}]; gridColumns=cloneColumns(after); await grid.updateColumns(gridColumns); pushHistory({kind:"columns",before,after}); record("custom-columns-20-plus-history",started,true); stage="column-undo"; setTest("customColumns","running","20 دورة نجحوا، وERP Custom اتضاف. اضغط Ctrl+Z."); instruction("اضغط Ctrl+Z لإلغاء إضافة ERP Custom.","اختبار الـHistory للأعمدة قبل Save فقط، زي القرار الحالي.");
}

async function splitStress(){
  $("split").hidden=true; const started=now(); await selectWholeColumn("basket"); let ok=true;
  for(let i=0;i<20;i++){ $("grid-card").classList.toggle("half",i%2===0); await twoFrames(); if(!isWholeBasket(await grid.getSelectedRange())){ok=false;break;} }
  $("grid-card").classList.remove("half"); await twoFrames(); record("split-20",started,ok); setTest("split",ok?"pass":"fail",ok?"20 تغيير Full/Split والتحديد فضل Basket.":"Selection اتكسر أثناء Split.");
  if(ok){stage="rtl-ready";$("rtl").hidden=false;instruction("Split نجح. اضغط «شغّل RTL Stress».");}
}

async function rtlStress(){
  $("rtl").hidden=true; const started=now(); await createGrid(true); await selectWholeColumn("basket"); let ok=true;
  for(let i=0;i<100;i++){ await grid.scrollToRow((i*7919)%data.length); }
  ok=isWholeBasket(await grid.getSelectedRange()); record("rtl-fresh-100-jumps",started,ok); setTest("rtl",ok?"pass":"fail",ok?"RTL Fresh + 100 قفزة حافظ على Basket.":"Selection اتكسر في RTL.");
  if(ok){stage="zoom-wait"; initialDpr=roundDpr(devicePixelRatio); zoomSeen=new Set([initialDpr]); zoomLeftInitial=false; zoomFailed=false; await selectWholeColumn("basket"); setTest("zoom","running",`DPR البداية=${initialDpr}.`); instruction("غيّر Zoom: 100 → 90 → 80 → 67 → 100.","استخدم Zoom المتصفح الحقيقي. النتيجة هتظهر تلقائيًا لما ترجع لنفس Zoom البداية.");}
}

async function checkZoom(){
  if(stage!=="zoom-wait"||zoomFailed)return; const d=roundDpr(devicePixelRatio); zoomSeen.add(d); if(Math.abs(d-initialDpr)>.01)zoomLeftInitial=true; await wait(80); const ok=isWholeBasket(await grid.getSelectedRange()); notes.push({at:Date.now(),type:"zoom",dpr:d,selectionOk:ok});
  if(!ok){zoomFailed=true;setTest("zoom","fail",`Selection اتكسر عند DPR=${d}`);return;}
  if(zoomLeftInitial&&zoomSeen.size>=4&&Math.abs(d-initialDpr)<=.01){setTest("zoom","pass",`Zoom values: ${[...zoomSeen].join(" → ")}. Selection سليم.`);stage="done";instruction("Gate 4 خلص. صدّر JSON وابعتلي الملف.");$("export").disabled=false;}
}

function snapshot(){
  const worstLong=longTasks.length?Math.max(...longTasks.map(x=>x.duration)):0; const worstFrame=frameGaps.length?Math.max(...frameGaps.map(x=>x.gap)):0;
  return {at:new Date().toISOString(),gate:"RevoGrid Community ERP Gate 4",candidate:"RevoGrid Community 4.25.2",rows:data.length,stage,tests,actions,notes,dirty:dirty.size,undoDepth:undoStack.length,redoDepth:redoStack.length,scrollEvents,longTasks:longTasks.length,longTaskTotalMs:longTasks.reduce((a,x)=>a+x.duration,0),longTaskMaxMs:worstLong,frameGapOver50:frameGaps.filter(x=>x.gap>50).length,maxFrameGapMs:worstFrame,heapMb:performance.memory?performance.memory.usedJSHeapSize/1048576:null,domNodes:document.getElementsByTagName("*").length,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},userAgent:navigator.userAgent};
}
function exportJson(){ const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=`grid-gate4-revogrid-erp-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

window.addEventListener("keydown",e=>{
  const mod=e.ctrlKey||e.metaKey; const k=e.key.toLowerCase();
  if(stage==="readonly-wait"&&e.key==="Enter"){ setTimeout(()=>verifyReadonly().catch(console.error),0); return; }
  if(!mod||(k!=="z"&&k!=="y"))return;
  const managed=["edit-undo","edit-redo","postsave-undo","postsave-redo","bulk-undo","bulk-redo","delete-undo","delete-redo","delete-final-undo","column-undo","column-redo"];
  if(!managed.includes(stage))return; e.preventDefault(); e.stopPropagation(); handleHistoryKey(k==="z"?"undo":"redo").catch(console.error);
},true);
window.addEventListener("resize",()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>checkZoom().catch(console.error),180); });

$("start").addEventListener("click",()=>start().catch(console.error));
$("save").addEventListener("click",()=>{ $("save").hidden=true; saveBaseline(); if(dirty.size===0){stage="postsave-undo";setTest("historySave","running","Save صفّر Dirty والـHistory مازال موجود. اضغط Ctrl+Z.");instruction("اضغط Ctrl+Z بعد Save.","لازم يرجع التعديل ويخلي الصف Dirty من جديد.");}else setTest("historySave","fail",`Save ترك Dirty=${dirty.size}`); });
$("bulk").addEventListener("click",()=>bulkHistory().catch(console.error));
$("delete").addEventListener("click",()=>deleteRows().catch(console.error));
$("columns").addEventListener("click",()=>customColumns().catch(console.error));
$("split").addEventListener("click",()=>splitStress().catch(console.error));
$("rtl").addEventListener("click",()=>rtlStress().catch(console.error));
$("restart").addEventListener("click",()=>location.reload());
$("export").addEventListener("click",exportJson);

try{new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({at:now(),duration:e.duration});}).observe({type:"longtask",buffered:true});}catch{}
function frameLoop(t){const gap=t-lastFrame;lastFrame=t;if(gap>16.7)frameGaps.push({at:t,gap});requestAnimationFrame(frameLoop)} requestAnimationFrame(frameLoop); setInterval(renderMetrics,500);

(async()=>{
  data=generateRows(ROWS); rebuildIndex(); gridColumns=baseColumns(); await createGrid(false); stage="ready"; $("start").disabled=false; instruction("الشيت جاهز. اضغط «ابدأ Gate 4».","هتعمل خطوات بسيطة، والنجاح/الفشل يظهر تلقائيًا."); renderMetrics();
})().catch(err=>{console.error(err);instruction(`Load failed: ${err.message}`)});
