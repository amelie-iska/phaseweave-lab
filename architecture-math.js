"use strict";
(function(root) {
  function dot(left,right) { return left.reduce((sum,v,i)=>sum+v*right[i],0); }
  function headDetails(stage,q,k,head,component,matrix) {
    const weights=matrix[head][q], values=stage.v[head];
    const term=weights[k]*values[k][component];
    const context=weights.reduce((sum,w,j)=>sum+w*values[j][component],0);
    return {term,context,gated:context*stage.gate[head],
      logit:dot(stage.q[head][q],stage.k[head][k])*stage.score_multiplier};
  }
  function unpack(field) {
    const bytes=Uint8Array.from(atob(field.data),c=>c.charCodeAt(0));
    const shape=field.shape, count=shape.reduce((a,b)=>a*b,1);
    if(bytes.length!==count*4) throw new Error("Tensor byte count mismatch");
    const reader=new DataView(bytes.buffer), floats=new Float32Array(count);
    for(let i=0;i<count;i++) floats[i]=reader.getFloat32(4*i,true);
    let offset=0;
    function build(level) {
      const n=shape[level];
      if(level===shape.length-1) {
        const row=floats.subarray(offset,offset+n); offset+=n; return row;
      }
      return Array.from({length:n},()=>build(level+1));
    }
    return build(0);
  }
  const api={headDetails,unpack};
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  root.ArchitectureMath=api;
}(globalThis));
