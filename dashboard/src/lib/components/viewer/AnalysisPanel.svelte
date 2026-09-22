<script lang="ts">
	import FlaskIcon from '~icons/lucide/flask-conical';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { download } from '$lib/workspace';
	import { niftiBytes } from '$lib/nifti-export';
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	import type { FitConfig, FitResult } from '$lib/analysis';
	import { persistedPreference } from '$lib/persisted-preference.svelte';
	let {
		client,
		dataset,
		volumes,
		x,
		y,
		slice,
		result,
		openPanel = $bindable(true),
		roiIndices = []
	}: {
		client: AnalysisClient;
		dataset: Dataset;
		volumes: VoxelVolume[];
		x: number;
		y: number;
		slice: number;
		result?: FitResult;
		openPanel: boolean;
		roiIndices?: number[];
	} = $props();
	let config = $state<FitConfig>();
	$effect(() => {
		if (client.catalog && !config) config = JSON.parse(JSON.stringify(client.catalog.defaults));
	});
	let scope = $state<'voxel' | 'roi' | 'dataset'>('voxel');
	const open = persistedPreference('osipy.analysis.settings-open', true, (raw) => raw === 'true');
	const running = $derived(client.runs.find((r) => r.state === 'running'));
	const ready = $derived(dataset.bValues.includes(0) && new Set(dataset.bValues).size >= 4);
	const index = $derived(voxelIndex(x, y, slice, dataset.dimensions));
	const status = $derived(result?.maps.Status[index]);
	async function connect() {
		await client.connect();
		if (client.catalog) config = JSON.parse(JSON.stringify(client.catalog.defaults));
	}
	function run() {
		if (config)
			client.start(
				dataset,
				volumes,
				JSON.parse(JSON.stringify(config)),
				scope,
				scope === 'voxel' ? [index] : roiIndices
			);
	}
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
			<span class="ml-auto text-xs font-normal text-muted-foreground {openPanel ? '' : 'hidden'}"
				>{client.stage}</span
			>
			{#if openPanel}<ChevronDownIcon class="size-4" />{:else}<ChevronRightIcon
					class="size-4"
				/>{/if}
		</button>
	</h2>
	<details bind:open={open.current}>
		<summary class="cursor-pointer text-xs font-medium">Local companion & fitting settings</summary>
		<div class="mt-3 space-y-3 text-xs">
			<p class="text-muted-foreground">
				Start the Python companion locally, then enter its session token. Data goes only to the
				loopback endpoint; credentials are not saved.
			</p>
			<label class="block"
				>Companion URL<input class="input mt-1 w-full px-2 py-1.5" bind:value={client.url} /></label
			>
			<label class="block"
				>Session token<input
					class="input mt-1 w-full px-2 py-1.5"
					type="password"
					autocomplete="off"
					bind:value={client.token}
				/></label
			>
			<button class="button button-outline" disabled={client.busy} onclick={connect}
				>Connect companion</button
			>
			{#if client.catalog && config}
				<fieldset class="space-y-2" disabled={client.busy || !!running}>
					<label class="block"
						>Fitting method<select class="input mt-1 w-full text-xs" bind:value={config.model}
							>{#each client.catalog.models as model (model.id)}<option value={model.id}
									>{model.label}</option
								>{/each}</select
						></label
					>
					<p class="text-muted-foreground">
						OSIPY {client.catalog.osipyVersion} · {client.catalog.models[0].initialization}
					</p>
					<div class="grid grid-cols-2 gap-2">
						<label
							>Iterations<input
								class="input mt-1 w-full px-2 py-1"
								type="number"
								min="2"
								max="2000"
								step="1"
								bind:value={config.iterations}
							/></label
						>
						<label
							>Tolerance<input
								class="input mt-1 w-full px-2 py-1"
								type="number"
								min="0.000000000001"
								max="0.1"
								step="any"
								bind:value={config.tolerance}
							/></label
						>
						<label
							>Initial-guess b threshold<input
								class="input mt-1 w-full px-2 py-1"
								type="number"
								min="0"
								step="any"
								bind:value={config.threshold}
							/></label
						>
						<label
							>Minimum baseline (a.u.)<input
								class="input mt-1 w-full px-2 py-1"
								type="number"
								min="0"
								step="any"
								bind:value={config.minimumBaseline}
							/></label
						>
						<label
							>Minimum R²<input
								class="input mt-1 w-full px-2 py-1"
								type="number"
								min="-100"
								max="1"
								step="any"
								bind:value={config.minimumR2}
							/></label
						>
						<label
							>Maximum RMSE (optional)<input
								class="input mt-1 w-full px-2 py-1"
								type="number"
								min="0"
								step="any"
								value={config.maximumRmse ?? ''}
								onchange={(e) =>
									(config!.maximumRmse =
										e.currentTarget.value === '' ? null : e.currentTarget.valueAsNumber)}
							/></label
						>
					</div>
					<details>
						<summary class="cursor-pointer font-medium">Bounds and initialization</summary>
						<p class="my-2 text-muted-foreground">
							Blank initial values use data-dependent estimates. Blank bounds use OSIPY defaults; S₀
							has no default upper bound.
						</p>
						{#each client.catalog.models[0].parameters as parameter (parameter.name)}
							<fieldset class="mb-2 rounded border p-2">
								<legend>{parameter.name} · {parameter.unit}</legend>
								<div class="grid grid-cols-3 gap-1">
									{#each [0, 1] as edge (edge)}<label
											>{edge === 0 ? 'Lower' : 'Upper'}<input
												class="input mt-1 w-full px-1 py-1"
												type="number"
												step="any"
												placeholder={parameter.bounds[edge] === null
													? 'Unbounded'
													: String(parameter.bounds[edge])}
												value={config.bounds[parameter.name]?.[edge] ?? ''}
												onchange={(e) => {
													const bounds = config!.bounds[parameter.name] ?? [null, null];
													bounds[edge] =
														e.currentTarget.value === '' ? null : e.currentTarget.valueAsNumber;
													config!.bounds[parameter.name] = bounds;
												}}
											/></label
										>{/each}
									<label
										>Initial<input
											class="input mt-1 w-full px-1 py-1"
											type="number"
											step="any"
											placeholder="Auto"
											value={config.initial[parameter.name] ?? ''}
											onchange={(e) =>
												(config!.initial[parameter.name] =
													e.currentTarget.value === '' ? null : e.currentTarget.valueAsNumber)}
										/></label
									>
								</div>
							</fieldset>
						{/each}
					</details>
				</fieldset>
			{/if}
		</div>
	</details>
	{#if client.catalog && config}<div class="flex flex-wrap gap-2">
			<label class="min-w-0 flex-1 text-xs"
				>Fit scope<select class="input mt-1 w-full text-xs" bind:value={scope}
					><option value="voxel">Selected voxel</option><option
						value="roi"
						disabled={!roiIndices.length}>ROI · voxelwise ({roiIndices.length})</option
					><option value="dataset">Whole dataset</option></select
				></label
			><button
				class="button button-primary self-end"
				disabled={client.busy || !!running || !ready || (scope === 'roi' && !roiIndices.length)}
				onclick={run}>Run fitting</button
			>
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
				<span>{Math.round(running.progress * 100)}% · {running.scope}</span><button
					class="underline"
					onclick={() => client.cancel(running)}>Cancel run</button
				>
			</div>
		</div>{/if}
	{#if result}
		<div class="space-y-2 border-t pt-3 text-xs">
			<h3 class="font-semibold">Parameter maps</h3>
			<select
				class="input w-full text-xs"
				aria-label="Parameter map"
				value={client.map}
				onchange={(e) => client.chooseMap(result!, e.currentTarget.value)}
				><option value="none">Reference image only</option
				>{#each result.report.maps as map (map.name)}<option value={map.name}
						>{map.name} · {map.unit}</option
					>{/each}</select
			>
			{#if client.map !== 'none'}
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
					><label
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
					><input type="checkbox" bind:checked={client.showInvalid} />Show finite estimates rejected
					by quality checks</label
				>
				<button
					class="button button-outline"
					onclick={() =>
						download(
							new Blob([niftiBytes(dataset, [result!.maps[client.map]], true)], {
								type: 'application/octet-stream'
							}),
							`map-${client.map === 'D*' ? 'Dstar' : client.map}.nii`
						)}>Export selected map NIfTI</button
				>
				{#if !(client.maximum > client.minimum)}<p class="text-destructive">
						Maximum must exceed minimum.
					</p>{/if}
			{/if}
			<p>
				<strong>Voxel quality:</strong>
				{result.report.statusCodes[String(status)] ?? 'Unavailable'}
			</p>
			<dl class="grid grid-cols-2 gap-1">
				{#each result.report.maps.filter((m) => !['Status', 'Valid'].includes(m.name)) as map (map.name)}<div
					>
						<dt class="text-muted-foreground">{map.name} ({map.unit})</dt>
						<dd>
							{Number.isFinite(result.maps[map.name][index])
								? result.maps[map.name][index].toPrecision(5)
								: 'Not available'}
						</dd>
					</div>{/each}
			</dl>
			<button
				class="button button-outline"
				onclick={() =>
					download(
						new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' }),
						'analysis-report.json'
					)}>Export report JSON</button
			>
		</div>
	{/if}
	<details class="text-xs">
		<summary class="cursor-pointer font-medium">Run history ({client.runs.length})</summary>
		<div class="mt-2 space-y-2">
			{#each [...client.runs].reverse() as job (job.id)}<div class="rounded border p-2">
					<p class="font-medium">{job.state} · {job.scope}</p>
					<p class="text-muted-foreground">{job.startedAt}</p>
					{#if job.summary}<p>
							{job.summary.validVoxels}/{job.summary.selectedVoxels} valid · {job.summary.durationSeconds.toFixed(
								1
							)} s
						</p>{/if}{#if job.error}<p class="text-destructive">
							{job.error}
						</p>{/if}{#if job.state === 'completed'}<button
							class="mt-1 underline"
							disabled={job.sourceHash !== dataset.sha256}
							onclick={() => client.loadResult(job)}>Inspect result</button
						>{/if}
				</div>{/each}
		</div>
	</details>
</section>
