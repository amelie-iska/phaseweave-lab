"use strict";
(() => {
  const button = document.getElementById("workbench-load");
  const status = document.getElementById("workbench-result");
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Retrieving the published report…";
    try {
      const response = await fetch("trading-readiness-v2.json", {cache:"no-store", credentials:"omit",
        signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error("Report unavailable");
      const data = await response.json();
      const time = new Date(data.finished_utc);
      const {passed_fault_checks: passed, audited_fault_checks: total} = data;
      if (!Number.isFinite(time.getTime()) || !Number.isInteger(total) || total < 1 ||
          !Number.isInteger(passed) || passed < 0 || passed > total || !(data.measured_monotonic_seconds > 0)) {
        throw new Error("Incomplete receipt");
      }
      status.textContent = "Recorded " + time.toISOString().slice(0,16).replace("T"," ") + " UTC · " +
        passed + " of " + total + " fault checks passed · " + Math.round(data.measured_monotonic_seconds) + " seconds observed.";
    } catch {
      status.textContent = "The report is unavailable. Reconnect and try again.";
    } finally {
      button.disabled = false;
    }
  });
})();
