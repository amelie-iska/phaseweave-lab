# Operational readiness and validation

The current release exposes a reproducible trade-research environment.
Historical FX forecasts, real-time public depth, a sequential paper
engine, and read-only links to external dashboards each have separate
evidence. Passing a quote-margin test or completing a paper cycle does
not demonstrate realized trading returns.

## Release criteria

| Area | Required evidence | Current status |
| --- | --- | --- |
| Source data | A licensed, point-in-time record for each supported modality, with event and availability clocks, missing partitions, halts and correction handling | FX quote archives and observed public crypto depth verified. An equity sample supplies retrospective October prints only. Receipt-proven equity overlap is zero. |
| Predictive efficacy | Frozen out-of-time and unseen-instrument tests across multiple regimes, paired matched controls, uncertainty over sessions and model seeds | Five historical FX horizons measured on 491,517 windows. The matched horizon experiment has one seed per fit. Positive executable opportunities need a separate event-level study. |
| Independent executable replay | A second market-data lineage, event-level bid/ask depth, parallel inventory reconciliation, and independently reproduced outcomes net of actual fees and latency | One Gate depth replay and the live paper engine are available. Broker or exchange reconciliation is pending. |
| Feed resilience | A declared session duration and coverage denominator, latency distribution, stale/crossed checks, retries, gaps, reconnect, and restart tests | Loopback tests and a public snapshot soak cover a first local screen. Multi-venue uptime, process-restart recovery, and automatic incremental book reconciliation need their own receipts. |
| Paper ledger | Partial and failed order handling, inventory, fees, expiry, max exposure, stops, and an immutable replayable event log | Sequential level-taking and stranded-inventory protection verified. In-memory history and bounded export are available. Durable crash recovery and venue-order idempotency are pending. |
| Live execution | Authorized sandbox plus broker/exchange fills, duplicate retries, reconciliation, cancel/kill controls, and pre-trade limits before promotion | No signed live-order path or broker sandbox run is in this release. Freqtrade and Hummingbot connections currently read and link to their own interfaces. |
| Deployment | Independently reproduced install, supported device matrix, threat and dependency review, backups, key custody, authenticated multi-user telemetry, operational runbook, and rollback | The portable loopback bundle uses Python and a browser. Desktop and mobile interaction tests are complete. Remote hosted operator deployment and native app distribution are pending. |
| Commercial | Written product, source data and model rights, commercial terms, verified paid entitlements where used, and operational ownership | Noncommercial distribution and a separate commercial licensing route exist. No subscription or paid execution service has been activated. |

For any future live release, pre-register venue, symbols, sizing,
fee tier, clocks, order semantics, primary opportunity outcome, minimum
eligible count, independent operator sign-off, and automatic stop
criteria. Publish matched replay and reconciliation receipts, then
request a separate authorization for any real-money test. Do not use
vendor latency, proprietary benchmark scores, or a successful short
soak as a substitute for head-to-head market execution.

Market-access requirements depend on instrument, jurisdiction, venue,
and role. The cited regulatory material supplies examples of test and
risk-control practices for the covered firms. [FINRA algorithmic supervision guidance](https://www.finra.org/rules-guidance/notices/15-09) · [SEC market access rule](https://www.sec.gov/rules-regulations/2011/06/risk-management-controls-brokers-or-dealers-market-access)

[Trading desk setup](LOCAL_TRADING_DESK.md) · [Five-horizon evidence](FX_HORIZONS.md) · [Equity sample audit](EQUITY_TICK_ACCESS_AUDIT.md)

## Measured clock incident

An initial public-depth soak accepted a 60-second-old replayed payload
if the relay was fast. The corrected implementation replayed both
journals, withheld the stale test, and admitted 1 of 67 polls in the
original run and 4 of 70 in a fresh run. The fresh soak obtained 210
books and produced 70 abstentions. See the append-only incidents and
fault cases. [Before](TRADING_READINESS.md) · [After](TRADING_READINESS_V2.md)
