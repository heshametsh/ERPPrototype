(function () {
  const state = {
    candidate: 'unknown', version: 'unknown', rowCount: 0,
    startedAt: performance.now(), readyAt: null,
    longTasks: 0, longTaskTotalMs: 0, longTaskMaxMs: 0,
    frameCount: 0, frameGapOver50: 0, maxFrameGapMs: 0,
    wheelEvents: 0, scrollEvents: 0, lastFrameAt: performance.now(),
    actions: [], checks: [], notes: [],
  };
  const fields = ['workOrderNumber','workTypeCode','assignmentDate','workOrderValue','partialAmount','remainingAmount','basket','notes'];
  let statusElm, metricsElm, checksElm;

  function randomBasket(i) {
    const baskets = ['NeedLicense','UnderExecution','InspectionBasket','ModifyEstimate','Engineering','IssueReturn','InvoiceBasket','FinanceBasket'];
    return baskets[i % baskets.length];
  }
  function generateRows(count) {
    const rows = new Array(count);
    for (let i=0;i<count;i++) {
      const workOrderValue = 10000 + ((i * 7919) % 490000);
      const partial = i % 4 === 0 ? Math.round(workOrderValue * .35) : 0;
      rows[i] = {
        id:i+1, workOrderNumber:String(233000000+i), workTypeCode:[401,402,801,802][i%4],
        assignmentDate:`2026-${String((i%12)+1).padStart(2,'0')}-${String((i%28)+1).padStart(2,'0')}`,
        workOrderValue, partialAmount:partial, remainingAmount:workOrderValue-partial,
        basket:randomBasket(i), notes:`Row ${i+1} — ERP Gate 2`,
      };
    }
    return rows;
  }
  function payloadMatrix(rows=1000, cols=6, seed=0) {
    const out = new Array(rows);
    for (let r=0;r<rows;r++) {
      const n = r + seed;
      const vals = [
        String(900000000+n), String([401,402,801,802][n%4]),
        `2026-${String((n%12)+1).padStart(2,'0')}-${String((n%28)+1).padStart(2,'0')}`,
        String(10000+n*17), String(n%3===0?2500:0), String(7500+n*17),
      ];
      out[r] = vals.slice(0,cols);
    }
    return out;
  }
  function payloadText(rows, cols, seed=0) { return payloadMatrix(rows, cols, seed).map(r=>r.join('\t')).join('\n'); }
  async function copyPayload(rows, cols) {
    const text = payloadText(rows, cols);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setStatus(`تم نسخ ${rows.toLocaleString()}×${cols}.`, 'ok');
  }
  function twoFrames() { return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }
  function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
  function setStatus(message, kind) {
    statusElm ||= document.getElementById('bench-status');
    if (!statusElm) return;
    statusElm.textContent=message; statusElm.className=`status${kind?` ${kind}`:''}`;
  }
  function addCheck(name, passed, detail='') {
    state.checks.push({at:Date.now(),name,passed:!!passed,detail});
    setStatus(`${passed?'PASS':'FAIL'} — ${name}${detail?` — ${detail}`:''}`, passed?'ok':'error');
    render(); return !!passed;
  }
  async function measure(name, fn) {
    const t=performance.now();
    try { const result=await fn(); const ms=performance.now()-t; state.actions.push({at:Date.now(),name,ms,ok:true}); render(); return {result,ms}; }
    catch(e) { const ms=performance.now()-t; state.actions.push({at:Date.now(),name,ms,ok:false,error:String(e?.message||e)}); addCheck(name,false,String(e?.message||e)); throw e; }
  }
  function resetMetrics() {
    Object.assign(state,{startedAt:performance.now(),readyAt:null,longTasks:0,longTaskTotalMs:0,longTaskMaxMs:0,frameCount:0,frameGapOver50:0,maxFrameGapMs:0,wheelEvents:0,scrollEvents:0,lastFrameAt:performance.now(),actions:[],checks:[],notes:[]});
    setStatus('تم تصفير القياسات. ابدأ Gate 2.'); render();
  }
  function markReady(candidate,version,rowCount) {
    state.candidate=candidate; state.version=version; state.rowCount=rowCount; state.readyAt=performance.now();
    state.notes.push({at:Date.now(),type:'ready',ms:state.readyAt-state.startedAt,rows:rowCount});
    setStatus(`${candidate} جاهز على ${rowCount.toLocaleString()} صف.`, 'ok'); render();
  }
  function heapMb(){ return performance.memory?performance.memory.usedJSHeapSize/1024/1024:null; }
  function snapshot(){ return {at:new Date().toISOString(),gate:'ERP Grid Finalists Gate 2 Torture',candidate:state.candidate,version:state.version,rows:state.rowCount,readyMs:state.readyAt?state.readyAt-state.startedAt:null,longTasks:state.longTasks,longTaskTotalMs:state.longTaskTotalMs,longTaskMaxMs:state.longTaskMaxMs,frameCount:state.frameCount,frameGapOver50:state.frameGapOver50,maxFrameGapMs:state.maxFrameGapMs,wheelEvents:state.wheelEvents,scrollEvents:state.scrollEvents,heapMb:heapMb(),domNodes:document.getElementsByTagName('*').length,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},userAgent:navigator.userAgent,actions:state.actions.slice(),checks:state.checks.slice(),notes:state.notes.slice()}; }
  function exportMetrics(){ const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`grid-gate2-${state.candidate.replace(/\s+/g,'-').toLowerCase()}-${Date.now()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function render(){
    metricsElm ||= document.getElementById('bench-metrics'); checksElm ||= document.getElementById('check-results');
    if(metricsElm){ const heap=heapMb(), latest=state.actions.at(-1); metricsElm.innerHTML=`
      <div>Ready</div><strong>${state.readyAt?`${(state.readyAt-state.startedAt).toFixed(1)} ms`:'—'}</strong>
      <div>Long tasks</div><strong>${state.longTasks}</strong><div>Long total</div><strong>${state.longTaskTotalMs.toFixed(0)} ms</strong>
      <div>Worst long</div><strong>${state.longTaskMaxMs.toFixed(1)} ms</strong><div>Frame gaps &gt;50</div><strong>${state.frameGapOver50}</strong>
      <div>Worst frame</div><strong>${state.maxFrameGapMs.toFixed(1)} ms</strong><div>Wheel</div><strong>${state.wheelEvents}</strong>
      <div>Scroll</div><strong>${state.scrollEvents}</strong><div>JS heap</div><strong>${heap==null?'n/a':`${heap.toFixed(1)} MB`}</strong>
      <div>DOM nodes</div><strong>${document.getElementsByTagName('*').length}</strong><div>Last</div><strong>${latest?`${latest.name}: ${latest.ms.toFixed(1)} ms`:'—'}</strong>`; }
    if(checksElm){ const recent=state.checks.slice(-14).reverse(); checksElm.innerHTML=recent.length?recent.map(c=>`<div class="check ${c.passed?'pass':'fail'}"><b>${c.passed?'PASS':'FAIL'}</b> ${escapeHtml(c.name)}<span>${escapeHtml(c.detail)}</span></div>`).join(''):'<div class="small">لا توجد نتائج بعد.</div>'; }
  }
  function frameLoop(now){ const gap=now-state.lastFrameAt; state.lastFrameAt=now; state.frameCount++; if(gap>50){state.frameGapOver50++;state.maxFrameGapMs=Math.max(state.maxFrameGapMs,gap);} requestAnimationFrame(frameLoop); }
  try{ new PerformanceObserver(list=>{for(const e of list.getEntries()){state.longTasks++;state.longTaskTotalMs+=e.duration;state.longTaskMaxMs=Math.max(state.longTaskMaxMs,e.duration);}}).observe({type:'longtask',buffered:true}); }catch{}
  document.addEventListener('wheel',()=>state.wheelEvents++,{capture:true,passive:true});
  document.addEventListener('scroll',()=>state.scrollEvents++,{capture:true,passive:true});
  requestAnimationFrame(frameLoop); setInterval(render,500);

  function bind(adapter){
    const rows=document.getElementById('row-count'); let split=false, rtl=false;
    document.getElementById('reload-grid')?.addEventListener('click',()=>adapter.load(Number(rows.value),rtl));
    document.getElementById('run-torture')?.addEventListener('click',async()=>{const b=document.getElementById('run-torture');try{b.disabled=true;b.textContent='جاري الضغط…';await measure('gate2-torture',()=>adapter.runTorture());}finally{b.disabled=false;b.textContent='تشغيل ضغط Gate 2';}});
    document.getElementById('toggle-split')?.addEventListener('click',async()=>{split=!split;document.getElementById('grid-card')?.classList.toggle('is-split',split);window.dispatchEvent(new Event('resize'));state.notes.push({at:Date.now(),type:'split',enabled:split});await adapter.afterResize?.();});
    document.getElementById('toggle-rtl')?.addEventListener('click',async()=>{rtl=!rtl;await adapter.load(Number(rows.value),rtl,false);state.notes.push({at:Date.now(),type:'rtl',enabled:rtl});});
    document.getElementById('reset-metrics')?.addEventListener('click',resetMetrics);
    document.getElementById('export-metrics')?.addEventListener('click',exportMetrics);
    document.getElementById('select-column')?.addEventListener('click',()=>measure('select-whole-basket',()=>adapter.selectWholeBasket()));
    document.getElementById('check-column')?.addEventListener('click',()=>measure('check-whole-basket',()=>adapter.checkWholeBasket()));
    document.getElementById('prepare-paste')?.addEventListener('click',()=>measure('prepare-paste-5000x1',()=>adapter.preparePaste5000x1()));
    document.getElementById('copy-payload')?.addEventListener('click',()=>copyPayload(5000,1));
    document.getElementById('verify-paste')?.addEventListener('click',()=>measure('verify-paste-5000x1',()=>adapter.verifyPaste5000x1()));
    document.getElementById('readonly-test')?.addEventListener('click',()=>measure('readonly',()=>adapter.readonlyTest()));
  }
  window.GridGate2={state,fields,generateRows,payloadMatrix,payloadText,copyPayload,twoFrames,sleep,setStatus,addCheck,measure,resetMetrics,markReady,snapshot,exportMetrics,bind};
})();
