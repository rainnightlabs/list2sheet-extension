import {extractPageDatasets} from "./shared/extractor.js";

const STATE_PREFIX="list2sheet_tabstate_v1_";
const TASK_PREFIX="list2sheet_pagination_task_v1_";

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=value=>String(value??"").replace(/\s+/g," ").trim();

function stateKey(tabId){return STATE_PREFIX+tabId;}
function taskKey(tabId){return TASK_PREFIX+tabId;}

async function getSession(key){
  const result=await chrome.storage.session.get(key);
  return result[key]||null;
}

async function setSession(key,value){
  await chrome.storage.session.set({[key]:value});
}

async function getTask(tabId){return getSession(taskKey(tabId));}
async function saveTask(task){
  task.updatedAt=Date.now();
  await setSession(taskKey(task.tabId),task);
}

function datasetKind(dataset){
  if(!dataset) return "dataset";
  if(dataset.type==="table") return "table";
  return String(dataset.label||"repeated").split("·")[0].trim().toLowerCase();
}

function matchDataset(template,candidates){
  let best=null;
  for(const candidate of candidates||[]){
    if(candidate.type!==template.type) continue;

    let score=0;
    const templateHeaders=new Set(template.headers||[]);
    const candidateHeaders=new Set(candidate.headers||[]);
    const shared=[...templateHeaders].filter(header=>candidateHeaders.has(header)).length;
    score+=(templateHeaders.size ? shared/templateHeaders.size : 0)*100;

    if(template.meta?.signature && candidate.meta?.signature &&
       template.meta.signature===candidate.meta.signature) score+=180;
    if(datasetKind(template)===datasetKind(candidate)) score+=45;

    const templateClasses=new Set(template.source?.itemClasses||[]);
    const candidateClasses=candidate.source?.itemClasses||[];
    if(candidateClasses.length){
      const overlap=candidateClasses.filter(name=>templateClasses.has(name)).length;
      score+=(overlap/candidateClasses.length)*45;
    }

    if(candidate.rows?.length) score+=Math.min(candidate.rows.length,100)*0.2;
    if(!best||score>best.score) best={candidate,score};
  }
  return best&&best.score>=70 ? best.candidate : null;
}

function rowIdentity(row,headers=[]){
  const url=clean(row.URL);
  const title=clean(row.Title);
  const price=clean(row.Price);
  const image=clean(row.Image);
  return url || [title,price,image].filter(Boolean).join("\u241F") ||
    headers.map(header=>clean(row[header])).join("\u241F") ||
    JSON.stringify(row);
}

function mergeRows(existing,incoming,headers=[]){
  const map=new Map();
  for(const row of [...(existing||[]),...(incoming||[])]){
    const key=rowIdentity(row,headers);
    if(key&&!map.has(key)) map.set(key,{...row});
  }
  return [...map.values()];
}

function normalizePrice(value){
  let text=clean(value);
  if(!text) return "";
  text=text.replace(/￥/g,"¥")
    .replace(/^\s*¥\s*/,"¥")
    .replace(/^\s*\$\s*/,"$")
    .replace(/^\s*€\s*/,"€")
    .replace(/^\s*£\s*/,"£");
  if(/^\d[\d,.]*(?:\.\d+)?\s*元$/i.test(text)){
    text="¥"+text.replace(/\s*元$/i,"");
  }
  return text;
}

function stripTracking(value){
  const text=clean(value);
  if(!/^https?:\/\//i.test(text)) return text;
  try{
    const url=new URL(text);
    const exact=new Set(["fbclid","gclid","dclid","msclkid","mc_cid","mc_eid"]);
    for(const key of [...url.searchParams.keys()]){
      const lower=key.toLowerCase();
      if(lower.startsWith("utm_")||exact.has(lower)) url.searchParams.delete(key);
    }
    return url.toString();
  }catch{return text;}
}

function cleanRows(dataset,rows){
  const options=dataset.cleanupOptions||{};
  let next=(rows||[]).map(row=>{
    const out={};
    for(const [key,value] of Object.entries(row)){
      if(key.startsWith("__l2s")){
        out[key]=value;
        continue;
      }
      let v=clean(value);
      if(options.normalizePrice!==false&&key==="Price") v=normalizePrice(v);
      if(options.stripTracking===true&&key==="URL") v=stripTracking(v);
      out[key]=v;
    }
    return out;
  });

  if(options.removeAds!==false){
    next=next.filter(row=>row.__l2sAd!==true && row.__l2sAd!=="true");
  }

  const keywords=String(options.keywords||"")
    .split(/[\n,，]+/)
    .map(value=>clean(value).toLowerCase())
    .filter(Boolean);

  if(keywords.length){
    next=next.filter(row=>{
      const haystack=(dataset.headers||Object.keys(row))
        .filter(key=>!key.startsWith("__"))
        .map(key=>clean(row[key]).toLowerCase())
        .join(" ");
      const matched=keywords.some(keyword=>haystack.includes(keyword));
      return options.keywordMode==="exclude" ? !matched : matched;
    });
  }

  if(options.removeEmpty!==false){
    next=next.filter(row=>(dataset.headers||Object.keys(row))
      .filter(key=>!key.startsWith("__"))
      .some(key=>clean(row[key])));
  }
  if(options.removeMissingTitle===true&&(dataset.headers||[]).includes("Title")){
    next=next.filter(row=>clean(row.Title));
  }
  if(options.removeDuplicates!==false){
    const seen=new Set();
    next=next.filter(row=>{
      const key=rowIdentity(row,dataset.headers||[]);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return next;
}

async function detectNext(tabId,frameId=0){
  const detector=()=>{
    const clean=value=>String(value??"").replace(/\s+/g," ").trim();
    const visible=el=>{
      if(!el||el.nodeType!==1) return false;
      const style=getComputedStyle(el);
      const rect=el.getBoundingClientRect();
      return style.display!=="none" && style.visibility!=="hidden" &&
        Number(style.opacity||1)!==0 && rect.width>0 && rect.height>0;
    };
    const disabled=el=>
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled")==="true" ||
      /disabled|is-disabled|pagination-disabled/i.test(String(el.className||""));

    const cssPath=element=>{
      if(!element||element.nodeType!==1) return "";
      if(element.id) return "#"+CSS.escape(element.id);
      const parts=[];
      let node=element;
      while(node&&node.nodeType===1&&node!==document.documentElement){
        let part=node.tagName.toLowerCase();
        const classes=[...node.classList].filter(name=>name&&name.length<50).slice(0,2);
        if(classes.length) part+=classes.map(name=>"."+CSS.escape(name)).join("");
        const parent=node.parentElement;
        if(parent){
          const same=[...parent.children].filter(child=>child.tagName===node.tagName);
          if(same.length>1) part+=`:nth-of-type(${same.indexOf(node)+1})`;
        }
        parts.unshift(part);
        const candidate=parts.join(" > ");
        try{if(document.querySelectorAll(candidate).length===1) return candidate;}catch{}
        node=parent;
        if(parts.length>=8) break;
      }
      return parts.join(" > ");
    };

    const all=[...document.querySelectorAll("a,button,[role=button],[role=link]")]
      .filter(el=>visible(el)&&!disabled(el));

    const contextScore=el=>{
      let score=0;
      const parent=el.closest(
        '[class*="pagination"],[class*="pager"],[class*="page-"],[class*="pages"],nav,[role="navigation"]'
      );
      if(parent) score+=100;
      const context=[
        el.className||"",
        el.parentElement?.className||"",
        el.parentElement?.parentElement?.className||"",
        el.getAttribute("aria-label")||"",
        el.getAttribute("title")||""
      ].join(" ");
      if(/pagination|pager|page-item|page-link|pages|pagenum|page-number/i.test(context)) score+=90;
      return score;
    };

    const currentCandidates=all.filter(el=>{
      const text=clean(el.innerText||el.textContent);
      const cls=String(el.className||"")+" "+String(el.parentElement?.className||"");
      return /^\d{1,6}$/.test(text) && (
        el.getAttribute("aria-current")==="page" ||
        /(^|\s)(active|current|selected)(\s|$)/i.test(cls) ||
        (disabled(el) && /^\d+$/.test(text))
      );
    });

    let currentPage=0;
    for(const el of currentCandidates){
      const n=Number(clean(el.innerText||el.textContent));
      if(Number.isFinite(n)&&n>0){currentPage=n;break;}
    }

    const scored=[];
    for(const el of all){
      const text=clean(el.innerText||el.textContent);
      const aria=clean(el.getAttribute("aria-label"));
      const title=clean(el.getAttribute("title"));
      const rel=clean(el.getAttribute("rel"));
      const cls=clean(el.className);
      const combined=[text,aria,title,rel,cls].join(" ");
      let score=contextScore(el);

      if(rel.toLowerCase().split(/\s+/).includes("next")) score+=260;
      if(/(^|\s)(next|next page)(\s|$)/i.test(combined)) score+=180;
      if(/下一页|下页|后一页|下一頁|次へ|次頁|다음/i.test(combined)) score+=200;
      if(/pagination.*next|next.*pagination/i.test(combined)) score+=110;
      if(/^(>|›|»|→)$/.test(text)) score+=100;

      const pageNumber=/^\d{1,6}$/.test(text)?Number(text):0;
      if(pageNumber){
        if(currentPage&&pageNumber===currentPage+1) score+=240;
        else if(!currentPage&&pageNumber===2) score+=150;
        else if(currentPage&&pageNumber>currentPage) score+=Math.max(20,100-(pageNumber-currentPage)*10);
      }

      if(/next image|next slide|carousel|banner|video|track|下一张|轮播/i.test(combined)) score-=260;
      if(score<=80) continue;

      let href="";
      if(el.tagName==="A"){
        const raw=el.getAttribute("href")||"";
        if(raw&&!/^javascript:/i.test(raw)&&raw!=="#"&&!raw.startsWith("#")){
          try{
            const resolved=new URL(raw,location.href);
            if(/^https?:$/.test(resolved.protocol)&&resolved.origin===location.origin&&resolved.href!==location.href){
              href=resolved.href;
              score+=30;
            }
          }catch{}
        }
      }

      scored.push({
        score,
        href,
        selector:cssPath(el),
        text:text||aria||title||"Next",
        pageNumber:pageNumber||null
      });
    }

    scored.sort((a,b)=>b.score-a.score);
    return scored[0]||null;
  };

  const run=async target=>{
    const result=await chrome.scripting.executeScript({target,func:detector});
    const candidates=(result||[])
      .map(item=>item.result ? {...item.result,frameId:Number(item.frameId)||0} : null)
      .filter(Boolean)
      .sort((a,b)=>(b.score||0)-(a.score||0));
    return candidates[0]||null;
  };

  try{
    const direct=await run({tabId,frameIds:[Number(frameId)||0]});
    if(direct) return direct;
  }catch(error){
    if(!/No frame with id|frame.*not found|Cannot access/i.test(String(error?.message||error))){
      throw error;
    }
  }

  return run({tabId,allFrames:true});
}

async function clickNextControl(tabId,frameId,selector){
  try{
    const result=await chrome.scripting.executeScript({
      target:{tabId,frameIds:[Number(frameId)||0]},
      args:[selector],
      func:(selector)=>{
        let element=null;
        try{element=document.querySelector(selector);}catch{}
        if(!element) return {clicked:false};
        const beforeUrl=location.href;
        element.scrollIntoView({block:"center",inline:"nearest"});
        element.click();
        return {clicked:true,beforeUrl};
      }
    });
    return result?.[0]?.result||{clicked:false};
  }catch(error){
    if(/No frame with id|frame.*not found|Cannot access/i.test(String(error?.message||error))){
      return {clicked:false,staleFrame:true};
    }
    throw error;
  }
}

function datasetFingerprint(dataset){
  if(!dataset) return "";
  const headers=dataset.headers||[];
  return (dataset.rows||[]).slice(0,3)
    .map(row=>headers.map(header=>clean(row[header])).join("¦"))
    .join("¶");
}

async function waitForDatasetStable(task,template,frameId,beforeFingerprint,expectedRows=0){
  let changeSeen=false;
  let changedAt=0;
  let lastFingerprint="";
  let lastCount=-1;
  let stableHits=0;
  let best=null;

  // Up to ~18 seconds. Most pages settle in 2–4 seconds, but slow Ajax
  // tables should not lose rows merely because the first render was partial.
  for(let attempt=0;attempt<36;attempt++){
    await sleep(500);

    const latest=await getTask(task.tabId);
    if(!latest||latest.status!=="running") return null;
    if(!["waiting_dynamic","waiting_navigation","processing_page"].includes(latest.step)) return null;

    try{
      const scanned=await scanPage(task.tabId,frameId);
      const matched=matchDataset(template,scanned);
      if(!matched) continue;

      const fingerprint=datasetFingerprint(matched);
      const count=matched.rows?.length||0;
      const changed=
        fingerprint!==beforeFingerprint ||
        count!==(template.currentPageRowCount||template.rows?.length||0);

      if(!changeSeen){
        if(!changed) continue;
        changeSeen=true;
        changedAt=Date.now();
        lastFingerprint=fingerprint;
        lastCount=count;
        stableHits=1;
        best=matched;
        continue;
      }

      if(count>=(best?.rows?.length||0)) best=matched;

      if(fingerprint===lastFingerprint && count===lastCount){
        stableHits++;
      }else{
        lastFingerprint=fingerprint;
        lastCount=count;
        stableHits=1;
        best=matched;
      }

      const elapsed=Date.now()-changedAt;
      const reachedExpected=expectedRows>0 && count>=expectedRows;

      // Normal full page: 2 identical scans and >=1.2s after first change.
      if(reachedExpected && stableHits>=2 && elapsed>=1200) return matched;

      // Unknown/short page: require stronger stability so a 7/8/9-row
      // intermediate render is not mistaken for a completed 10-row page.
      if(stableHits>=4 && elapsed>=2600){
        // If we expected more rows, give the page another ~2 seconds before
        // accepting a stable short page (important for the real last page).
        if(expectedRows>0 && count<expectedRows && elapsed<4800) continue;
        return best||matched;
      }
    }catch{
      // During navigation/re-render the frame or table can disappear briefly.
    }
  }

  return best;
}

async function scanPage(tabId,frameId=0){
  const normalizeResults=results=>{
    const datasets=[];
    for(const frameResult of results||[]){
      const resolvedFrameId=Number(frameResult.frameId)||0;
      for(const dataset of frameResult.result||[]){
        dataset.source=dataset.source||{};
        dataset.source.frameId=resolvedFrameId;
        dataset.meta={...(dataset.meta||{}),frameId:resolvedFrameId};
        datasets.push(dataset);
      }
    }
    datasets.sort((a,b)=>(b.score||0)-(a.score||0));
    return datasets;
  };

  try{
    const result=await chrome.scripting.executeScript({
      target:{tabId,frameIds:[Number(frameId)||0]},
      func:extractPageDatasets
    });
    return normalizeResults(result);
  }catch(error){
    // Ajax-heavy pages can destroy/recreate iframes between pagination steps.
    // A stale frame id should trigger a fresh all-frame discovery, not fail the task.
    if(!/No frame with id|frame.*not found|Cannot access/i.test(String(error?.message||error))){
      throw error;
    }
    const fallback=await chrome.scripting.executeScript({
      target:{tabId,allFrames:true},
      func:extractPageDatasets
    });
    return normalizeResults(fallback);
  }
}

async function completeTask(task,status,reason=""){
  task.status=status;
  task.reason=reason;
  task.step="done";
  await saveTask(task);
}

async function navigateToNext(task){
  const latest=await getTask(task.tabId);
  if(!latest||latest.status!=="running") return;

  const state=await getSession(stateKey(task.tabId));
  if(!state||!Array.isArray(state.datasets)||!state.datasets.length){
    await completeTask(latest,"error","The saved dataset session was not available.");
    return;
  }

  const index=Math.max(0,Math.min(Number(state.currentIndex)||0,state.datasets.length-1));
  const template=state.datasets[index];
  const preferredFrameId=Number(template.source?.frameId)||0;

  const next=await detectNext(task.tabId,preferredFrameId);
  if(!next){
    await completeTask(latest,"complete","No further Next-page control was found.");
    return;
  }

  latest.nextLabel=next.text||"Next";
  latest.nextPageNumber=next.pageNumber||null;
  latest.nextSelector=next.selector||"";
  latest.nextUrl=next.href||"";
  const frameId=Number(next.frameId ?? preferredFrameId)||0;
  latest.frameId=frameId;

  // Normal top-frame links are still the most reliable path.
  if(next.href && frameId===0){
    latest.beforePageFingerprint=datasetFingerprint(template);
    latest.step="waiting_navigation";
    await saveTask(latest);
    try{
      await chrome.tabs.update(task.tabId,{url:next.href});
    }catch(error){
      await completeTask(latest,"error","Navigation failed: "+error.message);
    }
    return;
  }

  // JavaScript/Ajax pagination and iframe pagination are clicked in place.
  if(!next.selector){
    await completeTask(latest,"complete","A Next-page control was found, but it could not be activated.");
    return;
  }

  const beforeFingerprint=datasetFingerprint(template);
  latest.beforePageFingerprint=beforeFingerprint;
  latest.step="waiting_dynamic";
  await saveTask(latest);

  let clickResult=await clickNextControl(task.tabId,frameId,next.selector);
  if(!clickResult?.clicked && clickResult?.staleFrame){
    const retry=await detectNext(task.tabId,0);
    if(retry?.selector){
      const retryFrameId=Number(retry.frameId)||0;
      latest.frameId=retryFrameId;
      latest.nextSelector=retry.selector;
      latest.nextLabel=retry.text||latest.nextLabel;
      await saveTask(latest);
      clickResult=await clickNextControl(task.tabId,retryFrameId,retry.selector);
    }
  }
  if(!clickResult?.clicked){
    await completeTask(latest,"error","The detected Next-page control could not be clicked.");
    return;
  }

  const changed=await waitForDatasetStable(
    latest,
    template,
    frameId,
    beforeFingerprint,
    Number(latest.expectedRowsPerPage)||0
  );
  const afterClickTask=await getTask(task.tabId);
  if(!afterClickTask||afterClickTask.status!=="running") return;

  // If tabs.onUpdated already handled a full navigation, do not process twice.
  if(afterClickTask.step!=="waiting_dynamic") return;

  if(!changed){
    await completeTask(afterClickTask,"complete","The Next-page control was clicked, but the selected dataset did not change.");
    return;
  }

  await processLoadedPage(task.tabId,changed);
}

async function processLoadedPage(tabId,preScannedMatch=null){
  let task=await getTask(tabId);
  if(!task||task.status!=="running"||!["waiting_navigation","waiting_dynamic"].includes(task.step)) return;

  task.step="processing_page";
  await saveTask(task);

  const state=await getSession(stateKey(tabId));
  if(!state||!Array.isArray(state.datasets)||!state.datasets.length){
    await completeTask(task,"error","The saved dataset session was not available.");
    return;
  }

  const index=Math.max(0,Math.min(Number(state.currentIndex)||0,state.datasets.length-1));
  const template=state.datasets[index];

  let matched=preScannedMatch;
  if(!matched){
    try{
      matched=await waitForDatasetStable(
        task,
        template,
        template.source?.frameId||0,
        task.beforePageFingerprint||datasetFingerprint(template),
        Number(task.expectedRowsPerPage)||0
      );
    }catch(error){
      await completeTask(task,"error","Could not wait for the next page data: "+error.message);
      return;
    }
  }
  if(!matched){
    await completeTask(task,"complete","The next page loaded, but the selected dataset could not be matched.");
    return;
  }

  const pageRowCount=matched.rows?.length||0;
  template.currentPageRowCount=pageRowCount;
  template.originalRows=mergeRows(
    template.originalRows||template.rows,
    matched.rows,
    template.headers||matched.headers||[]
  );
  template.rows=cleanRows(template,template.originalRows);

  const tab=await chrome.tabs.get(tabId);
  state.url=tab.url||task.nextUrl||state.url;
  state.host=(()=>{
    try{return new URL(state.url).hostname.replace(/^www\./,"").toLowerCase();}
    catch{return state.host||"";}
  })();
  state.savedAt=Date.now();
  state.datasets[index]=template;
  await setSession(stateKey(tabId),state);

  task.pagesVisited+=1;
  task.rowsCollected=template.rows.length;
  task.lastPageRows=pageRowCount;
  task.pageRowCounts=Array.isArray(task.pageRowCounts) ? task.pageRowCounts : [];
  task.pageRowCounts.push(pageRowCount);
  task.currentUrl=state.url;
  task.step="processing";
  await saveTask(task);

  if(task.pagesVisited>=task.pagesTarget){
    await completeTask(task,"complete","Requested page limit reached.");
    return;
  }

  await navigateToNext(task);
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  (async()=>{
    if(message?.type==="LIST2SHEET_PAGINATION_STATUS"){
      sendResponse({ok:true,task:await getTask(message.tabId)});
      return;
    }

    if(message?.type==="LIST2SHEET_PAGINATION_STOP"){
      const task=await getTask(message.tabId);
      if(task&&task.status==="running"){
        task.status="stopped";
        task.reason="Stopped by user.";
        task.step="done";
        await saveTask(task);
      }
      sendResponse({ok:true,task});
      return;
    }

    if(message?.type==="LIST2SHEET_PAGINATION_START"){
      const tabId=Number(message.tabId);
      const pages=Math.max(1,Math.min(Number(message.pages)||5,10));
      const state=await getSession(stateKey(tabId));
      if(!state||!Array.isArray(state.datasets)||!state.datasets.length){
        sendResponse({ok:false,error:"Scan the page first so List2Sheet has a dataset to continue."});
        return;
      }

      const tab=await chrome.tabs.get(tabId);
      if(!tab?.url||state.url!==tab.url){
        sendResponse({ok:false,error:"The saved scan belongs to a different page. Scan this page again first."});
        return;
      }

      const index=Math.max(0,Math.min(Number(state.currentIndex)||0,state.datasets.length-1));
      const dataset=state.datasets[index];
      const task={
        tabId,
        status:"running",
        step:"processing",
        pagesTarget:pages,
        pagesVisited:0,
        rowsCollected:dataset.rows?.length||0,
        expectedRowsPerPage:dataset.rows?.length||0,
        pageRowCounts:[],
        lastPageRows:0,
        startUrl:tab.url,
        currentUrl:tab.url,
        startedAt:Date.now(),
        updatedAt:Date.now()
      };
      await saveTask(task);

      await navigateToNext(task);
      const started=await getTask(tabId);
      if(started?.status==="complete" && started?.pagesVisited===0){
        sendResponse({ok:false,error:started.reason||"No Next-page control was detected on this page."});
        return;
      }
      sendResponse({ok:true,task:started});
      return;
    }

    if(message?.type==="LIST2SHEET_PICK_RESULT"){
      const tabId=sender?.tab?.id;
      if(!tabId||!message.dataset){
        sendResponse({ok:false,error:"Picker result did not include a tab or dataset."});
        return;
      }

      const tab=await chrome.tabs.get(tabId);
      const frameId=Number(sender.frameId)||0;
      const dataset=message.dataset;
      dataset.source=dataset.source||{};
      dataset.source.frameId=frameId;
      dataset.meta={...(dataset.meta||{}),frameId,signature:dataset.meta?.signature||"manual-pick"};
      dataset.originalRows=(dataset.rows||[]).map(row=>({...row}));
      dataset.cleanupOptions={
        removeDuplicates:true,
        removeEmpty:true,
        removeMissingTitle:false,
        normalizePrice:true,
        stripTracking:false,
        removeAds:true,
        keywords:"",
        keywordMode:"include"
      };
      dataset.columnConfig=(dataset.headers||[]).map((source,index)=>({
        source,label:source,enabled:true,order:index
      }));

      let host="";
      try{host=new URL(tab.url||"").hostname.replace(/^www\./,"").toLowerCase();}catch{}

      const existing=await getSession(stateKey(tabId));
      const preserved=(existing&&existing.url===tab.url&&Array.isArray(existing.datasets))
        ? existing.datasets.filter(item=>item?.meta?.manual!==true)
        : [];

      await setSession(stateKey(tabId),{
        url:tab.url||"",
        host,
        currentIndex:0,
        previewLimit:existing?.previewLimit||"12",
        datasets:[dataset,...preserved],
        savedAt:Date.now()
      });

      await chrome.action.setBadgeText({tabId,text:"✓"}).catch(()=>{});
      await chrome.action.setBadgeBackgroundColor({tabId,color:"#57d39b"}).catch(()=>{});
      setTimeout(()=>chrome.action.setBadgeText({tabId,text:""}).catch(()=>{}),2500);

      sendResponse({ok:true,rows:dataset.rows?.length||0});
      return;
    }

    sendResponse({ok:false,error:"Unknown message."});
  })().catch(error=>sendResponse({ok:false,error:error.message}));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{
  if(changeInfo.status!=="complete") return;
  (async()=>{
    const task=await getTask(tabId);
    if(!task||task.status!=="running"||task.step!=="waiting_navigation") return;
    await processLoadedPage(tabId);
  })().catch(async error=>{
    const task=await getTask(tabId);
    if(task&&task.status==="running"){
      await completeTask(task,"error",error.message);
    }
  });
});
