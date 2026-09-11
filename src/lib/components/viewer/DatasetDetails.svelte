<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Dataset } from '$lib/ivim';
	let {
		dataset,
		active,
		open = $bindable(false)
	}: { dataset: Dataset; active: number; open: boolean } = $props();
</script>

<details class="card p-4 text-xs leading-6 text-muted-foreground" bind:open>
	<summary class="cursor-pointer text-sm font-semibold text-foreground"
		>Dataset & acquisition metadata</summary
	>
	<p class="mt-3 font-medium text-foreground">{dataset.name}</p>
	<p>
		<strong>Public in-vivo brain. Not for diagnosis.</strong> Viewing only; no fitting or uploads. Saved
		coordinates and notes stay in this browser.
	</p>
	<p>{dataset.dimensions.slice(0, 3).join(' × ')} voxels · {dataset.bValues.length} volumes</p>
	<p>{dataset.spacing.map((s) => s.toFixed(6)).join(' × ')} {dataset.spatialUnit}</p>
	<p>
		{new Set(dataset.bValues).size} distinct b-values: {[...new Set(dataset.bValues)].join(', ')} s/mm²
	</p>
	<p>Selected volume {active + 1} b-vector: {dataset.bVectors[active].join(', ')}</p>
	<p>
		Native oblique plane · axes {dataset.axisCodes.join(' / ')}. Original NIfTI indices
		(zero-based); displayed slice and volume numbers start at 1.
	</p>
	<p>
		Previews: slice {Math.floor(dataset.dimensions[2] / 2) + 1}, default window. Repeated b-values
		are separate acquired volumes.
	</p>
	<a class="underline" href="https://doi.org/10.5281/zenodo.14605039"
		>OSIPI TF2.4 · Zenodo 14605039 · CC BY 4.0</a
	><a class="ml-3 underline" href={resolve('/about')}>About OSIPY</a>
</details>
