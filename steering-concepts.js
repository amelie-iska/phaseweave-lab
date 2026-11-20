"use strict";

const SteeringConcepts = (() => {
  const names = ["X", "Y", "Z"];

  function selectConcept(indices, slot, chosen) {
    const next = indices.slice();
    const previous = next.indexOf(chosen);
    if (previous >= 0) next[previous] = next[slot];
    next[slot] = chosen;
    return next;
  }

  function display(data, mode, indices) {
    if (mode === "pca") return {axes:data.axis_labels, point:row => row.point, minExtent:.17};
    return {
      axes:indices.map(i => data.concepts[i].short + " (SD)"),
      point:row => indices.map(i => row.concept_delta_sd[i]),
      minExtent:.01,
    };
  }

  function fields(data, indices, update) {
    return names.map((name, i) => {
      const label = document.createElement("label");
      const select = document.createElement("select");
      select.id = "latent-concept-" + name.toLowerCase();
      data.concepts.forEach((c, j) => select.add(new Option(c.label, j)));
      select.value = String(indices[i]);
      select.addEventListener("change", () => {
        update(selectConcept(indices, i, Number(select.value)));
        document.getElementById(select.id)?.focus();
      });
      label.append(name + " concept", select);
      return label;
    });
  }

  function pointAt(axis, dose) {
    const row = axis.points.find(p => p.dose === dose);
    if (!row) throw new RangeError("Dose is absent from the measured steering receipt");
    return row;
  }

  const signed = (n, digits=3) => (n>0 ? "+" : "") + n.toFixed(digits);

  function report(container, data, method, axisId, dose, table, paragraph) {
    const axes = method.axes;
    const chosen = pointAt(axes.find(axis => axis.axis_id === axisId), dose);
    const rows = data.concepts.map((concept, i) => [
      concept.label, ...axes.map(axis => signed(pointAt(axis, dose).concept_delta_sd[i])),
    ]);
    const details = data.concepts.map((concept, i) => [
      concept.label, signed(chosen.concept_delta_native[i], 4) + " " + concept.unit,
      concept.october_pearson_r.toFixed(3),
    ]);
    const heading = document.createElement("h3");
    heading.textContent = "All four edit directions at dose " + signed(dose, 2);
    const subheading = document.createElement("h3");
    subheading.textContent = "Selected direction in the concepts’ original units";
    const definitions = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "How the four concepts are measured";
    const list = document.createElement("dl");
    data.concepts.forEach(concept => {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = concept.label;
      definition.textContent = concept.description;
      list.append(term,definition);
    });
    definitions.append(summary,list);
    container.replaceChildren(heading,
      paragraph("Each cell gives the mean change in a frozen concept observer over 1,024 October windows, in August target standard deviations (SD). A direction can move several concepts together."),
      table("All concepts by edit direction at selected dose",["Observer change (SD)",...axes.map(a => "Axis " + a.axis_id)],rows),
      subheading,table("Selected axis concept changes and observer validation",["Concept","Mean change · axis " + axisId,"October r"],details),
      paragraph("Pearson r measures the observer’s agreement with recorded attributes on unedited October windows. An edited latent is a model intervention; its observer responses do not identify economic causes."), definitions);
  }

  return {selectConcept, display, fields, pointAt, signed, report};
})();
if (typeof module !== "undefined" && module.exports) module.exports = SteeringConcepts;
