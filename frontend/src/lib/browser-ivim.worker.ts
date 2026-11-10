import type { BrowserIvimRequest, BrowserIvimWorkerResponse } from './browser-ivim';
import type { BrowserIvimResult } from './browser-ivim';
import { OSIPY_VERSION, PYODIDE_VERSION } from './browser-ivim';

type Pyodide = {
	loadPackage: (packages: string | string[]) => Promise<void>;
	runPythonAsync: (code: string) => Promise<unknown>;
	globals: { set: (name: string, value: unknown) => void; delete: (name: string) => void };
};

const scope = self as unknown as {
	onmessage: ((event: MessageEvent<{ jobId: number; request: BrowserIvimRequest }>) => void) | null;
	postMessage: (message: BrowserIvimWorkerResponse) => void;
};
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const OSIPY_WHEEL =
	'https://files.pythonhosted.org/packages/14/f7/580e8c8337f1164b0b48e8cdcfaf7405ec8db7bc14d76484a1dbc7c51e53/osipy-0.1.4-py3-none-any.whl';

let runtime: Promise<Pyodide> | undefined;

async function loadRuntime(): Promise<Pyodide> {
	if (!runtime) {
		runtime = (async () => {
			const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`)) as {
				loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
			};
			const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
			await pyodide.loadPackage(['numpy', 'micropip']);
			pyodide.globals.set('osipy_wheel_url', OSIPY_WHEEL);
			await pyodide.runPythonAsync(`
import micropip
await micropip.install(osipy_wheel_url, deps=False)
del osipy_wheel_url
`);
			return pyodide;
		})();
	}
	return runtime;
}

scope.onmessage = async (event: MessageEvent<{ jobId: number; request: BrowserIvimRequest }>) => {
	const { jobId, request } = event.data;
	try {
		const pyodide = await loadRuntime();
		scope.postMessage({ jobId, phase: 'ready' } satisfies BrowserIvimWorkerResponse);
		pyodide.globals.set('request_json', JSON.stringify(request));
		const resultJson = await pyodide.runPythonAsync(`
import json
import sys
import time
import numpy as np
import osipy
from osipy.common.backend import GPUConfig, set_backend
from osipy.ivim import fit_ivim
from osipy.ivim.fitting.estimators import FittingMethod, IVIMFitParams
from osipy.ivim.models.biexponential import IVIMBiexponentialModel, IVIMParams, IVIMSimplifiedModel

request = json.loads(request_json)
set_backend(GPUConfig(force_cpu=True, n_workers=1))
b = np.asarray(request["bValues"], dtype=float)
signal = np.asarray(request["signal"], dtype=float).reshape(1, 1, 1, -1)
method = request["method"]
model = request["model"]
effective_threshold = 0.0 if method == "full" else float(request["bThreshold"])
params = IVIMFitParams(
    method=FittingMethod(method),
    b_threshold=effective_threshold,
    signal_model=model,
)
started = time.perf_counter()
fit = fit_ivim(
    signal=signal,
    b_values=b,
    mask=np.ones((1, 1, 1), dtype=bool),
    params=params,
)
compute_ms = (time.perf_counter() - started) * 1000.0
d = float(fit.d_map.values[0, 0, 0])
f = float(fit.f_map.values[0, 0, 0])
s0 = float(fit.s0_map.values[0, 0, 0])
r_squared = None if fit.r_squared is None else float(fit.r_squared[0, 0, 0])
fit_attempted = bool(fit.quality_mask[0, 0, 0])
result_params = {"d": d, "f": f, "s0": s0}
if model == "biexponential":
    d_star = float(fit.d_star_map.values[0, 0, 0])
    result_params["dStar"] = d_star
    curve = IVIMBiexponentialModel().predict(
        b, IVIMParams(s0=s0, d=d, d_star=d_star, f=f)
    )
    physical = d_star > d
    model_cutoff = None
else:
    model_cutoff = effective_threshold
    curve = IVIMSimplifiedModel(b_threshold=model_cutoff).predict(
        b, np.asarray([s0, d, f], dtype=float)
    )
    physical = True
physical = physical and d > 0 and s0 > 0 and 0 <= f <= 1
finite_output = bool(
    all(np.isfinite(value) for value in result_params.values())
    and np.all(np.isfinite(curve))
)
passes_policy = bool(
    fit_attempted
    and physical
    and finite_output
    and r_squared is not None
    and np.isfinite(r_squared)
    and r_squared > 0.5
)
json.dumps({
    "osipyVersion": osipy.__version__,
    "pyodideVersion": "${PYODIDE_VERSION}",
    "pythonVersion": sys.version.split()[0],
    "model": model,
    "method": method,
    "effectiveBThreshold": effective_threshold,
    "modelCutoff": model_cutoff,
    "params": result_params,
    "rSquared": r_squared,
    "fitAttempted": fit_attempted,
    "passesRestQualityPolicy": passes_policy,
    "fittedCurve": np.asarray(curve, dtype=float).tolist(),
    "computeMs": compute_ms,
})
`);
		pyodide.globals.delete('request_json');
		const result = JSON.parse(String(resultJson)) as BrowserIvimResult;
		if (result.osipyVersion !== OSIPY_VERSION)
			throw new Error(`Loaded unexpected OSIPY version ${String(result.osipyVersion)}.`);
		scope.postMessage({ jobId, phase: 'result', result } satisfies BrowserIvimWorkerResponse);
	} catch (error) {
		scope.postMessage({
			jobId,
			phase: 'error',
			error: error instanceof Error ? error.message : 'The browser fit failed.'
		} satisfies BrowserIvimWorkerResponse);
	}
};
