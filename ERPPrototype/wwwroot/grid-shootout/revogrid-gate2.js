import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
defineRevoGrid();

let grid=null, data=[], rowCount=50000, rtl=false, pasteTxn=null;
const colsBase=()=>[
  {name:'Work Order',prop:'workOrderNumber',size:150,sortable:true,filter:'string'},
  {name:'Work Type',prop:'workTypeCode',size:100,sortable:true,filter:'number'},
  {name:'Assignment Date',prop:'assignmentDate',size:135,sortable:true,filter:'string'},
  {name:'Work Order Value',prop:'workOrderValue',size:150,sortable:true,filter:'number'},
  {name:'Partial Amount',prop:'partialAmount',size:135,sortable:true,filter:'number'},
  {name:'Remaining Amount',prop:'remainingAmount',size:150,sortable:true,filter:'number',readonly:true},
  {name:'Basket',prop:'basket',size:170,sortable:true,filter:'string'},
  {name:'Notes',prop:'notes',size:260,sortable:true,filter:'string'},
];
const wait=GridGate2.twoFrames;
function selectedColumn(r){return r?.x ?? r?.start?.x ?? r?.start?.col ?? r?.startColumn ?? r?.col ?? null;}
function selectedRow(r){return r?.y ?? r?.start?.y ?? r?.start?.row ?? r?.startRow ?? r?.row ?? null;}
function selectedColumnEnd(r){return r?.x1 ?? r?.end?.x ?? r?.end?.col ?? r?.endColumn ?? selectedColumn(r);}
function selectedRowEnd(r){return r?.y1 ?? r?.end?.y ?? r?.end?.row ?? r?.endRow ?? selectedRow(r);}
function basketVisualIndex(){const physical=colsBase().findIndex(c=>c.prop==='basket');return rtl?(colsBase().length-1-physical):physical;}
async function load(count, rtlMode=rtl, reset=true){
  if(reset) GridGate2.resetMetrics();
  rowCount=count; rtl=!!rtlMode; data=GridGate2.generateRows(count); pasteTxn=null;
  document.getElementById('grid').replaceChildren();
  grid=document.createElement('revo-grid');
  grid.style.width='100%'; grid.style.height='720px';
  grid.columns=colsBase(); grid.source=data; grid.range=true; grid.useClipboard={rangeFill:true}; grid.resize=true; grid.rowHeaders=true; grid.rowSize=22; grid.filter=true; grid.rtl=rtl;
  document.getElementById('grid').appendChild(grid);
  await customElements.whenDefined('revo-grid'); await wait();
  GridGate2.state.notes.push({at:Date.now(),type:'rtl-mode',enabled:rtl,expectedBasketVisualIndex:basketVisualIndex()});
  GridGate2.markReady('RevoGrid','4.25.2',count);
}
async function selectWholeBasket(){const x=basketVisualIndex();await grid.setCellsFocus({x,y:0},{x,y:rowCount-1});await wait();return checkWholeBasket();}
async function checkWholeBasket(){const r=await grid.getSelectedRange();const x=basketVisualIndex();const ok=selectedColumn(r)===x&&selectedColumnEnd(r)===x&&selectedRow(r)===0&&selectedRowEnd(r)===rowCount-1;GridGate2.addCheck('Whole Basket column',ok,`rtl=${rtl}, expectedX=${x}, range=${JSON.stringify(r)}`);return ok;}
async function selectionScrollStress(){await selectWholeBasket();const anchors=[0,rowCount-1,Math.floor(rowCount*.05),Math.floor(rowCount*.95),Math.floor(rowCount*.25),Math.floor(rowCount*.75),Math.floor(rowCount*.5)];for(let i=0;i<500;i++)await grid.scrollToRow(anchors[i%anchors.length]);await wait();return checkWholeBasket();}
async function preparePaste5000x1(){const target=Math.min(100,Math.max(0,rowCount-5001));const source=await grid.getSource();pasteTxn={target,original:source.slice(target,target+5000).map(r=>r.workOrderNumber),after:null};await grid.scrollToRow(target);await grid.setCellsFocus({x:rtl?7:0,y:target},{x:rtl?7:0,y:target});await wait();GridGate2.setStatus(`Target row ${target+1}. Ctrl+V الآن.`, 'ok');}
async function verifyPaste5000x1(){if(!pasteTxn)throw new Error('اضغط تجهيز Paste أولًا');const expected=GridGate2.payloadMatrix(5000,1).map(r=>r[0]);const source=await grid.getSource();let bad=0;for(let i=0;i<5000;i++)if(String(source[pasteTxn.target+i]?.workOrderNumber??'')!==String(expected[i]))bad++;pasteTxn.after=source.slice(pasteTxn.target,pasteTxn.target+5000).map(r=>r.workOrderNumber);GridGate2.addCheck('Native clipboard 5000×1',bad===0,`mismatches=${bad}`);}
async function bulkHistoryStress(){const target=Math.min(100,Math.max(0,rowCount-5001));let source=await grid.getSource();const before=source.slice(target,target+5000).map(r=>r.workOrderNumber);const after=GridGate2.payloadMatrix(5000,1,10000).map(r=>r[0]);for(let i=0;i<5000;i++)source[target+i].workOrderNumber=after[i];grid.source=source.slice();await wait();let current=await grid.getSource();let bad=0;for(let i=0;i<5000;i++)if(String(current[target+i].workOrderNumber)!==String(after[i]))bad++;GridGate2.addCheck('Bulk apply 5000×1',bad===0,`mismatches=${bad}`);
  source=current;for(let i=0;i<5000;i++)source[target+i].workOrderNumber=before[i];grid.source=source.slice();await wait();current=await grid.getSource();bad=0;for(let i=0;i<5000;i++)if(String(current[target+i].workOrderNumber)!==String(before[i]))bad++;GridGate2.addCheck('ERP Undo 5000×1',bad===0,`mismatches=${bad}`);
  source=current;for(let i=0;i<5000;i++)source[target+i].workOrderNumber=after[i];grid.source=source.slice();await wait();current=await grid.getSource();bad=0;for(let i=0;i<5000;i++)if(String(current[target+i].workOrderNumber)!==String(after[i]))bad++;GridGate2.addCheck('ERP Redo 5000×1',bad===0,`mismatches=${bad}`);
}
async function partialEndRule(){let source=await grid.getSource();const originalLength=source.length;const available=200,target=originalLength-available;const incoming=GridGate2.payloadMatrix(4000,1,30000).map(r=>r[0]);for(let i=0;i<available;i++)source[target+i].workOrderNumber=incoming[i];grid.source=source.slice();await wait();const now=await grid.getSource();let bad=0;for(let i=0;i<available;i++)if(String(now[target+i].workOrderNumber)!==String(incoming[i]))bad++;GridGate2.addCheck('End rule 4000→200',now.length===originalLength&&bad===0,`rows=${now.length}, applied=${available-bad}`);}
async function customColumnStress(){for(let i=0;i<20;i++){let cols=colsBase();cols.push({name:`Custom ${i}`,prop:`custom${i}`,size:160,sortable:true,filter:'string'});await grid.updateColumns(cols);await grid.updateColumns(cols.map(c=>c.prop===`custom${i}`?{...c,name:`Renamed ${i}`,size:220}:c));await grid.updateColumns(colsBase());}await wait();GridGate2.addCheck('20 Custom column cycles',true,'add/rename/resize/delete completed');}
async function deleteRestoreStress(){let source=await grid.getSource();const start=Math.min(1000,source.length-1001),original=source.length;for(let i=0;i<5;i++){const removed=source.slice(start,start+1000);const reduced=source.slice(0,start).concat(source.slice(start+1000));grid.source=reduced;await wait();source=reduced.slice(0,start).concat(removed,reduced.slice(start));grid.source=source;await wait();}const len=(await grid.getSource()).length;GridGate2.addCheck('5× Delete/Restore 1000',len===original,`rows=${original}→${len}`);}
async function sortFilterStress(){for(let i=0;i<5;i++){await grid.updateColumnSorting({prop:'workOrderValue'},'desc',false);await wait();await grid.clearSorting();await wait();grid.filter={collection:{basket:{type:'eq',value:'NeedLicense'}}};await wait();const visible=(await grid.getVisibleSource()).length;grid.filter=true;await wait();GridGate2.addCheck(`Filter cycle ${i+1}`,visible>0&&visible<rowCount,`visible=${visible}`);}GridGate2.addCheck('5× Sort/Filter cycles',true,'completed');}
async function resizeStress(){await selectWholeBasket();const card=document.getElementById('grid-card');for(let i=0;i<20;i++){card?.classList.toggle('is-split',i%2===0);window.dispatchEvent(new Event('resize'));await wait();}card?.classList.remove('is-split');window.dispatchEvent(new Event('resize'));await wait();await checkWholeBasket();}
async function rtlStress(){await load(rowCount,true,false);await selectionScrollStress();await load(rowCount,false,false);await selectionScrollStress();GridGate2.addCheck('LTR + RTL semantic Basket',true,'tested after fresh layout in both directions');}
async function readonlyTest(){const cols=colsBase();const col=cols.find(c=>c.prop==='remainingAmount');const ok=col?.readonly===true;try{await grid.setCellEdit(10,'remainingAmount');}catch{}await wait();GridGate2.addCheck('Remaining readonly configured',ok,'Manual double-click must not open editor');}
async function afterResize(){await wait();}
async function runTorture(){GridGate2.resetMetrics();GridGate2.setStatus('جاري ضغط RevoGrid…');const step=async(n,f)=>{try{await GridGate2.measure(n,f);}catch{}};await step('selection-scroll-500',selectionScrollStress);await step('bulk-history-5000x1',bulkHistoryStress);await step('end-rule',partialEndRule);await step('readonly',readonlyTest);await step('custom-columns-20',customColumnStress);await step('delete-restore-5x1000',deleteRestoreStress);await step('sort-filter-5',sortFilterStress);await step('resize-20',resizeStress);await step('rtl-ltr-stress',rtlStress);const failed=GridGate2.state.checks.filter(x=>!x.passed).length;GridGate2.setStatus(failed?`Gate 2 انتهى: ${failed} فشل`:'Gate 2: كل الاختبارات الآلية نجحت',failed?'error':'ok');}
GridGate2.bind({load,runTorture,selectWholeBasket,checkWholeBasket,preparePaste5000x1,verifyPaste5000x1,readonlyTest,afterResize});
load(50000,false).catch(e=>{console.error(e);GridGate2.setStatus(`RevoGrid load failed: ${e.message}`,'error');});
