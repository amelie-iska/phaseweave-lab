# Supervised variable-length FX cycle pilot

This pilot pairs observed quote histories with future directed cycle margins. It uses six direct fiat pairs among EUR, GBP, JPY and USD for K4 training and evaluation. A separate October K5 split exposes CHF and scores only routes containing CHF. Each episode holds a real observed graph, its current-margin persistence, and masked future outcomes. [Archive and clock preflight](../fx-cycles.html) · [Underlying data provenance](../data.html)

## Frozen split and target contract

The curation plan was frozen before outcome construction. It pins the 30 underlying archive entries via their two manifests, the curator and its quote abstraction, split periods, exact session dates and sampling rule.

| Split | Fixed 12:00–13:00 UTC sessions in 2026 | Graph | Cap per session |
| --- | --- | --- | ---: |
| Train | Aug 4, 7, 12, 14, 18, 21, 25, 27 | K4 | 768 |
| Validation | Sep 2, 4, 9, 11, 15 | K4 | 512 |
| Stress | Sep 17, 18, 22, 24, 29 | K4 | 512 |
| Test | Oct 6, 9, 14, 20, 23, 30 | K4 | 512 |
| New asset | Oct 6, 9, 14, 20, 23, 30 | K5, CHF-containing target routes | 512 |

Use all declared graph edges observed as of each of 16 one-second frames in the 15 seconds through the origin. The source cube uses HistData fixed EST converted to UTC, followed by a one-second modeled bucket release delay. When a source timestamp repeats, use its minimum bid and maximum ask. A leg is available if its effective quote timestamp is at or before the frame and no more than 250 ms old. Because the archive uses whole-second clocks, observed ages at this cadence are zero. These modeled availability timestamps do not measure network or venue receipt latency.

An input route needs a complete origin and at least one complete preceding frame. A row qualifies for subsampling when this test passes for at least one route of length four or five, using only input-period masks. Capped sessions use a deterministic uniform sample without replacement at seed 20261121, derived per split and date. Every sampled origin stays at least one second inside the session after the 15-second input lookback and before the 300-second outcome. Full histories and outcomes cannot span a session or chronological fold boundary. Features and sampling in August and September use K4 pairs only.

Each route starts at its lexicographically smallest currency. Store the lexicographically first traversal and then its opposite; retain both directions. K4 has eight directed triangles and six quadrilaterals. K5 has 12 CHF-containing directed triangles, 24 quadrilaterals and 24 pentagons. The K5 feature graph also contains non-CHF pairs that occur in K4. The October comparisons share dates and can share source rows. Treat length-five scores from a head trained only on K4 as structural extrapolation.

A target uses independently refreshed bids and reciprocal asks on the entire route at 1, 5, 15, 60 or 300 seconds. Every target-side leg must be fresh as of the tenor and have effective availability strictly later than the origin. Take the log of each oriented rate, sum in basis points and subtract 0.1 assumed log bp per leg. Store both sides. Their sum cannot exceed twice the negative fee charge, up to numerical tolerance. The target is an indicative quote margin.

## NPZ interface

Load the split archives with NumPy `allow_pickle=False`. A part has (N) origins, (E=12) and (R=14) for K4, or (E=20) and (R=60) for K5.

| Field | Shape | Meaning |
| --- | --- | --- |
| `features` | float32 `[N,16,E,3]` | Gauge-centered directed log bp, fraction of age limit, and edge availability. Absent edges use `[0,1,0]`. |
| `anchor_utc_s` | int64 `[N]` | Increasing UTC origin seconds. |
| `edge_index` | int64 `[E,2]` | Asset index of each oriented arc. |
| `route_edges` | int64 `[R,5]` | Arc indices for each simple cycle, padded with −1. |
| `route_lengths` | int64 `[R]` | Valid prefix length, three through five. |
| `assets`, `horizons_s` | string `[4 or 5]`, int64 `[5]` | Asset names and physical tenors. |
| `persistence`, `origin_route_mask` | float32 / bool `[N,R]` | Observed origin margin with a valid-bit. Zero storage for unavailable routes. |
| `route_mask`, `route_mask_5s` | bool `[N,R]` | Input eligibility with one prior complete route in the full history or the four decimated frames `[0,5,10,15]`. |
| `targets`, `target_mask`, `target_mask_5s` | float32 / bool / bool `[N,R,5]` | Outcome and two separate eligible-history masks. Masked target storage is zero. |
| `input_quote_available_utc_s` | int64 `[N,16,E]` | Effective as-of quote clocks for independent checks, or −1 for a missing quote. |
| `target_min_available_utc_s`, `target_max_available_utc_s` | int64 `[N,R,5]` | Earliest and latest effective target-leg clocks for independent checks, or −1 for an ineligible target. |

The four-frame sensitivity is a paired history decimation on the same sampled origins. It keeps the elapsed lookback and tenors fixed. An experiment comparing five-second anchor sampling can select the same aligned subset for both methods. The model input consists of the observed predictor graph and input eligibility. Target values, target masks and target clock fields belong only to the loss and evaluation. Fit any learned scaling exclusively on training data.

## Measured pilot

The completed five-part dataset contains 16,414 origin rows. October K4 and K5 are separate graph cohorts and may include the same UTC origin. Counts below retain both directions of a cycle and report target eligibility rather than independent statistical trials.

| Split | Origins | Four-leg labels at 1 s | 5 s | 15 s | 60 s | 300 s | Four-leg 1 s labels with decimated history |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train | 5,150 | 5,756 | 4,664 | 4,510 | 4,262 | 4,082 | 3,612 |
| Validation | 2,560 | 3,138 | 2,376 | 2,506 | 2,466 | 2,230 | 1,964 |
| Stress | 2,560 | 4,514 | 3,980 | 3,790 | 3,534 | 3,388 | 3,454 |
| Test | 3,072 | 4,830 | 3,822 | 3,824 | 3,636 | 3,488 | 3,456 |
| New asset | 3,072 | 13,584 | 11,702 | 12,080 | 10,780 | 10,628 | 10,018 |

The October K5 fold has 9,810 five-leg labels at one second and 7,560 at 300 seconds. On one-second quadrilaterals, origin persistence gives 0.255292 log bp MAE in October K4 and 0.280457 in October K5. One-second CHF pentagon persistence gives 0.339824 log bp MAE. These are separate eligible route cohorts.

- Plan SHA-256 `d0e53fe406b27de9a03614de06260079b0a2b2ad0d6c242beb245bdb6b400ba5`
- Dataset manifest SHA-256 `91d2f42fe5b286fecf40c46e66bb97d2cb64f6dca59339a4b78f3406d7c80d15`
- Curator SHA-256 `08d738a5bc47a6537450c57da95111dccde4c68825d46f2ddb0ae2e12307783a`

## Reproduction and validation

From the project root, use the existing Python environment with fresh output paths.

```sh
py=/home/iska/miniconda3/envs/tokengt/bin/python
PYTHONDONTWRITEBYTECODE=1 "$py" research/curate_fx_cycle_dataset.py freeze \
  --plan FRESH_PLAN.json
PYTHONDONTWRITEBYTECODE=1 "$py" research/curate_fx_cycle_dataset.py curate \
  --plan FRESH_PLAN.json --output FRESH_DATA_DIRECTORY
```

Curation checks the frozen plan, ZIP identities and clock rules. It verifies gauge telescoping, paired orientation masks, the fee bound, per-session support, target timestamps and a complete NPZ array round trip. The private output manifest contains source and part hashes, route orders, session coverage, and per-length and per-tenor persistence metrics. Keep the NPZ payload in authorized research storage. [Source rights and provenance](../data.html)
