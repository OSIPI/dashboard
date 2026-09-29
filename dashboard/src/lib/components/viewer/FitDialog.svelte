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
		strategy,
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
		strategy: string;
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
	let configuredSelection = '';
	let scope = $state<'voxel' | 'roi' | 'dataset'>('voxel');
	let awaitingResultId = $state('');
	const runningJob = $derived(
		client.runs.find((job) => ['pending', 'running', 'cancelling'].includes(job.state))
	);
	const ready = $derived(dataset.bValues.includes(0) && new Set(dataset.bValues).size >= 4);
	const model = $derived(client.catalog?.models.find((item) => item.id === method));
	$effect(() => {
		const selection = `${method}:${strategy}`;
		if (client.catalog && model && configuredSelection !== selection) {
			configuredSelection = selection;
			config = { ...$state.snapshot(client.catalog.defaults), model: method, method: strategy };
		}
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
		const job = client.runs.find(
			(item) =>
				item.id === client.selected && ['pending', 'running', 'cancelling'].includes(item.state)
		);
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
					OSIPY {client.catalog.osipyVersion} · {model.reference}
				</p>
				{#if runningJob}<div class="space-y-2 text-sm" role="status">
						<progress class="w-full accent-selection" max="1" value={runningJob.progress}
						></progress>
						<div class="flex justify-between gap-2">
							<span
								>{runningJob.state === 'cancelling' ? 'Cancelling' : 'Fitting'} · {Math.round(
									runningJob.progress * 100
								)}%</span
							><button
								type="button"
								class="underline"
								disabled={runningJob.state === 'cancelling'}
								onclick={() => client.cancel(runningJob)}
								>{runningJob.state === 'cancelling' ? 'Stopping…' : 'Cancel run'}</button
							>
						</div>
					</div>{/if}
				{#if client.error}<p class="text-sm text-destructive" role="alert">{client.error}</p>{/if}
				<fieldset class="grid gap-4 sm:grid-cols-2" disabled={client.busy || !!runningJob}>
					<legend class="mb-3 font-semibold">Fitting settings</legend>
					<label class="block text-sm"
						>Fitter strategy<select class="input mt-1 w-full" bind:value={config.method}>
							{#each model.fitterStrategies as strategy (strategy)}<option value={strategy}
									>{strategy.replace(/^./, (letter) => letter.toUpperCase())}</option
								>{/each}
						</select></label
					>
					{#if config.method !== 'full'}<label class="block text-sm"
							>b-value threshold (s/mm²)<input
								class="input mt-1 w-full"
								type="number"
								min="0"
								max={Math.max(...dataset.bValues)}
								step="any"
								bind:value={config.bThreshold}
							/></label
						>{/if}
					<p class="text-xs text-muted-foreground sm:col-span-2">
						Optimizer settings use the installed OSIPY defaults; the report records their effective
						values.
					</p>
				</fieldset>
				<fieldset class="border-t pt-4" disabled={client.busy || !!runningJob}>
					<legend class="text-sm font-medium">Fit scope</legend>
					<div class="mt-3 grid gap-2 sm:grid-cols-3">
						{#each [{ value: 'voxel', title: 'Selected voxel', detail: 'Current image position' }, { value: 'roi', title: 'ROI · voxelwise', detail: `${roiIndices.length} selected voxels` }, { value: 'dataset', title: 'Whole dataset', detail: 'Entire 3D scan' }] as option (option.value)}
							<label
								class="flex min-h-24 cursor-pointer flex-col justify-between gap-3 rounded-xl border-2 p-3 text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring {scope ===
								option.value
									? 'border-selection bg-selection/10'
									: 'border-border hover:border-selection/60'} {option.value === 'roi' &&
								!roiIndices.length
									? 'cursor-not-allowed opacity-50'
									: ''}"
							>
								<input
									class="sr-only"
									type="radio"
									name="fit-scope"
									value={option.value}
									bind:group={scope}
									disabled={option.value === 'roi' && !roiIndices.length}
								/>
								<span class="flex items-center gap-2 font-medium">
									<span
										class="flex size-4 shrink-0 items-center justify-center rounded-full border-2 {scope ===
										option.value
											? 'border-selection'
											: 'border-muted-foreground'}"
										aria-hidden="true"
										>{#if scope === option.value}<span class="size-2 rounded-full bg-selection"
											></span>{/if}</span
									>
									{option.title}
								</span>
								<span class="text-xs text-muted-foreground">{option.detail}</span>
							</label>
						{/each}
					</div>
					{#if !ready}<p class="mt-2 text-sm text-destructive">
							Fitting needs b=0 and at least four distinct b-values.
						</p>{/if}
				</fieldset>
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
			<AnalysisResults {client} {result} {dataset} {x} {y} {slice} />
		{/if}
	</div>
</dialog>
