import {getProState} from "./shared/license-state.js";
import {extractPageDatasets} from "./shared/extractor.js";

const FREE_ROW_LIMIT = 100;
const DEFAULT_PREVIEW_LIMIT = 12;
const SESSION_STATE_PREFIX = "list2sheet_tabstate_v1_";

let datasets = [];
let currentIndex = 0;
let isPro = false;
let currentPageHost = "";
let currentTabId = null;
let currentPageUrl = "";
let sessionSaveTimer = null;
let lastLoadedSessionSavedAt = 0;
const RECIPE_STORAGE_KEY = "list2sheet_recipes_v1";

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
  activate: document.querySelector("#activateButton"),
  highlight: document.querySelector("#highlightButton"),
  toggleFields: document.querySelector("#toggleFieldsButton"),
  fieldEditor: document.querySelector("#fieldEditor"),
  fieldList: document.querySelector("#fieldList"),
  selectAllFields: document.querySelector("#selectAllFields"),
  resetFields: document.querySelector("#resetFields"),
  toggleCleanup: document.querySelector("#toggleCleanupButton"),
  cleanupEditor: document.querySelector("#cleanupEditor"),
  cleanupStats: document.querySelector("#cleanupStats"),
  cleanDuplicates: document.querySelector("#cleanDuplicates"),
  cleanEmpty: document.querySelector("#cleanEmpty"),
  cleanMissingTitle: document.querySelector("#cleanMissingTitle"),
  cleanPrice: document.querySelector("#cleanPrice"),
  cleanTracking: document.querySelector("#cleanTracking"),
  applyCleanup: document.querySelector("#applyCleanup"),
  resetCleanup: document.querySelector("#resetCleanup"),
  xlsx: document.querySelector("#xlsxButton"),
  saveRecipe: document.querySelector("#saveRecipeButton"),
  recipeStatus: document.querySelector("#recipeStatus"),
  forgetRecipe: document.querySelector("#forgetRecipeButton"),
  collectMore: document.querySelector("#collectMoreButton"),
  scrollRounds: document.querySelector("#scrollRounds"),
  collectorStats: document.querySelector("#collectorStats"),
  previewMeta: document.querySelector("#previewMeta"),
  previewLimit: document.querySelector("#previewLimit"),
  pageCount: document.querySelector("#pageCount"),
  collectPages: document.querySelector("#collectPagesButton"),
  paginationStats: document.querySelector("#paginationStats"),
  paginationStatus: document.querySelector("#paginationStatus"),
  stopPages: document.querySelector("#stopPagesButton")
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

function sessionStateKey(tabId = currentTabId) {
  return tabId == null ? "" : SESSION_STATE_PREFIX + tabId;
}

function sanitizeDatasetState(dataset) {
  if (!dataset || !Array.isArray(dataset.headers)) return null;

  dataset.rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  dataset.originalRows = Array.isArray(dataset.originalRows)
    ? dataset.originalRows
    : dataset.rows.map(row => ({...row}));
  dataset.cleanupOptions = {...defaultCleanupOptions(), ...(dataset.cleanupOptions || {})};

  const bySource = new Map();
  if (Array.isArray(dataset.columnConfig)) {
    for (const column of dataset.columnConfig) {
      if (!column?.source || !dataset.headers.includes(column.source) || bySource.has(column.source)) continue;
      bySource.set(column.source, {
        source: column.source,
        label: normalizeCell(column.label) || column.source,
        enabled: column.enabled !== false,
        order: Number.isFinite(column.order) ? column.order : bySource.size
      });
    }
  }

  for (const source of dataset.headers) {
    if (!bySource.has(source)) {
      bySource.set(source, {
        source,
        label: source,
        enabled: true,
        order: bySource.size
      });
    }
  }

  dataset.columnConfig = [...bySource.values()]
    .sort((a,b) => a.order - b.order)
    .map((column,index) => ({...column, order:index}));

  if (!dataset.columnConfig.some(column => column.enabled) && dataset.columnConfig[0]) {
    dataset.columnConfig[0].enabled = true;
  }

  return dataset;
}

async function saveSessionStateNow() {
  if (!currentTabId || !currentPageUrl || !datasets.length || !chrome.storage?.session) return;

  const key = sessionStateKey();
  const payload = {
    url: currentPageUrl,
    host: currentPageHost,
    currentIndex,
    previewLimit: els.previewLimit?.value || String(DEFAULT_PREVIEW_LIMIT),
    datasets,
    savedAt: Date.now()
  };

  try {
    await chrome.storage.session.set({[key]: payload});
    lastLoadedSessionSavedAt = payload.savedAt;
  } catch (error) {
    console.warn("LIST2SHEET_SESSION_SAVE_FAILED", error);
  }
}

function scheduleSessionSave() {
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    saveSessionStateNow();
  }, 120);
}

async function restoreSessionState() {
  if (!chrome.storage?.session) return false;

  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) return false;

  currentTabId = tab.id;
  currentPageUrl = tab.url || "";
  try {
    currentPageHost = new URL(currentPageUrl).hostname.replace(/^www\./,"").toLowerCase();
  } catch {
    currentPageHost = "";
  }

  const key = sessionStateKey(tab.id);
  const result = await chrome.storage.session.get(key);
  const saved = result[key];

  if (!saved || saved.url !== currentPageUrl || !Array.isArray(saved.datasets) || !saved.datasets.length) {
    return false;
  }

  datasets = saved.datasets.map(sanitizeDatasetState).filter(Boolean);
  if (!datasets.length) return false;
  lastLoadedSessionSavedAt = Number(saved.savedAt)||0;

  currentIndex = Math.max(0,Math.min(Number(saved.currentIndex)||0,datasets.length-1));
  if (els.previewLimit) {
    const allowed = new Set(["12","50","all"]);
    els.previewLimit.value = allowed.has(String(saved.previewLimit)) ? String(saved.previewLimit) : "12";
  }

  populateDatasetSelect();
  els.select.value = String(currentIndex);
  applyCleanupControls(activeDataset()?.cleanupOptions || defaultCleanupOptions());
  renderFieldEditor();
  renderDataset();
  await updateRecipeUi();
  els.results.hidden = false;
  showStatus(`Restored ${activeDataset()?.rows?.length || 0} collected rows from this tab.`,"success");
  return true;
}

async function syncSessionStateFromBackground() {
  if (!currentTabId || !chrome.storage?.session) return false;

  const key=sessionStateKey(currentTabId);
  const result=await chrome.storage.session.get(key);
  const saved=result[key];

  if(!saved || !Array.isArray(saved.datasets) || !saved.datasets.length) return false;
  const savedAt=Number(saved.savedAt)||0;
  if(savedAt<=lastLoadedSessionSavedAt) return false;

  const nextDatasets=saved.datasets.map(sanitizeDatasetState).filter(Boolean);
  if(!nextDatasets.length) return false;

  datasets=nextDatasets;
  currentIndex=Math.max(0,Math.min(Number(saved.currentIndex)||0,datasets.length-1));
  currentPageUrl=saved.url||currentPageUrl;
  currentPageHost=saved.host||currentPageHost;
  lastLoadedSessionSavedAt=savedAt;

  populateDatasetSelect();
  els.select.value=String(currentIndex);
  applyCleanupControls(activeDataset()?.cleanupOptions||defaultCleanupOptions());
  renderFieldEditor();
  renderDataset();
  await updateRecipeUi();
  els.results.hidden=false;
  return true;
}

function datasetKind(dataset) {
  if (!dataset) return "dataset";
  if (dataset.type === "table") return "table";
  return String(dataset.label || "repeated").split("·")[0].trim().toLowerCase();
}

function recipeKey(dataset) {
  const headers = Array.isArray(dataset?.headers) ? dataset.headers.join("¦") : "";
  return [currentPageHost || "unknown", dataset?.type || "unknown", datasetKind(dataset), headers].join("|");
}

function recipeMatchScore(dataset, recipe) {
  if (!dataset || !recipe) return -1;
  if ((recipe.host || "") !== (currentPageHost || "")) return -1;
  if (recipe.type && recipe.type !== dataset.type) return -1;

  const datasetHeaders = new Set(dataset.headers || []);
  const recipeColumns = Array.isArray(recipe.columns) ? recipe.columns : [];
  const savedSources = recipeColumns.map(column => column.source).filter(Boolean);
  const overlap = savedSources.filter(source => datasetHeaders.has(source)).length;
  const overlapRatio = savedSources.length ? overlap / savedSources.length : 0;

  let score = overlapRatio * 100;

  const currentKind = datasetKind(dataset);
  if (recipe.kind && recipe.kind === currentKind) score += 35;

  const savedSignature = recipe.sourceHint?.signature || "";
  const currentSignature = dataset.meta?.signature || "";
  if (savedSignature && currentSignature && savedSignature === currentSignature) score += 120;

  const savedTag = recipe.sourceHint?.itemTag || "";
  const currentTag = dataset.source?.itemTag || "";
  if (savedTag && currentTag && savedTag === currentTag) score += 15;

  const savedClasses = Array.isArray(recipe.sourceHint?.itemClasses) ? recipe.sourceHint.itemClasses : [];
  const currentClasses = new Set(Array.isArray(dataset.source?.itemClasses) ? dataset.source.itemClasses : []);
  if (savedClasses.length) {
    const classOverlap = savedClasses.filter(name => currentClasses.has(name)).length / savedClasses.length;
    score += classOverlap * 40;
  }

  // A recipe must still share most of its source fields. This prevents a
  // product recipe from being applied to an unrelated price/banner dataset.
  if (savedSources.length && overlapRatio < 0.6 && !(savedSignature && savedSignature === currentSignature)) {
    return -1;
  }

  return score;
}

async function loadRecipeMap() {
  const result = await chrome.storage.local.get(RECIPE_STORAGE_KEY);
  return result[RECIPE_STORAGE_KEY] || {};
}

async function saveRecipeMap(map) {
  await chrome.storage.local.set({[RECIPE_STORAGE_KEY]: map});
}

function currentCleanupOptions() {
  return {
    removeDuplicates: els.cleanDuplicates.checked,
    removeEmpty: els.cleanEmpty.checked,
    removeMissingTitle: els.cleanMissingTitle.checked,
    normalizePrice: els.cleanPrice.checked,
    stripTracking: els.cleanTracking.checked
  };
}

function defaultCleanupOptions() {
  return {
    removeDuplicates: true,
    removeEmpty: true,
    removeMissingTitle: false,
    normalizePrice: true,
    stripTracking: false
  };
}

function applyCleanupControls(options = defaultCleanupOptions()) {
  els.cleanDuplicates.checked = options.removeDuplicates !== false;
  els.cleanEmpty.checked = options.removeEmpty !== false;
  els.cleanMissingTitle.checked = options.removeMissingTitle === true;
  els.cleanPrice.checked = options.normalizePrice !== false;
  els.cleanTracking.checked = options.stripTracking === true;
}

function applyRecipeToDataset(dataset, recipe) {
  if (!dataset || !recipe) return false;

  const savedColumns = Array.isArray(recipe.columns) ? recipe.columns : [];
  const currentSources = new Set(dataset.headers || []);
  const compatible = savedColumns.length &&
    savedColumns.every(column => currentSources.has(column.source));

  if (compatible) {
    dataset.columnConfig = savedColumns.map((column,index) => ({
      source: column.source,
      label: column.label || column.source,
      enabled: column.enabled !== false,
      order: Number.isFinite(column.order) ? column.order : index
    }));
  }

  dataset.cleanupOptions = {...defaultCleanupOptions(), ...(recipe.cleanup || {})};
  dataset.rows = cleanupDataset(dataset, dataset.cleanupOptions);
  dataset.appliedRecipeKey = recipe.key || recipeKey(dataset);
  return true;
}

async function findBestRecipe(dataset, map = null) {
  if (!dataset) return null;
  const recipes = map || await loadRecipeMap();

  // Prefer the exact legacy/current key first.
  const exactKey = recipeKey(dataset);
  if (recipes[exactKey]) return {key: exactKey, recipe: recipes[exactKey], score: 999};

  let best = null;
  for (const [key, recipe] of Object.entries(recipes)) {
    const score = recipeMatchScore(dataset, recipe);
    if (score < 0) continue;
    if (!best || score > best.score) best = {key, recipe, score};
  }
  return best;
}

async function applySavedRecipes() {
  const map = await loadRecipeMap();
  let applied = 0;
  let preferredIndex = -1;
  let preferredScore = -1;

  for (let index = 0; index < datasets.length; index++) {
    const dataset = datasets[index];
    const match = await findBestRecipe(dataset, map);
    if (!match) continue;

    if (applyRecipeToDataset(dataset, {...match.recipe, key: match.key})) {
      applied++;
      if (match.score > preferredScore) {
        preferredScore = match.score;
        preferredIndex = index;
      }
    }
  }

  return {count: applied, preferredIndex};
}

async function hasSavedRecipe(dataset = activeDataset()) {
  return Boolean(await findBestRecipe(dataset));
}

async function updateRecipeUi(dataset = activeDataset()) {
  if (!dataset || !els.saveRecipe) return;
  const saved = await hasSavedRecipe(dataset);
  els.saveRecipe.textContent = saved ? "Saved ✓" : "Save settings";
  els.saveRecipe.classList.toggle("saved", saved);
  els.recipeStatus.textContent = saved
    ? `Saved for ${currentPageHost}. It will auto-apply after the next scan.`
    : "Settings are not saved for this dataset.";
  els.forgetRecipe.hidden = !saved;
}

function markRecipeDirty() {
  const dataset = activeDataset();
  if (!dataset || !els.saveRecipe) return;
  els.saveRecipe.textContent = "Save settings";
  els.saveRecipe.classList.remove("saved");
  els.recipeStatus.textContent = "Settings changed. Save to reuse them after the next scan.";
}

async function scanTabFrames(tabId) {
  const results=await chrome.scripting.executeScript({
    target:{tabId,allFrames:true},
    func:extractPageDatasets
  });

  const merged=[];
  for(const frameResult of results||[]){
    const frameId=Number(frameResult.frameId)||0;
    for(const dataset of frameResult.result||[]){
      dataset.source=dataset.source||{};
      dataset.source.frameId=frameId;
      dataset.meta={...(dataset.meta||{}),frameId};
      merged.push(dataset);
    }
  }
  merged.sort((a,b)=>(b.score||0)-(a.score||0));
  return merged;
}

function scriptTargetForDataset(tabId,dataset){
  const frameId=Number(dataset?.source?.frameId)||0;
  return {tabId,frameIds:[frameId]};
}

async function scanCurrentPage() {
  hideStatus();
  els.scan.disabled = true;
  els.scan.textContent = "Scanning…";

  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error("No active tab found.");
    currentTabId = tab.id;
    currentPageUrl = tab.url || "";
    try {
      currentPageHost = new URL(currentPageUrl).hostname.replace(/^www\./,"").toLowerCase();
    } catch {
      currentPageHost = "";
    }

    datasets = await scanTabFrames(tab.id);
    datasets.forEach(dataset => {
      dataset.originalRows = dataset.rows.map(row => ({...row}));
      dataset.cleanupOptions = defaultCleanupOptions();
      resetColumnConfig(dataset);
      sanitizeDatasetState(dataset);
    });
    const savedApplied = await applySavedRecipes();
    currentIndex = savedApplied.preferredIndex >= 0 ? savedApplied.preferredIndex : 0;

    if (!datasets.length) {
      els.results.hidden = true;
      showStatus("No structured dataset detected on this page. Try a page with a table, product grid, search results, or repeated cards.");
      return;
    }

    populateDatasetSelect();
    els.select.value = String(currentIndex);
    applyCleanupControls(activeDataset()?.cleanupOptions || defaultCleanupOptions());
    renderFieldEditor();
    renderDataset();
    await updateRecipeUi();
    els.results.hidden = false;
    scheduleSessionSave();
    showStatus(
      savedApplied.count
        ? `Detected ${datasets.length} dataset${datasets.length === 1 ? "" : "s"}. Applied ${savedApplied.count} saved setting${savedApplied.count === 1 ? "" : "s"} and selected the best match.`
        : `Detected ${datasets.length} dataset${datasets.length === 1 ? "" : "s"}.`,
      "success"
    );
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

function resetColumnConfig(dataset) {
  dataset.columnConfig = dataset.headers.map((source, index) => ({
    source,
    label: source,
    enabled: true,
    order: index
  }));
}

function columnConfig(dataset) {
  sanitizeDatasetState(dataset);
  return dataset.columnConfig.sort((a,b) => a.order - b.order);
}

function activeColumns(dataset) {
  return columnConfig(dataset).filter(column => column.enabled);
}

function normalizedExportRows(dataset) {
  const columns = activeColumns(dataset);
  return rowsForPlan(dataset).map(row => {
    const out = {};
    columns.forEach(column => {
      out[column.label || column.source] = row[column.source] ?? "";
    });
    return out;
  });
}

function renderFieldEditor() {
  const dataset = activeDataset();
  if (!dataset) return;
  const columns = columnConfig(dataset);
  els.fieldList.innerHTML = "";

  columns.forEach((column, index) => {
    const row = document.createElement("div");
    row.className = "fieldRow";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = column.enabled;
    check.title = "Include this field";
    check.addEventListener("change", () => {
      column.enabled = check.checked;
      renderDataset();
      markRecipeDirty();
      scheduleSessionSave();
    });

    const input = document.createElement("input");
    input.className = "fieldName";
    input.value = column.label;
    input.title = `Source: ${column.source}`;
    input.addEventListener("input", () => {
      column.label = input.value.trim() || column.source;
      renderDataset();
      markRecipeDirty();
    });

    const up = document.createElement("button");
    up.type = "button";
    up.className = "orderButton";
    up.textContent = "↑";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveColumn(dataset, index, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "orderButton";
    down.textContent = "↓";
    down.disabled = index === columns.length - 1;
    down.addEventListener("click", () => moveColumn(dataset, index, 1));

    row.append(check, input, up, down);
    els.fieldList.appendChild(row);
  });
}

function moveColumn(dataset, index, direction) {
  const columns = columnConfig(dataset);
  const target = index + direction;
  if (target < 0 || target >= columns.length) return;
  const a = columns[index];
  const b = columns[target];
  const order = a.order;
  a.order = b.order;
  b.order = order;
  renderFieldEditor();
  renderDataset();
}

function cloneRows(rows) {
  return rows.map(row => ({...row}));
}

function normalizePrice(value) {
  let text = normalizeCell(value);
  if (!text) return "";
  text = text.replace(/￥/g, "¥");
  text = text.replace(/^\s*¥\s*/, "¥");
  text = text.replace(/^\s*\$\s*/, "$");
  text = text.replace(/^\s*€\s*/, "€");
  text = text.replace(/^\s*£\s*/, "£");
  if (/^\d[\d,.]*(?:\.\d+)?\s*元$/i.test(text)) {
    text = "¥" + text.replace(/\s*元$/i, "");
  }
  return text;
}

function stripTrackingParams(value) {
  const text = normalizeCell(value);
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    const url = new URL(text);
    const exact = new Set(["fbclid","gclid","dclid","msclkid","mc_cid","mc_eid"]);
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || exact.has(lower)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return text;
  }
}

function cleanupDataset(dataset, options) {
  const sourceRows = cloneRows(dataset.originalRows || dataset.rows);
  let rows = sourceRows.map(row => {
    const out = {};
    for (const [key,value] of Object.entries(row)) {
      let next = normalizeCell(value);
      if (options.normalizePrice && key === "Price") next = normalizePrice(next);
      if (options.stripTracking && key === "URL") next = stripTrackingParams(next);
      out[key] = next;
    }
    return out;
  });

  if (options.removeEmpty) {
    rows = rows.filter(row => Object.values(row).some(value => normalizeCell(value)));
  }

  if (options.removeMissingTitle && dataset.headers.includes("Title")) {
    rows = rows.filter(row => normalizeCell(row.Title));
  }

  if (options.removeDuplicates) {
    const seen = new Set();
    rows = rows.filter(row => {
      const fingerprint = dataset.headers.map(header => normalizeCell(row[header])).join("\u241F");
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
  }

  return rows;
}

function renderCleanupStats(dataset = activeDataset()) {
  if (!dataset || !els.cleanupStats) return;
  const original = dataset.originalRows?.length ?? dataset.rows.length;
  const current = dataset.rows.length;
  els.cleanupStats.textContent = current === original ? `${current} rows` : `${original} → ${current} rows`;
}

function renderDataset() {
  const dataset = activeDataset();
  if (!dataset) return;

  const rows = rowsForPlan(dataset);
  let columns = activeColumns(dataset);
  if (!columns.length) {
    const first = columnConfig(dataset)[0];
    if (first) first.enabled = true;
    columns = activeColumns(dataset);
  }
  els.meta.textContent = `${dataset.rows.length} rows × ${columns.length} selected`;
  els.limitNotice.hidden = isPro || dataset.rows.length <= FREE_ROW_LIMIT;

  const previewMode = els.previewLimit?.value || String(DEFAULT_PREVIEW_LIMIT);
  const previewCount = previewMode === "all"
    ? rows.length
    : Math.max(1, Number(previewMode) || DEFAULT_PREVIEW_LIMIT);
  const previewRows = rows.slice(0, previewCount);
  if (els.previewMeta) {
    els.previewMeta.textContent = `Showing ${previewRows.length} of ${rows.length} row${rows.length === 1 ? "" : "s"}`;
  }
  els.preview.innerHTML = "";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach(column => {
    const th = document.createElement("th");
    th.textContent = column.label || column.source;
    th.title = column.source;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  previewRows.forEach(row => {
    const tr = document.createElement("tr");
    columns.forEach(column => {
      const td = document.createElement("td");
      td.textContent = normalizeCell(row[column.source]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  els.preview.append(thead,tbody);
  renderCleanupStats(dataset);
  if (els.collectorStats) els.collectorStats.textContent = `${dataset.rows.length} collected`;
  updateProActions();
}

function toTsv(dataset) {
  const columns = activeColumns(dataset);
  const rows = rowsForPlan(dataset);
  const esc = value => normalizeCell(value).replace(/\t/g," ").replace(/\r?\n/g," ");
  return [
    columns.map(column => esc(column.label || column.source)).join("\t"),
    ...rows.map(row => columns.map(column => esc(row[column.source])).join("\t"))
  ].join("\n");
}

function toCsv(dataset) {
  const columns = activeColumns(dataset);
  const rows = rowsForPlan(dataset);
  const quote = value => {
    const text = normalizeCell(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
  };
  return [
    columns.map(column => quote(column.label || column.source)).join(","),
    ...rows.map(row => columns.map(column => quote(row[column.source])).join(","))
  ].join("\r\n");
}

function toMarkdown(dataset) {
  const columns = activeColumns(dataset);
  const rows = rowsForPlan(dataset);
  const esc = value => normalizeCell(value).replace(/\|/g,"\\|");
  return [
    "| " + columns.map(column => esc(column.label || column.source)).join(" | ") + " |",
    "| " + columns.map(() => "---").join(" | ") + " |",
    ...rows.map(row => "| " + columns.map(column => esc(row[column.source])).join(" | ") + " |")
  ].join("\n");
}

function toJson(dataset) {
  return JSON.stringify(normalizedExportRows(dataset), null, 2);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&apos;");
}

function excelColumnName(index) {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    value--;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

function crc32(bytes) {
  if (!crc32.table) {
    crc32.table = Array.from({length:256}, (_,n) => {
      let c=n;
      for(let k=0;k<8;k++) c=(c&1) ? (0xEDB88320^(c>>>1)) : (c>>>1);
      return c>>>0;
    });
  }
  let crc=0xFFFFFFFF;
  for(const byte of bytes) crc=crc32.table[(crc^byte)&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

function u16(value) {
  return new Uint8Array([value&255,(value>>>8)&255]);
}

function u32(value) {
  return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);
}

function concatBytes(parts) {
  const length=parts.reduce((sum,part)=>sum+part.length,0);
  const out=new Uint8Array(length);
  let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.length;}
  return out;
}

function makeZip(files) {
  const encoder=new TextEncoder();
  const localParts=[];
  const centralParts=[];
  let offset=0;

  files.forEach(file => {
    const name=encoder.encode(file.name);
    const data=typeof file.data==="string" ? encoder.encode(file.data) : file.data;
    const crc=crc32(data);

    const local=concatBytes([
      u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),
      name,data
    ]);
    localParts.push(local);

    const central=concatBytes([
      u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),
      u16(0),u16(0),u32(0),u32(offset),name
    ]);
    centralParts.push(central);
    offset+=local.length;
  });

  const central=concatBytes(centralParts);
  const end=concatBytes([
    u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),
    u32(central.length),u32(offset),u16(0)
  ]);
  return concatBytes([...localParts,central,end]);
}

function toXlsx(dataset) {
  const columns=activeColumns(dataset);
  const rows=rowsForPlan(dataset);
  const allRows=[
    columns.map(column => column.label || column.source),
    ...rows.map(row => columns.map(column => normalizeCell(row[column.source])))
  ];

  const sheetRows=allRows.map((row,rowIndex) => {
    const cells=row.map((value,colIndex) => {
      const ref=excelColumnName(colIndex)+(rowIndex+1);
      const text=String(value ?? "");
      const numeric=/^-?\d+(?:\.\d+)?$/.test(text) && !/^0\d+/.test(text);
      if(numeric) return `<c r="${ref}"><v>${xmlEscape(text)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex+1}">${cells}</row>`;
  }).join("");

  const lastRef=excelColumnName(Math.max(columns.length-1,0))+Math.max(allRows.length,1);
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastRef}"/>
<sheetData>${sheetRows}</sheetData>
</worksheet>`;

  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="List2Sheet" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  return makeZip([
    {name:"[Content_Types].xml",data:contentTypes},
    {name:"_rels/.rels",data:rootRels},
    {name:"xl/workbook.xml",data:workbook},
    {name:"xl/_rels/workbook.xml.rels",data:workbookRels},
    {name:"xl/worksheets/sheet1.xml",data:sheet}
  ]);
}

function downloadBytes(filename, bytes, mime) {
  const blob=new Blob([bytes],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
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
  [els.csv,els.json,els.markdown,els.xlsx].forEach(button => {
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
    if (els.collectMore) els.collectMore.textContent = "Auto-scroll & collect";
    if (els.collectPages) els.collectPages.textContent = "Collect next pages";
  } else {
    els.planBadge.textContent = "FREE";
    els.planBadge.classList.remove("pro");
    els.licenseTitle.textContent = "Free plan";
    els.licenseDescription.textContent = "Preview and copy up to 100 rows.";
    els.activate.textContent = "Activate Pro";
    if (els.collectMore) els.collectMore.textContent = "Auto-scroll & collect 🔒";
    if (els.collectPages) els.collectPages.textContent = "Collect next pages 🔒";
  }

  if (activeDataset()) renderDataset();
}

function mergeCollectedRows(dataset, incomingRows) {
  const headers = dataset.headers || [];
  const map = new Map();

  const add = (row) => {
    const url = normalizeCell(row.URL);
    const title = normalizeCell(row.Title);
    const price = normalizeCell(row.Price);
    const image = normalizeCell(row.Image);
    const fallback = headers.map(header => normalizeCell(row[header])).join("\u241F");
    const key = url || [title,price,image].filter(Boolean).join("\u241F") || fallback;
    if (!key) return;
    if (!map.has(key)) map.set(key, {...row});
  };

  for (const row of dataset.originalRows || dataset.rows || []) add(row);
  for (const row of incomingRows || []) add(row);

  return [...map.values()];
}

async function collectMoreFromPage(dataset, maxRounds) {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) throw new Error("No active tab found.");

  const datasetTarget=scriptTargetForDataset(tab.id,dataset);

  const originalPositionResult = await chrome.scripting.executeScript({
    target:datasetTarget,
    func:() => ({
      y: window.scrollY,
      height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    })
  });
  const originalY = originalPositionResult?.[0]?.result?.y || 0;

  const accumulated = new Map();
  const addRows = rows => {
    for (const row of rows || []) {
      const url = normalizeCell(row.URL);
      const title = normalizeCell(row.Title);
      const price = normalizeCell(row.Price);
      const image = normalizeCell(row.Image);
      const key = url || [title,price,image].filter(Boolean).join("\u241F") || JSON.stringify(row);
      if (key && !accumulated.has(key)) accumulated.set(key,{...row});
    }
  };

  addRows(dataset.originalRows || dataset.rows);

  const matchScannedDataset = scannedDatasets => {
    let best = null;

    for (const candidate of scannedDatasets || []) {
      if (candidate.type !== dataset.type) continue;

      let score = 0;
      const originalHeaders = new Set(dataset.headers || []);
      const candidateHeaders = new Set(candidate.headers || []);
      const shared = [...originalHeaders].filter(header => candidateHeaders.has(header)).length;
      const headerRatio = originalHeaders.size ? shared / originalHeaders.size : 0;
      score += headerRatio * 100;

      if (dataset.meta?.signature && candidate.meta?.signature &&
          dataset.meta.signature === candidate.meta.signature) score += 180;

      if (datasetKind(candidate) === datasetKind(dataset)) score += 45;

      const originalClasses = new Set(dataset.source?.itemClasses || []);
      const candidateClasses = candidate.source?.itemClasses || [];
      if (candidateClasses.length) {
        const overlap = candidateClasses.filter(name => originalClasses.has(name)).length;
        score += (overlap / candidateClasses.length) * 45;
      }

      if (candidate.rows?.length) score += Math.min(candidate.rows.length,100) * 0.2;

      if (!best || score > best.score) best = {candidate,score};
    }

    return best && best.score >= 70 ? best.candidate : null;
  };

  let rounds=0;
  let noGrowth=0;
  let previousCount=accumulated.size;
  let previousHeight=originalPositionResult?.[0]?.result?.height || 0;

  try {
    for (let round=0; round<Math.max(1,Math.min(Number(maxRounds)||10,30)); round++) {
      rounds=round+1;

      await chrome.scripting.executeScript({
        target:datasetTarget,
        func:() => {
          const height=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
          window.scrollTo({top:height,behavior:"smooth"});
          return height;
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1400));

      // Re-run the exact same extraction engine used by the normal Scan button.
      const scanResult = await chrome.scripting.executeScript({
        target:datasetTarget,
        func:extractPageDatasets
      });
      const scannedDatasets=scanResult?.[0]?.result || [];
      const matched=matchScannedDataset(scannedDatasets);
      if (matched) addRows(matched.rows);

      const heightResult = await chrome.scripting.executeScript({
        target:datasetTarget,
        func:() => Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)
      });
      const nextHeight=heightResult?.[0]?.result || previousHeight;
      const nextCount=accumulated.size;

      if (nextCount===previousCount && nextHeight===previousHeight) noGrowth++;
      else noGrowth=0;

      previousCount=nextCount;
      previousHeight=nextHeight;

      if (noGrowth>=2) break;
    }
  } finally {
    await chrome.scripting.executeScript({
      target:datasetTarget,
      args:[originalY],
      func:(y) => window.scrollTo({top:y,behavior:"auto"})
    }).catch(()=>{});
  }

  return {
    rows:[...accumulated.values()],
    rounds,
    stoppedEarly:noGrowth>=2,
    count:accumulated.size
  };
}

els.scan.addEventListener("click", scanCurrentPage);
els.select.addEventListener("change", () => {
  currentIndex = Number(els.select.value) || 0;
  applyCleanupControls(activeDataset()?.cleanupOptions || defaultCleanupOptions());
  renderFieldEditor();
  renderDataset();
  renderCleanupStats();
  updateRecipeUi();
  scheduleSessionSave();
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
  downloadText("list2sheet.json", toJson(activeDataset()), "application/json;charset=utf-8");
});
els.markdown.addEventListener("click", () => {
  if (!requirePro()) return;
  downloadText("list2sheet.md", toMarkdown(activeDataset()), "text/markdown;charset=utf-8");
});
els.xlsx.addEventListener("click", () => {
  if (!requirePro()) return;
  const bytes=toXlsx(activeDataset());
  downloadBytes("list2sheet.xlsx",bytes,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

els.toggleFields.addEventListener("click", () => {
  const willOpen = els.fieldEditor.hidden;
  els.fieldEditor.hidden = !willOpen;
  els.toggleFields.textContent = willOpen ? "Hide fields" : "Edit fields";
  if (willOpen) renderFieldEditor();
});

els.selectAllFields.addEventListener("click", () => {
  const dataset = activeDataset();
  if (!dataset) return;
  columnConfig(dataset).forEach(column => column.enabled = true);
  renderFieldEditor();
  renderDataset();
  markRecipeDirty();
  scheduleSessionSave();
});

els.resetFields.addEventListener("click", () => {
  const dataset = activeDataset();
  if (!dataset) return;
  resetColumnConfig(dataset);
  renderFieldEditor();
  renderDataset();
  markRecipeDirty();
  scheduleSessionSave();
});

els.highlight.addEventListener("click", async () => {
  const dataset = activeDataset();
  if (!dataset?.source) return;

  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error("No active tab found.");

    const result = await chrome.scripting.executeScript({
      target:scriptTargetForDataset(tab.id,dataset),
      args:[dataset.source],
      func:(source) => {
        const targets = [];
        if (source?.kind === "table" && source.selector) {
          const element = document.querySelector(source.selector);
          if (element) targets.push(element);
        } else if (source?.kind === "repeated" && source.parentSelector) {
          const parent = document.querySelector(source.parentSelector);
          if (parent) {
            const children = [...parent.children];
            for (const index of source.childIndexes || []) {
              if (children[index]) targets.push(children[index]);
            }
          }
        } else if (source?.kind === "search" && Array.isArray(source.selectors)) {
          for (const selector of source.selectors) {
            try {
              const element=document.querySelector(selector);
              if(element) targets.push(element);
            } catch {}
          }
        }

        if (!targets.length) return 0;

        const originals = targets.map(element => ({
          element,
          outline: element.style.outline,
          outlineOffset: element.style.outlineOffset,
          background: element.style.backgroundColor
        }));

        targets.forEach(element => {
          element.style.outline = "3px solid #57d39b";
          element.style.outlineOffset = "2px";
        });

        targets[0].scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"});

        setTimeout(() => {
          originals.forEach(({element,outline,outlineOffset,background}) => {
            element.style.outline = outline;
            element.style.outlineOffset = outlineOffset;
            element.style.backgroundColor = background;
          });
        }, 2600);

        return targets.length;
      }
    });

    const count = result?.[0]?.result || 0;
    showStatus(count ? `Highlighted ${count} source element${count === 1 ? "" : "s"} on the page.` : "Could not locate the source elements. Re-scan the page and try again.", count ? "success" : "");
  } catch (error) {
    showStatus("Could not highlight this dataset: " + error.message, "error");
  }
});

els.toggleCleanup.addEventListener("click", () => {
  const willOpen=els.cleanupEditor.hidden;
  els.cleanupEditor.hidden=!willOpen;
  els.toggleCleanup.textContent=willOpen ? "Hide cleanup" : "Clean data";
  if(willOpen) renderCleanupStats();
});

els.applyCleanup.addEventListener("click", () => {
  const dataset=activeDataset();
  if(!dataset) return;
  const before=dataset.rows.length;
  dataset.cleanupOptions=currentCleanupOptions();
  dataset.rows=cleanupDataset(dataset,dataset.cleanupOptions);
  renderDataset();
  markRecipeDirty();
  scheduleSessionSave();
  const removed=before-dataset.rows.length;
  showStatus(removed>0 ? `Cleanup complete. Removed ${removed} row${removed===1?"":"s"}.` : "Cleanup complete. No rows were removed.","success");
});

els.resetCleanup.addEventListener("click", () => {
  const dataset=activeDataset();
  if(!dataset?.originalRows) return;
  dataset.rows=cloneRows(dataset.originalRows);
  dataset.cleanupOptions=defaultCleanupOptions();
  applyCleanupControls(dataset.cleanupOptions);
  renderDataset();
  markRecipeDirty();
  scheduleSessionSave();
  showStatus("Original scanned rows restored.","success");
});

[els.cleanDuplicates,els.cleanEmpty,els.cleanMissingTitle,els.cleanPrice,els.cleanTracking].forEach(control => {
  control.addEventListener("change", markRecipeDirty);
});

els.saveRecipe.addEventListener("click", async () => {
  const dataset=activeDataset();
  if(!dataset) return;

  const map=await loadRecipeMap();
  const key=recipeKey(dataset);
  dataset.cleanupOptions=currentCleanupOptions();

  map[key]={
    key,
    host:currentPageHost,
    type:dataset.type,
    kind:datasetKind(dataset),
    headers:[...(dataset.headers || [])],
    sourceHint:{
      signature:dataset.meta?.signature || "",
      itemTag:dataset.source?.itemTag || "",
      itemClasses:Array.isArray(dataset.source?.itemClasses) ? [...dataset.source.itemClasses] : []
    },
    columns:columnConfig(dataset).map(column => ({
      source:column.source,
      label:column.label,
      enabled:column.enabled,
      order:column.order
    })),
    cleanup:{...dataset.cleanupOptions},
    updatedAt:Date.now()
  };

  await saveRecipeMap(map);
  dataset.appliedRecipeKey=key;
  await updateRecipeUi(dataset);
  scheduleSessionSave();
  showStatus(`Settings saved for ${currentPageHost || "this site"}. They will auto-apply after the next scan.`,"success");
});

els.forgetRecipe.addEventListener("click", async () => {
  const dataset=activeDataset();
  if(!dataset) return;
  const map=await loadRecipeMap();
  const match=await findBestRecipe(dataset,map);
  if(match?.key) delete map[match.key];
  await saveRecipeMap(map);
  dataset.appliedRecipeKey="";
  await updateRecipeUi(dataset);
  showStatus("Saved settings removed. Current preview is unchanged.","success");
});

els.collectMore.addEventListener("click", async () => {
  if (!requirePro()) return;

  const dataset=activeDataset();
  if(!dataset?.source){
    showStatus("Scan and choose a dataset before collecting more.","error");
    return;
  }

  const oldText=els.collectMore.textContent;
  els.collectMore.disabled=true;
  els.scan.disabled=true;
  els.collectMore.textContent="Collecting…";
  showStatus("Auto-scrolling the page and collecting newly loaded rows. Please keep this tab open.");

  try{
    const result=await collectMoreFromPage(dataset,els.scrollRounds.value);
    const before=(dataset.originalRows||dataset.rows).length;
    dataset.originalRows=result.rows.map(row => ({...row}));
    dataset.rows=cleanupDataset(dataset,dataset.cleanupOptions||currentCleanupOptions());
    const after=dataset.rows.length;

    renderDataset();
    renderFieldEditor();
    scheduleSessionSave();

    const added=Math.max(0,after-before);
    const suffix=result.stoppedEarly
      ? ` Stopped early after ${result.rounds} scrolls because no more rows appeared.`
      : ` Completed ${result.rounds} scrolls.`;

    showStatus(
      added
        ? `Collected ${added} new row${added===1?"":"s"}; ${after} total.${suffix}`
        : `No new rows were found; ${after} total.${suffix}`,
      added ? "success" : ""
    );
  }catch(error){
    showStatus("Could not collect more rows: "+error.message,"error");
  }finally{
    els.collectMore.disabled=false;
    els.scan.disabled=false;
    els.collectMore.textContent=isPro ? "Auto-scroll & collect" : "Auto-scroll & collect 🔒";
  }
});

els.previewLimit.addEventListener("change", () => {
  renderDataset();
  scheduleSessionSave();
});

let paginationPollTimer = null;

async function refreshPaginationStatus() {
  if (!currentTabId) {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (tab?.id) currentTabId = tab.id;
  }
  if (!currentTabId) return;

  try {
    await syncSessionStateFromBackground();
    const response = await chrome.runtime.sendMessage({
      type:"LIST2SHEET_PAGINATION_STATUS",
      tabId:currentTabId
    });
    const task=response?.task;
    if(!task){
      els.paginationStats.textContent="";
      els.paginationStatus.textContent="Works with normal same-site Next-page links. The task keeps running even when the popup closes during navigation.";
      els.stopPages.hidden=true;
      return;
    }

    const total=task.rowsCollected || activeDataset()?.rows?.length || 0;
    els.paginationStats.textContent=`${total} collected`;

    const pageCounts=Array.isArray(task.pageRowCounts)&&task.pageRowCounts.length
      ? ` Page rows: ${task.pageRowCounts.join(" / ")}.`
      : "";

    if(task.status==="running"){
      els.paginationStatus.textContent=
        `Collecting page ${Math.min(task.pagesVisited+1,task.pagesTarget)} of ${task.pagesTarget} next page${task.pagesTarget===1?"":"s"}… ${total} rows collected.${pageCounts}`;
      els.stopPages.hidden=false;
      els.collectPages.disabled=true;
    }else{
      els.stopPages.hidden=true;
      els.collectPages.disabled=false;
      const reason=task.reason ? ` ${task.reason}` : "";
      els.paginationStatus.textContent=
        task.status==="complete"
          ? `Pagination complete: ${task.pagesVisited} page${task.pagesVisited===1?"":"s"} visited, ${total} rows collected.${pageCounts}${reason}`
          : task.status==="stopped"
            ? `Pagination stopped after ${task.pagesVisited} page${task.pagesVisited===1?"":"s"}. ${total} rows collected.${pageCounts}`
            : `Pagination ended: ${task.status}. ${total} rows collected.${pageCounts}${reason}`;
    }
  } catch (error) {
    console.warn("LIST2SHEET_PAGINATION_STATUS_FAILED",error);
  }
}

els.collectPages.addEventListener("click", async () => {
  if(!requirePro()) return;
  const dataset=activeDataset();
  if(!dataset){
    showStatus("Scan and choose a dataset before collecting pages.","error");
    return;
  }

  await saveSessionStateNow();
  els.collectPages.disabled=true;
  els.paginationStatus.textContent="Starting multi-page collection…";

  try{
    const response=await chrome.runtime.sendMessage({
      type:"LIST2SHEET_PAGINATION_START",
      tabId:currentTabId,
      pages:Number(els.pageCount.value)||5
    });

    if(!response?.ok){
      throw new Error(response?.error || "Could not start pagination.");
    }

    showStatus("Pagination started. The page may navigate and close this popup. Re-open List2Sheet at any time to see progress.","success");
    await refreshPaginationStatus();
  }catch(error){
    els.collectPages.disabled=false;
    showStatus("Could not start pagination: "+error.message,"error");
  }
});

els.stopPages.addEventListener("click", async () => {
  if(!currentTabId) return;
  await chrome.runtime.sendMessage({
    type:"LIST2SHEET_PAGINATION_STOP",
    tabId:currentTabId
  }).catch(()=>{});
  await refreshPaginationStatus();
});

els.activate.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function initializePopup() {
  await refreshPlan();
  await restoreSessionState();
  await refreshPaginationStatus();
  paginationPollTimer=setInterval(refreshPaginationStatus,800);
}

window.addEventListener("unload",() => {
  if(paginationPollTimer) clearInterval(paginationPollTimer);
});

initializePopup();