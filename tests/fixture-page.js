import {extractPageDatasets} from "../shared/extractor.js";

const body=document.body;
const name=body.dataset.testCase || "unknown";
const expected=body.dataset.expectType || "";
const minRows=Number(body.dataset.expectMinRows || 0);

requestAnimationFrame(() => {
  const datasets=extractPageDatasets();
  let pass=false;
  let detail="";

  if(expected==="none"){
    pass=datasets.length===0;
    detail="datasets="+datasets.length;
  }else{
    const match=datasets.find(dataset=>dataset.type===expected);
    pass=Boolean(match && (match.rows?.length||0)>=minRows);
    detail=match
      ? match.label+"; rows="+(match.rows?.length||0)
      : "No "+expected+" dataset; detected="+datasets.map(d=>d.type+":"+d.label).join(" | ");
  }

  if(name==="pagination-noise"){
    const suspicious=datasets.some(dataset=>
      (dataset.rows?.length||0)<=2 &&
      dataset.rows?.some(row=>{
        const values=Object.values(row).filter(Boolean);
        return values.length>0 && values.every(v=>/^\d+$/.test(String(v)));
      })
    );
    pass=pass&&!suspicious;
    if(suspicious) detail+="; pagination controls were misdetected";
  }

  parent.postMessage({
    type:"LIST2SHEET_FIXTURE_RESULT",
    name,
    pass,
    detail
  },"*");
});