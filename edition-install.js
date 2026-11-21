"use strict";
(() => {
  const promptButton = document.querySelector("[data-install-edition]");
  const offline = document.querySelector("[data-edition-offline]");
  const page = new URL(location.href);
  page.search = "";
  page.hash = "";
  let installEvent = null;

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("edition-worker.js", {scope: page.pathname}).catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installEvent = event;
    promptButton.hidden = false;
  });
  function hidePrompt() {
    installEvent = null;
    promptButton.hidden = true;
  }
  promptButton.addEventListener("click", async () => {
    const prompt = installEvent;
    if (!prompt) return;
    hidePrompt();
    await prompt.prompt();
  });
  window.addEventListener("appinstalled", hidePrompt);

  function connection() {
    offline.hidden = navigator.onLine;
  }
  window.addEventListener("online", connection);
  window.addEventListener("offline", connection);
  connection();
})();
