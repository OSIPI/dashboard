<script lang="ts">
	import type { Dataset } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import type { FitResult } from '$lib/analysis';
	import { download } from '$lib/workspace';

	let {
		result,
		dataset,
		x,
		y,
		slice
	}: {
		result: FitResult;
		dataset: Dataset;
		x: number;
		y: number;
		slice: number;
	} = $props();
	const index = $derived(voxelIndex(x, y, slice, dataset.dimensions));
	const status = $derived(result.maps.Status[index]);
</script>

<div class="space-y-5 p-5 text-sm">
	<p>
		{result.report.validVoxels}/{result.report.selectedVoxels} valid voxels · {result.report.scope} fit
	</p>
	<div>
		<h3 class="font-semibold">Selected voxel ({x}, {y}, {slice})</h3>
		<p class="mt-1 text-muted-foreground">
			Quality: {result.report.statusCodes[String(status)] ?? 'Unavailable'}
		</p>
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
