# Joint continuous reasoning on historical K5 FX routes

A single trained continuous encoder connects qutrit cycle features, analogy retrieval, GraphCG-style steering, a branching forest and a conditional path GFlowNet. On three September development sessions, the complete model scored **0.189932 log bp MAE**, the encoder-only control **0.189522**, and current-margin persistence **0.238159**. The measured accuracy gain over persistence therefore also occurred with the simpler model. On five-leg forecasts alone, the complete model scored 0.217254 against 0.219243 for the encoder-only control. These are development results from one seed. [Joint model](https://github.com/amelie-iska/PhaseWeave/blob/main/research/joint_fx_reasoning.py) · [Training protocol](https://github.com/amelie-iska/PhaseWeave/blob/main/research/train_joint_fx_reasoning.py)

## How the predictions are made

Each eligible directed route has 25 causal features from the previous 15 seconds. These summarize observed directed circulation, spread, availability and their history. The encoder maps them into 16 continuous coordinates. The five outputs are corrections to the current margin at 1, 5, 15, 60 and 300 seconds. An ineligible route returns its current-margin baseline. [Route feature implementation](https://github.com/amelie-iska/PhaseWeave/blob/main/research/train_fx_cycles.py)

- **Cycle features.** A trainable three-wire, radix-three chain-phase patch takes the final frame's six route measurements. Its exact local measurement probabilities produce three clock expectations, which project into the shared latent state. The cycle ablation removes this explicit patch. The input history and persistence still describe the observed route. [Qudit marginal computation](https://github.com/amelie-iska/PhaseWeave/blob/main/research/fx_cycle_transfer_models.py)
- **Analogy.** A learned key projection compares a query against 192 strictly earlier August route observations encoded by the same network. The four closest by cosine similarity supply weighted historical margin corrections to the shared state. Each tenor uses its own evidence mask. A tenor with no valid neighbor contributes zero. The private memory stays on the training host. [Earlier analogical transport](https://github.com/amelie-iska/PhaseWeave/blob/main/research/continuous_analogy.py)
- **Steering.** Four learned directions apply measured doses for signed circulation, spread, missing history and loop dispersion. Training combines the return loss with the earlier GraphCG contrastive objective and an observer that ties each direction to a measurable concept. The model accepts optional counterfactual offsets in [−2, 2] on each axis. Their effects describe changes inside the fitted forecaster. [Earlier GraphCG objective](https://github.com/amelie-iska/PhaseWeave/blob/main/research/train_graphcg_fx.py)
- **Forest.** Four learned roots in three dimensions each generate two candidate children at each of two successive levels. A verifier predicts candidate error using the observed context. Its lower-cost child survives. A final learned repair competes with the unedited point. A soft vote across trees incorporates the entire selected path into the shared state. The verifier and candidate readout train against observed August outcomes. Inference uses only the verifier's estimated costs. [Earlier deep-forest expansion](https://github.com/amelie-iska/PhaseWeave/blob/main/research/evaluate_deep_forest.py)
- **GFlowNet.** The continuous path has four ordered points in three dimensions, including an edit frame. Appending a point uses a learned conditional diagonal Gaussian. Backtracking deterministically deletes the last point. The terminal reward density is a weighted mixture of Gaussian densities centered on the forest's four detached trajectories, with coordinate standard deviation 0.35. Each component integrates to one on 12-dimensional Lebesgue measure, and the forest weights sum to one for every context. Therefore the reward normalization is exactly one and trajectory balance uses fixed log Z of zero. This objective distills the evolving forest distribution. During inference, four full autoregressive rollouts use fixed antithetic Gaussian innovations. Their encoded paths enter the actual forecast. When the forest is ablated, the flow continues training against a single path centered on observed concept values. [Earlier ordered path policy](https://github.com/amelie-iska/PhaseWeave/blob/main/research/train_edited_path_gflownet.py)

## Exposure, controls and tests

The training memory uses August 3–4. The latest possible bank response precedes the earliest fitted query's input window. Ten later August dates supply 5,760 fitted route windows with 6,935 eligible target values. September 1, 3 and 8 supply 1,728 route windows for checkpoint selection. September 10, 14 and 16 supply another 1,728 windows with 2,449 scored values for the development comparison. Sampling depends only on input availability and length. The six September dates belonged to the earlier campaign's validation split. [K5 fold registration](https://github.com/amelie-iska/PhaseWeave/blob/main/research/curate_fx_k5_dataset.py)

All seven models used the same 5,920-parameter template, initialization seed, six epochs and 270 optimizer updates. Removing a branch leaves its allocated parameters inactive. Each arm selected epoch four independently. The reported MAE weights each of the three route lengths and five tenors equally. Each ablation below was retrained from the common initialization. [Fit and selection driver](https://github.com/amelie-iska/PhaseWeave/blob/main/research/train_joint_fx_reasoning.py)

| Model | Development MAE, log bp |
|---|---:|
| Persistence | 0.238159 |
| Encoder only | 0.189522 |
| Joint model | 0.189932 |
| Joint without analogy | 0.189674 |
| Joint without cycle patch | 0.192155 |
| Joint without steering | 0.191723 |
| Joint without forest | 0.192239 |
| Joint without path flow | 0.190451 |

Independent CPU checks reproduced all seven scores exactly. On 48 observed route inputs they reconstructed every surviving forest branch, verified that missing analogical evidence had no effect, and measured nonzero forecast gradients in all five components. Changing only the flow's sampling innovations shifted the actual final forecasts by 0.004166 log bp on average. The independent Gaussian calculation agreed with the recorded forward log densities to within 0.00000191. These checks establish that the components participate in the prediction. The small validation sample and single seed leave their comparative accuracy uncertain. [Focused verification](https://github.com/amelie-iska/PhaseWeave/blob/main/research/check_joint_fx_reasoning.py)

The training entry point requires a new output directory. The selected joint weights have SHA-256 `f9eaeeca1958376f28d884dcb29c6afa5df90ffae1e2e4ed6ca64b20bebab444`. The aggregate development receipt has SHA-256 `f139a82bcdffdb59e8a46ae207a98570690b1bf8ff9ef80e8901663f0ada69ea`, and the independent check has SHA-256 `b5286b520802aa5e0611f29686470829d2bca4abaa0b421eb653ecd41124b28d`.

```sh
python -B research/train_joint_fx_reasoning.py --dataset artifacts/fx-k5-supervised-pilot-v1 --output FRESH_RUN
python -B research/check_joint_fx_reasoning.py --dataset artifacts/fx-k5-supervised-pilot-v1 --fit FRESH_RUN --selection-sha256 SELECTION_SHA256 --output FRESH_CHECK.json
```

## Run the integrated trace

Open the local front page and choose **Joint continuous model** in **Local model trace**. Select a route length, forecast tenor and named concept offset. Run the model to see the four continuous tree paths alongside the four sampled paths, analogue weights and the forecast. Switch **3D view** to **Qutrit probability density** and scrub the measured frames. Earlier complete quote frames are passed through the same fitted patch for visualization. The final frame is the patch output used in the forecast.

The trained integration uses the private chronological analogue memory on the local host. The public front page also embeds the Hugging Face model app for its existing released historical snapshots. The public market density view is a separate quote-driven unitary walk.

[Front inference](../#live-inference) · [K5 held-out comparison](../fx-cycles-k5.html)
