<script lang="ts">
	import FlaskIcon from '~icons/lucide/flask-conical';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import MethodsMenu from '$lib/components/viewer/MethodsMenu.svelte';
	import type { Dataset } from '$lib/ivim';
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	import type { FitResult } from '$lib/analysis';
	import { download } from '$lib/workspace';
	import { niftiBytes } from '$lib/nifti-export';
	let {
		client,
		dataset,
		result,
		selectedMethod,
		selectedStrategy,
		openPanel = $bindable(true),
		onopen,
		onselect
	}: {
		client: AnalysisClient;
		dataset: Dataset;
		result?: FitResult;
		selectedMethod?: string;
		selectedStrategy?: string;
		openPanel: boolean;
		onopen: () => void;
		onselect: (id: string, strategy: string) => void;
	} = $props();
	const running = $derived(
		client.runs.find((r) => ['pending', 'running', 'cancelling'].includes(r.state))
	);
	const ready = $derived(dataset.bValues.includes(0) && new Set(dataset.bValues).size >= 4);
</script>

<section class="card space-y-3 p-3 {openPanel ? '' : '[&>*:not(:first-child)]:hidden'}">
	<h2 id="ivim-analysis" tabindex="-1" class="scroll-mt-3">
		<button
			type="button"
			class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			aria-label="{openPanel ? 'Collapse' : 'Expand'} IVIM analysis panel"
			aria-expanded={openPanel}
			onclick={() => (openPanel = !openPanel)}
		>
			<FlaskIcon class="size-4 shrink-0" aria-hidden="true" />IVIM analysis
			<span
				class="ml-auto items-center gap-2 text-xs font-normal text-muted-foreground {openPanel
					? 'flex'
					: 'hidden'}"
			>
				{#if client.catalog}
					<span class="relative flex size-2 shrink-0" aria-hidden="true">
						<span
							class="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none"
						></span>
						<span class="relative inline-flex size-2 rounded-full bg-green-500"></span>
					</span>
				{/if}
				{client.stage === 'Connected · local REST API' ? 'Ready' : client.stage}
			</span>
			{#if openPanel}<ChevronDownIcon class="size-4" />{:else}<ChevronRightIcon
					class="size-4"
				/>{/if}
		</button>
	</h2>
	{#if !client.catalog}<p class="text-xs text-muted-foreground">
			Open Local analysis at the top right to connect before fitting.
		</p>{/if}
	<div class="space-y-2 border-t pt-3 text-xs">
		<h3 class="font-semibold">Signal model</h3>
		<MethodsMenu
			catalog={client.catalog}
			canFit={!!client.catalog && ready}
			selectedMethod={client.catalog ? selectedMethod : undefined}
			selectedStrategy={client.catalog ? selectedStrategy : undefined}
			{onselect}
		/>
	</div>
	{#if client.catalog}<div class="flex justify-end text-xs">
			<button class="button button-outline" onclick={onopen}>Open analysis</button>
		</div>{/if}
	{#if !ready}<p class="text-xs text-muted-foreground">
			Fitting needs b=0 and at least four distinct b-values.
		</p>{/if}
	{#if client.error}<p class="text-xs break-words text-destructive" role="alert">
			{client.error}
		</p>{/if}
	{#if running}<div class="space-y-2 text-xs" role="status">
			<progress class="w-full accent-selection" max="1" value={running.progress}></progress>
			<div class="flex justify-between gap-2">
				<span
					>{running.state === 'cancelling'
						? 'Cancelling'
						: `${Math.round(running.progress * 100)}%`} · {running.scope}</span
				><button
					class="underline"
					disabled={running.state === 'cancelling'}
					onclick={() => client.cancel(running)}
					>{running.state === 'cancelling' ? 'Stopping…' : 'Cancel run'}</button
				>
			</div>
		</div>{/if}
	{#if result}
		<div class="space-y-3 border-t pt-3 text-xs">
			<h3 class="font-semibold">Parameter maps</h3>
			<p class="text-muted-foreground">
				Overlay colors on the MRI image, not the voxel-signal graph.
			</p>
			<select
				class="input w-full text-xs"
				aria-label="Parameter map"
				value={client.map}
				onchange={(event) => client.chooseMap(result, event.currentTarget.value)}
				><option value="none">Reference image only</option
				>{#each result.report.maps as map (map.name)}<option value={map.name}
						>{map.name} · {map.unit}</option
					>{/each}</select
			>
			{#if client.map !== 'none'}
				{#if result.report.validVoxels === 0 && !client.showInvalid}<p
						class="text-muted-foreground"
					>
						No valid map values to display from this run.
					</p>{/if}
				<label class="block"
					>Map opacity<input
						class="mt-1 w-full accent-selection"
						aria-label="Map opacity"
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={client.opacity}
					/></label
				>
				<div class="grid grid-cols-2 gap-2">
					<label
						>Map minimum<input
							class="input mt-1 w-full px-1 py-1"
							type="number"
							step="any"
							bind:value={client.minimum}
						/></label
					>
					<label
						>Map maximum<input
							class="input mt-1 w-full px-1 py-1"
							type="number"
							step="any"
							bind:value={client.maximum}
						/></label
					>
				</div>
				<div
					class="h-2 rounded bg-[linear-gradient(to_right,#440154,#3b528b,#21918c,#5ec962,#fde725)]"
				></div>
				<label class="flex items-center gap-2"
					><input type="checkbox" bind:checked={client.showInvalid} />Show voxels without valid
					model parameter estimates</label
				>
				<button
					class="button button-outline"
					onclick={() =>
						download(
							new Blob([niftiBytes(dataset, [result.maps[client.map]], true)], {
								type: 'application/octet-stream'
							}),
							`map-${client.map === 'D*' ? 'Dstar' : client.map}.nii`
						)}>Export selected map NIfTI</button
				>
				{#if !(client.maximum > client.minimum)}<p class="text-destructive">
						Maximum must exceed minimum.
					</p>{/if}
			{/if}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-muted-foreground">
					Result · {client.catalog?.models.find((m) => m.id === result.report.model)?.label ??
						result.report.model}
				</p>
			</div>
		</div>
	{/if}
	<details class="text-xs">
		<summary class="cursor-pointer font-medium">Run history ({client.runs.length})</summary>
		<div class="mt-2 space-y-2">
			{#each [...client.runs].reverse() as job (job.id)}<div class="rounded border p-2">
					<p class="font-medium">{job.state} · {job.scope}</p>
					<p class="text-muted-foreground">{job.startedAt}</p>
					{#if job.summary}<p>
							{job.summary.validVoxels}/{job.summary.selectedVoxels} passed post-fit checks
							{#if job.summary.durationSeconds !== undefined}
								· {job.summary.durationSeconds.toFixed(1)} s{/if}
						</p>{/if}{#if job.error}<p class="text-destructive">
							{job.error}
						</p>{/if}{#if job.state === 'completed'}<button
							class="mt-1 underline"
							disabled={job.sourceHash !== dataset.sha256}
							onclick={() => client.loadResult(job, dataset)}>Inspect result</button
						>{/if}{#if ['completed', 'failed', 'cancelled'].includes(job.state)}<button
							class="mt-1 ml-3 underline"
							disabled={job.state === 'completed' &&
								!client.results.some((item) => item.id === job.id)}
							title="Free an API run slot. Already downloaded maps stay in your browser; API voxel detail for this run becomes unavailable."
							onclick={() => client.release(job)}>Free API slot</button
						>{/if}
				</div>{/each}
		</div>
	</details>
</section>
