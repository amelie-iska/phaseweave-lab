"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const hosted = location.hostname.endsWith(".github.io");
  const podium = "https://raw.githubusercontent.com/amelie-iska/phaseweave-lab/main/numerai-front-status.json";
  const pulse = "_runtime/";
  const pairs = new Set(["BTC_USDT", "ETH_USDT", "ETH_BTC"]);
  const names = {proposal:"Proposed",fill:"Paper fill",closed:"Paper cycle closed",expiration:"Expired",
    flattened:"Paper unwind",profile:"Settings change"};
  const scores = {neutral_corr:"NCORR",neutral_mmc:"NMMC",v2_corr20:"CORR20",corr60:"CORR60",mmc:"MMC",mmc60:"MMC60"};
  const number = (x, places) => Number.isFinite(x) ? x.toFixed(places) : "—";
  const shortClock = value => new Date(value).toISOString().slice(11,19) + " UTC";
  const longClock = value => new Date(value).toISOString().slice(0,16).replace("T"," ") + " UTC";
  const text = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  const el = (tag, value) => {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    return node;
  };
  async function get(url) {
    const response = await fetch(url,{cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(3500)});
    if (!response.ok) throw Error("Feed request failed");
    return response.json();
  }
  function clock(id, value, stale) {
    text(id,value);
    $(id).dataset.state = stale ? "stale" : "fresh";
  }
  function showEvents(events) {
    const list = $("front-events");
    if (!events.length) {
      list.replaceChildren(el("li","No actions recorded in this session yet."));
      return;
    }
    const signature = JSON.stringify(events);
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;
    list.replaceChildren(...events.map(event => {
      const row = el("li");
      const stamp = el("time",shortClock(event.utc));
      stamp.dateTime = new Date(event.utc).toISOString();
      const kind = el("span",event.kind);
      kind.className = "front-event-kind";
      kind.dataset.event = event.loss ? "loss" : event.kind;
      row.append(stamp,kind,el("span",event.description));
      return row;
    }));
  }
  async function showPaper() {
    try {
      const paper = await get(pulse + "paper.json");
      const observed = Date.parse(paper.latest_utc);
      if (paper.schema !== "phaseweave.paper-front.v1" || !Number.isFinite(observed)) throw Error("Waiting for source");
      const stale = Date.now() - observed > 12000;
      clock("front-activity-clock",(stale ? "Last update " : "Live · ") + shortClock(observed),stale);
      text("front-activity-source",paper.source + " · " + paper.model_count + " models · " + paper.completed + " closed cycles");
      const events = paper.actions.filter(event => names[event.event] && Number.isFinite(Date.parse(event.utc))).slice(0,4);
      showEvents(events.map(event => ({
        utc:event.utc,kind:names[event.event],loss:event.trade_pnl < 0,
        description:[event.model.replace(" · tropical attention · "," · "),
          event.leg ? "leg " + event.leg : "",Number.isFinite(event.trade_pnl) ? number(event.trade_pnl,4) + " USDT" : "",
          event.event === "profile" && event.revision ? "revision " + event.revision : ""].filter(Boolean).join(" · "),
      })));
    } catch {
      clock("front-activity-clock","Local feed unavailable",true);
      text("front-activity-source","Waiting for the local paper worker. Previously received actions stay visible.");
    }
  }

  function publicTradeFeed() {
    let socket;
    let retry;
    let lastObserved;
    let lastPaint = 0;
    let trades = [];
    let delay = 1500;
    text("front-activity-source","Gate spot trades · open the paper dashboard for model actions.");
    function connect() {
      if (document.hidden || socket) return;
      clock("front-activity-clock","Connecting to Gate",false);
      const ws = new WebSocket("wss://api.gateio.ws/ws/v4/");
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:"spot.trades",event:"subscribe",payload:[...pairs]}));
      ws.onmessage = ({data}) => {
        let frame;
        try { frame = JSON.parse(data); } catch { return; }
        if (frame.channel !== "spot.trades" || frame.event !== "update") return;
        const trade = frame.result;
        if (!trade || !pairs.has(trade.currency_pair) || !["buy","sell"].includes(trade.side)) return;
        const utc = Number(trade.create_time_ms);
        if (!Number.isFinite(utc) || Math.abs(Date.now()-utc)>60000 || !Number.isFinite(Number(trade.price))) return;
        lastObserved = Math.max(lastObserved || 0, utc);
        delay = 1500;
        trades = [{utc,kind:trade.side === "buy" ? "Taker buy" : "Taker sell",
          description:trade.currency_pair.replace("_"," / ") + " · " + Number(trade.price).toLocaleString("en-US",{maximumFractionDigits:8})},
        ...trades].slice(0,4);
      };
      ws.onclose = () => {
        if (ws !== socket) return;
        socket = null;
        clock("front-activity-clock","Gate disconnected",true);
        if (!document.hidden) {
          retry = setTimeout(connect,delay);
          delay = Math.min(delay*2,30000);
        }
      };
    }
    setInterval(() => {
      if (document.hidden || !lastObserved) return;
      const stale = Date.now()-lastObserved > 15000;
      if (socket) clock("front-activity-clock",(stale ? "Last trade " : "Live · ") + shortClock(lastObserved),stale);
      if (lastObserved !== lastPaint) {
        lastPaint = lastObserved;
        showEvents(trades);
      }
    },1000);
    document.addEventListener("visibilitychange",() => {
      if (document.hidden) {
        clearTimeout(retry);
        const previous = socket;
        socket = null;
        previous?.close();
      } else connect();
    });
    connect();
  }

  async function development() {
    try {
      const result = await get("numerai-registered-development-v1.json");
      const values = result.mean_development_neutral_corr;
      text("front-benchmark","Development neutral CORR · PhaseWeave " + number(values[result.winner],5) +
        " · LightGBM " + number(values.lgbm_jupiter_60,5) + " · " + result.scored_per_date_panel.dates + " dates");
    } catch { text("front-benchmark","The verified development receipt is unavailable here."); }
  }
  function renderNumerai(value) {
    const checked = Date.parse(value.checked_utc);
    if (value.schema !== "phaseweave.numerai-front.v1" || !Number.isFinite(checked)) throw Error("Invalid assessment");
    const stale = Date.now()-checked > (hosted ? 9*3600e3 : 35*60e3);
    clock("front-numerai-clock",(stale ? "Last verified " : "Checked ") + longClock(checked),stale);
    const {latest_round:latest, latest_generally_resolved:resolved} = value;
    const configs = value.payout_scores.map(score => score.defaultMultiplier + "× " +
      (scores[score.displayName] || score.displayName)).join(" + ");
    text("front-numerai-round","Latest Classic round " + latest.number + " · " + configs +
      " · latest generally resolved " + resolved.number);
    const top = value.leaders.slice(0,3).map(row => "#" + row.rank + " " + row.username + " " + number(row.mmc60Rep,4));
    text("front-numerai-leading",value.leaderboard_metric + " · " + top.join(" · "));
  }
  async function numerai() {
    try {
      renderNumerai(await get(hosted ? podium : pulse + "numerai.json"));
    } catch {
      try { renderNumerai(await get("numerai-front-status.json")); }
      catch { clock("front-numerai-clock","Assessment unavailable",true); }
    }
  }
  if (hosted) publicTradeFeed();
  else {
    showPaper();
    setInterval(() => { if (!document.hidden) showPaper(); },2200);
  }
  development();
  numerai();
  setInterval(() => { if (!document.hidden) numerai(); },hosted ? 15*60e3 : 30e3);
})();
