"use strict";

class GatePublicFeed {
  constructor(onState, assets = ["ETH", "BTC", "USDT"]) {
    this.onState = onState;
    const [base, bridge, market] = assets;
    this.assets = assets;
    this.pairs = [base + "_" + bridge, bridge + "_" + market, base + "_" + market];
    this.quotes = new Map();
    this.socket = null;
    this.retry = null;
    this.running = false;
    this.fallback = null;
    this.pending = null;
    this.mode = "Disconnected";
    this.delay = 1000;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
    this.poll();
  }

  stop() {
    this.running = false;
    clearTimeout(this.retry);
    clearInterval(this.fallback);
    this.fallback = null;
    this.pending?.abort();
    this.socket?.close();
    this.socket = null;
    this.quotes.clear();
    this.mode = "Disconnected";
  }

  accept(pair, bid, ask, bidSize, askSize, updated) {
    const received = Date.now();
    if (!this.pairs.includes(pair) ||
      ![bid, ask, bidSize, askSize, updated].every(Number.isFinite) ||
      bid <= 0 || ask < bid || bidSize <= 0 || askSize <= 0 || updated <= 0) return;
    const current = this.quotes.get(pair);
    if (current && updated < current.updated) return;
    this.quotes.set(pair, { bid, ask, bidSize, askSize, updated, received });
  }

  connect() {
    if (!this.running) return;
    this.mode = "Connecting to Gate";
    this.onState(this.mode);
    const socket = new WebSocket("wss://api.gateio.ws/ws/v4/");
    this.socket = socket;
    const subscribe = () => socket.send(JSON.stringify({
      time: Math.floor(Date.now() / 1000), channel: "spot.book_ticker",
      event: "subscribe", payload: this.pairs,
    }));
    socket.addEventListener("open", subscribe);
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload.channel !== "spot.book_ticker" || payload.event !== "update") return;
      const update = payload.result;
      this.accept(update.s, +update.b, +update.a, +update.B, +update.A, +update.t);
      this.mode = "Gate WebSocket · public BBO";
      this.delay = 1000;
      if (this.fallback !== null) clearInterval(this.fallback);
      this.fallback = null;
      this.onState(this.mode);
    });
    const fail = () => {
      if (this.socket !== socket || !this.running) return;
      this.socket = null;
      socket.close();
      this.mode = "Gate reconnecting · REST fallback";
      this.onState(this.mode);
      if (this.fallback === null) {
        this.poll();
        this.fallback = setInterval(() => this.poll(), 3500);
      }
      this.retry = setTimeout(() => this.connect(), this.delay);
      this.delay = Math.min(this.delay * 2, 30_000);
    };
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
  }

  async poll() {
    if (this.pending || !this.running) return;
    const request = new AbortController();
    this.pending = request;
    const deadline = setTimeout(() => request.abort(), 5000);
    const results = await Promise.allSettled(this.pairs.map(async (pair) => {
      const response = await fetch(
        "https://api.gateio.ws/api/v4/spot/order_book?limit=1&currency_pair=" + pair,
        { signal: request.signal, cache: "no-store" },
      );
      if (!response.ok) throw new Error("HTTP " + response.status);
      const book = await response.json();
      const [bid, bidSize] = book.bids[0] || [];
      const [ask, askSize] = book.asks[0] || [];
      if (this.running) this.accept(pair, +bid, +ask, +bidSize, +askSize, +book.update);
    }));
    clearTimeout(deadline);
    this.pending = null;
    if (this.running && this.fallback !== null && results.every((result) => result.status === "rejected")) {
      this.mode = "Gate unavailable · waiting for reconnect";
      this.onState(this.mode);
    }
  }

  snapshot(now = Date.now(), assets = this.assets) {
    const [base, bridge, market] = assets;
    const first = base + "_" + bridge, second = bridge + "_" + market, third = base + "_" + market;
    const rates = new Map([first, second, third].filter(pair => this.quotes.has(pair))
      .map(pair => [pair, this.quotes.get(pair)]));
    const gauge = { [base]: 0, [bridge]: 0, [market]: 0 };
    if (rates.has(first) && rates.has(second)) {
      gauge[bridge] = -Math.log(rates.get(first).bid);
      gauge[market] = gauge[bridge] - Math.log(rates.get(second).bid);
    }
    const edges = [...rates.entries()].flatMap(([pair, quote]) => {
      const [base, counter] = pair.split("_");
      const age = Math.max(0, now - quote.updated);
      const evidence = { age, updated: quote.updated, received: quote.received };
      return [
        { from: base, to: counter, side: "bid", capacity: quote.bidSize, nativeRate: quote.bid,
          bps: 1e4 * (Math.log(quote.bid) + gauge[counter] - gauge[base]), ...evidence },
        { from: counter, to: base, side: "inverse ask", capacity: quote.ask * quote.askSize, nativeRate: 1 / quote.ask,
          bps: 1e4 * (-Math.log(quote.ask) + gauge[base] - gauge[counter]), ...evidence },
      ];
    });
    return {
      utc: new Date(now).toISOString(), assets, edges,
      source: this.mode, bookCount: rates.size, clockSkew: edges.some((edge) => edge.updated > now + 1000),
    };
  }
}

if (typeof module !== "undefined") module.exports = GatePublicFeed;

// Anonymous spot top-of-book markets. Every triangle has all three direct books.
const GateSpotSources = (() => {
  const markets = new Map(["ETH", "XRP", "DOGE", "LTC", "ADA"]
    .map(asset => ["gate-" + asset.toLowerCase(), [asset, "BTC", "USDT"]]));
  const has = id => markets.has(id);
  const assets = id => markets.get(id);
  const entries = () => [...markets].map(([id, coins]) => [id, "Live Gate · " + coins.join("/")]);
  function start(feed) {
    try { feed.start(); } catch { feed.stop(); }
    return feed;
  }
  function connect(id) {
    return has(id) ? start(new GatePublicFeed(() => {}, assets(id))) : null;
  }
  function connectBasket() {
    const feed = new GatePublicFeed(() => {});
    feed.pairs = [...new Set([...markets.values()].flatMap(([a, b, c]) =>
      [a + "_" + b, b + "_" + c, a + "_" + c]))];
    return start(feed);
  }
  function snapshot(feed, maxAgeMs = 5000, id, now = Date.now()) {
    if (!feed || (id && !has(id))) return null;
    const frame = feed.snapshot(now, assets(id));
    if (frame.bookCount !== 3 || frame.edges.length !== 6 || frame.clockSkew ||
        !frame.edges.every(edge => Number.isFinite(edge.bps) && Number.isFinite(edge.updated) &&
          edge.updated <= now && edge.age <= maxAgeMs)) return null;
    const key = frame.edges.map(edge => `${edge.from}/${edge.to}/${edge.updated}/${edge.bps}`).sort().join("|");
    return {frame, id: key};
  }
  return {has, assets, entries, connect, connectBasket, snapshot};
})();
