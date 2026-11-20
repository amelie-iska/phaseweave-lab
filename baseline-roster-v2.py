"""Run Google's pinned zero-shot TimesFM 2.5 against PhaseWeave and persistence on identical FX windows."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import torch
from safetensors.torch import load_model
from transformers import TimesFm2_5ModelForPrediction

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO/"research"))
from forecast import Forecast, parameterize, source_modules

DATA_HASH = "89177f9ca8eb968e50ee763bda01850af603ac663268db94a2015c01007aabff"
REVISION = "5a9806b9b291fad9233b5249d88263f1846304d3"
WEIGHTS = "b53f6d52114e2ad786890f3c4637ce05f580b7800d6e24401f88b398b76035ef"
FM_CONFIG = "452ecae918f67b2e7d0f2892ab424d1876939e70d077db3708a4fe8ca03a7de5"
PHASE = "c22a9fe57a069766057b96b25ae2031a920e954b262a454e88036a56dc9bb967"
SEED = 20261128
SPLITS = ("validation","test","new_asset","stress")


def sha(path):
    with path.open("rb") as fd:
        return hashlib.file_digest(fd,"sha256").hexdigest()


def freeze(data, manifest):
    """Select 64 complete 16-frame windows per triangle and split, before reading labels."""
    selected = {}
    for index, split in enumerate(SPLITS):
        p = data/(split+".npz")
        if sha(p) != manifest["splits"][split]["sha256"]:
            raise ValueError("FX split hash mismatch")
        with np.load(p,allow_pickle=False) as a:
            triangles = a["triangle"]
            complete = (a["features"][...,-1]>.5).all(axis=(1,2))
            rng = np.random.default_rng([SEED,index])
            ids = []
            for name in sorted(set(triangles.tolist())):
                pool = np.flatnonzero(complete & (triangles==name))
                if len(pool)<64:
                    raise ValueError("requested complete sample unavailable")
                ids.extend(rng.choice(pool,64,replace=False))
            selected[split] = np.sort(ids)
    return selected


@torch.inference_mode()
def run(args):
    data = REPO/"data/margin-window-pilot-v2"
    prior = REPO/"runs/convergence-width-200-v1"
    if (sha(data/"manifest.json")!=DATA_HASH or sha(args.checkpoint/"model.safetensors")!=WEIGHTS or
        sha(args.checkpoint/"config.json")!=FM_CONFIG or sha(prior/"best.safetensors")!=PHASE):
        raise ValueError("frozen dataset or model identity mismatch")
    manifest = json.loads((data/"manifest.json").read_text())
    torch.set_num_threads(4)
    torch.set_float32_matmul_precision("highest")
    torch.use_deterministic_algorithms(True)
    ids = freeze(data,manifest)
    fm = TimesFm2_5ModelForPrediction.from_pretrained(args.checkpoint,local_files_only=True,trust_remote_code=False,
                                                    attn_implementation="eager",dtype=torch.float32).eval()
    cfg = json.loads((prior/"run.json").read_text())["config"]
    modules = source_modules()
    phase = Forecast(cfg,modules)
    parameterize(phase,cfg,modules,rescale_params=False)
    load_model(phase,str(prior/"best.safetensors"))
    phase.eval()
    receipt = dict(model="google/timesfm-2.5-200m-transformers",revision=REVISION,weights_sha256=WEIGHTS,
                   config_sha256=sha(args.checkpoint/"config.json"),phaseweave_sha256=PHASE,data_sha256=DATA_HASH,
                   seed=SEED,source_sha256=sha(Path(__file__)),torch=torch.__version__,
                   transformers=__import__("transformers").__version__,cpu_threads=4,history_seconds=16,
                   horizon_seconds=1,rows_per_triangle=64,complete_context_only=True,
                   timesfm_input="each directional margin separately, first point forecast, official mask padding to one 32-step patch",
                   splits={})
    for split,indices in ids.items():
        with np.load(data/(split+".npz"),allow_pickle=False) as a:
            x = a["features"][indices]
            p = a["persistence"][indices]
            tags = a["triangle"][indices]
            dates = a["anchor_utc_s"][indices]//86400
        rates = x[...,0]
        history = np.stack((rates[:,:,[0,2,5]].sum(-1),rates[:,:,[1,3,4]].sum(-1)),axis=1) - 3*manifest["fee_log_bps"]
        if not np.allclose(history[:,:,-1],p,atol=2e-5,rtol=0):
            raise ValueError("reconstructed route histories disagree with official persistence")
        pred = {"TimesFM 2.5":[], "PhaseWeave 2M":[], "Persistence":[]}
        for start in range(0,len(indices),16):
            span = slice(start,start+16)
            batch = torch.from_numpy(history[span].reshape(-1,16)).float()
            result = fm(past_values=list(batch.unbind(0)),forecast_context_len=32,truncate_negative=False)
            pred["TimesFM 2.5"].append(result.mean_predictions[:,0].reshape(-1,2).numpy())
            pred["PhaseWeave 2M"].append(phase(torch.from_numpy(x[span]),torch.from_numpy(p[span])).numpy())
            pred["Persistence"].append(p[span])
        pred={k:np.concatenate(v) for k,v in pred.items()}
        if not all(v.shape==p.shape and np.isfinite(v).all() for v in pred.values()):
            raise ValueError("non-finite forecast or shape mismatch")
        with np.load(data/(split+".npz"),allow_pickle=False) as a:
            target=a["margin"][indices]
        comparisons={}
        unique_days=np.unique(dates)
        day_rng=np.random.default_rng([SEED,911,SPLITS.index(split)])
        day_draws=day_rng.integers(len(unique_days),size=(2500,len(unique_days)))
        for reference in ("Persistence","PhaseWeave 2M"):
            delta=(np.abs(pred["TimesFM 2.5"]-target)-np.abs(pred[reference]-target)).mean(axis=1,dtype=np.float64)
            total=np.array([[delta[dates==d].sum(),(dates==d).sum()] for d in unique_days])
            boot=total[day_draws].sum(1)
            comparisons[reference]=dict(mean_delta=float(delta.mean()),day_bootstrap_95=
                                        np.quantile(boot[:,0]/boot[:,1],[.025,.975]).tolist())
        receipt["splits"][split]=dict(paired_timesfm_minus_reference=comparisons,rows=len(indices),triangles=len(set(tags.tolist())),days=len(set(dates.tolist())),
                        ids_sha256=hashlib.sha256(indices.astype("<i8").tobytes()).hexdigest(),
                        mae={k:float(np.abs(v-target).mean(dtype=np.float64)) for k,v in pred.items()},
                        prediction_sha256={k:hashlib.sha256(v.astype("<f4").tobytes()).hexdigest() for k,v in pred.items()})
        print(split,len(indices),receipt["splits"][split]["mae"],flush=True)
    with args.output.open("x") as fd:
        json.dump(receipt,fd,sort_keys=True,indent=2,allow_nan=False)
        fd.write("\n")


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--checkpoint",type=Path,required=True,help="Local Google snapshot at the pinned revision.")
    p.add_argument("--output",type=Path,required=True,help="New JSON file for aggregate scores.")
    run(p.parse_args())
