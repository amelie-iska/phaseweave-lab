"use strict";

(() => {
  const themes = [...document.querySelectorAll("[data-animation-theme]")];
  function theme(value) {
    document.documentElement.dataset.theme = value;
    themes.forEach((item) =>
      item.setAttribute("aria-pressed", String(item.dataset.animationTheme === value)));
    try { localStorage.setItem("phaseweave-theme", value); } catch {}
  }
  try { theme(localStorage.getItem("phaseweave-theme") === "light" ? "light" : "dark"); } catch {}
  themes.forEach((item) => item.addEventListener("click", () => theme(item.dataset.animationTheme)));

  const players = [...document.querySelectorAll(".animation-card video")];
  players.forEach((player) => player.addEventListener("play", () => {
    players.filter((item) => item !== player && !item.paused).forEach((item) => item.pause());
  }));
})();
