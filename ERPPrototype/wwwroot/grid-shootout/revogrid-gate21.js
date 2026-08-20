import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
defineRevoGrid();
const G=window.GridGate21,ROWS=50000;let grid,data,pasteTxn=null;
const columns=()=>[
{name:'Work Order',prop:'workOrderNumber',size:150,sortable:true,filter:'string'},
{name:'Work Type',prop:'workTypeCode',size:100,sortable:true,filter:'number'},
{name:'Assignment Date',prop:'assignmentDate',size:135,sortable:true,filter:'string'},
{name:'Work Order Value',prop:'workOrderValue',size:150,sortable:true,filter:'number'},
{name:'Partial Amount',prop:'partialAmount',size:135,sortable:true,filter:'number'},
{name:'Remaining Amount',prop:'remainingAmount',size:150,sortable:true,filter:'number',readonly:true},
{name:'Basket',prop:'basket',size:170,sortable:true,filter:'string'},
{name:'Notes',prop:'notes',size:260,sortable:true,filter:'string'}];
const wait=G.twoFrames;
function selX(r){return r?.x??r?.start?.x??null}function selY(r){return r?.y??r?.start?.y??null}function selX1(r){return r?.x1??r?.end?.x??selX(r)}function selY1(r){return r?.y1??r?.end?.y??selY(r)}
function once(el,name,timeout=6000){return new Promise((resolve,reject)=>{let t;const done=e=>{clearTimeout(t);el.removeEventListener(name,done);resolve(e)};el.addEventListener(name,done,{once:true});t=setTimeout(()=>{el.removeEventListener(name,done);reject(new Error(`${name} timeout`))},timeout);});}
async function load(){data=G.generateRows(ROWS);document.getElementById('grid').replaceChildren();grid=document.createElement('revo-grid');grid.style.width='100%';grid.style.height='720px';grid.columns=columns();grid.source=data;grid.range=true;grid.useClipboard={rangeFill:true};grid.resize=true;grid.rowHeaders=true;grid.rowSize=22;grid.filter={collection:{}};document.getElementById('grid').appendChild(grid);await customElements.whenDefined('revo-grid');await wait();G.markReady('RevoGrid 2.1','4.25.2',ROWS);}
async function selectBasket(){await grid.setCellsFocus({x:6,y:0},{x:6,y:ROWS-1});await wait();return checkBasket();}
async function checkBasket(){const r=await grid.getSelectedRange(),ok=selX(r)===6&&selX1(r)===6&&selY(r)===0&&selY1(r)===ROWS-1;G.addCheck('Basket selection',ok,`range=${JSON.stringify(r)}`);return ok;}
async function selectionStress(){await selectBasket();const a=[0,ROWS-1,2500,47500,12500,37500,25000];for(let i=0;i<500;i++)await grid.scrollToRow(a[i%a.length]);await wait();return checkBasket();}
async function applyFilterAndRead(){const event=once(grid,'aftertrimmed');grid.filter={collection:{basket:{type:'eq',value:'NeedLicense'}}};await event;await wait();const visible=await grid.getVisibleSource();return visible.length;}
async function clearFilter(){const event=once(grid,'aftertrimmed').catch(()=>null);grid.filter={collection:{}};await event;await wait();}
async function filterStress(){for(let i=0;i<5;i++){const visible=await applyFilterAndRead();G.addCheck(`Filter cycle ${i+1}`,visible===6250,`visible=${visible}, expected=6250`);await clearFilter();const all=(await grid.getVisibleSource()).length;G.addCheck(`Filter clear ${i+1}`,all===ROWS,`visible=${all}`);}}
async function runAuto(){G.setStatus('جاري اختبار RevoGrid…');await G.measure('selection-scroll-500',selectionStress);await G.measure('filter-event-5',filterStress);const bad=G.state.checks.filter(x=>!x.passed).length;G.setStatus(bad?`انتهى: ${bad} فشل`:'RevoGrid 2.1: PASS',bad?'error':'ok');}
async function copyPayload(text){try{await navigator.clipboard.writeText(text);}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}}
async function prepareCopy(){const target=100;const source=await grid.getSource();pasteTxn={target,before:source.slice(target,target+5000).map(r=>r.workOrderNumber)};await copyPayload(G.payloadText(5000));await grid.scrollToRow(target);await grid.setCellsFocus({x:0,y:target},{x:0,y:target});grid.focus({preventScroll:true});await wait();const focused=await grid.getSelectedRange();G.addCheck('Paste target refocused',selX(focused)===0&&selY(focused)===target,`range=${JSON.stringify(focused)}`);G.setStatus('جاهز. اضغط Ctrl+V الآن ثم فحص Paste.','ok');}
async function verifyPaste(){if(!pasteTxn)throw new Error('اضغط نسخ + تجهيز Paste أولًا');await wait();const source=await grid.getSource();let bad=0;for(let i=0;i<5000;i++)if(String(source[pasteTxn.target+i]?.workOrderNumber??'')!==String(910000000+i))bad++;G.addCheck('Native clipboard 5000×1',bad===0,`mismatches=${bad}`);}
document.getElementById('run-auto').addEventListener('click',()=>G.measure('gate21-auto',runAuto));document.getElementById('prepare-copy').addEventListener('click',()=>G.measure('prepare-native-paste',prepareCopy));document.getElementById('verify-paste').addEventListener('click',()=>G.measure('verify-native-paste',verifyPaste));document.getElementById('export-metrics').addEventListener('click',G.exportMetrics);load().catch(e=>{console.error(e);G.setStatus(`Load failed: ${e.message}`,'error')});
