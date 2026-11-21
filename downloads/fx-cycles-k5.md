# Five-leg FX forecasts on a supervised K5 graph

On five September 2026 sessions, a classical message-passing neural network (MPNN) forecast five-leg CHF margins with mean absolute errors of **0.26014** and **0.26173 log basis points** from one- and five-second input histories. Both used five-leg labels in training. Current-margin persistence scored **0.32581** on the same observations. Adding five-leg supervision helped at the slower cadence and hurt at the faster cadence. The evidence covers historical indicative quotes and a modeled fee. [Aggregate results and provenance](../fx-cycles-k5-v1.json)

## Matched five-leg comparison

Both input cadences span the same 15 seconds. The table uses only route-origins eligible at **both** cadences. Each reported MAE gives equal weight to the 1, 5, 15, 60 and 300 second forecast tenors. For learned neural arms it then averages the two seeds' MAEs. These are individual model scores averaged after evaluation. The predictions were sealed before opening held-out outcomes. [Campaign protocol](https://github.com/amelie-iska/PhaseWeave/blob/main/configs/fx-cycle-k5-v1.yaml) · [Trainer and scoring](https://github.com/amelie-iska/PhaseWeave/blob/main/research/train_fx_cycle_transfer.py)

| Model or training contrast | 1 s input | 5 s input |
|---|---:|---:|
| Current-margin persistence | 0.32581 | 0.32581 |
| DLinear with route masks | 0.31239 | 0.30538 |
| Route ridge | 0.26794 | 0.27450 |
| Hodge edge-space ridge | 0.26791 | 0.27468 |
| Histogram gradient boosting | 0.26294 | 0.26920 |
| Classical MPNN, three- and four-leg labels | 0.25735 | 0.26810 |
| Classical MPNN, all lengths | 0.26014 | 0.26173 |
| Coherent MPNN, three- and four-leg labels | 0.25804 | 0.26778 |
| Coherent MPNN, all lengths | 0.26278 | 0.26773 |

At the one-second **forecast tenor**, the all-length classical MPNN scored 0.24690 and 0.24884 for the two input cadences. At the five-second tenor it scored 0.25476 and 0.25425. Gradient boosting had the lowest single-second-tenor MAE of the listed one-second input controls, 0.24238. Across all directed routes, the same classical MPNN scored 0.18612, 0.22854 and 0.26014 for triangles, quadrilaterals and pentagons with one-second input. Five-second input gave 0.19682, 0.23375 and 0.26173 respectively. [Per-tenor and per-length scores](../fx-cycles-k5-v1.json)

## Coherence, graph architecture and supervision

The one-second campaign paired seven backbones with classical and coherent six-wire, radix-three patches. Each row uses all-length supervision and the shared pentagon support above. Classical GAT had the smallest observed mean in this retrospective comparison. Every paired backbone had higher mean error with the coherent patch. These 14 fits per seed do not establish an architectural ordering on other dates. [Architecture and propagation definitions](https://github.com/amelie-iska/PhaseWeave/blob/main/research/fx_cycle_transfer_models.py)

| Backbone | Classical | Coherent |
|---|---:|---:|
| GCN | 0.25906 | 0.26050 |
| GAT | 0.25715 | 0.26288 |
| MPNN | 0.26014 | 0.26278 |
| TokenGT | 0.26163 | 0.26287 |
| GCN–TokenGT | 0.26063 | 0.26367 |
| GAT–TokenGT | 0.26269 | 0.26462 |
| MPNN–TokenGT | 0.26227 | 0.26430 |

The five-leg supervision contrast keeps the K5 input graph, dates, seeds and 696 updates fixed. Both variants select a checkpoint using three- and four-leg validation targets. On common support, full minus short supervision changed classical MPNN MAE by +0.00279 at one-second cadence and −0.00636 at five-second cadence. The coherent changes were +0.00474 and −0.00005. A short-supervised fit sees CHF in shorter cycles during training and extrapolates to the five-leg target. [Registered contrasts](../fx-cycles-k5-v1.json)

Increasing coherent MPNN radix from three to five held six wires and 108,300 trainable parameters fixed. On common support, radix five scored 0.26315 versus 0.26278 for radix three. On the larger one-second eligible cohort, the two values were 0.26121 and 0.26142. The sign also varied by seed at the one-second forecast tenor. The centered difference for seed 20261121 was +0.00372 log bp and for 20261122 was −0.00235. The implementation computes exact local marginals of a simulated chain-phase circuit on classical hardware. [Circuit implementation](https://github.com/amelie-iska/PhaseWeave/blob/main/research/fx_cycle_transfer_models.py) · [Paired scores and day-block intervals](../fx-cycles-k5-v1.json)

## Coverage and verification

The graph spans CHF, EUR, GBP, JPY and USD, with 20 directed edges and 74 simple directed cycles. August contributed 8,320 training origins. Six earlier September sessions contributed 3,072 validation origins, and five later September sessions contributed 2,560 held-out origins. All 24 pentagons contain CHF. Eligible directed pentagon counts from shortest to longest tenor were 8,920 / 7,026 / 6,662 / 6,378 / 5,766 at one-second cadence, and 5,432 / 4,176 / 3,984 / 3,806 / 3,538 on common support. Reversed routes, nearby origins and tenors share quotes. The reported uncertainty resamples UTC sessions and has only five day blocks. [Curation and session registration](https://github.com/amelie-iska/PhaseWeave/blob/main/research/curate_fx_k5_dataset.py)

The independent audit checked all 66 sealed forecast arrays, 5,280 score cells and 750 paired-contrast cells. The largest scalar difference was 1.67 × 10⁻¹⁶. Later input windows independently reconstructed 144,366 of 155,324 eligible directed targets, with maximum absolute difference 4.77 × 10⁻⁷ log bp. All eight sampled MPNN CPU replays stayed within 3.10 × 10⁻⁶ log bp. [Independent auditor](https://github.com/amelie-iska/PhaseWeave/blob/main/research/audit_fx_cycle_transfer.py)

Five-second gradient boosting reproduced all 947,200 forecast values byte for byte when replayed with the original CUDA feature preprocessing and saved scikit-learn estimators. The one-second replay likewise matched. The independent CPU path had five values beyond its registered tolerance, two of them eligible. Its overall eligible MAE shifted by −0.000000187 log bp. The original audit preserves this exception. The five-second sealed HGB prediction SHA-256 is `a83a0fae157d07bf7ab71e3f80ba7116c4c7223a83defe8bdb864e955bb18ed6`. [Audit and seal identifiers](../fx-cycles-k5-v1.json)

# Supervised K5 pentagon benchmark data

This separate pilot gives the five-currency graph its own five-leg training outcomes and a later chronological test. Each cohort uses CHF, EUR, GBP, JPY and USD, with all 20 directed edges and the same 74 directed routes. The existing K4-trained pentagon extrapolation remains a separate result. [Earlier K4 and CHF study](https://github.com/amelie-iska/PhaseWeave/blob/main/docs/FX_CYCLE_DATASET.md) · [FX quote sources](https://github.com/amelie-iska/PhaseWeave/blob/main/docs/DATASET.md)

## Frozen chronology and prior exposure

Use the following dates in 2026, with sessions from 12:00 through 13:00 UTC.

| Role | Dates | Cap per session |
| --- | --- | ---: |
| Train | Aug 3, 4, 6, 7, 10, 12, 14, 18, 21, 24, 25, 27 | 768 |
| Validation | Sep 1, 3, 8, 10, 14, 16 | 512 |
| Locked test | Sep 21, 23, 25, 28, 30 | 512 |

The preflight checked manifests and origin-clock and route columns for the two original margin-window datasets, the expanded scaling dataset, the five-tenor triangle dataset, and the earlier longer-cycle pilot. It parsed no outcome values to choose these dates. Earlier CHF triangle outcomes appear on 26 October dates. Earlier CHF pentagon outcomes appear only on October 6, 9, 14, 20, 23 and 30. All 11 selected September validation and test days are distinct from dates in the earlier longer-cycle evaluation. The older non-CHF triangle studies used those same September calendar dates for validation or stress. The benchmark therefore establishes fresh CHF and pentagon outcome coverage within the audited project corpus. Shorter non-CHF strata still share past market dates and underlying quote conditions.

The origin and every observation through its longest target tenor stay in the same declared session. Training ends in August, validation ends before the late-September test period, and neither the existing October outputs nor the earlier K4 score tables participate in constructing targets. Frozen-model selection should use the independent validation part before reading the test outcomes. The test is retrospective and chronologically later than training.

## Common K5 geometry and two supervision masks

The asset order is CHF, EUR, GBP, JPY and USD. Orient each unordered pair in both directions. Canonical simple cycles begin at their lexicographically smallest asset and store each traversal alongside its opposite. The fixed route axis has 20 triangles, 30 quadrilaterals and 24 pentagons. It includes 60 CHF-containing directions and 14 without CHF. For the CHF stratum, look up the route's asset indices through `edge_index[route_edges]`, excluding padding. Every pentagon contains CHF.

Each eligible origin has a complete current pentagon and at least one complete preceding frame for that route in the causal input window. Use a deterministic, uniform random cap with seed 20261124 keyed by role and date. The selection code uses input masks only. It retains incomplete future targets with explicit false masks and zero storage.

All models use identical K5 origins, features and route axes. A short-label fit uses only length-three and length-four labels in its training loss. A full-label fit also uses length-five labels. The same saved future keys permit paired comparisons after checkpoint selection. Use the recorded date strata and a shared mask for any test contrast, with results separated by route length, CHF membership and tenor.

The conservative availability clock adds one second to fixed-EST, whole-second source stamps after conversion to UTC. Duplicate ticks use minimum bid and maximum ask. Each arc has a maximum modeled availability-age of 250 ms. Look back 15 seconds through the origin, then score the five physical tenors of 1, 5, 15, 60 and 300 seconds. Every leg in a fresh target must advance strictly after the origin on the modeled clock. Route margins sum directed log bids or reciprocal asks less 0.1 assumed log bp per leg. The two directions satisfy the logged bid/ask fee ceiling. These values represent indicative quote margins. [Availability assumptions and gates](https://github.com/amelie-iska/PhaseWeave/blob/main/docs/FX_CYCLE_PREFLIGHT.md)

## Verified coverage

The new dataset contains 13,952 origins in 23 sessions. The counts below include both directions and refer to eligible route/tenor labels. A single origin can contribute several routes.

| Split | Origins | Pentagon 1 s | Pentagon 5 s | Pentagon 15 s | Pentagon 60 s | Pentagon 300 s | Pentagon 1 s common to both histories |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train | 8,320 | 26,306 | 22,154 | 20,608 | 20,106 | 17,778 | 16,486 |
| Validation | 3,072 | 10,882 | 8,660 | 8,082 | 7,692 | 6,984 | 6,490 |
| Locked test | 2,560 | 8,920 | 7,026 | 6,662 | 6,378 | 5,766 | 5,432 |

Independent replay checked 218 archived source-to-availability edge clocks in each of the train and validation windows. Recomputed pentagon origin margins and the 1- and 300-second labels agreed within 8.56×10⁻⁸ log bp. All 228,200 eligible train orientation pairs and 94,775 validation pairs satisfy the fee half-space with zero observed overshoot. Checks on the locked test part cover its hashes, masks, clocks and route structure. Test outcome values are outside the independent replay.

- Frozen curation plan SHA-256 `24471be860aa072100ac39bb5539c0284abcb00f7eb4c08b8b3dee38941e4c2f`
- Dataset manifest SHA-256 `4f6bc04f1ab9ebec085408c6fd1e9cb61c6c465233abadcd40e6490b08f4245a`

## Interface and reproduction

The format is `phaseweave.fx-cycle-supervised-k5.v1`. Each of `train.npz`, `validation.npz` and `test.npz` preserves the preceding data contract.

- `features` has shape `[N,16,20,3]`, `edge_index` has shape `[20,2]`, and `route_edges` has shape `[74,5]` with −1 padding.
- `anchor_utc_s` has shape `[N]`. `persistence`, `route_mask`, `route_mask_5s` and `origin_route_mask` have shape `[N,74]`.
- `targets`, `target_mask` and `target_mask_5s` have shape `[N,74,5]` with tenor as the final axis.
- The five-second history uses frames `[0,5,10,15]` at identical origins. Its common target mask is `target_mask_5s`, equal to one-second target support intersected with the decimated input route mask.
- Arrays `input_quote_available_utc_s`, `target_min_available_utc_s` and `target_max_available_utc_s` support clock audits. Model inputs exclude all outcome fields. Any fitted normalization uses only training observations.

Run with the existing Python environment and fresh destinations.

```sh
py=/home/iska/miniconda3/envs/tokengt/bin/python
PYTHONDONTWRITEBYTECODE=1 "$py" research/curate_fx_k5_dataset.py freeze \
  --plan FRESH_PLAN.json
PYTHONDONTWRITEBYTECODE=1 "$py" research/curate_fx_k5_dataset.py curate \
  --plan FRESH_PLAN.json --output FRESH_DATA_DIRECTORY
```

The new curator pins the prior curator and quote abstraction byte-for-byte, checks all required archive identities, and preserves the original datasets. Each new part is written exclusively and checked for exact array round-trip agreement. The private manifest reports hashes, geometry, and label eligibility counts. Keep the split payloads in authorized research storage. [Source terms](https://github.com/amelie-iska/PhaseWeave/blob/main/docs/DATASET.md)

# Matched K5 forecast and cyclic-qudit comparison

The study asks whether training a shared route head on five-leg labels improves inference on unseen five-leg CHF cycles. The short-supervision and full-supervision MPNNs use the same five-currency graph, quote histories, origin rows, initialized weights, batch order and validation criterion. Both calculate a prediction for each of the 74 routes. The short-supervision loss excludes pentagon outcomes and the full-supervision loss includes them with length and tenor balancing. The contrast changes both the pool of labels and the relative weight assigned to each length. It leaves the quote graph and prefix inputs fixed. [Dataset contract](#supervised-k5-pentagon-benchmark-data)

The September 21–30 test sessions contain fresh CHF and pentagon outcomes in the audited source history. Earlier experiments used these dates for non-CHF triangles. The fits use August sessions and September 1–16 validation. Select the first checkpoint that attains the smallest validation mean of the ten length/tenor MAEs for lengths three and four. This makes the comparison independent of five-leg validation values. DLinear uses its documented all-length selection, so its scores are a reference rather than part of the paired supervision claim. Persistence, ridge, histogram gradient boosting, Hodge ridge and route-shared DLinear provide controls at both spacings. Hodge ridge projects the antisymmetric edge field onto the null space of the observed incidence matrix to measure cyclic residual energy even when the quote graph has missing edges. Without declared faces, this projection is onto the graph cycle space. [DLinear](https://arxiv.org/abs/2205.13504) · [Statistical ranking and combinatorial Hodge theory](https://arxiv.org/abs/0811.1067)

The registered graph roster has seven backbones, classical and coherent versions of each, additional phase and tropical controls, and two seeds. All have three spatial layers of width 48 and train for eight epochs. Weight selection uses validation only. A four-frame input series samples the same 15 elapsed seconds as the sixteen-frame series. The paired history comparison uses targets available to both. The held-out target arrays are opened only after both cadences have sealed checkpoint selections and prediction bundles. Day bootstrap intervals use five dated blocks and characterize this test only.

## Exact single-wire circuit readout

For radix \(q\) and \(w\) wires let \(z_i\) be the digit on wire \(i\) and let \(C_s=\cos(2\pi s/q)\). A learned six-dimensional route feature map produces angles \(a_i\). Preparation gives the product probability \(p(z)=\prod_i p_i(z_i)\), where \(p_i\) is the softmax of \(\cos(a_i-2\pi s/q)\). The prepared amplitude is \(\sqrt{p(z)}\) with diagonal phase

\[
\Phi(z) = \sum_i a_i C_{z_i} + \frac{2\pi}{q}\sum_{i=1}^{w-1}\kappa_i z_i z_{i+1}.
\]

After that diagonal layer, each wire receives the local unitary \(U_i=I+(e^{i\theta_i}-1)\lvert s\rangle\langle s\rvert\), with \(\lvert s\rangle\) the uniform vector. Its local clock expectation is the trace of \(C U_i\rho_i U_i^\dagger\). In the partial trace defining \(\rho_i(s,s')\), every phase shared by the bra and ket cancels. Only the phase at wire \(i\) and the terms with immediate neighbors survive. Thus

\[
\rho_i(s,s')=\sqrt{p_i(s)p_i(s')}\,e^{ia_i(C_s-C_{s'})}\,
\prod_{j\,\sim\,i}\left[\sum_t p_j(t) e^{i(2\pi/q)\kappa_{ij}(s-s')t}\right].
\]

The local mixers on the traced wires also cancel by unitarity. This computation needs \(O(wq^2)\) stored density entries per example and \(O(wq^3)\) arithmetic for a fixed-degree chain, instead of \(q^w\) joint amplitudes. It gives exact marginals for the specified circuit. General circuits, joint measurements and nonlocal dynamics can require additional contractions. The six-wire five-level patch has \(q^w=15{,}625\) joint states. The implementation computes its single-wire observables on a classical RTX 4090.

The product-phase control drops the diagonal pair phases while retaining the same parameterized local mixers. The dephased control uses \(|U_i|^2\) acting on \(p_i\). The max-plus control computes each output's best incoming log mass and normalizes the resulting log scores. Because the observed max-plus transition operates on a product input, its global normalizer factorizes exactly into the wire normalizers. The TokenGT-style tropical outer attention is a separate ablation. Dense-reference tests cover marginals and gradients at radices 2, 3 and 5 for 16 circuit settings, legacy four-qutrit parity, and a twelve-wire finite-gradient check.

## Reproduction

Use the existing research environment, immutable verified archive inputs, and new artifact paths. The public release contains aggregate scores and methods. The licensed quote payload, per-origin predictions and checkpoints remain in authorized storage.

```sh
export PHASEWEAVE_PYTHON=/home/iska/miniconda3/envs/tokengt/bin/python
./scripts/train_fx_cycle_k5.sh \
  artifacts/fx-k5-supervised-pilot-v1 \
  4f6bc04f1ab9ebec085408c6fd1e9cb61c6c465233abadcd40e6490b08f4245a \
  artifacts/k5-reproduction
```

The wrapper calls `fit-seal` at both 1 s and 5 s before it calls `score`. The latter checks both seals, forecast and provenance hashes before it loads the held-out outcome arrays. Use `PHASEWEAVE_DEVICE=cpu` for a standalone CPU reproduction with the same seeds. Backend floating-point arithmetic can differ.

Run one verified five-leg historical inference on a CPU. The example number indexes predictor-eligible CHF route/origin pairs and reads no targets. The output includes both orientations, five predictions, the recurrent state and patch embedding, and the six local probability vectors for each orientation. The final output is checked against the sealed batch prediction within a small numerical tolerance.

```sh
"$PHASEWEAVE_PYTHON" -B research/infer_fx_cycle_transfer.py \
  --dataset artifacts/fx-k5-supervised-pilot-v1 \
  --manifest-sha256 4f6bc04f1ab9ebec085408c6fd1e9cb61c6c465233abadcd40e6490b08f4245a \
  --campaign artifacts/k5-reproduction --cadence 1 --legs 5 --example 0
```

Choose `--legs 3`, `--legs 4` or `--cadence 5` with the same checkpoint family. Choose `--checkpoint mpnn-classical-q3w6-softmax-full-20261121` to trace the matched classical patch. The archived indicative measurements use a fixed fee assumption and have no execution-size or fill evidence. [Interactive comparison](https://amelie-iska.github.io/phaseweave-lab/fx-cycles-k5.html)
