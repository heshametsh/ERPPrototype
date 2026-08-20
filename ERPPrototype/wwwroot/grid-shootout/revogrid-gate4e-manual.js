import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

const ROWS=100000, BULK=5000, DELETE_COUNT=1000;
let grid, data=[], gridColumns=[], idIndex=new Map();
let stage="loading", pendingEdit=null, readonlyStart=0, readonlyAfter=0, readonlyValue=null;
let bulkBefore=null, deletePrepared=null, splitCount=0, rtlScrollStart=0, rtlChecking=false;
let zoomBaseDpr=null, zoomStep=0, zoomTimer=null;
const baseline=new Map(), dirty=new Set(), undoStack=[], redoStack=[];
const tests={}, actions=[], notes=[], longTasks=[];
let scrollEvents=0;

const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const twoFrames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const now=()=>performance.now();
const keyOf=(id,prop)=>`${id}::${String(prop)}`;
const cloneColumns=cols=>cols.map(c=>({...c}));
function record(name,started,ok,detail=""){actions.push({at:Date.now(),name,ms:now()-started,ok,detail});}

function generateRows(count){
  const baskets=["NeedLicense","UnderExecution","InspectionBasket","ModifyEstimate","Engineering","IssueReturn","InvoiceBasket","FinanceBasket"];
  return Array.from({length:count},(_,i)=>{const value=10000+((i*7919)%490000), partial=i%4===0?Math.round(value*.35):0;return{id:i+1,workOrderNumber:String(233000000+i),workTypeCode:[401,402,801,802][i%4],assignmentDate:`2026-${String(i%12+1).padStart(2,"0")}-${String(i%28+1).padStart(2,"0")}`,workOrderValue:value,partialAmount:partial,remainingAmount:value-partial,basket:baskets[i%8],notes:`ERP row ${i+1}`};});
}
function rebuildIndex(){idIndex=new Map(data.map((r,i)=>[r.id,i]));}
function rowById(id){const i=idIndex.get(id);return i==null?null:data[i];}
function colIndex(prop){return gridColumns.findIndex(c=>String(c.prop)===String(prop));}
function visualColIndex(prop){const x=colIndex(prop);return grid?.rtl?gridColumns.length-1-x:x;}
function rangeX(r){return r?.x??r?.start?.x??null} function rangeY(r){return r?.y??r?.start?.y??null} function rangeX1(r){return r?.x1??r?.end?.x??rangeX(r)} function rangeY1(r){return r?.y1??r?.end?.y??rangeY(r)}
function isWholeBasket(r){const x=visualColIndex("basket");return x>=0&&rangeX(r)===x&&rangeX1(r)===x&&rangeY(r)===0&&rangeY1(r)===data.length-1;}
function headerTemplate(h,column){const glyph=column?.order==="asc"?"↑":column?.order==="desc"?"↓":"↕";return h("span",{class:"erp-header-inner"},[h("span",{class:"erp-header-title","data-erp-header-action":"select",title:"تحديد العمود كله"},column.name||String(column.prop||"")),h("span",{class:"erp-sort-trigger","data-erp-header-action":"sort",title:"Sort"},glyph)]);}
function headerAction(e){for(const n of e?.composedPath?.()||[]){if(n?.dataset?.erpHeaderAction)return n.dataset.erpHeaderAction;}return null;}
function baseColumns(){const common={sortable:true,columnTemplate:headerTemplate};return[
  {...common,name:"Work Order",prop:"workOrderNumber",size:150},{...common,name:"Work Type",prop:"workTypeCode",size:100},{...common,name:"Assignment Date",prop:"assignmentDate",size:135},{...common,name:"Work Order Value",prop:"workOrderValue",size:150},{...common,name:"Partial Amount",prop:"partialAmount",size:135},{...common,name:"Remaining Amount",prop:"remainingAmount",size:150,readonly:true},{...common,name:"Basket",prop:"basket",size:170},{...common,name:"Notes",prop:"notes",size:260}
];}

function instruction(text,sub=""){$("instruction").textContent=text;$("sub").textContent=sub;}
function setTest(name,status,detail=""){const el=document.querySelector(`[data-test="${name}"]`);if(!el)return;el.classList.remove("running","pass","fail");if(status!=="pending")el.classList.add(status);el.querySelector(".badge").textContent=status==="pass"?"✓":status==="fail"?"✕":"…";if(detail)el.querySelector("small").textContent=detail;tests[name]={status,detail,at:Date.now()};renderFinal();}
function renderMetrics(){$("dirty").textContent=dirty.size.toLocaleString();$("undo").textContent=undoStack.length;$("redo").textContent=redoStack.length;$("rows").textContent=data.length.toLocaleString();const worst=longTasks.length?Math.max(...longTasks.map(x=>x.duration)):0;$("long").textContent=`${worst.toFixed(0)}ms`;$("heap").textContent=performance.memory?`${(performance.memory.usedJSHeapSize/1048576).toFixed(0)}MB`:"n/a";}
function renderFinal(){const names=["historySave","bulkHistory","readonly","deleteRestore","customColumns","split","rtl","zoom"],s=names.map(n=>tests[n]?.status||"pending"),f=$("final");f.classList.remove("pass","fail");if(s.every(x=>x==="pass")){f.textContent="النتيجة النهائية: PASS — كل الاختبارات اليدوية نجحت.";f.classList.add("pass");$("export").disabled=false;}else if(s.some(x=>x==="fail")){f.textContent="النتيجة النهائية: يوجد FAIL — صدّر JSON.";f.classList.add("fail");$("export").disabled=false;}else f.textContent="النتيجة النهائية: الاختبار اليدوي مستمر.";}
function ensureBaseline(id,prop,before){const k=keyOf(id,prop);if(!baseline.has(k))baseline.set(k,before);}
function refreshDirty(id,prop){const row=rowById(id);if(!row)return;const k=keyOf(id,prop),saved=baseline.get(k);if(Object.is(row[prop],saved))dirty.delete(k);else dirty.add(k);}
function pushHistory(op){undoStack.push(op);redoStack.length=0;renderMetrics();}
function clearHistory(){undoStack.length=0;redoStack.length=0;renderMetrics();}
function saveBaseline(){for(const k of [...dirty]){const [idText,prop]=k.split("::"),row=rowById(Number(idText));if(row)baseline.set(k,row[prop]);}dirty.clear();renderMetrics();}

async function applyCellOp(op,dir){const useAfter=dir==="redo";for(const d of op.deltas){const row=rowById(d.id);if(!row)continue;row[d.prop]=useAfter?d.after:d.before;refreshDirty(d.id,d.prop);}grid.source=data.slice();await twoFrames();}
async function applyRowsOp(op,dir){if(dir==="undo")data.splice(op.index,0,...op.rows);else data.splice(op.index,op.rows.length);rebuildIndex();grid.source=data.slice();await twoFrames();}
async function applyColumnsOp(op,dir){gridColumns=cloneColumns(dir==="undo"?op.before:op.after);await grid.updateColumns(gridColumns);await twoFrames();}
async function doUndo(){const op=undoStack.pop();if(!op)return false;const s=now();if(op.kind==="cells")await applyCellOp(op,"undo");else if(op.kind==="rows")await applyRowsOp(op,"undo");else if(op.kind==="columns")await applyColumnsOp(op,"undo");redoStack.push(op);renderMetrics();record(`undo-${op.kind}`,s,true);return true;}
async function doRedo(){const op=redoStack.pop();if(!op)return false;const s=now();if(op.kind==="cells")await applyCellOp(op,"redo");else if(op.kind==="rows")await applyRowsOp(op,"redo");else if(op.kind==="columns")await applyColumnsOp(op,"redo");undoStack.push(op);renderMetrics();record(`redo-${op.kind}`,s,true);return true;}

async function createGrid(rtl=false){await customElements.whenDefined("revo-grid");grid=document.createElement("revo-grid");grid.style.width="100%";grid.style.height="760px";grid.columns=gridColumns;grid.source=data;grid.range=true;grid.useClipboard={rangeFill:true};grid.resize=true;grid.rowHeaders=true;grid.rowSize=22;grid.rtl=rtl;$("grid").replaceChildren(grid);bindGridEvents();await twoFrames();}
async function selectWholeColumn(prop){const x=visualColIndex(prop);await grid.setCellsFocus({x,y:0},{x,y:data.length-1});grid.focus({preventScroll:true});await twoFrames();return String(prop)==="basket"?isWholeBasket(await grid.getSelectedRange()):true;}

function bindGridEvents(){
  grid.addEventListener("viewportscroll",()=>{scrollEvents++;if(stage==="rtl-scroll")maybeFinishRtl();});
  grid.addEventListener("beforeheaderclick",e=>{if(headerAction(e?.detail?.originalEvent)!=="select")return;const prop=e?.detail?.column?.prop;if(prop==null)return;e.preventDefault?.();e.detail?.originalEvent?.preventDefault?.();queueMicrotask(async()=>{const ok=await selectWholeColumn(prop);notes.push({at:Date.now(),type:"header-select",prop,ok,stage});if(stage==="split-select"&&String(prop)==="basket"&&ok){stage="split-toggle";splitCount=0;$("splitToggle").hidden=false;instruction("تمام. اضغط «تبديل Split / Full» أربع مرات بنفسك.","بعد كل ضغطة هنتأكد إن Basket مازال محدد.");}else if(stage==="rtl-select"&&String(prop)==="basket"&&ok){stage="rtl-scroll";rtlScrollStart=scrollEvents;instruction("دلوقتي اسحب Scroll بقوة لتحت وارجع لفوق.","لما يحصل Scroll كفاية الصفحة هتحكم تلقائيًا على ثبات التحديد.");}});});
  grid.addEventListener("beforeedit",e=>{const d=e.detail||{};if(stage==="edit-wait"&&String(d.prop)==="notes")pendingEdit={id:d.model?.id,prop:"notes",before:d.model?.notes};});
  grid.addEventListener("afteredit",e=>{const d=e.detail||{};if(String(d.prop)==="remainingAmount")readonlyAfter++;if(stage!=="edit-wait"||!pendingEdit||String(d.prop)!=="notes")return;const p=pendingEdit;pendingEdit=null;const row=rowById(p.id);if(!row)return;const after=d.val!==undefined?d.val:(d.model?.notes);row.notes=after;if(Object.is(p.before,after))return;ensureBaseline(p.id,"notes",p.before);refreshDirty(p.id,"notes");pushHistory({kind:"cells",deltas:[{id:p.id,prop:"notes",before:p.before,after}]});notes.push({at:Date.now(),type:"manual-edit",id:p.id,before:p.before,after});stage="edit-undo";setTest("historySave","running","التعديل اتسجل. اضغط Ctrl+Z بنفسك.");instruction("اضغط Ctrl+Z مرة واحدة.","لو رجعت القيمة هنطلب منك Ctrl+Y.");});
  grid.addEventListener("beforeeditstart",e=>{if(String(e?.detail?.prop)==="remainingAmount")readonlyStart++;});
  grid.addEventListener("afterpasteapply",()=>{if(stage==="bulk-paste-wait")setTimeout(()=>captureBulkPaste().catch(failBulk),0);});
}

async function start(){stage="edit-wait";$("start").hidden=true;setTest("historySave","running","مستنيك تعدّل أي خلية في Notes.");instruction("اختار أي خلية في Notes وعدّلها بإيدك ثم اضغط Enter.","الصفحة لن تعدّل أي خلية بدل منك.");}

function historyShortcut(e){if(!(e.ctrlKey||e.metaKey))return null;const code=String(e.code||""),key=String(e.key||"").toLowerCase();if(code==="KeyZ"||key==="z"||key==="ئ")return e.shiftKey?"redo":"undo";if(code==="KeyY"||key==="y"||key==="غ")return"redo";return null;}
async function handleHistory(kind){if(kind==="undo")await doUndo();else await doRedo();
  if(stage==="edit-undo"&&kind==="undo"){const op=redoStack.at(-1),d=op?.deltas?.[0],row=d?rowById(d.id):null;if(!d||!Object.is(row?.[d.prop],d.before)){setTest("historySave","fail","Ctrl+Z لم يرجع القيمة.");return;}stage="edit-redo";instruction("Undo نجح ✅. اضغط Ctrl+Y بنفسك.");}
  else if(stage==="edit-redo"&&kind==="redo"){const op=undoStack.at(-1),d=op?.deltas?.[0],row=d?rowById(d.id):null;if(!d||!Object.is(row?.[d.prop],d.after)){setTest("historySave","fail","Ctrl+Y لم يرجع التعديل.");return;}stage="edit-save";$("save").hidden=false;instruction("Redo نجح ✅. اضغط Save بنفسك.","بعد Save هنختبر Undo/Redo مرة ثانية.");}
  else if(stage==="postsave-undo"&&kind==="undo"){if(dirty.size!==1){setTest("historySave","fail",`Undo بعد Save: Dirty=${dirty.size}`);return;}stage="postsave-redo";instruction("Undo بعد Save نجح ✅. اضغط Ctrl+Y.");}
  else if(stage==="postsave-redo"&&kind==="redo"){if(dirty.size!==0){setTest("historySave","fail",`Redo بعد Save: Dirty=${dirty.size}`);return;}setTest("historySave","pass","Edit + Dirty + Save + Undo/Redo بعد Save نجح يدويًا.");clearHistory();stage="bulk-ready";$("copy5000").hidden=false;instruction("اختبار 1 خلص. اضغط «انسخ 5000 قيمة».","الزر ينسخ القيم فقط؛ إنت اللي هتعمل Paste داخل Notes.");}
  else if(stage==="bulk-undo"&&kind==="undo"){const op=redoStack.at(-1);if(!op?.deltas?.length||!op.deltas.every(d=>Object.is(rowById(d.id)?.notes,d.before))){setTest("bulkHistory","fail","Undo لم يرجع كل الـ5000.");return;}stage="bulk-redo";instruction("Ctrl+Z رجّع الـ5000 كلهم ✅. اضغط Ctrl+Y.");}
  else if(stage==="bulk-redo"&&kind==="redo"){const op=undoStack.at(-1);if(!op?.deltas?.length||!op.deltas.every(d=>Object.is(rowById(d.id)?.notes,d.after))){setTest("bulkHistory","fail","Redo لم يرجع كل الـ5000.");return;}setTest("bulkHistory","pass","Paste 5000 + Undo/Redo كعملية واحدة نجح يدويًا.");saveBaseline();clearHistory();stage="readonly-ready";await prepareReadonly();}
  else if(stage==="delete-undo"&&kind==="undo"){if(data.length!==ROWS){setTest("deleteRestore","fail",`بعد Undo الصفوف=${data.length}`);return;}stage="delete-redo";instruction("Undo رجّع الـ1000 ✅. اضغط Ctrl+Y.");}
  else if(stage==="delete-redo"&&kind==="redo"){if(data.length!==ROWS-DELETE_COUNT){setTest("deleteRestore","fail",`بعد Redo الصفوف=${data.length}`);return;}stage="delete-final-undo";instruction("Redo حذفهم تاني ✅. اضغط Ctrl+Z مرة أخيرة.");}
  else if(stage==="delete-final-undo"&&kind==="undo"){if(data.length!==ROWS){setTest("deleteRestore","fail",`النهاية الصفوف=${data.length}`);return;}setTest("deleteRestore","pass","Delete + Undo + Redo + Undo لـ1000 صف نجح يدويًا.");clearHistory();stage="column-ready";$("addColumn").hidden=false;instruction("اضغط «إضافة عمود مخصص» بنفسك.","بعد ظهوره هنعمل Undo/Redo يدوي.");}
  else if(stage==="column-undo"&&kind==="undo"){const cols=await grid.getColumns();if(cols.some(c=>String(c.prop)==="erpCustom")){setTest("customColumns","fail","Undo لم يشل العمود.");return;}stage="column-redo";instruction("Undo شال العمود ✅. اضغط Ctrl+Y.");}
  else if(stage==="column-redo"&&kind==="redo"){const cols=await grid.getColumns();if(!cols.some(c=>String(c.prop)==="erpCustom")){setTest("customColumns","fail","Redo لم يرجع العمود.");return;}setTest("customColumns","pass","Add + Undo + Redo للعمود المخصص نجح يدويًا.");clearHistory();stage="split-select";instruction("دلوقتي اضغط على اسم Basket في الهيدر لتحديد العمود كله.","بعدها هتعمل Split/Full بنفسك.");}
}

async function saveClick(){$("save").hidden=true;saveBaseline();stage="postsave-undo";instruction("Save تم. اضغط Ctrl+Z بنفسك.","المطلوب Undo يظل شغال بعد Save في نفس الجلسة.");}

async function copy5000(){const s=now();const payload=Array.from({length:BULK},(_,i)=>`MANUAL-5000-${String(i).padStart(5,"0")}`).join("\n");try{await navigator.clipboard.writeText(payload);}catch{const ta=document.createElement("textarea");ta.value=payload;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();}bulkBefore=new Map(data.map(r=>[r.id,r.notes]));stage="bulk-paste-wait";$("copy5000").hidden=true;setTest("bulkHistory","running","5000 قيمة في Clipboard. اختار Notes واضغط Ctrl+V.");instruction("اختار أي خلية ظاهرة في Notes واضغط Ctrl+V بنفسك.","لا تضغط Paste في عمود تاني.");record("copy-5000-only",s,true);}
async function captureBulkPaste(){const s=now(),src=await grid.getSource();const newData=src.map(r=>({...r}));const deltas=[];for(const r of newData){const before=bulkBefore.get(r.id);if(before!==undefined&&!Object.is(before,r.notes))deltas.push({id:r.id,prop:"notes",before,after:r.notes});}data=newData;rebuildIndex();for(const d of deltas){ensureBaseline(d.id,"notes",d.before);refreshDirty(d.id,"notes");}if(deltas.length!==BULK){setTest("bulkHistory","fail",`المتغير فعليًا ${deltas.length.toLocaleString()} بدل 5000.`);record("manual-paste-5000",s,false,`changed=${deltas.length}`);return;}pushHistory({kind:"cells",deltas});stage="bulk-undo";setTest("bulkHistory","running","5000/5000 اتغيروا بإيدك. اضغط Ctrl+Z.");instruction("Paste نجح 5000/5000 ✅. اضغط Ctrl+Z مرة واحدة بنفسك.","لازم يرجع الخمسة آلاف كعملية واحدة.");record("manual-paste-5000",s,true,`changed=${deltas.length}`);}
function failBulk(err){console.error(err);setTest("bulkHistory","fail",String(err?.message||err));}

async function prepareReadonly(){setTest("readonly","running","هنحدد Remaining Amount فقط؛ إنت هتضغط Enter.");readonlyStart=0;readonlyAfter=0;readonlyValue=data[10].remainingAmount;await grid.scrollToRow(10);await grid.setCellsFocus({x:visualColIndex("remainingAmount"),y:10},{x:visualColIndex("remainingAmount"),y:10});grid.focus({preventScroll:true});stage="readonly-wait";instruction("Remaining Amount متحدد. اضغط Enter بنفسك وحاول تكتب.","لو Readonly صحيح Editor مش هيفتح والقيمة مش هتتغير.");}
async function checkReadonly(){await wait(700);const ok=data[10].remainingAmount===readonlyValue&&readonlyStart===0&&readonlyAfter===0;setTest("readonly",ok?"pass":"fail",ok?"Readonly منع فتح وحفظ Editor يدويًا.":`editStart=${readonlyStart}, afterEdit=${readonlyAfter}`);if(ok){stage="delete-ready";$("prepareDelete").hidden=false;instruction("Readonly نجح. اضغط «جهّز تحديد 1000 صف».","بعدها إنت هتضغط Delete بنفسك.");}}

async function prepareDelete(){const index=20000;deletePrepared={index,ids:data.slice(index,index+DELETE_COUNT).map(r=>r.id)};await grid.scrollToRow(index);await grid.setCellsFocus({x:visualColIndex("workOrderNumber"),y:index},{x:visualColIndex("workOrderNumber"),y:index+DELETE_COUNT-1});grid.focus({preventScroll:true});stage="delete-wait";$("prepareDelete").hidden=true;setTest("deleteRestore","running","1000 صف متحددين. اضغط Delete.");instruction("اضغط زر Delete من الكيبورد بنفسك.","كود الـERP التجريبي سيحذف الصفوف المحددة فقط بعد ضغطتك.");}
async function deleteSelected(){const s=now(),{index,ids}=deletePrepared,rows=data.splice(index,DELETE_COUNT);rebuildIndex();grid.source=data.slice();await twoFrames();const idsOk=rows.map(r=>r.id).every((id,i)=>id===ids[i]);pushHistory({kind:"rows",index,rows});stage="delete-undo";record("manual-delete-key-1000",s,idsOk,`rows=${data.length}`);if(!idsOk||data.length!==ROWS-DELETE_COUNT){setTest("deleteRestore","fail","الحذف لم يطابق الـ1000 المحددين.");return;}instruction("Delete حذف 1000 ✅. اضغط Ctrl+Z بنفسك.");}

async function addCustomColumn(){const s=now();$("addColumn").hidden=true;const before=cloneColumns(gridColumns),after=[...cloneColumns(gridColumns),{name:"ERP Custom",prop:"erpCustom",size:140,columnTemplate:headerTemplate}];gridColumns=cloneColumns(after);await grid.updateColumns(gridColumns);await twoFrames();pushHistory({kind:"columns",before,after});stage="column-undo";setTest("customColumns","running","العمود اتضاف. اضغط Ctrl+Z.");instruction("ERP Custom اتضاف ✅. اضغط Ctrl+Z بنفسك.","بعدها Ctrl+Y.");record("manual-add-custom-column",s,true);}

async function splitToggle(){const s=now();$("grid-card").classList.toggle("half");await twoFrames();const ok=isWholeBasket(await grid.getSelectedRange());splitCount++;record("manual-split-toggle",s,ok,`count=${splitCount}`);if(!ok){setTest("split","fail",`Selection اتكسر عند الضغطة ${splitCount}.`);return;}setTest("split","running",`${splitCount}/4 — Basket مازال محدد.`);if(splitCount>=4){$("splitToggle").hidden=true;$("grid-card").classList.remove("half");await twoFrames();setTest("split","pass","4 تغييرات Split/Full يدويًا والتحديد ثابت.");stage="rtl-ready";$("rtlToggle").hidden=false;instruction("Split نجح. اضغط «تحويل إلى RTL» بنفسك.");}else instruction(`تمام ${splitCount}/4. اضغط تبديل Split / Full مرة أخرى.`);}

async function rtlToggle(){const s=now();$("rtlToggle").hidden=true;await createGrid(true);record("manual-rtl-toggle",s,true);stage="rtl-select";setTest("rtl","running","RTL اشتغل. اضغط اسم Basket لتحديد العمود.");instruction("RTL اشتغل. اضغط اسم Basket في الهيدر بنفسك.","بعدها اسحب Scroll بقوة لتحت ولفوق.");}
async function maybeFinishRtl(){if(rtlChecking||scrollEvents-rtlScrollStart<25)return;rtlChecking=true;await wait(120);const ok=isWholeBasket(await grid.getSelectedRange());rtlChecking=false;if(ok){setTest("rtl","pass",`RTL + ${scrollEvents-rtlScrollStart} Scroll events والتحديد ثابت.`);stage="zoom";zoomBaseDpr=window.devicePixelRatio;zoomStep=0;setTest("zoom","running","ابدأ Zoom يدوي: 90% ثم 80% ثم 67% ثم 100%.");instruction("غيّر Zoom المتصفح إلى 90% بنفسك.","بعدها 80% → 67% → 100%. Basket لازم يفضل محدد.");}else setTest("rtl","fail","Basket فقد التحديد أثناء Scroll في RTL.");}

const zoomTargets=[{ratio:.90,label:"90%"},{ratio:.80,label:"80%"},{ratio:.67,label:"67%"},{ratio:1.00,label:"100%"}];
async function checkZoom(){if(stage!=="zoom"||!zoomBaseDpr||zoomStep>=zoomTargets.length)return;const ratio=window.devicePixelRatio/zoomBaseDpr,target=zoomTargets[zoomStep];if(Math.abs(ratio-target.ratio)>.055)return;const ok=isWholeBasket(await grid.getSelectedRange());notes.push({at:Date.now(),type:"zoom-seen",target:target.label,ratio,dpr:window.devicePixelRatio,ok});if(!ok){setTest("zoom","fail",`Selection اتكسر عند ${target.label}.`);stage="done";return;}zoomStep++;if(zoomStep===zoomTargets.length){setTest("zoom","pass","90→80→67→100 يدويًا وBasket فضل محدد.");stage="done";instruction("كل الاختبارات اليدوية خلصت. صدّر JSON وابعتلي الملف.");$("export").disabled=false;}else instruction(`تمام ${target.label} ✅. دلوقتي غيّر Zoom إلى ${zoomTargets[zoomStep].label}.`);}

window.addEventListener("keydown",e=>{const kind=historyShortcut(e);if((e.ctrlKey||e.metaKey))notes.push({at:Date.now(),type:"key",stage,key:e.key,code:e.code,recognized:kind});if(kind&&["edit-undo","edit-redo","postsave-undo","postsave-redo","bulk-undo","bulk-redo","delete-undo","delete-redo","delete-final-undo","column-undo","column-redo"].includes(stage)){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();handleHistory(kind).catch(console.error);return;}if(stage==="readonly-wait"&&e.key==="Enter"){setTimeout(()=>checkReadonly().catch(console.error),0);return;}if(stage==="delete-wait"&&(e.key==="Delete"||e.code==="Delete")){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();deleteSelected().catch(console.error);}},true);
window.addEventListener("resize",()=>{clearTimeout(zoomTimer);zoomTimer=setTimeout(()=>checkZoom().catch(console.error),180);});

$("start").addEventListener("click",()=>start().catch(console.error));
$("save").addEventListener("click",()=>saveClick().catch(console.error));
$("copy5000").addEventListener("click",()=>copy5000().catch(console.error));
$("prepareDelete").addEventListener("click",()=>prepareDelete().catch(console.error));
$("addColumn").addEventListener("click",()=>addCustomColumn().catch(console.error));
$("splitToggle").addEventListener("click",()=>splitToggle().catch(console.error));
$("rtlToggle").addEventListener("click",()=>rtlToggle().catch(console.error));
$("restart").addEventListener("click",()=>location.reload());
$("export").addEventListener("click",()=>{const payload={at:new Date().toISOString(),gate:"RevoGrid Community ERP Gate 4E Manual",version:"4.25.2",rows:data.length,stage,tests,actions,notes,dirty:dirty.size,undo:undoStack.length,redo:redoStack.length,scrollEvents,longTasks:longTasks.length,longTaskMaxMs:longTasks.length?Math.max(...longTasks.map(x=>x.duration)):0,heapMb:performance.memory?performance.memory.usedJSHeapSize/1048576:null,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},userAgent:navigator.userAgent};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`grid-gate4d-manual-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});

if("PerformanceObserver" in window){try{new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({startTime:e.startTime,duration:e.duration});}).observe({type:"longtask",buffered:true});}catch{}}
setInterval(renderMetrics,800);

(async()=>{const s=now();data=generateRows(ROWS);rebuildIndex();gridColumns=baseColumns();await createGrid(false);record("ready-100k",s,true);renderMetrics();$("start").disabled=false;instruction("الشيت جاهز. اضغط «ابدأ الاختبار اليدوي».","من هنا مفيش خطوة هتتعمل بدل منك.");})();
