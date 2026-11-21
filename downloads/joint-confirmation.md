# Frozen joint FX confirmation

The encoder-only control had the lowest error in the registered CHF pentagon comparison. It scored **0.297915 log bp MAE** across five equally weighted tenors. The complete joint model scored **0.299484** and persistence **0.372777**. The joint model's excess error was **+0.001569 log bp**. The paired eight-day bootstrap interval was [0.000737, 0.002380]. An independent two-way resample of UTC days and reversal-paired routes gave [0.000568, 0.002799]. The encoder had lower pentagon MAE on seven of eight sessions. [Interactive results](https://amelie-iska.github.io/phaseweave-lab/joint-evidence.html) · [Cohort and clocks](#frozen-october-cohort-for-joint-fx-reasoning)

| Frozen arm | All CHF route lengths | CHF pentagons |
| --- | ---: | ---: |
| Encoder only | 0.252268 | 0.297915 |
| Joint continuous | 0.254022 | 0.299484 |
| Without cycle patch | 0.256198 | 0.301423 |
| Without analogy | 0.254411 | 0.298393 |
| Without steering | 0.253146 | 0.298753 |
| Without forest | 0.255574 | 0.300686 |
| Without GFlowNet | 0.254272 | 0.300714 |
| Persistence | 0.310209 | 0.372777 |

The October result uses the original seven frozen checkpoints, with their common August analogue memory and all optimization decisions unchanged. It measures indicative quote margins with the same 0.1 log bp cost per leg. The observed accuracy gain against persistence was common to the encoder and joint forecaster. The earlier September development advantage for the joint model on pentagons reversed. No new arm was fit on October, and the sample covers one vendor, eight UTC days and 12 reversal-paired pentagon routes. The separate ablation comparisons are descriptive. [Earlier development and model](joint-fx-reasoning.md) · [Crossed resampling reference](https://arxiv.org/abs/0712.1111)

## Forecast freeze and independent verification

The predictor-only cohort has 4,096 origins and exactly the 74 known route slots. The scoring mask selects CHF-containing routes. A complete label requires strictly later fresh edges at the designated tenor. The 261,474 native CHF labels include **83,090 pentagon** direction-tenor targets. The common-history subset has 203,454 total CHF labels. All forecasts still use the native 16-frame input. Common support filters scored keys to those that also have eligible coarse history. It does not rerun the model with coarse inputs. The confirmation dates were absent from the prior pentagon studies. Earlier CHF triangle cohorts include up to 129 of the same origin seconds, with possible reuse of individual pair quotes.

The clock-only plan preceded predictor extraction. An immutable registration and the forecasts preceded generation of the label archive. The outcome receipt binds the predictor manifest and forecast seal. The label reader opens only after it has verified both receipts. Eight forecast arrays stay in private research storage, together with the source and outcome rows.

The independent audit verified all 240 native- and common-support score cells within 2.22 × 10⁻¹⁶ log bp. It also regenerated all seven learned forecasts bitwise on 72 observed route windows and reconstructed 242,942 eligible target margins from overlapping later input frames within 8.35 × 10⁻⁷ log bp. This independent reconstruction has incomplete support because some later target clocks never enter another sampled input window. The paired intervals retain both route orientations in the same resampling group. [Independent implementation](https://github.com/amelie-iska/PhaseWeave/blob/main/research/audit_joint_fx_confirmation.py)

| Receipt | SHA-256 |
| --- | --- |
| Clock-only curation plan | `92edaee2938b636d50991f43e072e17ad372ca1e9694cc51e2c27d1425049e80` |
| Predictor manifest | `e318e605ceced6923aa026ae37a6b7a9700fa38fa0266455d9eeacf072b2932e` |
| Prediction seal | `4d00adafb31d435427defabf6932e959189f08de80c44b29993dabec509cc502` |
| Outcome release | `7daadd198b6bf50f3e4e16153c9a9ebb323525b8243da6337104cb83a6bdf3b5` |
| Official aggregate scores | `89f0e836a175fec7ff469ff07348fcd14eb36d44ce3f2d73ba56090c17233f6a` |
| Independent audit | `8f8b3154a4f4a2161813e035c55d64b67d76681dfe3e217650157b52ae50cbea` |

## Reproduction

Use the existing research environment, the pinned data archives and a fresh output directory. Define `COHORT` and `CAMPAIGN` as fresh paths, `MODEL_RUN` as the original joint model directory, and `PYTHON` as the research Python executable. First create the staged predictors, then seal the eight forecasts.

```sh
"$PYTHON" -B research/curate_joint_fx_confirmation.py freeze --output "$COHORT"
"$PYTHON" -B research/curate_joint_fx_confirmation.py predictors --output "$COHORT"
cohort_sha=$(sha256sum "$COHORT/manifest.json" | cut -d ' ' -f1)
"$PYTHON" -B research/joint_fx_confirmation.py predict --cohort "$COHORT" \
  --cohort-sha256 "$cohort_sha" --fit "$MODEL_RUN" --campaign "$CAMPAIGN"
seal_sha=$(sha256sum "$CAMPAIGN/prediction-seal.json" | cut -d ' ' -f1)
"$PYTHON" -B research/curate_joint_fx_confirmation.py labels --output "$COHORT" \
  --prediction-seal "$CAMPAIGN/prediction-seal.json" --prediction-seal-sha256 "$seal_sha"
"$PYTHON" -B research/joint_fx_confirmation.py score --cohort "$COHORT" \
  --cohort-sha256 "$cohort_sha" --campaign "$CAMPAIGN" --prediction-seal-sha256 "$seal_sha"
```

The scorer writes aggregate output exclusively. The live Gate shadow is a separate evaluation with a venue receipt clock. It does not alter the registered historical score.

# Frozen October cohort for joint FX reasoning

This eight-session retrospective confirmation tests whether a frozen joint reasoning model forecasts CHF-containing five-leg conversion margins better than its matched encoder-only control. The registered endpoint is joint minus `all_disabled` MAE in log basis points, giving equal weight to the five tenors. The CHF triangle and quadrilateral results are secondary. The forecast is evaluated on indicative quotes.

## Chronology and freshness

The UTC sessions are October 5, 7, 12, 15, 19, 22, 27 and 29, 2026, from 12:00 inclusive through 13:00 exclusive. All follow the August memory and fitting periods and the September selection checks. The clock-only audit reads origin timestamps and route geometry from four pinned triangle corpora and two pinned longer-cycle corpora. The older K4/K5 pilot admitted CHF pentagons on October 6, 9, 14, 20, 23 and 30. The subsequent K5 study used August and September. Neither longer-cycle cohort intersects these October confirmation dates.

The confirmation has 4,096 origins, 512 per date, sampled from 554–2,349 eligible origins per date. The price-free eligibility rule requires a complete five-leg route at the anchor and at least one complete earlier frame of that same route. SHA-256-derived NumPy seeds using base seed `20261126` select origins without replacement. The predeclared session calendar allows no replacement dates. Future availability and future price values have no role in sampling.

The audited triangle corpora include earlier work on the same dates. The largest confirmed overlap is 129 shared CHF triangle origin seconds and 235 shared non-CHF triangle origin seconds per corpus. The same observations can contribute to multiple older corpora, so these counts should stay separate by corpus. A shared origin second is evidence of historical clock reuse, with individual pair-row overlap possible. The fresh scope is the recorded CHF pentagon route/time cohort. All studies use the same archive family.

## Quotes, clocks and masks

The source is ten SHA-verified October HistData Generic ASCII pairs spanning CHF, EUR, GBP, JPY and USD. Source timestamps are fixed EST and quantized to whole seconds in these archives. Duplicate ticks use the minimum bid and maximum ask. The effective availability clock adds one second to the source bucket. This release delay is an assumption for replay. HistData provides no venue receipt clock. An edge is fresh when its effective clock is at most 250 ms behind the evaluation time. At the one-second grid used here, the latest eligible bucket must have that same effective second. Forward conversion uses the observed bid and the reverse conversion uses reciprocal ask.

The predictors keep the prior K5 geometry of 20 directed edges and 74 directed routes in unchanged order. CHF routes can be selected using the assets on each route. There are 12 CHF triangles, 24 CHF quadrilaterals and 24 CHF pentagons. A causal window has 16 one-second frames over 15 elapsed seconds. The coarse sensitivity uses the four identical-origin frames at offsets −15, −10, −5 and 0. Features are gauge-centered log rates in log bps, normalized quote age, and an availability flag. A masked edge has `[0, 1, 0]`. Both route orientations share availability.

Targets are same-session cycle sums at 1, 5, 15, 60 and 300 seconds, less an assumed 0.1 log bps per leg. Every target leg must be fresh at the tenor and strictly newer on the effective clock than the forecast origin. Each valid target has both min/max source availability timestamps. The paired orientation sum must stay below the negative sum of both per-route fees within numerical precision. Ineligible targets store zero with a false mask and a clock sentinel of −1. The five-second sensitivity uses the dense target mask intersected with the sparse input mask, so common comparisons can pair the same observations.

## Reproduce the staged cohort

Use the existing research environment in the PhaseWeave checkout and a fresh output path.

```bash
py=/home/iska/miniconda3/envs/tokengt/bin/python
out="$PWD/artifacts/joint-fx-confirmation-reproduction-v1"
export PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1
"$py" research/curate_joint_fx_confirmation.py freeze --output "$out"
"$py" research/curate_joint_fx_confirmation.py predictors --output "$out"
```

The `freeze` stage reads clocks and geometry, then writes `plan.json` with dates, exact sampled origins, all four availability mask digests, source and development fit hashes, and prior overlap counts. `predictors` parses BBO values only for the already-frozen input frame clocks, verifies their masks, and writes `predictors.npz` and immutable `manifest.json`. The predictor archive includes the original Fold input ABI and `input_quote_available_utc_s` for source-clock auditing. Values on input clocks can also serve as targets for other overlapping origins. Before the forecast seal, the curator leaves target-only clocks unparsed and creates no label archive.

The final stage requires the official prediction seal and hashes, plus the sealed `predictions.npz` adjacent to the seal. Pass the actual verified seal path and SHA-256 from the scoring protocol.

```bash
"$py" research/curate_joint_fx_confirmation.py labels --output "$out" \
  --prediction-seal "$seal" --prediction-seal-sha256 "$seal_sha256"
```

This writes a separate `labels.npz` and `outcomes.json` that binds its hash to the unchanged cohort manifest and prediction seal. It verifies future masks against their clock-only precommitments before writing, then verifies an exact NPZ round trip. The private package contains transformed vendor quote observations. Redistribution rights remain unverified under [the source terms review](https://github.com/amelie-iska/PhaseWeave/blob/main/docs/DATASET.md).

# Prospective quote shadow for the joint FX model

The frozen joint model, its encoder-only control and its no-GFlowNet control observed the existing public Gate order-book capture for ETH/BTC/USDT. The experiment opened the capture at its end to consume future arrivals only. It used a 180-second issuance window and allowed the last 300-second target to mature. It started on 21 November 2026 at 02:05:23 UTC. Prior FX model selection and all weights stayed fixed. Existing paper workers and the capture continued separately. [Public order-book schema](https://www.gate.com/docs/developers/apiv4/ws/#limited-level-full-order-book-snapshot)

Of **36 scheduled origins**, **five issued a forecast**. The other 31 lacked the required quote history. Across the complete issuance and settlement window, 70 of 481 grid seconds had a fresh three-pair quote. There were five eligible origin-tenor pairs and 20 unresolved-by-data pairs that reached their maturity clocks without a fresh outcome. Neither the 60-second nor the 300-second head had a scored label. The p95 end-to-end computation time before logging was 5.74 ms over the five issued forecasts. [Aggregate prospectively logged results](https://amelie-iska.github.io/phaseweave-lab/joint-evidence.html)

| Tenor | Scored origins | Joint MAE | Encoder-only MAE | Without GFlowNet MAE | Persistence MAE |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 s | 3 | 0.82784 | 0.77348 | 0.80077 | 0.50626 |
| 5 s | 1 | 3.23754 | 3.18733 | 3.23307 | 3.21271 |
| 15 s | 1 | 1.36635 | 1.32711 | 1.36043 | 1.81541 |
| 60 s | 0 | — | — | — | — |
| 300 s | 0 | — | — | — | — |

Each scored origin averages the two directions. All entries are log basis points. This small cross-market sample establishes that the fixed model ran on prospectively observed quote histories and that post-issuance outcomes can be matched. It supplies too few labels for a live accuracy ranking. The historical FX training distribution and the crypto spread and missingness distributions differ. The modeled 0.1 log bp per leg matches the training target instead of an account fee schedule. Orders, fills and returns are outside the measurement.

## Causal rules and audit

Use 16 one-second opportunities across 15 seconds. Give four arms the same present quote and target clocks. At issue time require a complete triangle, a complete earlier frame, quote age at most 250 ms, receipt skew at most 300 ms, and a 100 ms issue budget. Check exchange and local receipt clocks separately. Require every target book to have an exchange update strictly after forecast issuance and to satisfy the same trade-free freshness gate. A forecast stores its UTC origin, issue clock and source capture cut before the scorer can access a later target state. The writer flushes each event. The absence of eligible evidence remains explicit at every horizon.

The auditor reconstructs both directions directly from the captured bids and reciprocal asks, independent of the gauge transformation. It checks actual capture and post-issuance clocks and accounts for each issued origin-tenor exactly once. All eligible and missing counts agree. Maximum error discrepancy is 1.72 × 10⁻¹¹ log bp. Raw quote and forecast receipts are private. [Scorer](https://github.com/amelie-iska/PhaseWeave/blob/main/research/live_joint_fx_shadow.py) · [Independent verifier](https://github.com/amelie-iska/PhaseWeave/blob/main/research/audit_live_joint_fx_shadow.py)

| Receipt | SHA-256 |
| --- | --- |
| Live protocol | `def389f93cfc93403e40999064681f52600577d43b433cb4daa151c3aac44b36` |
| Aggregate live summary | `2810c5f42661fd3fbf0de6f49d49d213b5ddc92f07edf18c09903ce34bebce18` |
| Independent live audit | `88777762ba1095be794d26fd65fefe47cde72425c4cc97eeeef7642f6f4662e1` |

Run in the existing Python environment, using a currently active public capture file and a fresh output directory.

```sh
python -B research/live_joint_fx_shadow.py \
  --capture PUBLIC_CAPTURE.jsonl --fit FROZEN_JOINT_RUN \
  --output FRESH_SHADOW --observe-seconds 180
python -B research/audit_live_joint_fx_shadow.py \
  --campaign FRESH_SHADOW --capture PUBLIC_CAPTURE.jsonl --output FRESH_AUDIT.json
```
