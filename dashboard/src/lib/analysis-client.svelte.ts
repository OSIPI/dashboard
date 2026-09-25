import { SvelteMap } from 'svelte/reactivity';
import {
	companionUrl,
	datasetEnvelope,
	parseFitResult,
	type Catalog,
	type FitConfig,
	type FitJob,
	type FitResult
} from './analysis';
import type { Dataset, VoxelVolume } from './ivim';

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
	private credential = '';
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
				...(!__LOCAL_COMPANION_PROXY__ ? { Authorization: `Bearer ${this.credential}` } : {}),
				...init.headers
			}
		});
		if (!response.ok) {
			const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
			throw new Error(body.error || `HTTP ${response.status}`);
		}
		return response;
	}
	async connect() {
		this.generation++;
		this.error = '';
		this.busy = true;
		try {
			this.endpoint = __LOCAL_COMPANION_PROXY__ ? '/local-companion' : companionUrl(this.url);
			this.credential = __LOCAL_COMPANION_PROXY__ ? '' : this.token.trim();
			if (!__LOCAL_COMPANION_PROXY__ && !this.credential)
				throw new Error('Paste the companion session token.');
			this.controller.abort();
			this.controller = new AbortController();
			clearTimeout(this.timer);
			this.catalog = await (await this.request('/models')).json();
			if (!this.catalog?.models?.length) throw new Error('Companion returned no supported models.');
			this.datasets.clear();
			this.results = [];
			this.map = 'none';
			this.runs = await (await this.request('/runs')).json();
			this.stage = 'Connected · local CPU';
			if (this.runs.some((r) => r.state === 'running')) this.poll();
		} catch (e) {
			this.catalog = undefined;
			this.error =
				e instanceof TypeError && !__LOCAL_COMPANION_PROXY__
					? 'Cannot reach the local companion. Check Docker is running and allow local network access for this site in your browser.'
					: e instanceof Error
						? e.message
						: 'Connection failed';
			this.stage = 'Disconnected';
		} finally {
			this.busy = false;
		}
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
				this.stage = 'Sending dataset to your loopback companion…';
				const response = await this.request('/datasets', {
					method: 'POST',
					body: datasetEnvelope(dataset, volumes)
				});
				const id = (await response.json()).id as string;
				this.datasets.set(dataset.sha256, id);
				return id;
			};
			if (!datasetId) datasetId = await upload();
			const submit = (id: string) =>
				this.request('/runs', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ datasetId: id, config, scope, indices })
				});
			let response: Response;
			try {
				response = await submit(datasetId);
			} catch (error) {
				if (!(error instanceof Error) || error.message !== 'Unknown dataset') throw error;
				this.datasets.delete(dataset.sha256);
				response = await submit(await upload());
			}
			const job = (await response.json()) as FitJob;
			this.runs = [...this.runs, job];
			this.selected = job.id;
			this.stage = 'Fitting locally';
			this.poll();
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Analysis failed';
			this.stage = 'Ready';
		} finally {
			this.busy = false;
		}
	}
	private poll = async () => {
		const generation = this.generation;
		try {
			const runs = await (await this.request('/runs')).json();
			if (generation !== this.generation) return;
			if (!Array.isArray(runs)) throw new Error('Invalid companion run list.');
			this.runs = runs;
			const selected = this.runs.find((r) => r.id === this.selected);
			if (selected?.state === 'completed' && !this.results.some((r) => r.id === selected.id))
				await this.loadResult(selected);
			if (generation !== this.generation) return;
			if (this.runs.some((r) => r.state === 'running')) this.timer = setTimeout(this.poll, 500);
			else this.stage = 'Ready';
		} catch (e) {
			if (generation === this.generation && !this.controller.signal.aborted) {
				this.error = e instanceof Error ? e.message : 'Lost connection';
				this.stage = 'Disconnected — reconnect to inspect the run';
			}
		}
	};
	async loadResult(job: FitJob) {
		const generation = this.generation;
		this.selected = job.id;
		this.error = '';
		try {
			if (!this.results.some((r) => r.id === job.id)) {
				const response = await this.request(`/runs/${job.id}/result`);
				const result = parseFitResult(job.id, await response.arrayBuffer(), job.sourceHash);
				if (generation !== this.generation) return;
				this.results = [...this.results.slice(-9), result];
				this.onresult?.(result);
			}
			if (this.selected === job.id) this.map = 'none';
		} catch (e) {
			if (generation === this.generation)
				this.error = e instanceof Error ? e.message : 'Result unavailable';
		}
	}
	async cancel(job: FitJob) {
		try {
			await this.request(`/runs/${job.id}`, { method: 'DELETE' });
			this.generation++;
			clearTimeout(this.timer);
			await this.poll();
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Cancellation failed';
		}
	}
	chooseMap(result: FitResult, name: string) {
		this.map = name;
		const map = result.report.maps.find((m) => m.name === name);
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
