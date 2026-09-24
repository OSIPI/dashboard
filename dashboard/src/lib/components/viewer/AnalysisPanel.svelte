<script lang="ts">
	import FlaskIcon from '~icons/lucide/flask-conical';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import type { Dataset } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { download } from '$lib/workspace';
	import { niftiBytes } from '$lib/nifti-export';
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	import type { FitResult } from '$lib/analysis';
	import { persistedPreference } from '$lib/persisted-preference.svelte';
	let {
		client,
		dataset,
		x,
		y,
		slice,
		result,
		openPanel = $bindable(true),
		onconfigure
	}: {
		client: AnalysisClient;
		dataset: Dataset;
		x: number;
		y: number;
		slice: number;
		result?: FitResult;
		openPanel: boolean;
		onconfigure: () => void;
	} = $props();
	const open = persistedPreference('osipy.analysis.settings-open', false, (raw) => raw === 'true');
	const running = $derived(client.runs.find((r) => r.state === 'running'));
	const ready = $derived(dataset.bValues.includes(0) && new Set(dataset.bValues).size >= 4);
	const index = $derived(voxelIndex(x, y, slice, dataset.dimensions));
	const status = $derived(result?.maps.Status[index]);
	async function connect() {
		await client.connect();
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
		<summary class="cursor-pointer text-xs font-medium">Local companion</summary>
		<div class="mt-3 space-y-3 text-xs">
			{#if import.meta.env.DEV && !__LOCAL_COMPANION_PROXY__}
				<p class="text-muted-foreground">
					This dashboard was started without its local companion. Stop the server using port 60010,
					then run make dev from the dashboard repository. It connects automatically—no token
					needed.
				</p>
			{:else if __LOCAL_COMPANION_PROXY__}
				<p class="text-muted-foreground">
					The local companion connects automatically when you run make dev. Imaging data stays on
					this computer.
				</p>
				{#if !client.catalog}<button
						class="button button-outline"
						disabled={client.busy}
						onclick={connect}>{client.busy ? 'Connecting…' : 'Retry connection'}</button
					>{/if}
			{:else}
				<p class="text-muted-foreground">
					Start the Python companion locally, then enter its session token. Data goes only to the
					loopback endpoint; credentials are not saved.
				</p>
				<label class="block"
					>Companion URL<input
						class="input mt-1 w-full px-2 py-1.5"
						bind:value={client.url}
					/></label
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
			{/if}
		</div>
	</details>
	{#if client.catalog}<div class="flex items-center justify-between gap-2 text-xs">
			<p class="min-w-0 text-muted-foreground">{client.catalog.models[0].label}</p>
			<button class="button button-outline shrink-0" onclick={onconfigure}>Configure fit</button>
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
