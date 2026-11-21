# Additional trading competitions

Organizer rules reviewed 20 November 2026. Both venues test a portfolio policy against incoming market data and judge risk alongside return. PhaseWeave will select a strategy separately for each venue after the main research and release milestones.

| Competition | Organizer status | PhaseWeave entry stage |
| --- | --- | --- |
| Quantiacs rolling contests | Q25 submission window closed. Forward scoring runs 1 October 2026 through 31 January 2027. | Await a compatible edition, then qualify on organizer data. |
| AI4Finance Open Trading Challenge | The organizer lists its U.S. equity pilot as open. | Confirm intake and complete a qualifying U.S. equity paper run. |

## Quantiacs rolling contests

**Why it fits.** Submitted allocations are frozen during forward evaluation. Q25 ranks eligible entries by out-of-sample Sharpe and requires positive contest returns. Its venue-simulated fills use incoming market data. Entry requires no payment. The advertised amounts are allocations from which eligible winners can earn a conditional performance share. Check the next edition's timeline and terms before qualifying. [Organizer schedule](https://quantiacs.io/contest) · [Q25 official rules](https://quantiacs.com/contest/25)

**Q25 reference requirements.** The track required organizer data exclusively, repeatable quantitative rules, long-only weights in the point-in-time monthly top-ten crypto universe excluding stablecoins, and historical Sharpe above 1 from 1 January 2016. The detailed track rule gave five minutes per evaluation date and a modeled cost of 4% of 14-day ATR per change in position size, subject to the stated adjustment. Its published schedule gave the entry cutoff as 00:00 UTC on 1 October 2026. Confirm the time zone and use the detailed track rules when the next schedule opens. [Q25 official rules, sections 6–11](https://quantiacs.com/contest/25)

**PhaseWeave qualification.** Train a daily allocation policy on the selected edition's permitted data. Compare against tradable equal-weight, momentum and volatility controls on the same universe, dates and costs. Fit graph construction and preprocessing on past data only. Purge overlapping label and execution windows, and hold out a final chronological test. Use the official multi-pass precheck to verify repeatability, runtime and complete date coverage. Deliver a deterministic portfolio-weight notebook and review submission rights before sharing any artifacts. Existing intraday FX weights would require venue-specific retraining. [Organizer evaluation and notebook format](https://quantiacs.io/documentation/en/user_guide/passFilters.html) · [Quantiacs user agreement](https://quantiacs.com/termsofuse)

## AI4Finance Open Trading Challenge

**Why it fits.** The U.S. equity pilot requires FinRL-Trading and at least 30 trading days of automated Alpaca Paper execution on active market data. Evaluation weights risk-adjusted return at 30%, drawdown and stability at 20% each, and strategy documentation and code quality at 15% each. The entry package includes a public reproducible repository, trade logs, a daily equity curve and a description. The organizer links to FinRL-Trading and describes the package. Confirm the submission channel and intake before starting the qualifying run. [Organizer rules](https://ai4finance.org/competition) · [FinRL-Trading](https://github.com/AI4Finance-Foundation/FinRL-Trading)

**PhaseWeave qualification.** Compare a U.S. equity graph policy against fixed allocations and a classical learner under matching costs and risk limits. Run the selected policy through FinRL-Trading's portfolio-weight interface with fixed rebalance, sizing, stale-data and fallback rules. Record market-data entitlements, paper endpoint, risk caps, seed and release identifiers before the run. Retain broker acknowledgments and paper fills, rejected orders, feed uptime, slippage, daily equity, exposures and drawdown. Run model updates in a separate shadow process. The required U.S. equity record must come from a new qualifying run. [Portfolio weights and paper deployment](https://github.com/AI4Finance-Foundation/FinRL-Trading)

## Entry evidence

Save the applicable rules, eligibility, permitted data, submission rights, frozen code and checkpoint hashes, validation report and organizer receipt. Preserve a separate forward results series with score dates, fees, drawdown and turnover. Each submission requires a venue-specific qualifying result and a compatible active edition. [Numerai assessment and its separate gate](https://amelie-iska.github.io/phaseweave-lab/numerai.html)
