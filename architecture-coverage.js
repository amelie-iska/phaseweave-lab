"use strict";
(async function() {
  const id=s=>document.getElementById(s);
  const search=id("arch-catalog-search"), kind=id("arch-catalog-kind"), family=id("arch-catalog-family");
  const status=id("arch-catalog-status"), list=id("arch-catalog-rows"), nav=id("arch-catalog-pages");
  try {
    const response=await fetch("architecture-coverage-v1.json");
    if(!response.ok)throw new Error("missing catalog");
    const catalog=await response.json();
    if(catalog.schema!=="phaseweave.architecture-coverage.v1")throw new Error("unexpected catalog");
    const names=catalog.categories;
    const rows=catalog.rows;
    for(const [key,label] of Object.entries(names))kind.add(new Option(label,key));
    for(const label of [...new Set(rows.map(r=>r.roster))].sort())family.add(new Option(label,label));
    let page=0;
    const size=12;
    function render(){
      const needle=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const shown=rows.filter(r=>{
        const text=[r.name,r.roster,r.detail,names[r.kind]].join(" ").toLowerCase();
        return (!kind.value||r.kind===kind.value)&&(!family.value||r.roster===family.value)&&needle.every(w=>text.includes(w));
      });
      const pages=Math.ceil(shown.length/size);
      page=Math.min(page,Math.max(0,pages-1));
      const start=page*size;
      status.textContent=shown.length?
        `${shown.length} matching entries of ${rows.length} · showing ${start+1}–${Math.min(start+size,shown.length)}. Repeated evaluation rows can refer to the same weights.`:
        "No matching architecture evidence. Clear a filter to see more entries.";
      const cards=shown.slice(start,start+size).map(row=>{
        const box=document.createElement("article"),name=document.createElement("h3"),tag=document.createElement("span"),
          title=document.createElement("header"), text=document.createElement("p"), citations=document.createElement("p"),
          group=document.createElement("small");
        name.textContent=row.name; tag.textContent=names[row.kind]; tag.className="arch-badge arch-"+row.kind;
        group.textContent=row.roster; title.append(name,tag); text.textContent=row.detail;
        for(const [label,href] of row.links){
          if(citations.childNodes.length)citations.append(" · ");
          const anchor=document.createElement("a");anchor.textContent=label;anchor.href=href;citations.append(anchor);
        }
        box.append(group,title,text,citations);return box;
      });
      list.replaceChildren(...cards);nav.replaceChildren();
      if(pages<=1)return;
      function button(label,delta,disabled){
        const b=document.createElement("button");b.type="button";b.textContent=label;b.disabled=disabled;
        b.addEventListener("click",()=>{page+=delta;render();id("arch-catalog-title").focus();});
        return b;
      }
      nav.append(button("Previous page",-1,page===0),document.createTextNode(`Page ${page+1} of ${pages}`),button("Next page",1,page===pages-1));
    }
    for(const el of [search,kind,family])el.addEventListener(el===search?"input":"change",()=>{page=0;render();});
    render();
  }catch{status.textContent="The architecture evidence index could not load. The recorded stages above are available separately.";}
}());
