export function extractPageDatasets() {
  const clean = value => String(value ?? "").replace(/\s+/g," ").trim();
  const visible = element => {
    if (!element || element.nodeType !== 1) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };

  const adLabelPattern=/^(ad|ads|advertisement|sponsored|promoted|paid promotion|promoted content|广告|廣告|推广|推廣|赞助|贊助|商业推广|商業推廣)$/i;
  const hasAdSignal=element=>{
    if(!element||element.nodeType!==1) return false;

    const attrs=[
      element.id||"",
      String(element.className||""),
      element.getAttribute("aria-label")||"",
      element.getAttribute("data-testid")||"",
      element.getAttribute("data-ad")||"",
      element.getAttribute("data-sponsored")||""
    ].join(" ");

    if(/(^|[\s_-])(sponsored|promoted|advertisement|advert|ad-container|ad-item|ad-card|paid-promotion)([\s_-]|$)/i.test(attrs)){
      return true;
    }

    const explicit=element.matches(
      '[data-ad="true"],[data-sponsored="true"],[aria-label="Sponsored"],[aria-label="Advertisement"]'
    );
    if(explicit) return true;

    const shortLabels=[...element.querySelectorAll("span,small,label,strong")]
      .slice(0,80)
      .map(node=>clean(node.innerText||node.textContent))
      .filter(text=>text && text.length<=28);

    return shortLabels.some(text=>adLabelPattern.test(text));
  };

  const cssPath = element => {
    if (!element || element.nodeType !== 1) return "";
    if (element.id) return "#" + CSS.escape(element.id);

    const parts=[];
    let node=element;
    while(node && node.nodeType===1 && node!==document.documentElement){
      let part=node.tagName.toLowerCase();
      const classes=[...node.classList]
        .filter(name=>name && name.length<50)
        .slice(0,2);
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
      if(parts.length>=7) break;
    }
    return parts.join(" > ");
  };

  const uniqueHeaders = headers => {
    const seen=new Map();
    return headers.map((header,index)=>{
      const base=clean(header)||`Column ${index+1}`;
      const count=(seen.get(base)||0)+1;
      seen.set(base,count);
      return count===1 ? base : `${base} ${count}`;
    });
  };

  const cellText = cell => {
    let text=clean(cell?.innerText || cell?.textContent);
    if(text) return text;
    const control=cell?.querySelector?.("input,select,textarea");
    if(!control) return "";
    if(control.tagName==="SELECT"){
      return clean(control.selectedOptions?.[0]?.textContent || control.value);
    }
    if(control.type==="checkbox" || control.type==="radio"){
      return control.checked ? "TRUE" : "";
    }
    return clean(control.value);
  };

  const datasets=[];
  const layoutWords=/(pagination|pager|page[-_ ]?nav|breadcrumb|toolbar|footer|header|menu|sidebar)/i;

  // 1) Real HTML data tables.
  document.querySelectorAll("table").forEach((table,tableIndex)=>{
    if(!visible(table)) return;

    const tableContext=[
      table.id||"",
      table.className||"",
      table.getAttribute("role")||"",
      table.closest("nav,header,footer,aside")?.tagName||"",
      table.parentElement?.className||""
    ].join(" ");

    const rowEls=[...table.rows].filter(row=>row.closest("table")===table && visible(row));
    if(rowEls.length<2) return;

    let headerIndex=rowEls.findIndex(row=>row.querySelectorAll(":scope > th").length>0);
    if(headerIndex<0 && table.tHead?.rows?.length){
      headerIndex=rowEls.indexOf(table.tHead.rows[0]);
    }

    const firstDataIndex=headerIndex>=0 ? headerIndex+1 : 0;
    const headerCells=headerIndex>=0
      ? [...rowEls[headerIndex].children].filter(cell=>/^(TH|TD)$/.test(cell.tagName))
      : [...rowEls[0].children].filter(cell=>/^(TH|TD)$/.test(cell.tagName));

    const columnCount=Math.max(
      headerCells.length,
      ...rowEls.slice(firstDataIndex).map(row =>
        [...row.children].filter(cell=>/^(TH|TD)$/.test(cell.tagName)).length
      )
    );
    if(columnCount<2) return;

    let headers=uniqueHeaders(Array.from({length:columnCount},(_,index)=>{
      if(headerIndex<0) return `Column ${index+1}`;
      const cell=headerCells[index];
      const direct=cellText(cell);
      const attr=clean(
        cell?.getAttribute("data-field") ||
        cell?.getAttribute("aria-label") ||
        cell?.getAttribute("title")
      );
      return direct || attr || `Column ${index+1}`;
    }));

    const dataRowEls=rowEls.slice(firstDataIndex);
    const rawPairs=dataRowEls.map(row=>{
      const cells=[...row.children].filter(cell=>/^(TH|TD)$/.test(cell.tagName));
      return {
        row,
        values:Array.from({length:columnCount},(_,index)=>cellText(cells[index]))
      };
    }).filter(pair=>pair.values.some(Boolean));
    const rawRows=rawPairs.map(pair=>pair.values);

    if(rawRows.length<2) return;

    // Remove columns that are completely empty (common checkbox/action placeholders).
    const keepIndexes=[];
    for(let index=0;index<columnCount;index++){
      const header=headers[index]||"";
      const hasData=rawRows.some(row=>clean(row[index]));
      if(clean(header).replace(/^Column \d+$/,"") || hasData) keepIndexes.push(index);
    }
    if(keepIndexes.length<2) return;

    headers=keepIndexes.map(index=>headers[index]);
    const dataRows=rawPairs.map(pair=>{
      const out={};
      keepIndexes.forEach((sourceIndex,targetIndex)=>{
        out[headers[targetIndex]]=pair.values[sourceIndex]||"";
      });
      if(hasAdSignal(pair.row)) out.__l2sAd=true;
      return out;
    });

    const flattened=rawRows.flat().map(clean).filter(Boolean);
    const numericLike=flattened.length
      ? flattened.filter(text=>/^\d+$/.test(text) || /^[<>›»«→←]+$/.test(text)).length/flattened.length
      : 0;
    const linkCount=table.querySelectorAll("a[href]").length;
    const mostlyLinks=linkCount >= Math.max(3,rawRows.length);

    // This specifically removes Google-style pager/layout tables and similar UI tables.
    if(layoutWords.test(tableContext) && rawRows.length<=3) return;
    if(rawRows.length<=2 && numericLike>0.55 && mostlyLinks) return;

    const realHeaderCount=headers.filter(header=>!/^Column \d+$/.test(header)).length;
    const headerQuality=realHeaderCount/Math.max(headers.length,1);
    let score=
      1600 +
      Math.min(dataRows.length,100)*18 +
      Math.min(headers.length,20)*20 +
      headerQuality*350;

    if(rawRows.length<=2) score-=700;
    if(numericLike>0.65) score-=250;

    datasets.push({
      type:"table",
      label:`Table · ${dataRows.length} rows × ${headers.length} columns`,
      headers,
      rows:dataRows,
      score,
      meta:{
        signature:"html-table",
        rowCount:dataRows.length,
        columnCount:headers.length,
        headerQuality
      },
      source:{kind:"table",selector:cssPath(table)}
    });
  });

  // 2) ARIA grids / div-based data tables.
  document.querySelectorAll('[role="table"],[role="grid"]').forEach((grid,gridIndex)=>{
    if(grid.tagName==="TABLE" || !visible(grid)) return;

    const rowEls=[...grid.querySelectorAll('[role="row"]')]
      .filter(row=>row.closest('[role="table"],[role="grid"]')===grid && visible(row));
    if(rowEls.length<3) return;

    const firstCells=[...rowEls[0].querySelectorAll(
      ':scope > [role="columnheader"],:scope > [role="cell"],:scope > [role="gridcell"]'
    )];
    if(firstCells.length<2) return;

    const hasHeaders=firstCells.some(cell=>cell.getAttribute("role")==="columnheader");
    const headers=uniqueHeaders(firstCells.map((cell,index)=>
      hasHeaders ? cellText(cell) || clean(cell.getAttribute("aria-label")) || `Column ${index+1}`
        : `Column ${index+1}`
    ));

    const rows=rowEls.slice(hasHeaders?1:0).map(row=>{
      const cells=[...row.querySelectorAll(
        ':scope > [role="cell"],:scope > [role="gridcell"],:scope > [role="columnheader"]'
      )];
      const out={};
      headers.forEach((header,index)=>out[header]=cellText(cells[index]));
      if(hasAdSignal(row)) out.__l2sAd=true;
      return out;
    }).filter(row=>Object.entries(row).some(([key,value])=>!key.startsWith("__")&&Boolean(value)));

    if(rows.length<2) return;

    datasets.push({
      type:"table",
      label:`Data grid · ${rows.length} rows × ${headers.length} columns`,
      headers,
      rows,
      score:1550+Math.min(rows.length,100)*18+headers.length*18+(hasHeaders?300:0),
      meta:{signature:"aria-grid",rowCount:rows.length,columnCount:headers.length},
      source:{kind:"table",selector:cssPath(grid)}
    });
  });

  // 3) Search-result style pages (Google/Bing/document directories/etc.).
  const resultRows=[];
  const resultSources=[];
  const seenResultUrls=new Set();
  const headings=[...document.querySelectorAll("h2,h3,h4")].filter(visible);

  for(const heading of headings){
    const title=clean(heading.innerText||heading.textContent);
    if(title.length<3 || title.length>220) continue;

    let anchor=heading.closest("a[href]") || heading.querySelector("a[href]");
    if(!anchor){
      let node=heading.parentElement;
      for(let depth=0;node&&depth<3;depth++,node=node.parentElement){
        const links=[...node.querySelectorAll("a[href]")].filter(visible);
        if(links.length){
          anchor=links.find(link=>clean(link.innerText).includes(title)) || links[0];
          if(anchor) break;
        }
      }
    }
    if(!anchor?.href || !/^https?:/i.test(anchor.href)) continue;

    let container=heading.parentElement;
    for(let depth=0;container&&depth<6;depth++){
      const headingCount=container.querySelectorAll("h2,h3,h4").length;
      const text=clean(container.innerText);
      if(
        text.length>=title.length &&
        text.length<=1400 &&
        headingCount<=2 &&
        container.querySelectorAll("a[href]").length<=12
      ) break;
      container=container.parentElement;
    }
    if(!container) continue;

    const containerText=clean(container.innerText);
    const priceLike=/(?:[$€£¥￥]\s*\d|\d+(?:\.\d+)?\s*(?:USD|EUR|GBP|CNY|RMB|元|円))/i.test(containerText);
    // Product cards are handled by the repeated-card detector instead.
    if(priceLike) continue;

    const href=anchor.href;
    if(seenResultUrls.has(href)) continue;

    let hostname="";
    try{hostname=new URL(href).hostname.replace(/^www\./,"");}catch{}

    const lines=(container.innerText||"").split(/\n+/)
      .map(clean)
      .filter(Boolean)
      .filter(line=>line!==title)
      .filter(line=>!line.includes(href))
      .filter(line=>line.length>8);

    let snippet=lines.sort((a,b)=>b.length-a.length)[0]||"";
    if(snippet.length>360) snippet=snippet.slice(0,357)+"…";

    seenResultUrls.add(href);
    const resultRow={
      Title:title,
      URL:href,
      Domain:hostname,
      Snippet:snippet
    };
    if(hasAdSignal(container)) resultRow.__l2sAd=true;
    resultRows.push(resultRow);
    resultSources.push(cssPath(container));
  }

  if(resultRows.length>=3){
    datasets.push({
      type:"search",
      label:`Search results · ${resultRows.length} rows`,
      headers:["Title","URL","Domain","Snippet"],
      rows:resultRows,
      score:2050+Math.min(resultRows.length,100)*20,
      meta:{signature:"semantic-search-results",rowCount:resultRows.length},
      source:{kind:"search",selectors:resultSources.slice(0,100)}
    });
  }

  // 4) Danmaku / bullet-comment streams are kept separate from normal comments.
  const danmakuContextPattern=/(danmaku|danmu|bullet[-_ ]?comment|弹幕|彈幕)/i;
  const danmakuParents=[...document.querySelectorAll("section,main,article,ul,ol,div")]
    .filter(parent=>{
      if(!visible(parent)||parent.children.length<2||parent.children.length>500) return false;
      const context=[
        parent.id||"",
        String(parent.className||""),
        parent.getAttribute("aria-label")||"",
        parent.getAttribute("data-testid")||""
      ].join(" ");
      return danmakuContextPattern.test(context);
    });

  const danmakuSeen=new Set();
  for(const parent of danmakuParents){
    const items=[...parent.children].filter(visible);
    if(items.length<2) continue;

    const rows=[];
    for(const item of items){
      const text=clean(item.innerText||item.textContent);
      if(!text||text.length>500) continue;
      if(danmakuSeen.has(text)) continue;
      danmakuSeen.add(text);
      const row={Danmaku:text};
      if(hasAdSignal(item)) row.__l2sAd=true;
      rows.push(row);
    }
    if(rows.length<2) continue;

    datasets.push({
      type:"danmaku",
      label:`Danmaku · ${rows.length} rows`,
      headers:["Danmaku"],
      rows,
      score:1150+Math.min(rows.length,100)*8,
      meta:{signature:"danmaku-stream",rowCount:rows.length},
      source:{
        kind:"repeated",
        parentSelector:cssPath(parent),
        childIndexes:items.map(item=>[...parent.children].indexOf(item)),
        itemTag:items[0]?.tagName?.toLowerCase()||"",
        itemClasses:items[0]?[...items[0].classList].slice(0,3):[]
      }
    });
  }

  // 5) Comment / discussion streams.
  const commentContextPattern=/(comment|comments|comment-list|comment-section|discussion|replies|reply-list|评论|評論|留言|评论区|評論區|评论列表|評論列表|回复|回覆)/i;
  const commentParents=[...document.querySelectorAll("section,main,article,ul,ol,div")]
    .filter(parent=>{
      if(!visible(parent)||parent.children.length<2||parent.children.length>300) return false;
      const context=[
        parent.id||"",
        String(parent.className||""),
        parent.getAttribute("aria-label")||"",
        parent.getAttribute("data-testid")||""
      ].join(" ");
      return commentContextPattern.test(context);
    });

  const commentFingerprints=new Set();

  for(const parent of commentParents){
    const groups=new Map();
    for(const child of [...parent.children].filter(visible)){
      const classPart=[...child.classList].slice(0,3).sort().join(".");
      const signature=child.tagName.toLowerCase()+(classPart?"."+classPart:"");
      if(!groups.has(signature)) groups.set(signature,[]);
      groups.get(signature).push(child);
    }

    for(const [signature,items] of groups){
      if(items.length<2) continue;

      const fingerprint=signature+"|"+items.length+"|"+
        items.slice(0,3).map(item=>clean(item.innerText).slice(0,45)).join("~");
      if(commentFingerprints.has(fingerprint)) continue;
      commentFingerprints.add(fingerprint);

      const extractFirst=(item,selectors,predicate=()=>true)=>{
        for(const selector of selectors){
          let nodes=[];
          try{nodes=[...item.querySelectorAll(selector)];}catch{}
          for(const node of nodes){
            const text=clean(node.innerText||node.textContent||node.getAttribute?.("aria-label"));
            if(text&&predicate(text,node)) return text;
          }
        }
        return "";
      };

      const rows=items.map(item=>{
        const author=extractFirst(item,[
          '[class*="author"]','[class*="username"]','[class*="user-name"]',
          '[class*="nickname"]','[class*="user"]','[data-testid*="author"]',
          '[data-testid*="user"]'
        ],text=>text.length<=120);

        const date=extractFirst(item,[
          "time",'[class*="date"]','[class*="time"]','[class*="publish"]',
          '[class*="created"]','[class*="timestamp"]'
        ],text=>text.length<=80);

        const likes=extractFirst(item,[
          '[class*="like"]','[class*="vote"]','[class*="upvote"]',
          '[aria-label*="like" i]','[aria-label*="赞" i]'
        ],text=>text.length<=80);

        const replies=extractFirst(item,[
          '[class*="repl"][class*="count"]','[class*="reply-count"]',
          '[aria-label*="repl" i]','[aria-label*="回复" i]'
        ],text=>text.length<=80);

        const link=item.matches("a[href]")?item:item.querySelector("a[href]");

        const excluded=new Set([author,date,likes,replies].filter(Boolean));
        const candidates=[];

        const preferredSelectors=[
          '[class*="comment-content"]','[class*="comment-text"]',
          '[class*="content"]','[class*="text"]',
          '[data-testid*="comment"]','[data-testid*="content"]',
          "p"
        ];

        for(const selector of preferredSelectors){
          let nodes=[];
          try{nodes=[...item.querySelectorAll(selector)];}catch{}
          for(const node of nodes){
            if(node.closest("button")) continue;
            const text=clean(node.innerText||node.textContent);
            if(!text||text.length<2||text.length>3000||excluded.has(text)) continue;
            candidates.push(text);
          }
        }

        if(!candidates.length){
          for(const node of item.querySelectorAll("span,div")){
            if(node.children.length>2||node.closest("button")) continue;
            const text=clean(node.innerText||node.textContent);
            if(!text||text.length<3||text.length>1200||excluded.has(text)) continue;
            candidates.push(text);
          }
        }

        const comment=[...new Set(candidates)]
          .sort((a,b)=>b.length-a.length)[0]||"";

        const out={};
        if(author) out.Author=author;
        if(comment) out.Comment=comment;
        if(date) out.Date=date;
        if(likes) out.Likes=likes;
        if(replies) out.Replies=replies;
        if(link?.href) out.URL=link.href;
        if(hasAdSignal(item)) out.__l2sAd=true;
        return out;
      }).filter(row=>Boolean(row.Comment) && Object.entries(row).some(([key,value])=>!key.startsWith("__")&&Boolean(value)));

      if(rows.length<2) continue;

      const headers=["Author","Comment","Date","Likes","Replies","URL"]
        .filter(header=>rows.some(row=>clean(row[header])));
      if(!headers.includes("Comment")) continue;

      const contentQuality=rows.filter(row=>clean(row.Comment).length>=8).length/rows.length;
      if(contentQuality<0.5) continue;

      datasets.push({
        type:"comments",
        label:`Comments · ${rows.length} rows`,
        headers,
        rows:rows.map(row=>{
          const normalized={};
          headers.forEach(header=>normalized[header]=row[header]||"");
          if(row.__l2sAd) normalized.__l2sAd=true;
          return normalized;
        }),
        score:2250+Math.min(rows.length,100)*18+contentQuality*250,
        meta:{
          signature:"comment-stream:"+signature,
          rowCount:rows.length,
          contentQuality
        },
        source:{
          kind:"repeated",
          parentSelector:cssPath(parent),
          childIndexes:items.map(item=>[...parent.children].indexOf(item)),
          itemTag:items[0]?.tagName?.toLowerCase()||"",
          itemClasses:items[0]?[...items[0].classList].slice(0,3):[]
        }
      });
    }
  }

  // 6) Generic repeated cards/lists.
  const candidateParents=[...document.querySelectorAll("ul,ol,main,section,article,div")]
    .filter(parent=>visible(parent) && parent.children.length>=3 && parent.children.length<=100);

  const seenGroups=new Set();
  const menuWords=/(nav|menu|cate|category|sidebar|channel|tab|filter|breadcrumb|header|footer|toolbar|shortcut)/i;
  const paginationWords=/(pagination|pager|page-item|page-link|pages|pagenum|page-number)/i;
  const pricePattern=/(?:[$€£¥￥]\s?\d|\d+(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|CNY|RMB|元|円))/i;

  for(const parent of candidateParents){
    const groups=new Map();

    for(const child of [...parent.children].filter(visible)){
      const classPart=[...child.classList].slice(0,3).sort().join(".");
      const signature=child.tagName.toLowerCase()+(classPart?"."+classPart:"");
      if(!groups.has(signature)) groups.set(signature,[]);
      groups.get(signature).push(child);
    }

    for(const [signature,items] of groups){
      if(items.length<3) continue;

      const fingerprint=signature+"|"+items.length+"|"+
        items.slice(0,3).map(item=>clean(item.innerText).slice(0,30)).join("~");
      if(seenGroups.has(fingerprint)) continue;
      seenGroups.add(fingerprint);

      const contextText=[
        signature,
        parent.id||"",
        [...parent.classList].join(" "),
        parent.getAttribute("role")||"",
        parent.closest("nav,header,footer,aside")?.tagName||""
      ].join(" ");

      const itemTexts=items.map(item=>clean(item.innerText));
      const simplePageRatio=itemTexts.length
        ? itemTexts.filter(text=>/^\d{1,5}$/.test(text)||/^[<>›»«→←]+$/.test(text)).length/itemTexts.length
        : 0;

      // Never offer obvious pagination controls as a dataset.
      if(paginationWords.test(contextText) || simplePageRatio>=0.6) continue;

      const isMenuLike=menuWords.test(contextText);
      let imageCount=0;
      let linkCount=0;
      let priceCount=0;
      let buttonCount=0;

      const extractFirstText=(item,selectors,predicate=()=>true)=>{
        for(const selector of selectors){
          for(const el of item.querySelectorAll(selector)){
            const text=clean(el.innerText||el.textContent);
            if(text&&predicate(text,el)) return text;
          }
        }
        return "";
      };

      const rows=items.map(item=>{
        if(item.querySelector("img")) imageCount++;
        if(item.matches("a[href]")||item.querySelector("a[href]")) linkCount++;
        if(item.querySelector("button,[role=button]")) buttonCount++;
        if(pricePattern.test(clean(item.innerText))) priceCount++;

        const allText=clean(item.innerText);
        const priceMatch=allText.match(/(?:[$€£¥￥]\s*\d[\d,.]*(?:\.\d+)?|\d[\d,.]*(?:\.\d+)?\s*(?:USD|EUR|GBP|CNY|RMB|元|円))/i);
        const price=priceMatch?clean(priceMatch[0]):"";

        const usefulTitle=text=>
          text.length>=3 &&
          text.length<=180 &&
          !/^[¥￥$€£]?\s*\d[\d,.]*$/.test(text) &&
          !/^(¥|￥|\$|€|£)$/.test(text);

        let title=extractFirstText(item,[
          "[class*=title]","[class*=name]","[class*=desc]",
          "h1","h2","h3","h4","a"
        ],usefulTitle);

        if(!title){
          const candidates=[...item.querySelectorAll("p,span,strong")]
            .map(el=>clean(el.innerText||el.textContent))
            .filter(usefulTitle)
            .sort((a,b)=>b.length-a.length);
          title=candidates[0]||"";
        }

        const seller=extractFirstText(item,[
          "[class*=seller]","[class*=shop]","[class*=store]","[class*=merchant]"
        ],text=>text.length<=100&&text!==title);

        const sales=extractFirstText(item,[
          "[class*=sales]","[class*=sold]","[class*=deal]","[class*=volume]"
        ],text=>text.length<=80&&text!==price);

        const rating=extractFirstText(item,[
          "[class*=rating]","[class*=score]","[class*=star]"
        ],text=>text.length<=40);

        const link=item.matches("a[href]")?item:item.querySelector("a[href]");
        const img=item.querySelector("img");
        const imageUrl=img?.currentSrc||img?.src||"";

        const used=new Set([title,price,seller,sales,rating].filter(Boolean));
        const extras=[];
        const leafNodes=[...item.querySelectorAll("span,p,strong,small,em,i")]
          .filter(el=>el.children.length===0);

        for(const el of leafNodes){
          const text=clean(el.innerText||el.textContent);
          if(!text||text.length>120||used.has(text)) continue;
          if(/^(¥|￥|\$|€|£)$/.test(text)) continue;
          if(/^[¥￥$€£]?\s*\d[\d,.]*$/.test(text)) continue;
          if(price&&(text===price||price.includes(text))) continue;
          used.add(text);
          extras.push(text);
          if(extras.length>=3) break;
        }

        const out={};
        if(title) out.Title=title;
        if(price) out.Price=price;
        if(seller) out.Seller=seller;
        if(sales) out.Sales=sales;
        if(rating) out.Rating=rating;
        extras.forEach((value,index)=>out[`Extra ${index+1}`]=value);
        if(link?.href) out.URL=link.href;
        if(imageUrl) out.Image=imageUrl;
        if(hasAdSignal(item)) out.__l2sAd=true;

        if(!Object.keys(out).filter(key=>!key.startsWith("__")).length&&allText) out.Title=allText.slice(0,220);
        return out;
      }).filter(row=>Object.values(row).some(Boolean));

      if(rows.length<3) continue;

      const preferredHeaders=["Title","Price","Seller","Sales","Rating","Extra 1","Extra 2","Extra 3","URL","Image"];
      const headers=preferredHeaders.filter(header=>rows.some(row=>clean(row[header])));
      if(!headers.length) continue;

      const density=rows.reduce((sum,row)=>
        sum+headers.filter(header=>clean(row[header])).length,0
      )/(rows.length*headers.length);
      if(density<0.30) continue;

      const count=rows.length;
      const imageRatio=imageCount/items.length;
      const linkRatio=linkCount/items.length;
      const priceRatio=priceCount/items.length;
      const buttonRatio=buttonCount/items.length;

      let score=
        Math.min(count,40)*8+
        Math.min(headers.length,8)*12+
        imageRatio*420+
        linkRatio*220+
        priceRatio*420+
        buttonRatio*60+
        density*120;

      if(isMenuLike) score-=900;
      if(imageRatio<0.15&&priceRatio<0.15&&count>12) score-=260;
      if(headers.length>=9&&imageRatio<0.2) score-=100;

      // Pure navigation lists are not useful export datasets.
      if(isMenuLike && imageRatio<0.15 && priceRatio<0.15) continue;

      let kind="Repeated list";
      if(imageRatio>=0.5&&priceRatio>=0.25) kind="Product cards";
      else if(imageRatio>=0.5) kind="Visual cards";
      else if(priceRatio>=0.35) kind="Priced list";

      datasets.push({
        type:"repeated",
        label:`${kind} · ${count} rows`,
        headers,
        rows:rows.map(row=>{
          const normalized={};
          headers.forEach(header=>normalized[header]=row[header]||"");
          if(row.__l2sAd) normalized.__l2sAd=true;
          return normalized;
        }),
        score,
        meta:{signature,imageRatio,linkRatio,priceRatio,isMenuLike},
        source:{
          kind:"repeated",
          parentSelector:cssPath(parent),
          childIndexes:items.map(item=>[...parent.children].indexOf(item)),
          itemTag:items[0]?.tagName?.toLowerCase()||"",
          itemClasses:items[0]?[...items[0].classList].slice(0,3):[]
        }
      });
    }
  }

  // Remove obvious duplicate datasets and globally rank.
  datasets.sort((a,b)=>(b.score||0)-(a.score||0));
  const seen=new Set();
  const deduped=[];
  for(const dataset of datasets){
    const sample=(dataset.rows||[]).slice(0,3)
      .map(row=>(dataset.headers||[]).map(header=>clean(row[header])).join("¦"))
      .join("¶");
    const key=[dataset.type,(dataset.headers||[]).join("|"),sample].join("::");
    if(seen.has(key)) continue;
    seen.add(key);
    deduped.push(dataset);
  }

  const strong=deduped.filter(dataset=>
    dataset.type==="table" ||
    dataset.type==="search" ||
    (dataset.score||0)>=280
  );

  return (strong.length?strong:deduped).slice(0,12);
}
