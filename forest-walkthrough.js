"use strict";

const ForestWalkthrough = (() => {
  const isVote = edge => edge.kind.includes("consensus");
  const isEdit = edge => /repair|correct|refine/.test(edge.kind);
  const score = node => Number.isFinite(node?.score) ? node.score.toFixed(6) : "—";
  const disposition = node => node?.feasible === true ? "Feasible" :
    node?.feasible === false ? "Rejected" : "Feasibility unrecorded";
  const title = node => "#" + node.id + " · " + node.label;

  function inspect(trace, selected) {
    const nodes = new Map(trace.nodes.map(node => [node.id,node]));
    const voters = trace.edges.filter(isVote);
    const repairs = trace.edges.filter(isEdit);
    const roots = trace.nodes.filter(n => n.tree >= 0 && n.depth === 0);
    const shortlist = trace.nodes.filter(n => n.status === "shortlisted");
    const median = voters.length ? nodes.get(voters[0].target) : trace.nodes.find(n => n.status === "consensus");
    const edit = repairs.find(edge => edge.target === selected.id) ||
      repairs.find(edge => edge.source === selected.id);
    const lineage = [selected];
    const visited = new Set([selected.id]);
    for (;;) {
      const parent = trace.edges.find(edge => !isVote(edge) && edge.target === lineage[0].id);
      if (!parent || visited.has(parent.source)) break;
      visited.add(parent.source);
      lineage.unshift(nodes.get(parent.source));
    }
    const activeVotes = voters.filter(edge => edge.target === median?.id).map(edge => nodes.get(edge.source));
    const winner = activeVotes.find(node => node.tree === selected.tree);
    const experiment = trace.experiment;
    const stages = [
      {id:"roots",label:"Seed roots",note:roots.length + " starting states", node:roots[0]},
      {id:"shortlist",label:"Sparse shortlist",note:shortlist.length + " retained finalists", node:shortlist[0]},
      {id:"repair",label:"Apply repairs",note:repairs.length + " recorded edits", node:nodes.get(repairs[0]?.target)},
      {id:"votes",label:"Read leaf votes",note:activeVotes.length + " voting states", node:activeVotes[0],depth:median?.depth},
      {id:"median",label:"Coordinate median",note:median ? "One recorded aggregate" : "Aggregate unavailable",node:median},
    ];
    return {nodes, stages, edit, lineage, winner, median, activeVotes,
      finalists:shortlist.filter(node=>node.tree===selected.tree),
      evaluated:experiment?.evaluations_per_window, retention:experiment?.retention};
  }

  function local(trace, pivot, radius) {
    const complex = trace.local_complexes[pivot.id];
    const ids = new Set([pivot.id, ...(complex?.vertices || [])]);
    const points = trace.nodes.filter(node => ids.has(node.id)).map(node => ({
      id:node.id, label:"#"+node.id, point:node.point, color:node.id===pivot.id ? "text" : "blue",
      radius:node.id===pivot.id ? 6 : 4,
    }));
    const byId = new Map(points.map(point => [point.id,point.point]));
    const simplices = (complex?.simplices || []).filter(s => s.vertices.length > 1 && s.vertices.every(id=>byId.has(id)));
    const visible = simplices.filter(s => s.birth <= radius);
    const edges = visible.filter(s => s.vertices.length===2);
    const faces = visible.filter(s => s.vertices.length===3);
    const shape = (simplex,alpha) => ({coords:simplex.vertices.map(id=>byId.get(id)),color:"violet",alpha});
    return {scene:{axes:trace.coordinate_names || ["Forward Δ","Reverse Δ","Log move"], points,
      lines:edges.map(s=>shape(s,.85)),faces:faces.map(s=>shape(s,.18)),minExtent:.45},
      simplices, edges:edges.length, faces:faces.length};
  }

  function text(tag, value) {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    return node;
  }

  function button(label, callback) {
    const node = text("button",label);
    node.type = "button";
    node.onclick = callback;
    return node;
  }

  function render(trace, pivot, activeStage, radius, callbacks) {
    const check = inspect(trace,pivot);
    const stages = document.getElementById("forest-stages");
    const held = document.activeElement?.dataset?.forestStage;
    stages.replaceChildren(...check.stages.map(stage => {
      const action = button("",() => callbacks.stage(stage));
      action.dataset.forestStage = stage.id;
      action.append(text("strong",stage.label),text("small",stage.note));
      action.disabled = !stage.node;
      action.setAttribute("aria-pressed",String(stage.id===activeStage));
      return action;
    }));
    if (held) [...stages.children].find(node=>node.dataset.forestStage===held)?.focus({preventScroll:true});

    const retention = check.evaluated ? check.evaluated + " candidates evaluated · " + trace.nodes.length + " states shown. " +
      "The trace retains " + check.retention + "." : trace.nodes.length + " states in the archived trace.";
    document.getElementById("forest-retention").textContent = retention;
    const view = document.getElementById("forest-lineage");
    view.replaceChildren(text("p",title(pivot) + " · " + disposition(pivot) + " · verifier score " + score(pivot)));
    const route = text("ol");
    route.className = "forest-path";
    check.lineage.forEach(node => {
      const li = text("li");
      const jump = button("#"+node.id,()=>callbacks.node(node));
      jump.ariaLabel = title(node);
      jump.setAttribute("aria-current",String(node.id===pivot.id));
      li.append(jump);
      route.append(li);
    });
    view.append(route);
    if (check.edit) {
      const before = check.nodes.get(check.edit.source), after = check.nodes.get(check.edit.target);
      const delta = Number.isFinite(before.score) && Number.isFinite(after.score) ? "(" +
        (after.score-before.score >= 0 ? "+" : "") + (after.score-before.score).toFixed(6) + ")" : "";
      const repair = text("p");
      repair.append(text("strong","Repair "),button("#"+before.id,()=>callbacks.node(before)),
        document.createTextNode(" " + score(before) + " → "),button("#"+after.id,()=>callbacks.node(after)),
        document.createTextNode(" " + score(after) + " " + delta + " · " + disposition(after)));
      view.append(repair);
    }
    if (check.winner) {
      const vote = text("p");
      vote.append(text("strong","Tree vote "),button("#"+check.winner.id,()=>callbacks.node(check.winner)),
        document.createTextNode(" → "),button("#"+check.median.id,()=>callbacks.node(check.median)));
      view.append(vote);
    }
    if (check.finalists.length) {
      const table = text("table");
      table.setAttribute("aria-label","Recorded shortlist and selected tree vote");
      const head = table.createTHead().insertRow();
      ["State","Disposition","Verifier score"].forEach(label=>{
        const field = text("th",label);
        field.scope = "col";
        head.append(field);
      });
      const body = table.createTBody();
      const options = Array.from(new Set([...check.finalists,...(check.winner ? [check.winner] : [])]));
      options.forEach(node=>{
        const row = body.insertRow();
        row.insertCell().append(button(title(node),()=>callbacks.node(node)));
        row.insertCell().textContent = disposition(node) + (node===check.winner ? " · vote" : "");
        row.insertCell().textContent = score(node);
      });
      view.append(table);
    }
    if (activeStage === "votes" || pivot.id === check.median?.id) {
      const list = text("ul");
      list.className = "forest-path";
      list.setAttribute("aria-label","Recorded votes");
      check.activeVotes.forEach(node=>{
        const li = text("li");
        li.append(button("T"+(node.tree+1)+" · #"+node.id,()=>callbacks.node(node)));
        list.append(li);
      });
      view.append(text("p",check.activeVotes.length + " winning states feed the coordinatewise median."),list);
    }

    const neighborhood = local(trace,pivot,radius);
    document.getElementById("forest-local-status").textContent =
      "Radius " + radius.toFixed(3) + " · " + neighborhood.edges + " edges · " + neighborhood.faces + " triangles";
    const list = document.getElementById("forest-births");
    list.replaceChildren(...neighborhood.simplices.map(simplex=>{
      const row = text("li",simplex.vertices.map(id=>"#"+id).join(" / ") + " · " +
        simplex.birth.toFixed(5) + (simplex.birth <= radius ? " · visible" : ""));
      return row;
    }));
    if (!neighborhood.simplices.length) list.append(text("li","No edges or triangles stored for this node."));
    const selector = document.getElementById("forest-neighbors");
    selector.replaceChildren(...neighborhood.scene.points.map(point=>{
      const btn = button("#"+point.id,()=>callbacks.node(check.nodes.get(point.id)));
      btn.setAttribute("aria-current",String(point.id===pivot.id));
      return btn;
    }));
    return neighborhood.scene;
  }

  return {inspect, local, render};
})();

if (typeof module !== "undefined") module.exports = ForestWalkthrough;
