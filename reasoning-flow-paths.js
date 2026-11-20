"use strict";

const ReasoningFlowPaths = (() => {
  const choices = [
    ["short", "Short sampler · 3 stages"],
    ["edited", "Forest path · 10 frames with an edit"],
    ["unedited", "Forest path · 9 frames without an edit"],
  ];
  const hashes = {
    edited: "a6fe567cb8e6b817dcc7c2818976227e2976990e5f7002eb8fdabc1ee0a156ae",
    unedited: "27ea7ea387cec3cf2cfd92ae812a8485c7aa45d20e5acf64ab22e578caf03679",
  };
  const policy = "c25b6a94c2c3267970596c7d95a33da4f024be5d98e1ab56b00942f00f0f2dc8";
  const traces = new Map();

  function validate(key, trace) {
    const length = key === "edited" ? 10 : 9;
    const {nodes, edges} = trace;
    if (!Object.hasOwn(hashes,key) || trace.id !== `fx-gfn-validation-${key}-v1` ||
        trace.policy_sha256 !== policy || trace.source_split !== "validation" ||
        !Array.isArray(nodes) || nodes.length !== length || !Array.isArray(edges) || edges.length !== length-1 ||
        !Number.isInteger(trace.tree) || trace.tree < 0 || trace.tree > 15 ||
        !Number.isInteger(trace.alternative) || trace.alternative < 0 || trace.alternative > 2 ||
        (trace.alternative === 2) !== (key === "edited")) throw new Error("Unexpected forest path");
    nodes.forEach((node, frame) => {
      const kind = frame === 0 ? "root" : frame === 9 ? "edit" : "expansion";
      if (node.id !== frame || node.kind !== kind || !Array.isArray(node.point) ||
          node.point.length !== 3 || !node.point.every(Number.isFinite)) throw new Error("Invalid path frame");
      const edge = edges[frame-1];
      if (frame && (edge.source !== frame-1 || edge.target !== frame || edge.kind !== kind))
        throw new Error("Invalid path ancestry");
    });
    return trace;
  }

  async function load(key) {
    if (!Object.hasOwn(hashes,key)) throw new Error("Unknown forest path");
    if (traces.has(key)) return traces.get(key);
    const response = await fetch(`gflownet-path-${key}.json`, {mode:"same-origin"});
    if (!response.ok) throw new Error("Missing forest path");
    const bytes = await response.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const hex = Array.from(digest,n=>n.toString(16).padStart(2,"0")).join("");
    if (hex !== hashes[key]) throw new Error("Forest path checksum mismatch");
    const trace = validate(key,JSON.parse(new TextDecoder().decode(bytes)));
    traces.set(key,trace);
    return trace;
  }

  function label(frame) {
    return frame === 0 ? "Root" : frame === 9 ? "Edit" : `Expansion ${frame}`;
  }

  function scene(trace, stage) {
    const colors = {root:"blue", expansion:"jade", edit:"copper"};
    const shown = trace.nodes.slice(0,stage+1);
    return {
      axes:["Forward Δ","Reverse Δ","Log magnitude"],
      minExtent:Math.max(.1,...trace.nodes.flatMap(n=>n.point.map(Math.abs))),
      points:shown.map((n,i)=>({point:n.point,color:colors[n.kind],radius:i===stage?6:3.5,
        square:n.kind==="edit",label:i===stage?label(i):undefined})),
      lines:trace.edges.slice(0,stage).map(e=>({
        coords:[trace.nodes[e.source].point,trace.nodes[e.target].point],
        color:colors[e.kind],width:e.kind==="edit"?3:2,arrow:true,dash:e.kind==="edit"?[5,3]:[],
      })),
      faces:[],
    };
  }
  return {choices,load,label,scene,validate};
})();

if (typeof module !== "undefined" && module.exports) module.exports = ReasoningFlowPaths;
