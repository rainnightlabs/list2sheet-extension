import {getProState} from "./shared/license-state.js";

const FREE_ROW_LIMIT = 100;
const PREVIEW_ROW_LIMIT = 12;

let datasets = [];
let currentIndex = 0;
let isPro = false;

const els = {
  scan: document.querySelector("#scanButton"),
  status: document.querySelector("#statusBox"),
  results: document.querySelector("#results"),
  select: document.querySelector("#datasetSelect"),
  meta: document.querySelector("#datasetMeta"),
  preview: document.querySelector("#previewTable"),
  limitNotice: document.querySelector("#limitNotice"),
  copy: document.querySelector("#copyButton"),
  csv: document.querySelector("#csvButton"),
  json: document.querySelector("#jsonButton"),
  markdown: document.querySelector("#markdownButton"),
  planBadge: document.querySelector("#planBadge"),
  licenseTitle: document.querySelector("#licenseTitle"),
  licenseDescription: document.querySelector("#licenseDescription"),
  activate: document.querySelector("#activateButton")
};

function showStatus(message, type="") {
  els.status.hidden = false;
  els.status.className = "status" + (type ? " " + type : "");
  els.status.textContent = message;
}

function hideStatus() {
  els.status.hidden = true;
}

function normalizeCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractPageDatasets() {
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

  const uniqueHeaders = (headers) => {
    const seen = new Map();
    return headers.map((header, index) => {
      const base = clean(header) || `Column ${index + 1}`;
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count === 1 ? base : `${base} ${count}`;
    });
  };

  const datasets = [];

  document.querySelectorAll("table").forEach((table, tableIndex) => {
    const rowEls = [...table.querySelectorAll("tr")];
    if (!rowEls.length) return;

    const firstCells = [...rowEls[0].querySelectorAll("th,td")];
    if (firstCells.length < 2) return;

    const hasHeaders = rowEls[0].querySelectorAll("th").length > 0;
    const headers = uniqueHeaders(
      firstCells.map((cell, i) => hasHeaders ? clean(cell.innerText) : `Column ${i + 1}`)
    );

    const dataRows = rowEls.slice(hasHeaders ? 1 : 0)
      .map(row => [...row.querySelectorAll("th,td")].map(cell => clean(cell.innerText)))
      .filter(row => row.some(Boolean))
      .map(row => {
        const out = {};
        headers.forEach((header, i) => out[header] = row[i] || "");
        return out;
      });

    if (dataRows.length) {
      datasets.push({
        type: "table",
        label: `Table ${tableIndex + 1}`,
        headers,
        rows: dataRows,
        score: 1200 + dataRows.length * Math.min(headers.length, 8)
      });
    }
  });

  const candidateParents = [...document.querySelectorAll("ul,ol,main,section,article,div")]
    .filter(parent => parent.children.length >= 3 && parent.children.length <= 80);

  const seenGroups = new Set();
  const menuWords = /(nav|menu|cate|category|sidebar|channel|tab|filter|breadcrumb|header|footer|toolbar|shortcut)/i;
  const pricePattern = /(?:[$€£¥￥]\s?\d|\d+(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|CNY|RMB|元|円))/i;

  for (const parent of candidateParents) {
    const groups = new Map();

    for (const child of [...parent.children]) {
      const classPart = [...child.classList].slice(0, 3).sort().join(".");
      const signature = child.tagName.toLowerCase() + (classPart ? "." + classPart : "");
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(child);
    }

    for (const [signature, items] of groups) {
      if (items.length < 3) continue;

      const fingerprint = signature + "|" + items.length + "|" +
        items.slice(0,3).map(x => clean(x.innerText).slice(0,30)).join("~");
      if (seenGroups.has(fingerprint)) continue;
      seenGroups.add(fingerprint);

      const contextText = [
        signature,
        parent.id || "",
        [...parent.classList].join(" "),
        parent.getAttribute("role") || "",
        parent.closest("nav,header,footer,aside")?.tagName || ""
      ].join(" ");

      const isMenuLike = menuWords.test(contextText);

      let imageCount = 0;
      let linkCount = 0;
      let priceCount = 0;
      let buttonCount = 0;

      const extractFirstText = (item, selectors, predicate = () => true) => {
        for (const selector of selectors) {
          for (const el of item.querySelectorAll(selector)) {
            const text = clean(el.innerText || el.textContent);
            if (text && predicate(text, el)) return text;
          }
        }
        return "";
      };

      const rows = items.map(item => {
        if (item.querySelector("img")) imageCount++;
        if (item.matches("a[href]") || item.querySelector("a[href]")) linkCount++;
        if (item.querySelector("button,[role=button]")) buttonCount++;
        if (pricePattern.test(clean(item.innerText))) priceCount++;

        const allText = clean(item.innerText);
        const priceMatch = allText.match(/(?:[$€£¥￥]\s*\d[\d,.]*(?:\.\d+)?|\d[\d,.]*(?:\.\d+)?\s*(?:USD|EUR|GBP|CNY|RMB|元|円))/i);
        const price = priceMatch ? clean(priceMatch[0]) : "";

        const isUsefulTitle = (text) =>
          text.length >= 3 &&
          text.length <= 180 &&
          !/^[¥￥$€£]?\s*\d[\d,.]*$/.test(text) &&
          !/^(¥|￥|\$|€|£)$/.test(text);

        let title = extractFirstText(item, [
          "[class*=title]","[class*=name]","[class*=desc]",
          "h1","h2","h3","h4","a"
        ], isUsefulTitle);

        if (!title) {
          const candidates = [...item.querySelectorAll("p,span,strong")]
            .map(el => clean(el.innerText || el.textContent))
            .filter(isUsefulTitle)
            .sort((a,b) => b.length - a.length);
          title = candidates[0] || "";
        }

        const seller = extractFirstText(item, [
          "[class*=seller]","[class*=shop]","[class*=store]","[class*=merchant]"
        ], text => text.length <= 100 && text !== title);

        const sales = extractFirstText(item, [
          "[class*=sales]","[class*=sold]","[class*=deal]","[class*=volume]"
        ], text => text.length <= 80 && text !== price);

        const rating = extractFirstText(item, [
          "[class*=rating]","[class*=score]","[class*=star]"
        ], text => text.length <= 40);

        const link = item.matches("a[href]") ? item : item.querySelector("a[href]");
        const img = item.querySelector("img");
        const imageUrl = img?.currentSrc || img?.src || "";

        const used = new Set([title, price, seller, sales, rating].filter(Boolean));
        const extras = [];
        const leafNodes = [...item.querySelectorAll("span,p,strong,small,em,i")]
          .filter(el => el.children.length === 0);

        for (const el of leafNodes) {
          const text = clean(el.innerText || el.textContent);
          if (!text || text.length > 120 || used.has(text)) continue;
          if (/^(¥|￥|\$|€|£)$/.test(text)) continue;
          if (/^[¥￥$€£]?\s*\d[\d,.]*$/.test(text)) continue;
          if (price && (text === price || price.includes(text))) continue;
          used.add(text);
          extras.push(text);
          if (extras.length >= 3) break;
        }

        const out = {};
        if (title) out.Title = title;
        if (price) out.Price = price;
        if (seller) out.Seller = seller;
        if (sales) out.Sales = sales;
        if (rating) out.Rating = rating;
        extras.forEach((value, index) => out[`Extra ${index + 1}`] = value);
        if (link?.href) out.URL = link.href;
        if (imageUrl) out.Image = imageUrl;

        if (!Object.keys(out).length && allText) out.Title = allText.slice(0, 220);
        return out;
      }).filter(row => Object.values(row).some(Boolean));

      if (rows.length < 3) continue;

      const preferredHeaders = ["Title","Price","Seller","Sales","Rating","Extra 1","Extra 2","Extra 3","URL","Image"];
      const headers = preferredHeaders.filter(header => rows.some(row => clean(row[header])));

      const density = rows.reduce((sum,row) =>
        sum + headers.filter(header => clean(row[header])).length, 0
      ) / (rows.length * headers.length);

      if (density < 0.30) continue;

      const count = rows.length;
      const imageRatio = imageCount / items.length;
      const linkRatio = linkCount / items.length;
      const priceRatio = priceCount / items.length;
      const buttonRatio = buttonCount / items.length;

      let score =
        Math.min(count, 40) * 8 +
        Math.min(headers.length, 8) * 12 +
        imageRatio * 420 +
        linkRatio * 220 +
        priceRatio * 420 +
        buttonRatio * 60 +
        density * 120;

      if (isMenuLike) score -= 700;
      if (imageRatio < 0.15 && priceRatio < 0.15 && count > 12) score -= 220;
      if (headers.length >= 9 && imageRatio < 0.2) score -= 100;

      let kind = "Repeated list";
      if (imageRatio >= 0.5 && priceRatio >= 0.25) kind = "Product cards";
      else if (imageRatio >= 0.5) kind = "Visual cards";
      else if (priceRatio >= 0.35) kind = "Priced list";

      datasets.push({
        type: "repeated",
        label: `${kind} · ${count} rows`,
        headers,
        rows: rows.map(row => {
          const normalized = {};
          headers.forEach(header => normalized[header] = row[header] || "");
          return normalized;
        }),
        score,
        meta: {
          signature,
          imageRatio,
          linkRatio,
          priceRatio,
          isMenuLike
        }
      });
    }
  }

  datasets.sort((a,b) => (b.score || 0) - (a.score || 0));

  const strong = datasets.filter(dataset =>
    dataset.type === "table" ||
    (dataset.score || 0) >= 250
  );

  return (strong.length ? strong : datasets).slice(0, 12);
}

async function scanCurrentPage() {
  hideStatus();
  els.scan.disabled = true;
  els.scan.textContent = "Scanning…";

  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error("No active tab found.");

    const result = await chrome.scripting.executeScript({
      target:{tabId:tab.id},
      func:extractPageDatasets
    });

    datasets = result?.[0]?.result || [];
    currentIndex = 0;

    if (!datasets.length) {
      els.results.hidden = true;
      showStatus("No structured dataset detected on this page. Try a page with a table, product grid, search results, or repeated cards.");
      return;
    }

    populateDatasetSelect();
    renderDataset();
    els.results.hidden = false;
    showStatus(`Detected ${datasets.length} dataset${datasets.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    els.results.hidden = true;
    showStatus(
      "List2Sheet could not scan this page. Chrome internal pages, the Web Store, PDFs, and some protected pages cannot be accessed. " + error.message,
      "error"
    );
  } finally {
    els.scan.disabled = false;
    els.scan.textContent = "Scan current page";
  }
}

function populateDatasetSelect() {
  els.select.innerHTML = "";
  datasets.forEach((dataset,index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = dataset.label;
    els.select.appendChild(option);
  });
}

function activeDataset() {
  return datasets[currentIndex];
}

function rowsForPlan(dataset) {
  return isPro ? dataset.rows : dataset.rows.slice(0, FREE_ROW_LIMIT);
}

function renderDataset() {
  const dataset = activeDataset();
  if (!dataset) return;

  const rows = rowsForPlan(dataset);
  els.meta.textContent = `${dataset.rows.length} rows × ${dataset.headers.length} columns`;
  els.limitNotice.hidden = isPro || dataset.rows.length <= FREE_ROW_LIMIT;

  const previewRows = rows.slice(0, PREVIEW_ROW_LIMIT);
  els.preview.innerHTML = "";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  dataset.headers.forEach(header => {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  previewRows.forEach(row => {
    const tr = document.createElement("tr");
    dataset.headers.forEach(header => {
      const td = document.createElement("td");
      td.textContent = normalizeCell(row[header]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  els.preview.append(thead,tbody);
  updateProActions();
}

function toTsv(dataset) {
  const rows = rowsForPlan(dataset);
  const esc = value => normalizeCell(value).replace(/\t/g," ").replace(/\r?\n/g," ");
  return [
    dataset.headers.map(esc).join("\t"),
    ...rows.map(row => dataset.headers.map(header => esc(row[header])).join("\t"))
  ].join("\n");
}

function toCsv(dataset) {
  const quote = value => {
    const text = normalizeCell(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
  };
  return [
    dataset.headers.map(quote).join(","),
    ...dataset.rows.map(row => dataset.headers.map(header => quote(row[header])).join(","))
  ].join("\r\n");
}

function toMarkdown(dataset) {
  const esc = value => normalizeCell(value).replace(/\|/g,"\\|");
  return [
    "| " + dataset.headers.map(esc).join(" | ") + " |",
    "| " + dataset.headers.map(() => "---").join(" | ") + " |",
    ...dataset.rows.map(row => "| " + dataset.headers.map(header => esc(row[header])).join(" | ") + " |")
  ].join("\n");
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function requirePro() {
  if (isPro) return true;
  chrome.runtime.openOptionsPage();
  return false;
}

function updateProActions() {
  [els.csv,els.json,els.markdown].forEach(button => {
    button.textContent = button.dataset.baseLabel || button.textContent.replace(" 🔒","");
    if (!button.dataset.baseLabel) button.dataset.baseLabel = button.textContent;
    if (!isPro) button.textContent += " 🔒";
  });
}

async function refreshPlan() {
  const state = await getProState();
  isPro = state.pro === true;

  if (isPro) {
    els.planBadge.textContent = "PRO";
    els.planBadge.classList.add("pro");
    els.licenseTitle.textContent = "List2Sheet Pro";
    els.licenseDescription.textContent = "Unlimited rows and file exports unlocked.";
    els.activate.textContent = "Manage license";
  } else {
    els.planBadge.textContent = "FREE";
    els.planBadge.classList.remove("pro");
    els.licenseTitle.textContent = "Free plan";
    els.licenseDescription.textContent = "Preview and copy up to 100 rows.";
    els.activate.textContent = "Activate Pro";
  }

  if (activeDataset()) renderDataset();
}

els.scan.addEventListener("click", scanCurrentPage);
els.select.addEventListener("change", () => {
  currentIndex = Number(els.select.value) || 0;
  renderDataset();
});
els.copy.addEventListener("click", async () => {
  const dataset = activeDataset();
  if (!dataset) return;
  await navigator.clipboard.writeText(toTsv(dataset));
  showStatus(`Copied ${rowsForPlan(dataset).length} rows as TSV.`, "success");
});
els.csv.addEventListener("click", () => {
  if (!requirePro()) return;
  downloadText("list2sheet.csv", toCsv(activeDataset()), "text/csv;charset=utf-8");
});
els.json.addEventListener("click", () => {
  if (!requirePro()) return;
  downloadText("list2sheet.json", JSON.stringify(activeDataset().rows,null,2), "application/json;charset=utf-8");
});
els.markdown.addEventListener("click", () => {
  if (!requirePro()) return;
  downloadText("list2sheet.md", toMarkdown(activeDataset()), "text/markdown;charset=utf-8");
});
els.activate.addEventListener("click", () => chrome.runtime.openOptionsPage());

refreshPlan();
