import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
import { defineCustomElement as defineFilterPanel } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revogr-filter-panel.js/+esm";

defineRevoGrid();
defineFilterPanel?.();

const G=window.GridGate22, ROWS=50000;
let grid, data, pasteTxn=null, pasteEventSeen=false;
const wait=G.twoFrames;
const columns=()=>[
{name:'Work Order',prop:'workOrderNumber',size:150,sortable:true,filter:'string'},
{name:'Work Type',prop:'workTypeCode',size:100,sortable:true,filter:'number'},
{name:'Assignment Date',prop:'assignmentDate',size:135,sortable:true,filter:'string'},
{name:'Work Order Value',prop:'workOrderValue',size:150,sortable:true,filter:'number'},
{name:'Partial Amount',prop:'partialAmount',size:135,sortable:true,filter:'number'},
{name:'Remaining Amount',prop:'remainingAmount',size:150,sortable:true,filter:'number',readonly:true},
{name:'Basket',prop:'basket',size:170,sortable:true,filter:'string'},
{name:'Notes',prop:'notes',size:260,sortable:true,filter:'string'}];
function sx(r){return r?.x??r?.start?.x??null}function sy(r){return r?.y??r?.start?.y??null}function sx1(r){return r?.x1??r?.end?.x??sx(r)}function sy1(r){return r?.y1??r?.end?.y??sy(r)}
async function load(){data=G.generateRows(ROWS);document.getElementById('grid').replaceChildren();await customElements.whenDefined('revo-grid');await customElements.whenDefined('revogr-filter-panel');grid=document.createElement('revo-grid');grid.style.width='100%';grid.style.height='720px';grid.filter=true;grid.columns=columns();grid.source=data;grid.range=true;grid.useClipboard={rangeFill:true};grid.resize=true;grid.rowHeaders=true;grid.rowSize=22;document.getElementById('grid').appendChild(grid);grid.addEventListener('afterpasteapply',()=>{pasteEventSeen=true;G.state.notes.push({at:Date.now(),type:'afterpasteapply'});G.setStatus('Paste event وصل. اضغط فحص Paste.','ok');});grid.addEventListener('aftertrimmed',e=>{G.state.notes.push({at:Date.now(),type:'aftertrimmed',detail:e?.detail??null});});await wait();G.markReady();}
async function selectBasket(){await grid.setCellsFocus({x:6,y:0},{x:6,y:ROWS-1});await wait();const r=await grid.getSelectedRange();G.addCheck('Whole Basket selection',sx(r)===6&&sx1(r)===6&&sy(r)===0&&sy1(r)===ROWS-1,`range=${JSON.stringify(r)}`);}
async function checkFilter(){const visible=await grid.getVisibleSource();const count=visible.length;const allNeed=count>0&&visible.every(r=>r.basket==='NeedLicense');G.addCheck('Community filter result',count===6250&&allNeed,`visible=${count}, allNeedLicense=${allNeed}`);}
async function checkFilterCleared(){const visible=await grid.getVisibleSource();G.addCheck('Community filter clear',visible.length===ROWS,`visible=${visible.length}`);}
async function copyPayload(text){try{await navigator.clipboard.writeText(text);}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}}
async function preparePaste(){const target=100;const source=await grid.getSource();pasteTxn={target,before:source.slice(target,target+5000).map(r=>r.workOrderNumber)};pasteEventSeen=false;await copyPayload(G.payloadText(5000));await grid.scrollToRow(target);await grid.setCellsFocus({x:0,y:target},{x:0,y:target});grid.focus({preventScroll:true});await wait();const r=await grid.getSelectedRange();G.addCheck('Paste target focused',sx(r)===0&&sy(r)===target,`range=${JSON.stringify(r)}`);G.setStatus('جاهز: اضغط Ctrl+V فقط داخل الصفحة، ثم فحص Paste.','ok');}
async function verifyPaste(){if(!pasteTxn)throw new Error('اضغط نسخ + تجهيز Paste أولًا');await wait();const source=await grid.getSource();let bad=0;for(let i=0;i<5000;i++)if(String(source[pasteTxn.target+i]?.workOrderNumber??'')!==String(910000000+i))bad++;G.addCheck('Native clipboard 5000×1',bad===0&&pasteEventSeen,`mismatches=${bad}, afterpasteapply=${pasteEventSeen}`);}
async function endRuleNativePrep(){const target=ROWS-200;pasteTxn={target,endRule:true};pasteEventSeen=false;await copyPayload(G.payloadText(4000,20000));await grid.scrollToRow(target);await grid.setCellsFocus({x:0,y:target},{x:0,y:target});grid.focus({preventScroll:true});await wait();G.setStatus('اختبار نهاية الشيت جاهز: Ctrl+V ثم فحص 4000→200.','ok');}
async function verifyEndRule(){const source=await grid.getSource();let bad=0;for(let i=0;i<200;i++)if(String(source[ROWS-200+i]?.workOrderNumber??'')!==String(910020000+i))bad++;G.addCheck('Native end rule 4000→200',source.length===ROWS&&bad===0&&pasteEventSeen,`rows=${source.length}, mismatches=${bad}, afterpasteapply=${pasteEventSeen}`);}
document.getElementById('select-basket').addEventListener('click',()=>G.measure('select-basket',selectBasket));
document.getElementById('check-filter').addEventListener('click',()=>G.measure('check-community-filter',checkFilter));
document.getElementById('check-clear').addEventListener('click',()=>G.measure('check-community-filter-clear',checkFilterCleared));
document.getElementById('prepare-paste').addEventListener('click',()=>G.measure('prepare-native-paste',preparePaste));
document.getElementById('verify-paste').addEventListener('click',()=>G.measure('verify-native-paste',verifyPaste));
document.getElementById('prepare-end').addEventListener('click',()=>G.measure('prepare-native-end-rule',endRuleNativePrep));
document.getElementById('verify-end').addEventListener('click',()=>G.measure('verify-native-end-rule',verifyEndRule));
document.getElementById('export-metrics').addEventListener('click',G.exportMetrics);
load().catch(e=>{console.error(e);G.setStatus(`Load failed: ${e.message}`,'error')});
