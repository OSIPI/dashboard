<script lang="ts">
	import DatabaseIcon from '~icons/lucide/database';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import { resolve } from '$app/paths';
	import type { Dataset } from '$lib/ivim';
	let {
		dataset,
		active,
		open = $bindable(false)
	}: { dataset: Dataset; active: number; open: boolean } = $props();
</script>

<section
	class="card p-4 text-xs leading-6 text-muted-foreground {open
		? ''
		: '[&>*:not(:first-child)]:hidden'}"
>
	<h2>
		<button
			type="button"
			class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			aria-label="{open ? 'Collapse' : 'Expand'} dataset metadata panel"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<DatabaseIcon class="size-4 shrink-0" aria-hidden="true" />Dataset & acquisition metadata
			{#if open}<ChevronDownIcon class="ml-auto size-4" />{:else}<ChevronRightIcon
					class="ml-auto size-4"
				/>{/if}
		</button>
	</h2>
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
</section>
