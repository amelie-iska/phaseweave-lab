# Local trading desk

Run from a PhaseWeave checkout or the local desk download. It needs Python
3.10 or later and a browser. The desk server uses only the standard library.

```sh
./scripts/trading_dashboard.sh
```

On Windows, run `python research/trading_desk.py`. Open
`http://127.0.0.1:8132/desk.html`. Click **Connect live quotes** to poll the
public Gate spot depth endpoint. No exchange credentials are needed.
Choose ETH/BTC/USDT or XRP/BTC/USDT, then enter the notional, fee per leg,
minimum margin, depth-age limit, capture skew limit, leg delay, and
session loss threshold. **Arm paper cycles** enables the paper engine.
**Pause new cycles** lets an in-progress simulated cycle finish.
**Mark stranded inventory** stops the run and preserves the last
simulated asset and amount for review. Export the session before closing
the server. History is bounded to 180 book captures and 360 events.

## Market, clock, and accounting

The engine reads up to ten levels on each side for three pairs. Age uses
the greater of local wall-clock time since the venue update and the
venue generation lag plus full request RTT and local elapsed time.
The desk also checks that each venue generation timestamp is plausible
and that sequence IDs advance. The bound adds the whole RTT to
avoid using a presumed one-way split. Snapshot skew uses the spread of
local receipt times across markets. Both controls are necessary because
these API responses are three separate requests, not an atomic book.

The decision sells into bids and buys from asks. An arrival waits for a
later capture, checks that book's freshness, consumes displayed levels,
and deducts a fixed fee from the asset received. Gaps, timeouts and
insufficient displayed depth can strand simulated inventory. Closed
paper P&L is expressed in USDT. The threshold stops new cycles after
losses reach it and cannot bound the loss of a cycle already in flight.
Actual venue fills, fees, inventory, queue priority and settlement are
outside this paper ledger. [Gate spot market data fields](https://www.gate.com/docs/developers/apiv4/en/spot/)

The 3D panel displays the captured levels on a torus, sphere or cylinder.
Each market has a fixed angular slot. Signed displacement from the
book midpoint sets the second surface coordinate. Glyph size follows
log USDT-equivalent notional; the BTC-quoted pair uses the same capture's
BTC/USDT midpoint for display. The time slider, latest switch, play
button and camera work on the retained observations. Visit the
higher-genus and gauge-density pages for the topological constructions
and their independently defined fields.

## Connect an existing trading UI

Run the external tools separately. PhaseWeave's connector reads their
status endpoints and opens their own UI. It passes no orders or trading
commands to either tool.

```sh
./scripts/trading_dashboard.sh \
  --freqtrade-api http://127.0.0.1:8080 \
  --freqtrade-ui http://127.0.0.1:8080 \
  --hummingbot-api http://127.0.0.1:8000 \
  --hummingbot-ui http://127.0.0.1:8501
```

Use the exact API and browser URLs from your local installation. For
Freqtrade, enable its loopback REST API and prefer its dry-run mode
while testing. PhaseWeave requests ping, configuration, open trade
counts and aggregate performance when permitted. Hummingbot supplies
its managed-bot status counts. The optional API Basic credentials use
`PHASEWEAVE_FREQTRADE_USERNAME`, `PHASEWEAVE_FREQTRADE_PASSWORD`,
`PHASEWEAVE_HUMMINGBOT_USERNAME` and `PHASEWEAVE_HUMMINGBOT_PASSWORD`
in the server environment. Configure them through your local secret
manager. Browser payloads contain aggregate connector results and never
those credentials. The server and connector targets bind to loopback.
[FreqUI](https://www.freqtrade.io/en/stable/freq-ui/) · [Freqtrade REST API](https://www.freqtrade.io/en/stable/rest-api/) · [Hummingbot Dashboard](https://hummingbot.org/dashboard/) · [Hummingbot API](https://hummingbot.org/hummingbot-api/routers/)
