import { AnalysisClient } from './analysis-client.svelte';
import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Catalog, FitConfig, FitJob, FitResult, VoxelFit } from './analysis';
import type { Dataset, VoxelVolume } from './ivim';
import { voxelIndex } from './ivim';
import {
	diagnostic,
	diagnosticChoice,
	diagnosticDataset,
	diagnosticError,
	diagnosticOperation
} from './diagnostics';
import {
	IVIM_MODELS,
	IVIM_METHODS,
	OSIPY_VERSION,
	PYODIDE_VERSION,
	validateBrowserIvimRequest,
	validateBrowserIvimResult,
	type BrowserIvimRequest,
	type BrowserIvimResult,
	type BrowserIvimWorkerResponse
} from './browser-ivim';

const statusCodes = {
	'0': 'not selected',
	'1': 'post fit quality passed · convergence unavailable',
	'2': 'unavailable or failed quality checks'
};
const browserCatalog: Catalog = {
	osipyVersion: OSIPY_VERSION,
	library: [{ technique: 'IVIM', groups: [{ label: 'Models', methods: [...IVIM_MODELS] }] }],
	models: IVIM_MODELS.map((id) => ({
		id,
		label: id === 'biexponential' ? 'Biexponential IVIM' : 'Simplified IVIM',
		parameters: (id === 'biexponential' ? ['D', 'D*', 'f', 'S0'] : ['D', 'f', 'S0']).map(
			(name) => ({
				name,
				unit: name.startsWith('D') ? 'mm²/s' : name === 'S0' ? 'a.u.' : '',
				bounds: [null, null] as [null, null]
			})
		),
		fitterStrategies: [...IVIM_METHODS],
		reference: 'Published OSIPY · Pyodide browser worker'
	})),
	defaults: { model: 'biexponential', method: 'segmented', bThreshold: 200 },
	statusCodes
};

export class BrowserAnalysisClient extends AnalysisClient {
	override readonly engine = 'browser' as const;
	override readonly maxVoxels = 4096;
	private worker?: Worker;
	private sequence = 0;
	private epoch = 0;
	private rejectPending?: (reason: Error) => void;
	private details = new SvelteMap<string, SvelteMap<number, VoxelFit>>();
	private trace?: ReturnType<typeof diagnosticOperation>;
	private loggedReady = false;

	override async connect() {
		this.catalog = browserCatalog;
		this.stage = 'Ready · browser fitting';
		this.error = '';
	}

	private fit(request: BrowserIvimRequest): Promise<BrowserIvimResult> {
		if (!this.worker)
			// Vite requires this literal URL constructor to bundle the worker.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			this.worker = new Worker(new URL('./browser-ivim.worker.ts', import.meta.url), {
				type: 'module'
			});
		const worker = this.worker,
			jobId = ++this.sequence;
		return new Promise<BrowserIvimResult>((resolve, reject) => {
			this.rejectPending = reject;
			worker.onerror = () =>
				reject(
					new Error('The browser Python worker failed. Cancel and retry, or use local Python.')
				);
			worker.onmessage = (event: MessageEvent<BrowserIvimWorkerResponse>) => {
				if (event.data.jobId !== jobId) return;
				if (event.data.phase === 'ready') {
					this.stage = 'Fitting in browser';
					if (!this.loggedReady) {
						this.loggedReady = true;
						this.trace?.stage('ready');
					}
				} else if (event.data.phase === 'error') reject(new Error(event.data.error));
				else {
					try {
						resolve(validateBrowserIvimResult(event.data.result, request.signal.length));
					} catch (error) {
						reject(error);
					}
				}
			};
			worker.postMessage({ jobId, request });
		}).finally(() => {
			if (this.sequence === jobId) this.rejectPending = undefined;
		});
	}

	override async start(
		dataset: Dataset,
		volumes: VoxelVolume[],
		config: FitConfig,
		scope: 'voxel' | 'roi' | 'dataset',
		indices: number[]
	) {
		if (this.busy) return;
		this.loggedReady = false;
		const trace = diagnosticOperation('browser-fit', {
			model: diagnosticChoice(config.model),
			method: diagnosticChoice(config.method),
			dataset: diagnosticDataset(dataset),
			engine: 'browser',
			scope: scope === 'voxel' ? 'voxel-scope' : scope,
			bytes: dataset.byteLength,
			volumes: volumes.length
		});
		this.trace = trace;
		this.error = '';
		const count = dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1);
		let selected: number[];
		try {
			if (scope === 'dataset' && count > this.maxVoxels)
				throw new Error(
					`Browser fitting is limited to ${this.maxVoxels.toLocaleString()} voxels per run. Select a smaller ROI or switch to Local Python for this dataset.`
				);
			selected =
				scope === 'dataset'
					? Array.from({ length: count }, (_, i) => i)
					: [...new SvelteSet(indices)];
			if (
				!selected.length ||
				selected.length > this.maxVoxels ||
				selected.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= count)
			)
				throw new Error(
					`Select between 1 and ${this.maxVoxels.toLocaleString()} in-bounds voxels for browser fitting.`
				);
			if (selected.length * dataset.bValues.length > 1_048_576)
				throw new Error(
					'This browser run exceeds one million signal samples. Choose a smaller ROI or use Local Python.'
				);
			// Native-grid maps feed the existing overlays and exports. Bound their allocation.
			const retainedBytes = this.results.reduce(
				(sum, r) => sum + Object.values(r.maps).reduce((bytes, map) => bytes + map.byteLength, 0),
				0
			);
			if (retainedBytes + count * 7 * 4 > 256 * 1024 * 1024)
				throw new Error(
					'Browser parameter maps would exceed 256 MiB. Remove old browser runs, or use Local Python for this scan.'
				);
			if (volumes.length !== dataset.bValues.length || volumes.some((v) => v.length !== count))
				throw new Error('Scan samples do not match the dataset geometry.');
			validateBrowserIvimRequest(
				{
					...config,
					model: config.model as BrowserIvimRequest['model'],
					method: config.method as BrowserIvimRequest['method'],
					bValues: dataset.bValues,
					signal: dataset.bValues.map(() => 1)
				},
				4096
			);
		} catch (error) {
			trace.end('rejected', { category: 'validation' });
			this.error = error instanceof Error ? error.message : 'Invalid browser fit';
			return;
		}

		const epoch = ++this.epoch;
		const job: FitJob = {
			id: `browser-${crypto.randomUUID()}`,
			datasetId: dataset.sha256,
			sourceHash: dataset.sha256,
			state: 'running',
			progress: 0,
			scope,
			config: { ...config, bThreshold: config.method === 'full' ? 0 : config.bThreshold },
			startedAt: new SvelteDate().toISOString()
		};
		this.runs = [...this.runs, job];
		this.selected = job.id;
		this.busy = true;
		this.stage = this.worker ? 'Fitting in browser' : 'Downloading browser Python and OSIPY…';
		trace.stage(this.worker ? 'ready' : 'read', { selectedVoxels: selected.length });
		const started = performance.now();
		const descriptors = browserCatalog.models.find((m) => m.id === config.model)!.parameters;
		const maps: Record<string, Float32Array> = {};
		const details = new SvelteMap<number, VoxelFit>();
		const errors: string[] = [];
		let valid = 0,
			computeMs = 0,
			pythonVersion = '';
		try {
			for (const name of [...descriptors.map((p) => p.name), 'R2', 'Valid', 'Status'])
				maps[name] = new Float32Array(count).fill(['Valid', 'Status'].includes(name) ? 0 : NaN);
			for (let n = 0; n < selected.length; n++) {
				if (epoch !== this.epoch) return;
				const index = selected[n];
				const signal = volumes.map((v) => v[index] * dataset.slope + dataset.intercept);
				const voxel = [
					index % dataset.dimensions[0],
					Math.floor(index / dataset.dimensions[0]) % dataset.dimensions[1],
					Math.floor(index / (dataset.dimensions[0] * dataset.dimensions[1]))
				];
				maps.Status[index] = 2;
				const unavailable: VoxelFit = {
					voxel,
					b_values: dataset.bValues,
					signal,
					available: false,
					reason: 'invalid_estimate',
					params: null,
					fitted_curve: null,
					r_squared: null
				};
				// Do not drop, clamp or fabricate invalid input samples, including background zeros.
				if (signal.some((v) => !Number.isFinite(v) || v <= 0 || v > 1e9)) {
					details.set(index, unavailable);
					if (errors.length < 10)
						errors.push(
							`Voxel (${voxel.join(', ')}): signals must be finite, positive and at most 1e9; no samples were changed.`
						);
				} else {
					const fitted = await this.fit({
						...job.config,
						model: config.model as BrowserIvimRequest['model'],
						method: config.method as BrowserIvimRequest['method'],
						bValues: dataset.bValues,
						signal
					});
					if (epoch !== this.epoch) return;
					pythonVersion = fitted.pythonVersion;
					computeMs += fitted.computeMs;
					const passed = fitted.passesRestQualityPolicy;
					const params: Record<string, number> = {
						D: fitted.params.d,
						f: fitted.params.f,
						S0: fitted.params.s0,
						bThreshold: fitted.effectiveBThreshold
					};
					if (fitted.params.dStar !== undefined) params['D*'] = fitted.params.dStar;
					if (passed) {
						valid++;
						for (const p of descriptors) maps[p.name][index] = params[p.name];
						maps.Valid[index] = 1;
						maps.Status[index] = 1;
					}
					maps.R2[index] = fitted.rSquared ?? NaN;
					details.set(
						index,
						passed
							? {
									...unavailable,
									available: true,
									reason: null,
									params,
									fitted_curve: fitted.fittedCurve,
									r_squared: fitted.rSquared
								}
							: unavailable
					);
				}
				this.runs = this.runs.map((r) =>
					r.id === job.id ? { ...r, progress: (n + 1) / selected.length } : r
				);
				if (Math.floor(((n + 1) * 10) / selected.length) !== Math.floor((n * 10) / selected.length))
					diagnostic('analysis.state', {
						operation: trace.id,
						engine: 'browser',
						state: 'running',
						progress: (n + 1) / selected.length
					});
			}
			const completedAt = new SvelteDate().toISOString();
			const durationSeconds = (performance.now() - started) / 1000;
			const result: FitResult = {
				id: job.id,
				maps,
				report: {
					schema: 1,
					dataset: {
						dimensions: dataset.dimensions,
						affine: dataset.affine,
						bValues: dataset.bValues,
						sha256: dataset.sha256,
						slope: dataset.slope,
						intercept: dataset.intercept,
						name: dataset.name
					},
					model: config.model,
					fitter: config.method,
					osipyVersion: OSIPY_VERSION,
					config: job.config,
					scope,
					selectedVoxels: selected.length,
					validVoxels: valid,
					statusCodes,
					statusCounts: { '0': count - selected.length, '1': valid, '2': selected.length - valid },
					durationSeconds,
					completedAt,
					maps: [
						...descriptors,
						{ name: 'R2', unit: '' },
						{ name: 'Valid', unit: 'mask' },
						{ name: 'Status', unit: 'code' }
					].map((p) => ({ name: p.name, unit: p.unit, ...this.range(maps[p.name]) })),
					errors,
					samplePolicy:
						'All acquired samples in original order, including repetitions; original scalar scaling; no averaging',
					qualityPolicy:
						'Fit attempted, finite physical parameters and R² > 0.5. Per-voxel convergence unavailable. Nonpositive or invalid input signals are marked unavailable, never changed.',
					provenance: {
						engine: 'browser',
						pyodide_version: PYODIDE_VERSION,
						python_version: pythonVersion || null,
						osipy_version: OSIPY_VERSION,
						fitter: config.method,
						effective_b_threshold: job.config.bThreshold,
						model_cutoff: config.model === 'simplified' ? job.config.bThreshold : null,
						compute_ms: computeMs,
						source_sha256: dataset.sha256,
						created_at: completedAt
					}
				}
			};
			this.details.set(job.id, details);
			this.results = [...this.results, result];
			this.runs = this.runs.map((r) =>
				r.id === job.id
					? {
							...r,
							state: 'completed',
							progress: 1,
							finishedAt: completedAt,
							summary: { validVoxels: valid, selectedVoxels: selected.length, durationSeconds }
						}
					: r
			);
			this.map = 'none';
			this.onresult?.(result);
			this.stage = 'Ready · browser fitting';
			trace.end('success', { selectedVoxels: selected.length, validVoxels: valid });
		} catch (error) {
			if (epoch !== this.epoch) return;
			trace.end('failed', { category: diagnosticError(error) });
			this.stopWorker();
			this.error = error instanceof Error ? error.message : 'Browser fitting failed';
			this.runs = this.runs.map((r) =>
				r.id === job.id ? { ...r, state: 'failed', error: this.error } : r
			);
			this.stage = 'Ready · browser fitting';
		} finally {
			if (epoch === this.epoch) this.busy = false;
		}
	}

	override async voxel(job: FitJob, x: number, y: number, z: number): Promise<VoxelFit> {
		const result = this.results.find((r) => r.id === job.id);
		if (!result) throw new Error('Browser result is no longer available.');
		return (
			this.details.get(job.id)?.get(voxelIndex(x, y, z, result.report.dataset.dimensions)) ?? {
				voxel: [x, y, z],
				b_values: result.report.dataset.bValues,
				signal: [],
				available: false,
				reason: 'not_selected',
				params: null,
				fitted_curve: null,
				r_squared: null
			}
		);
	}
	override async loadResult(job: FitJob) {
		this.selected = job.id;
		this.map = 'none';
	}
	override async release(job: FitJob) {
		if (!['completed', 'failed', 'cancelled'].includes(job.state)) return;
		this.runs = this.runs.filter((r) => r.id !== job.id);
		this.results = this.results.filter((r) => r.id !== job.id);
		this.details.delete(job.id);
	}
	private stopWorker() {
		this.worker?.terminate();
		this.worker = undefined;
		this.rejectPending?.(new Error('Browser fit cancelled.'));
		this.rejectPending = undefined;
	}
	override async cancel(job: FitJob) {
		if (!['running', 'pending', 'cancelling'].includes(job.state)) return;
		this.epoch++;
		this.trace?.end('cancelled');
		this.stopWorker();
		this.runs = this.runs.map((r) =>
			r.id === job.id ? { ...r, state: 'cancelled', finishedAt: new SvelteDate().toISOString() } : r
		);
		this.busy = false;
		this.stage = 'Cancelled · browser runtime cleared';
	}
	override dispose() {
		this.trace?.end('cancelled');
		this.epoch++;
		this.stopWorker();
		super.dispose();
	}
}
