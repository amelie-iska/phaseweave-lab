"use strict";
function setTheme(theme){
  document.documentElement.dataset.theme=theme;
  for(const button of document.querySelectorAll("[data-theme-choice]")){
    button.setAttribute("aria-pressed",String(button.dataset.themeChoice===theme));
  }
  try{localStorage.setItem("phaseweave-theme",theme);}catch{}
}
try{setTheme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{}
for(const button of document.querySelectorAll("[data-theme-choice]")){
  button.addEventListener("click",()=>setTheme(button.dataset.themeChoice));
}
