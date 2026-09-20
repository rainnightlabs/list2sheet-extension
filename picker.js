(() => {
  if (window.__list2sheetPickerActive) return;
  window.__list2sheetPickerActive = true;

  const clean=value=>String(value??"").replace(/\s+/g," ").trim();
  const pricePattern=/(?:[$€£¥￥]\s*\d[\d,.]*(?:\.\d+)?|\d[\d,.]*(?:\.\d+)?\s*(?:USD|EUR|GBP|CNY|RMB|元|円))/i;
  let highlighted=null;
  let originalOutline="";
  let originalOffset="";

  const visible=el=>{
    if(!el||el.nodeType!==1) return false;
    const style=getComputedStyle(el);
    const rect=el.getBoundingClientRect();
    return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0;
  };

  const cssPath=element=>{
    if(!element||element.nodeType!==1) return "";
    if(element.id) return "#"+CSS.escape(element.id);

    const parts=[];
    let node=element;
    while(node&&node.nodeType===1&&node!==document.documentElement){
      let part=node.tagName.toLowerCase();
      const classes=[...node.classList]
        .filter(name=>name&&name.length<50)
        .slice(0,3);
      if(classes.length) part+=classes.map(name=>"."+CSS.escape(name)).join("");

      const parent=node.parentElement;
      if(parent){
        const same=[...parent.children].filter(child=>child.tagName===node.tagName);
        if(same.length>1) part+=`:nth-of-type(${same.indexOf(node)+1})`;
      }

      parts.unshift(part);
      const candidate=parts.join(" > ");
      try{
        if(document.querySelectorAll(candidate).length===1) return candidate;
      }catch{}

      node=parent;
      if(parts.length>=8) break;
    }
    return parts.join(" > ");
  };

  const similarSignature=el=>{
    if(!el) return "";
    const classes=[...el.classList].filter(Boolean).slice(0,2).sort();
    return el.tagName.toLowerCase()+(classes.length?"."+classes.join("."):"");
  };

  const repeatedGroupFrom=target=>{
    let node=target;
    for(let depth=0;node&&depth<7;depth++,node=node.parentElement){
      const parent=node.parentElement;
      if(!parent) continue;
      const sig=similarSignature(node);
      const matches=[...parent.children].filter(child=>visible(child)&&similarSignature(child)===sig);
      if(matches.length>=3) return {parent,items:matches};
    }
    return null;
  };

  const rowObjectFromItem=item=>{
    const out={};
    const allText=clean(item.innerText||item.textContent);
    const price=allText.match(pricePattern)?.[0]||"";

    const candidates=[
      ...item.querySelectorAll('[class*="title"],[class*="name"],[class*="desc"],h1,h2,h3,h4,a,p,strong,span')
    ].map(el=>clean(el.innerText||el.textContent))
      .filter(text=>text.length>=3&&text.length<=180)
      .filter(text=>!pricePattern.test(text)||text.length>30);

    const title=candidates.find(text=>text!==price)||"";
    const link=item.matches("a[href]")?item:item.querySelector("a[href]");
    const image=item.querySelector("img");

    if(title) out.Title=title;
    if(price) out.Price=clean(price);
    if(link?.href) out.URL=link.href;
    if(image?.currentSrc||image?.src) out.Image=image.currentSrc||image.src;

    const used=new Set(Object.values(out).map(clean));
    let extra=1;
    for(const el of item.querySelectorAll("span,p,small,strong,em")){
      const text=clean(el.innerText||el.textContent);
      if(!text||text.length>120||used.has(text)||pricePattern.test(text)) continue;
      out["Extra "+extra]=text;
      used.add(text);
      extra++;
      if(extra>3) break;
    }

    if(!Object.keys(out).length&&allText) out.Title=allText.slice(0,220);
    return out;
  };

  const tableDataset=table=>{
    const rows=[...table.rows].filter(visible);
    if(rows.length<2) return null;
    const headerRow=rows.find(row=>row.querySelectorAll(":scope > th").length)||null;
    const headerCells=headerRow
      ? [...headerRow.children].filter(cell=>/^(TH|TD)$/.test(cell.tagName))
      : [...rows[0].children].filter(cell=>/^(TH|TD)$/.test(cell.tagName));
    const headers=headerCells.map((cell,index)=>clean(cell.innerText||cell.textContent)||"Column "+(index+1));
    const dataRows=rows.slice(headerRow?rows.indexOf(headerRow)+1:0).map(row=>{
      const cells=[...row.children].filter(cell=>/^(TH|TD)$/.test(cell.tagName));
      const out={};
      headers.forEach((header,index)=>out[header]=clean(cells[index]?.innerText||cells[index]?.textContent));
      return out;
    }).filter(row=>Object.values(row).some(Boolean));
    if(dataRows.length<1) return null;
    return {
      type:"table",
      label:"Picked table · "+dataRows.length+" rows",
      headers,
      rows:dataRows,
      score:3000,
      meta:{signature:"manual-table",manual:true},
      source:{
        kind:"table",
        selector:cssPath(table),
        manual:true
      }
    };
  };

  const repeatedDataset=group=>{
    const rows=group.items.map(rowObjectFromItem).filter(row=>Object.values(row).some(Boolean));
    if(rows.length<2) return null;
    const order=["Title","Price","URL","Image","Extra 1","Extra 2","Extra 3"];
    const headers=order.filter(header=>rows.some(row=>clean(row[header])));
    const first=group.items[0];
    const itemClasses=first ? [...first.classList].slice(0,3) : [];
    const signature=similarSignature(first)||"manual-repeated";

    return {
      type:"repeated",
      label:"Picked items · "+rows.length+" rows",
      headers,
      rows:rows.map(row=>{
        const normalized={};
        headers.forEach(header=>normalized[header]=row[header]||"");
        return normalized;
      }),
      score:3000,
      meta:{signature,manual:true},
      source:{
        kind:"repeated",
        parentSelector:cssPath(group.parent),
        childIndexes:group.items.map(item=>[...group.parent.children].indexOf(item)),
        itemTag:first?.tagName?.toLowerCase()||"",
        itemClasses,
        manual:true
      }
    };
  };

  const candidateFor=target=>{
    const tr=target.closest("tr");
    const table=tr?.closest("table");
    if(table&&visible(table)) return table;
    const group=repeatedGroupFrom(target);
    if(group) return group.items.includes(target)?target:group.items.find(item=>item.contains(target))||group.items[0];
    return target;
  };

  const clearHighlight=()=>{
    if(highlighted){
      highlighted.style.outline=originalOutline;
      highlighted.style.outlineOffset=originalOffset;
    }
    highlighted=null;
  };

  const move=event=>{
    const candidate=candidateFor(event.target);
    if(!candidate||candidate===highlighted) return;
    clearHighlight();
    highlighted=candidate;
    originalOutline=candidate.style.outline;
    originalOffset=candidate.style.outlineOffset;
    candidate.style.outline="3px solid #57d39b";
    candidate.style.outlineOffset="2px";
  };

  const cleanup=()=>{
    clearHighlight();
    document.removeEventListener("mouseover",move,true);
    document.removeEventListener("click",click,true);
    document.removeEventListener("keydown",keydown,true);
    window.__list2sheetPickerActive=false;
  };

  const keydown=event=>{
    if(event.key==="Escape") cleanup();
  };

  const click=async event=>{
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target=event.target;
    let dataset=null;

    const table=target.closest("table");
    if(table) dataset=tableDataset(table);

    if(!dataset){
      const group=repeatedGroupFrom(target);
      if(group) dataset=repeatedDataset(group);
    }

    if(!dataset){
      const text=clean(target.innerText||target.textContent);
      dataset={
        type:"repeated",
        label:"Picked element · 1 row",
        headers:["Title"],
        rows:[{Title:text||target.tagName}],
        score:3000,
        meta:{signature:"manual-element",manual:true},
        source:{kind:"manual-element",selector:cssPath(target),manual:true}
      };
    }

    cleanup();

    try{
      await chrome.runtime.sendMessage({
        type:"LIST2SHEET_PICK_RESULT",
        dataset
      });
    }catch{}
  };

  document.addEventListener("mouseover",move,true);
  document.addEventListener("click",click,true);
  document.addEventListener("keydown",keydown,true);

  chrome.runtime.onMessage.addListener(message=>{
    if(message?.type==="LIST2SHEET_PICK_CANCEL") cleanup();
  });
})();