# Shared graph forecasts for longer FX cycles

On October K4 routes with four legs, histogram gradient boosting reached **0.200266 log bp** one-second MAE, and the strongest two-seed neural mean was **0.203728** for GAT with token attention. Persistence scored **0.255292**. On five-leg routes containing CHF, ridge reached **0.302193**, persistence **0.339824**, and all 22 K4-trained neural fits had higher error. Both results use their own dated and eligible route cohorts. [Interactive results](https://amelie-iska.github.io/phaseweave-lab/fx-cycles.html) · [Dataset contract](../downloads/fx-cycle-dataset.md)

| October cohort at the one-second tenor | Scored route and origin pairs | Persistence | Ridge | Boosted trees | GAT with token attention, two-seed mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| Four-leg K4 | 4,830 | 0.255292 | 0.204458 | 0.200266 | 0.203728 |
| CHF five-leg K5 | 9,810 | 0.339824 | 0.302193 | 0.416433 | 0.413984 |

The shared neural route encoder uses current spread and age graph tokens, a history of complete cycle sums and other gauge-invariant route features, and averaged oriented adjacent edge embeddings. The adjacent-edge pooling is equivariant under node/edge relabeling and invariant to rotating the route start. The forecast is a learned residual above the current margin. The same parameter tensors accept K4 and K5 geometry, and unusable paths fall back to the available baseline. Graph node and edge tokens use shared parameters and role-sensitive endpoint embeddings. The published TokenGT results motivate that tokenized construction. [TokenGT](https://arxiv.org/abs/2207.02505) · [Exact K4 transport](../k4-transport.html)

The 26 fits used six epochs, two seeds, 246 gradient updates per fit, and 79,768 to 80,056 parameters. Each selected epoch minimized equal-length-and-tenor macro MAE in September validation. One-second history arms include GCN, GAT, MPNN, token attention, three hybrids, an outer tropical control and three circuit propagation controls. Five-second history compares classical and coherent MPNNs on exactly the same 15-second elapsed window. Fit and evaluation used the remote RTX 4090, including classical statevector and semiring simulation for the circuit patch. The ridge and HGB controls see the same available target definitions and use fixed route statistics.

On **3,456 common four-leg keys** at the one-second tenor, both classical and coherent MPNN seeds had higher October MAE with four frames than with sixteen. The classical increases were 0.002497 and 0.002694 log bp. The coherent increases were 0.001568 and 0.001571. On the five-leg CHF cohort, the one-second-history coherent-minus-classical contrast changed sign across seeds. The six October UTC-day blocks and one quote source limit generalization. [Independent audit and paired intervals](../fx-cycle-pilot-audit-v1.json)

All 26 checkpoint identities matched their receipts. Independent CPU replay of both MPNN patches and both seeds at both cadences on October K4 and CHF had a maximum score discrepancy of 3.56 × 10⁻⁷ log bp. It also verified exact native and common-support masks and recomputed paired intervals before any public export. The pilot estimates indicative archived quote margins, with no size, execution or fill evidence.

## Reproduction

Run the curated data commands in the [dataset contract](../downloads/fx-cycle-dataset.md). In the existing research environment run

    ./scripts/train_fx_cycles.sh CURATED_DATASET EXPECTED_MANIFEST_SHA256 FRESH_OUTPUT_ROOT

Use the optional environment variable PHASEWEAVE_PYTHON with the selected research Python path. The runner writes fit receipts and checkpoints before scoring held-out targets. The completed dataset manifest SHA-256 is recorded in the linked dataset contract. The evaluation and audited result bundles contain aggregate evidence only.

## Local front page

Choose **Trained FX cycles**. Select three or four assets for the trained K4 setting, or five for the explicitly labeled CHF extrapolation. History spacing chooses sixteen or four frames over the same elapsed window. Forecast tenor selects which of five model outputs is highlighted. The panel shows both orientation means and the persistence reference over a bounded October input cohort. [Live inference setup](../#live-inference)
