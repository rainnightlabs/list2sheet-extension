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
      let v=clean(value);
      if(options.normalizePrice!==false&&key==="Price") v=normalizePrice(v);
      if(options.stripTracking===true&&key==="URL") v=stripTracking(v);
      out[key]=v;
    }
    return out;
  });

  if(options.removeEmpty!==false){
    next=next.filter(row=>Object.values(row).some(value=>clean(value)));
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

async function detectNext(tabId){
  const result=await chrome.scripting.executeScript({
    target:{tabId},
    func:()=>{
      const clean=value=>String(value??"").replace(/\s+/g," ").trim();
      const disabled=el =>
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled")==="true" ||
        /disabled|is-disabled|pagination-disabled/i.test(el.className||"");

      const candidates=[...document.querySelectorAll(
        'a[rel="next"],a,button,[role="button"]'
      )].filter(el=>!disabled(el));

      const scored=[];
      for(const el of candidates){
        const text=clean(el.innerText||el.textContent);
        const aria=clean(el.getAttribute("aria-label"));
        const title=clean(el.getAttribute("title"));
        const rel=clean(el.getAttribute("rel"));
        const cls=clean(el.className);
        const combined=[text,aria,title,rel,cls].join(" ");

        let score=0;
        if(rel.toLowerCase().split(/\s+/).includes("next")) score+=200;
        if(/(^|\s)(next|next page)(\s|$)/i.test(combined)) score+=120;
        if(/下一页|下页|后一页|下一頁|次へ|次頁|다음/i.test(combined)) score+=140;
        if(/pagination.*next|next.*pagination/i.test(combined)) score+=80;
        if(/^(>|›|»|→)$/.test(text)) score+=45;

        // Avoid obvious non-pagination controls.
        if(/next image|next slide|carousel|banner|video|track/i.test(combined)) score-=120;

        if(score<=0) continue;

        const href=el.tagName==="A" ? el.href : "";
        scored.push({
          score,
          href,
          text:text||aria||title||"Next"
        });
      }

      scored.sort((a,b)=>b.score-a.score);
      const best=scored[0];
      if(!best) return null;

      if(best.href){
        try{
          const current=new URL(location.href);
          const next=new URL(best.href,current.href);
          if(next.origin!==current.origin) return null;
          if(next.href===current.href) return null;
          return {href:next.href,label:best.text};
        }catch{return null;}
      }

      return null;
    }
  });
  return result?.[0]?.result||null;
}

async function scanPage(tabId){
  const result=await chrome.scripting.executeScript({
    target:{tabId},
    func:extractPageDatasets
  });
  return result?.[0]?.result||[];
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

  const next=await detectNext(task.tabId);
  if(!next?.href){
    await completeTask(latest,"complete","No further same-site Next-page link was found.");
    return;
  }

  latest.step="waiting_navigation";
  latest.nextUrl=next.href;
  latest.nextLabel=next.label;
  await saveTask(latest);

  try{
    await chrome.tabs.update(task.tabId,{url:next.href});
  }catch(error){
    await completeTask(latest,"error","Navigation failed: "+error.message);
  }
}

async function processLoadedPage(tabId){
  let task=await getTask(tabId);
  if(!task||task.status!=="running"||task.step!=="waiting_navigation") return;

  // Give client-rendered result grids a short moment after load.
  await sleep(900);
  task=await getTask(tabId);
  if(!task||task.status!=="running") return;

  const state=await getSession(stateKey(tabId));
  if(!state||!Array.isArray(state.datasets)||!state.datasets.length){
    await completeTask(task,"error","The saved dataset session was not available.");
    return;
  }

  const index=Math.max(0,Math.min(Number(state.currentIndex)||0,state.datasets.length-1));
  const template=state.datasets[index];

  let scanned;
  try{
    scanned=await scanPage(tabId);
  }catch(error){
    await completeTask(task,"error","Could not scan the next page: "+error.message);
    return;
  }

  const matched=matchDataset(template,scanned);
  if(!matched){
    await completeTask(task,"complete","The next page loaded, but the selected dataset could not be matched.");
    return;
  }

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
        startUrl:tab.url,
        currentUrl:tab.url,
        startedAt:Date.now(),
        updatedAt:Date.now()
      };
      await saveTask(task);

      const next=await detectNext(tabId);
      if(!next?.href){
        await completeTask(task,"complete","No same-site Next-page link was detected on this page.");
        sendResponse({ok:false,error:"No same-site Next-page link was detected on this page."});
        return;
      }

      await navigateToNext(task);
      sendResponse({ok:true,task:await getTask(tabId)});
      return;
    }

    sendResponse({ok:false,error:"Unknown message."});
  })().catch(error=>sendResponse({ok:false,error:error.message}));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{
  if(changeInfo.status!=="complete") return;
  processLoadedPage(tabId).catch(async error=>{
    const task=await getTask(tabId);
    if(task&&task.status==="running"){
      await completeTask(task,"error",error.message);
    }
  });
});
