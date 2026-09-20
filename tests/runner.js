const cases=[
  "fixtures/table.html",
  "fixtures/cards.html",
  "fixtures/search.html",
  "fixtures/comments.html",
  "fixtures/danmaku.html",
  "fixtures/pagination.html",
  "fixtures/empty.html"
];

const results=document.querySelector("#results");
const summary=document.querySelector("#summary");
let completed=0;
let passed=0;

window.addEventListener("message",event=>{
  const data=event.data;
  if(data?.type!=="LIST2SHEET_FIXTURE_RESULT") return;
  completed++;
  if(data.pass) passed++;
  const item=document.createElement("div");
  item.className="result "+(data.pass?"pass":"fail");
  item.textContent=(data.pass?"PASS":"FAIL")+" · "+data.name+" · "+data.detail;
  results.appendChild(item);
  summary.textContent=passed+"/"+completed+" passed";
  if(completed===cases.length){
    summary.textContent+=" · "+(passed===cases.length?"All fixtures passed.":"Review failed fixtures.");
  }
});

for(const src of cases){
  const iframe=document.createElement("iframe");
  iframe.src=src+"?t="+Date.now();
  document.body.appendChild(iframe);
}