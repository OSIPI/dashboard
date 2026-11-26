<script lang="ts">
	import type { Dataset } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import type { FitResult } from '$lib/analysis';
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	import { download } from '$lib/workspace';

	let {
		client,
		result,
		dataset,
		x,
		y,
		slice
	}: {
		client: AnalysisClient;
		result: FitResult;
		dataset: Dataset;
		x: number;
		y: number;
		slice: number;
	} = $props();
	const index = $derived(voxelIndex(x, y, slice, dataset.dimensions));
	const status = $derived(result.maps.Status[index]);
	let voxel = $state.raw<Awaited<ReturnType<AnalysisClient['voxel']>>>();
	let voxelError = $state('');
	$effect(() => {
		const job = client.runs.find((item) => item.id === result.id);
		let current = true;
		voxel = undefined;
		voxelError = job
			? ''
			: 'Saved maps are available; per-voxel run detail is not retained in this session.';
		if (!job) return;
		void client.voxel(job, x, y, slice).then(
			(value) => {
				if (current) voxel = value;
			},
			(error) => {
				if (current)
					voxelError = error instanceof Error ? error.message : 'Voxel detail unavailable';
			}
		);
		return () => {
			current = false;
		};
	});
</script>

<div class="space-y-5 p-5 text-sm">
	<p>
		{result.report.validVoxels}/{result.report.selectedVoxels} voxels passed post-fit checks · {result
			.report.scope} fit
	</p>
	<p class="text-muted-foreground">OSIPY does not expose per-voxel convergence for this fit.</p>
	<p class="text-muted-foreground">
		{result.report.provenance?.engine === 'browser'
			? 'Browser Python · Pyodide ' + result.report.provenance.pyodide_version
			: 'Local Python REST API'} · OSIPY {result.report.osipyVersion}. RMSE and adjusted R² are not
		provided by this fitter.
	</p>
	{#if result.report.durationSeconds !== null}<p class="text-muted-foreground">
			Elapsed {result.report.durationSeconds.toFixed(2)} s, including runtime loading when needed.
		</p>{/if}
	{#if result.report.errors.length}<ul class="list-inside list-disc text-destructive">
			{#each result.report.errors as error (error)}<li>{error}</li>{/each}
		</ul>{/if}
	<div>
		<h3 class="font-semibold">Selected voxel ({x}, {y}, {slice})</h3>
		<p class="mt-1 text-muted-foreground">
			Quality: {result.report.statusCodes[String(status)]?.replaceAll('_', ' ') ?? 'Unavailable'}
		</p>
		{#if voxel?.available}<p class="mt-1 text-muted-foreground">
				Voxel detail · R² {voxel.r_squared === null
					? 'not available'
					: voxel.r_squared.toPrecision(5)} · {voxel.fitted_curve?.length ?? 0} fitted samples
			</p>{:else if voxel}<p class="mt-1 text-muted-foreground">
				Voxel fit unavailable: {voxel.reason?.replaceAll('_', ' ') ?? 'unknown reason'}.
			</p>{:else if voxelError}<p class="mt-1 text-muted-foreground">
				Voxel detail unavailable: {voxelError}
			</p>{/if}
		<dl class="mt-3 grid gap-3 sm:grid-cols-2">
			{#each result.report.maps.filter((m) => !['Status', 'Valid'].includes(m.name)) as map (map.name)}
				<div class="rounded-md border p-3">
					<dt class="text-muted-foreground">{map.name} ({map.unit})</dt>
					<dd class="mt-1 font-medium">
						{Number.isFinite(result.maps[map.name][index])
							? result.maps[map.name][index].toPrecision(5)
							: 'Not available'}
					</dd>
				</div>
			{/each}
		</dl>
	</div>
	<button
		class="button button-outline"
		onclick={() =>
			download(
				new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' }),
				'analysis-report.json'
			)}>Export report JSON</button
	>
</div>
