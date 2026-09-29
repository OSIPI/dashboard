import { SvelteDate, SvelteMap } from 'svelte/reactivity';
import {
	localApiUrl,
	datasetForm,
	fitJobState,
	fitRequest,
	parseNiftiMap,
	type Catalog,
	type FitConfig,
	type FitJob,
	type FitReport,
	type FitResult,
	type VoxelFit
} from './analysis';
import type { Dataset, VoxelVolume } from './ivim';

class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

type ApiFitConfig = {
	model: string;
	method: string;
	b_threshold: number;
	scope: 'voxel' | 'roi' | 'dataset';
	voxels: number[][];
};
type ApiJob = {
	job_id: string;
	dataset_id: string;
	status: string;
	progress: number;
	config?: ApiFitConfig;
	summary?: Record<string, unknown>;
	provenance?: Record<string, unknown>;
	error?: string;
};

export class AnalysisClient {
	onresult?: (result: FitResult) => void;
	url = $state('http://127.0.0.1:60016');
	token = $state('');
	catalog = $state<Catalog>();
	runs = $state<FitJob[]>([]);
	results = $state.raw<FitResult[]>([]);
	selected = $state('');
	busy = $state(false);
	error = $state('');
	stage = $state('Disconnected');
	map = $state('none');
	opacity = $state(0.65);
	minimum = $state(0);
	maximum = $state(1);
	showInvalid = $state(false);
	private endpoint = '';
	private datasets = new SvelteMap<string, string>();
	private controller = new AbortController();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private generation = 0;
	private async request(path: string, init: RequestInit = {}) {
		const response = await fetch(this.endpoint + path, {
			...init,
			redirect: 'error',
			signal: this.controller.signal,
			headers: {
				...(!__LOCAL_API_PROXY__ ? { Authorization: `Bearer ${this.token.trim()}` } : {}),
				...init.headers
			}
		});
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new ApiError(body.detail || body.error || `HTTP ${response.status}`, response.status);
		}
		return response;
	}
	async connect() {
		this.generation++;
		this.error = '';
		this.busy = true;
		try {
			this.endpoint = __LOCAL_API_PROXY__ ? '/local-api' : localApiUrl(this.url);
			if (!__LOCAL_API_PROXY__ && !this.token.trim())
				throw new Error('Paste the required local API session token.');
			this.controller.abort();
			this.controller = new AbortController();
			clearTimeout(this.timer);
			await this.request('/health');
			this.catalog = this.normalizeCatalog(await (await this.request('/models')).json());
			this.datasets.clear();
			this.results = [];
			this.runs = [];
			this.map = 'none';
			this.stage = 'Connected · local REST API';
		} catch (e) {
			this.catalog = undefined;
			this.error =
				e instanceof TypeError
					? 'Cannot reach the local OSIPY REST API. Check Docker is running and allow local network access for this site.'
					: e instanceof Error
						? e.message
						: 'Connection failed';
			this.stage = 'Disconnected';
		} finally {
			this.busy = false;
		}
	}
	private normalizeCatalog(value: unknown): Catalog {
		if (!value || typeof value !== 'object')
			throw new Error('API returned an invalid model catalog.');
		const raw = value as Record<string, unknown>;
		if (
			!Array.isArray(raw.models) ||
			!raw.models.length ||
			!raw.defaults ||
			typeof raw.defaults !== 'object'
		)
			throw new Error('API returned an empty or invalid model catalog.');
		const models = raw.models.map((entry) => {
			if (!entry || typeof entry !== 'object')
				throw new Error('API returned an invalid model catalog.');
			const item = entry as Record<string, unknown>;
			if (!item.id || !Array.isArray(item.parameters) || !Array.isArray(item.fitter_strategies))
				throw new Error('API returned an invalid model catalog.');
			return {
				id: String(item.id),
				label: String(item.label ?? item.id),
				parameters: item.parameters.map((parameter) => {
					const p = parameter as Record<string, unknown>;
					const bounds = Array.isArray(p.bounds) ? p.bounds : [null, null];
					return {
						name: String(p.name),
						unit: String(p.unit ?? ''),
						bounds: [
							bounds[0] == null ? null : Number(bounds[0]),
							bounds[1] == null ? null : Number(bounds[1])
						] as [number | null, number | null]
					};
				}),
				fitterStrategies: item.fitter_strategies.map(String),
				reference: String(item.reference ?? '')
			};
		});
		const defaults = raw.defaults as Record<string, unknown>;
		const statusCodes = raw.status_codes;
		if (!statusCodes || typeof statusCodes !== 'object')
			throw new Error('API catalog omitted status codes.');
		return {
			osipyVersion: String(raw.osipy_version),
			library: [
				{ technique: 'IVIM', groups: [{ label: 'Models', methods: models.map((m) => m.id) }] }
			],
			models,
			defaults: {
				model: String(defaults.model),
				method: String(defaults.method),
				bThreshold: Number(defaults.b_threshold)
			},
			statusCodes: Object.fromEntries(
				Object.entries(statusCodes).map(([key, label]) => [key, String(label).replaceAll('_', ' ')])
			)
		};
	}
	async start(
		dataset: Dataset,
		volumes: VoxelVolume[],
		config: FitConfig,
		scope: 'voxel' | 'roi' | 'dataset',
		indices: number[]
	) {
		if (this.busy) return;
		this.generation++;
		clearTimeout(this.timer);
		this.error = '';
		this.busy = true;
		try {
			let datasetId = this.datasets.get(dataset.sha256);
			const upload = async () => {
				this.stage = 'Sending dataset to the local REST API…';
				const response = await this.request('/datasets', {
					method: 'POST',
					body: datasetForm(dataset, volumes)
				});
				const id = String((await response.json()).dataset_id ?? '');
				if (!id) throw new Error('API did not return a dataset ID.');
				this.datasets.set(dataset.sha256, id);
				return id;
			};
			if (!datasetId) datasetId = await upload();
			const submit = (id: string) =>
				this.request(`/datasets/${id}/fits`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(fitRequest(config, scope, indices, dataset.dimensions))
				});
			let response: Response;
			try {
				response = await submit(datasetId);
			} catch (error) {
				if (!(error instanceof ApiError) || error.status !== 404) throw error;
				this.datasets.delete(dataset.sha256);
				response = await submit(await upload());
			}
			const body = await response.json();
			const job: FitJob = {
				id: String(body.job_id),
				datasetId,
				sourceHash: dataset.sha256,
				state: 'pending',
				progress: 0,
				scope,
				config,
				startedAt: new SvelteDate().toISOString()
			};
			this.runs = [...this.runs, job];
			this.selected = job.id;
			this.stage = 'Fitting locally';
			this.poll(job, dataset);
		} catch (e) {
			this.error =
				e instanceof ApiError && e.status === 429 && e.message.includes('job limit')
					? 'The local API is holding its maximum number of runs. Free an API slot in Run history, then try again.'
					: e instanceof Error
						? e.message
						: 'Analysis failed';
			this.stage = 'Ready';
		} finally {
			this.busy = false;
		}
	}
	private poll = async (job: FitJob, dataset?: Dataset) => {
		const generation = this.generation;
		try {
			const api = (await (await this.request(`/fits/${job.id}`)).json()) as ApiJob;
			if (generation !== this.generation) return;
			const updated = this.fromApiJob(api, job);
			this.runs = this.runs.map((item) => (item.id === job.id ? updated : item));
			if (updated.state === 'completed' && dataset && !this.results.some((r) => r.id === job.id))
				await this.loadResult(updated, dataset);
			else if (['pending', 'running', 'cancelling'].includes(updated.state))
				this.timer = setTimeout(() => this.poll(updated, dataset), 500);
			else this.stage = 'Ready';
		} catch (e) {
			if (generation === this.generation && !this.controller.signal.aborted) {
				this.error = e instanceof Error ? e.message : 'Lost connection';
				this.stage = 'Disconnected — reconnect to run another fit';
			}
		}
	};
	private fromApiJob(api: ApiJob, previous: FitJob): FitJob {
		const summary = api.summary;
		return {
			...previous,
			state: fitJobState(api.status),
			progress: Number(api.progress),
			error: api.error,
			finishedAt: ['succeeded', 'completed', 'cancelled', 'canceled', 'failed'].includes(api.status)
				? new SvelteDate().toISOString()
				: undefined,
			summary: summary
				? {
						validVoxels: Number(summary.n_voxels_valid),
						selectedVoxels: Number(summary.n_voxels_selected)
					}
				: undefined,
			apiSummary: summary,
			provenance: api.provenance
		};
	}
	private parameterDescriptor(
		name: string,
		unit: string
	): readonly [string, string, string] | undefined {
		const key = name.toLowerCase().replaceAll('₀', '0').replaceAll('*', '_star');
		return (
			{
				d: ['d', 'D', unit],
				d_star: ['d_star', 'D*', unit],
				f: ['f', 'f', unit],
				s0: ['s0', 'S0', unit]
			} as const
		)[key as 'd' | 'd_star' | 'f' | 's0'];
	}
	async loadResult(job: FitJob, dataset?: Dataset) {
		this.selected = job.id;
		this.error = '';
		if (!dataset) {
			this.error = 'The source dataset must be open to load REST API maps.';
			return;
		}
		try {
			if (!this.results.some((r) => r.id === job.id)) {
				const model = this.catalog?.models.find((item) => item.id === job.config.model);
				if (!model) throw new Error('The fitted model is absent from the connected API catalog.');
				const parameters = model.parameters.flatMap((parameter) => {
					const descriptor = this.parameterDescriptor(parameter.name, parameter.unit);
					return descriptor ? [descriptor] : [];
				});
				if (!parameters.length || parameters.length !== model.parameters.length)
					throw new Error('The model catalog contains an unsupported parameter map.');
				const required = [
					...parameters,
					['valid', 'Valid', 'mask'],
					['status', 'Status', 'code']
				] as const;
				const entries = await Promise.all(
					required.map(async ([path, name]) => {
						const response = await this.request(`/fits/${job.id}/maps/${path}`);
						return [name, parseNiftiMap(await response.arrayBuffer(), dataset)] as const;
					})
				);
				try {
					const response = await this.request(`/fits/${job.id}/maps/r_squared`);
					entries.push(['R2', parseNiftiMap(await response.arrayBuffer(), dataset)]);
				} catch (error) {
					if (!(error instanceof ApiError) || error.status !== 404) throw error;
				}
				const maps = Object.fromEntries(entries) as Record<string, Float32Array>;
				const descriptors = [
					...parameters,
					['valid', 'Valid', 'mask'] as const,
					['status', 'Status', 'code'] as const,
					...(maps.R2 ? [['r_squared', 'R2', ''] as const] : [])
				];
				if (!job.apiSummary || !job.provenance)
					throw new Error('Completed fit response omitted summary or provenance.');
				const summary = job.apiSummary;
				const provenance = job.provenance;
				const report: FitReport = {
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
					model: job.config.model,
					fitter: String(provenance.fitter),
					osipyVersion: String(provenance.osipy_version),
					config: job.config,
					scope: job.scope,
					selectedVoxels: Number(summary.n_voxels_selected),
					validVoxels: Number(summary.n_voxels_valid),
					statusCodes: this.catalog?.statusCodes ?? {},
					statusCounts: (summary.status_counts as Record<string, number>) ?? {},
					durationSeconds: null,
					completedAt: String(provenance.created_at),
					maps: descriptors.map(([, name, unit]) => ({ name, unit, ...this.range(maps[name]) })),
					errors: [],
					samplePolicy: 'All uploaded acquisitions',
					qualityPolicy: String(provenance.quality_policy),
					provenance
				};
				const result = { id: job.id, report, maps };
				this.results = [...this.results.slice(-9), result];
				this.onresult?.(result);
			}
			this.map = 'none';
			this.stage = 'Ready';
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Result unavailable';
		}
	}
	private range(values: Float32Array) {
		let min = Infinity,
			max = -Infinity;
		for (const value of values)
			if (Number.isFinite(value)) {
				min = Math.min(min, value);
				max = Math.max(max, value);
			}
		if (!Number.isFinite(min)) return { min: 0, max: 1 };
		if (max <= min) max = min + Math.max(Math.abs(min) * 0.01, 1e-12);
		return { min, max };
	}
	async voxel(job: FitJob, x: number, y: number, z: number): Promise<VoxelFit> {
		return (await (
			await this.request(`/fits/${job.id}/voxel?x=${x}&y=${y}&z=${z}`)
		).json()) as VoxelFit;
	}
	async cancel(job: FitJob) {
		try {
			const api = (await (
				await this.request(`/fits/${job.id}`, { method: 'DELETE' })
			).json()) as ApiJob;
			this.runs = this.runs.map((item) => (item.id === job.id ? this.fromApiJob(api, item) : item));
			if (api.status === 'cancelling') this.stage = 'Cancelling locally';
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Cancellation failed';
		}
	}
	async release(job: FitJob) {
		if (!['completed', 'failed', 'cancelled'].includes(job.state)) return;
		try {
			await this.request(`/fits/${job.id}/retained`, { method: 'DELETE' });
			this.runs = this.runs.filter((item) => item.id !== job.id);
			this.error = '';
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not free the API run slot';
		}
	}
	chooseMap(result: FitResult, name: string) {
		this.map = name;
		const map = result.report.maps.find((item) => item.name === name);
		if (map) {
			this.minimum = map.min;
			this.maximum = map.max;
		}
	}
	dispose() {
		this.generation++;
		this.controller.abort();
		clearTimeout(this.timer);
	}
}
