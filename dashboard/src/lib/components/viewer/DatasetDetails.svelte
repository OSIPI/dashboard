<script lang="ts">
	import DatabaseIcon from '~icons/lucide/database';
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
		><DatabaseIcon class="mr-1 inline-block size-4 align-middle" aria-hidden="true" />Dataset &
		acquisition metadata</summary
	>
	<p class="mt-3 font-medium text-foreground">{dataset.name}</p>
	<p>
		<strong
			>{dataset.source === 'local' ? 'Locally imported acquisition.' : 'Public in-vivo brain.'} Not for
			diagnosis.</strong
		> Local viewing and optional OSIPY fitting. No remote image uploads. Saved coordinates and notes
		stay in this browser.
	</p>
	<p>{dataset.dimensions.slice(0, 3).join(' × ')} voxels · {dataset.bValues.length} volumes</p>
	<p>{dataset.spacing.map((s) => s.toFixed(6)).join(' × ')} {dataset.spatialUnit}</p>
	<p>
		{new Set(dataset.bValues).size} distinct b-values: {[...new Set(dataset.bValues)].join(', ')} s/mm²
	</p>
	<p>
		Selected volume {active + 1} b-vector: {dataset.bVectors[active]?.join(', ') ?? 'Not supplied'}
	</p>
	<p>
		Native plane (may be oblique) · axes {dataset.axisCodes.join(' / ')}. Original NIfTI indices
		(zero-based); displayed slice and volume numbers start at 1.
	</p>
	<p>
		Previews: slice {Math.floor(dataset.dimensions[2] / 2) + 1}, default window. Repeated b-values
		are separate acquired volumes.
	</p>
	{#if dataset.source !== 'local'}<a
			class="underline"
			href="https://doi.org/10.5281/zenodo.14605039">OSIPI TF2.4 · Zenodo 14605039 · CC BY 4.0</a
		>{/if}<a class="ml-3 underline" href={resolve('/about')}>About OSIPY</a>
</details>
