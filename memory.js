"use strict";

const elem = (id) => document.getElementById(id);
const names = {hrr:"Holographic memory", cosine:"Explicit cosine", no_memory:"Training prior"};
let data, queries, facts;
const label = (id) => data.wikidata.nodes[id]?.label ?? id;
const words = (family) => family.replaceAll("_", " ");

function showTable(id, columns, rows) {
  const container = document.createElement("div");
  container.className = "table-overflow";
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column;
    head.append(th);
  });
  const body = table.createTBody();
  rows.forEach((row) => {
    const line = body.insertRow();
    row.forEach((content) => line.insertCell().append(content));
  });
  container.append(table);
  elem(id).replaceChildren(container);
}

function statementLinks(ids) {
  const fragment = document.createDocumentFragment();
  ids.forEach((id, index) => {
    const fact = facts.get(id);
    if (!fact) return;
    if (index) fragment.append(" · ");
    const link = document.createElement("a");
    link.href = `https://www.wikidata.org/wiki/Special:EntityData/${fact.subject}.json?revision=${fact.source_revision}`;
    link.textContent = `${label(fact.subject)} → ${label(fact.object)}`;
    fragment.append(link);
  });
  return fragment;
}

function render() {
  if (!data) return;
  const index = +elem("query").value;
  const selected = queries[index];
  const query = elem("withhold").checked ? data.queries.find((item) =>
    item.owner === selected.owner && item.family === selected.family && item.condition === "withheld_last_fact") : selected;
  const method = query.methods[elem("method").value];
  const operators = query.program.map((operator) => {
    const inverse = operator.startsWith("^");
    return (inverse ? "inverse " : "") + data.wikidata.properties[operator.replace(/^\^/, "")].label;
  });
  elem("query-detail").textContent = `${label(query.start)} · ${operators.join(" → ")}`;
  showTable("candidates", ["Rank", "Proposed path", "Score", "Source statements"],
    method.candidates.map((candidate, index) => [String(index+1),
      candidate.nodes.map(label).join(" → "), candidate.score.toFixed(5),
      candidate.verified_statement_ids ? statementLinks(candidate.verified_statement_ids) : "Missing path evidence"]));
  elem("verified-answer").textContent = method.verified_answer ? `Verified answer · ${label(method.verified_answer)}` : "Abstained · no candidate had a complete source path.";
  elem("analogy").replaceChildren();
  if (method.analogy) {
    const map = method.analogy.matched_nodes.map(([from, to]) => [label(from), label(to)]);
    showTable("analogy", ["Training exemplar", "Held-out owner"], map);
  }
}

function theme(value) {
  document.documentElement.dataset.theme = value;
  document.querySelectorAll("button[data-theme]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.theme === value)));
  try { localStorage.setItem("phaseweave-theme", value); } catch {}
}
document.querySelectorAll("button[data-theme]").forEach((button) => button.addEventListener("click",() => theme(button.dataset.theme)));
try { theme(localStorage.getItem("phaseweave-theme") || "dark"); } catch {}
["query", "method", "withhold"].forEach((id) => elem(id).addEventListener("change", render));
fetch("memory-data.json").then((response) => {
  if (!response.ok) throw new Error("retrieval report unavailable");
  return response.json();
}).then((result) => {
  data = result;
  facts = new Map(data.wikidata.triples.map((fact) => [fact.statement_id, fact]));
  queries = data.queries.filter((item) => item.condition === "complete");
  elem("query").replaceChildren(...queries.map((query, i) => new Option(`${label(query.owner)} · ${words(query.family)}`, i)));
  showTable("summary-table", ["Retrieval", "First-choice verified", "Verified within four", "Abstained when evidence missing"],
    Object.entries(data.summary_counts).map(([name, {all}]) => [names[name],
      `${all.top1_witness_hit}/${all.answerable}`, `${all.beam_witness_hit}/${all.answerable}`,
      `${all.verified_abstentions_missing}/${all.missing_evidence}`]));
  render();
}).catch(() => { elem("verified-answer").textContent = "The retrieval results could not load."; });
