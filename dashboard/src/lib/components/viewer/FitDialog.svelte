<script lang="ts">
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	import type { FitConfig, FitResult } from '$lib/analysis';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import AnalysisResults from './AnalysisResults.svelte';
	import XIcon from '~icons/lucide/x';

	let {
		client,
		dataset,
		volumes,
		x,
		y,
		slice,
		roiIndices = [],
		method,
		result,
		open = $bindable(false),
		activeTab = $bindable<'configure' | 'results'>('configure'),
		onrun
	}: {
		client: AnalysisClient;
		dataset: Dataset;
		volumes: VoxelVolume[];
		x: number;
		y: number;
		slice: number;
		roiIndices?: number[];
		method: string;
		result?: FitResult;
		open: boolean;
		activeTab: 'configure' | 'results';
		onrun: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let configureTab: HTMLButtonElement;
	let resultsTab: HTMLButtonElement;
	const titleId = $props.id();
	let config = $state<FitConfig>();
	let scope = $state<'voxel' | 'roi' | 'dataset'>('voxel');
	let awaitingResultId = $state('');
	const runningJob = $derived(client.runs.find((job) => job.state === 'running'));
	const ready = $derived(dataset.bValues.includes(0) && new Set(dataset.bValues).size >= 4);
	const model = $derived(client.catalog?.models.find((item) => item.id === method));
	$effect(() => {
		if (client.catalog && model && (!config || config.model !== method))
			config = { ...$state.snapshot(client.catalog.defaults), model: method };
	});
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
	$effect(() => {
		if (awaitingResultId && result?.id === awaitingResultId) {
			activeTab = 'results';
			awaitingResultId = '';
		}
	});
	$effect(() => {
		if (!result && activeTab === 'results') activeTab = 'configure';
	});
	function onTabKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		activeTab =
			event.key === 'Home' || !result
				? 'configure'
				: event.key === 'End'
					? 'results'
					: activeTab === 'configure'
						? 'results'
						: 'configure';
		(activeTab === 'results' ? resultsTab : configureTab).focus();
	}
	function close() {
		dialog.close();
		open = false;
	}
	async function run(event: SubmitEvent) {
		event.preventDefault();
		if (
			!config ||
			!model ||
			!ready ||
			client.busy ||
			runningJob ||
			(scope === 'roi' && !roiIndices.length)
		)
			return;
		await client.start(
			dataset,
			volumes,
			$state.snapshot(config),
			scope,
			scope === 'voxel' ? [voxelIndex(x, y, slice, dataset.dimensions)] : roiIndices
		);
		const job = client.runs.find((item) => item.id === client.selected && item.state === 'running');
		if (job) awaitingResultId = job.id;
		onrun();
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	class="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-1rem))] max-w-none overflow-y-auto rounded-xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/70"
	onclose={() => (open = false)}
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
>
	<div class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card px-5 py-4">
		<div>
			<h2 id={titleId} class="text-lg font-semibold">IVIM analysis</h2>
			<p class="mt-1 text-sm text-muted-foreground">{model?.label ?? 'OSIPY fitting method'}</p>
		</div>
		<button
			class="button button-ghost button-icon shrink-0"
			type="button"
			aria-label="Close IVIM analysis"
			onclick={close}><XIcon class="size-4" /></button
		>
	</div>
	<div class="flex gap-1 border-b px-5" role="tablist" aria-label="IVIM analysis sections">
		<button
			bind:this={configureTab}
			type="button"
			role="tab"
			id="fit-configure-tab"
			aria-controls="fit-configure-panel"
			aria-selected={activeTab === 'configure'}
			tabindex={activeTab === 'configure' ? 0 : -1}
			onkeydown={onTabKeydown}
			class="border-b-2 px-4 py-3 text-sm {activeTab === 'configure'
				? 'border-selection text-foreground'
				: 'border-transparent text-muted-foreground'}"
			onclick={() => (activeTab = 'configure')}>Configure</button
		>
		<button
			bind:this={resultsTab}
			type="button"
			role="tab"
			id="fit-results-tab"
			aria-controls="fit-results-panel"
			aria-selected={activeTab === 'results'}
			tabindex={activeTab === 'results' ? 0 : -1}
			onkeydown={onTabKeydown}
			disabled={!result}
			class="border-b-2 px-4 py-3 text-sm {activeTab === 'results'
				? 'border-selection text-foreground'
				: 'border-transparent text-muted-foreground'} disabled:opacity-50"
			onclick={() => (activeTab = 'results')}>Results</button
		>
	</div>
	<div
		id="fit-configure-panel"
		role="tabpanel"
		aria-labelledby="fit-configure-tab"
		class={activeTab === 'configure' ? '' : 'hidden'}
	>
		{#if model && config && client.catalog}
			<form class="space-y-5 p-5" onsubmit={run}>
				<p class="text-sm text-muted-foreground">
					OSIPY {client.catalog.osipyVersion} · {model.initialization}
				</p>
				{#if runningJob}<div class="space-y-2 text-sm" role="status">
						<progress class="w-full accent-selection" max="1" value={runningJob.progress}
						></progress>
						<div class="flex justify-between gap-2">
							<span>Fitting · {Math.round(runningJob.progress * 100)}%</span><button
								type="button"
								class="underline"
								onclick={() => client.cancel(runningJob)}>Cancel run</button
							>
						</div>
					</div>{/if}
				{#if client.error}<p class="text-sm text-destructive" role="alert">{client.error}</p>{/if}
				<fieldset class="grid gap-4 sm:grid-cols-2" disabled={client.busy || !!runningJob}>
					<legend class="mb-3 font-semibold">Fitting settings</legend>
					<label class="block text-sm"
						>Iterations<input
							class="input mt-1 w-full"
							type="number"
							min="2"
							max="2000"
							step="1"
							bind:value={config.iterations}
						/></label
					>
					<label class="block text-sm"
						>Tolerance<input
							class="input mt-1 w-full"
							type="number"
							min="0.000000000001"
							max="0.1"
							step="any"
							bind:value={config.tolerance}
						/></label
					>
					<label class="block text-sm"
						>Initial-guess b threshold<input
							class="input mt-1 w-full"
							type="number"
							min="0"
							step="any"
							bind:value={config.threshold}
						/></label
					>
					<label class="block text-sm"
						>Minimum baseline (a.u.)<input
							class="input mt-1 w-full"
							type="number"
							min="0"
							step="any"
							bind:value={config.minimumBaseline}
						/></label
					>
					<label class="block text-sm"
						>Minimum R²<input
							class="input mt-1 w-full"
							type="number"
							min="-100"
							max="1"
							step="any"
							bind:value={config.minimumR2}
						/></label
					>
					<label class="block text-sm"
						>Maximum RMSE (optional)<input
							class="input mt-1 w-full"
							type="number"
							min="0"
							step="any"
							value={config.maximumRmse ?? ''}
							onchange={(event) =>
								(config!.maximumRmse =
									event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber)}
						/></label
					>
				</fieldset>
				<details class="rounded-md border p-3 text-sm">
					<summary class="cursor-pointer font-medium">Bounds and initialization</summary>
					<p class="my-3 text-muted-foreground">
						Blank initial values use data-dependent estimates. Blank bounds use OSIPY defaults; S₀
						has no default upper bound.
					</p>
					{#each model.parameters as parameter (parameter.name)}
						<fieldset class="mb-3 rounded-md border p-3" disabled={client.busy || !!runningJob}>
							<legend class="px-1 font-medium">{parameter.name} · {parameter.unit}</legend>
							<div class="grid grid-cols-3 gap-2">
								{#each [0, 1] as edge (edge)}
									<label class="min-w-0"
										>{edge === 0 ? 'Lower' : 'Upper'}<input
											class="input mt-1 w-full"
											type="number"
											step="any"
											placeholder={parameter.bounds[edge] === null
												? 'Unbounded'
												: String(parameter.bounds[edge])}
											value={config.bounds[parameter.name]?.[edge] ?? ''}
											onchange={(event) => {
												const bounds = config!.bounds[parameter.name] ?? [null, null];
												bounds[edge] =
													event.currentTarget.value === ''
														? null
														: event.currentTarget.valueAsNumber;
												config!.bounds[parameter.name] = bounds;
											}}
										/></label
									>
								{/each}
								<label class="min-w-0"
									>Initial<input
										class="input mt-1 w-full"
										type="number"
										step="any"
										placeholder="Auto"
										value={config.initial[parameter.name] ?? ''}
										onchange={(event) =>
											(config!.initial[parameter.name] =
												event.currentTarget.value === ''
													? null
													: event.currentTarget.valueAsNumber)}
									/></label
								>
							</div>
						</fieldset>
					{/each}
				</details>
				<div class="border-t pt-4">
					<label class="block text-sm font-medium"
						>Fit scope<select class="input mt-1 w-full" bind:value={scope}
							><option value="voxel">Selected voxel</option><option
								value="roi"
								disabled={!roiIndices.length}>ROI · voxelwise ({roiIndices.length})</option
							><option value="dataset">Whole dataset</option></select
						></label
					>
					{#if !ready}<p class="mt-2 text-sm text-destructive">
							Fitting needs b=0 and at least four distinct b-values.
						</p>{/if}
				</div>
				<div class="flex flex-wrap justify-end gap-2 border-t pt-4">
					<button class="button button-outline" type="button" onclick={close}>Cancel</button>
					<button
						class="button button-primary"
						type="submit"
						disabled={client.busy ||
							!!runningJob ||
							!ready ||
							(scope === 'roi' && !roiIndices.length)}>Run fitting</button
					>
				</div>
			</form>
		{/if}
	</div>
	<div
		id="fit-results-panel"
		role="tabpanel"
		aria-labelledby="fit-results-tab"
		class={activeTab === 'results' ? '' : 'hidden'}
	>
		{#if result}
			<p class="px-5 pt-4 text-sm text-muted-foreground">
				{client.catalog?.models.find((item) => item.id === result.report.model)?.label ??
					result.report.model} · {result.report.fitter}
			</p>
			<AnalysisResults {result} {dataset} {x} {y} {slice} />
		{/if}
	</div>
</dialog>
