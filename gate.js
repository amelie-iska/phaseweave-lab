"use strict";

class GatePublicFeed {
  static pairs = ["ETH_BTC", "BTC_USDT", "ETH_USDT"];
  static assets = ["ETH", "BTC", "USDT"];

  constructor(onState) {
    this.onState = onState;
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
    if (!GatePublicFeed.pairs.includes(pair) ||
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
      event: "subscribe", payload: GatePublicFeed.pairs,
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
    const results = await Promise.allSettled(GatePublicFeed.pairs.map(async (pair) => {
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

  snapshot(now = Date.now()) {
    const rates = this.quotes;
    const gauge = { ETH: 0, BTC: 0, USDT: 0 };
    if (rates.has("ETH_BTC") && rates.has("BTC_USDT")) {
      gauge.BTC = -Math.log(rates.get("ETH_BTC").bid);
      gauge.USDT = gauge.BTC - Math.log(rates.get("BTC_USDT").bid);
    }
    const edges = [...rates.entries()].flatMap(([pair, quote]) => {
      const [base, counter] = pair.split("_");
      const age = Math.max(0, now - quote.updated);
      const evidence = { age, updated: quote.updated, received: quote.received };
      return [
        { from: base, to: counter, side: "bid", capacity: quote.bidSize,
          bps: 1e4 * (Math.log(quote.bid) + gauge[counter] - gauge[base]), ...evidence },
        { from: counter, to: base, side: "inverse ask", capacity: quote.ask * quote.askSize,
          bps: 1e4 * (-Math.log(quote.ask) + gauge[base] - gauge[counter]), ...evidence },
      ];
    });
    return {
      utc: new Date(now).toISOString(), assets: GatePublicFeed.assets, edges,
      source: this.mode, bookCount: rates.size, clockSkew: edges.some((edge) => edge.updated > now + 1000),
    };
  }
}

if (typeof module !== "undefined") module.exports = GatePublicFeed;
