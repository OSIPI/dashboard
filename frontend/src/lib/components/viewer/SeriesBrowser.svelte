<script lang="ts">
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import IvimImage from '../IvimImage.svelte';
	import GridIcon from '~icons/lucide/layout-grid';
	import ListIcon from '~icons/lucide/list';
	let {
		dataset,
		volumes,
		active,
		selected,
		search = $bindable(''),
		range = $bindable('all'),
		layout = $bindable('grid'),
		onselect,
		ontoggle,
		onselectmany,
		onclear
	}: {
		dataset: Dataset;
		volumes: VoxelVolume[];
		active: number;
		selected: number[];
		search: string;
		range: string;
		layout: 'grid' | 'list';
		onselect: (index: number) => void;
		ontoggle: (index: number) => void;
		onselectmany: (indices: number[]) => void;
		onclear: () => void;
	} = $props();
	let selecting = $state(false);
	const filtered = $derived(
		dataset.bValues
			.map((b, index) => ({ b, index }))
			.filter(
				({ b, index }) =>
					`ivim b ${b} ${dataset.name} volume ${index + 1}`
						.toLowerCase()
						.includes(search.trim().toLowerCase()) &&
					(range === 'all' ||
						(range === 'low' ? b <= 100 : range === 'high' ? b > 100 : b === Number(range)))
			)
	);
	const slices = $derived(dataset.dimensions[2]);
	const aspect = $derived(
		(dataset.dimensions[0] * dataset.spacing[0]) / (dataset.dimensions[1] * dataset.spacing[1])
	);
</script>

<div class="border-b p-3">
	<div class="mb-3 flex items-center justify-between gap-2">
		<h2 class="text-base font-semibold">
			Series browser <span class="text-muted-foreground">/ {dataset.bValues.length}</span>
		</h2>
		<div class="flex">
			<button
				class="button button-ghost button-icon max-[899px]:size-11"
				aria-label="Grid view"
				aria-pressed={layout === 'grid'}
				onclick={() => (layout = 'grid')}><GridIcon class="size-4" /></button
			>
			<button
				class="button button-ghost button-icon max-[899px]:size-11"
				aria-label="List view"
				aria-pressed={layout === 'list'}
				onclick={() => (layout = 'list')}><ListIcon class="size-4" /></button
			>
		</div>
	</div>
	<label class="sr-only" for="series-search">Search series</label>
	<input
		id="series-search"
		type="search"
		class="input w-full px-3 py-2 text-xs"
		placeholder="Search series or b-value"
		bind:value={search}
	/>
	<div class="mt-3 flex gap-1" aria-label="Quick b-value filters">
		{#each [{ value: 'all', label: 'All' }, { value: 'low', label: 'b ≤ 100' }, { value: 'high', label: 'b > 100' }] as filter (filter.value)}
			<button
				class="button button-ghost flex-1 px-1.5 text-xs max-[899px]:min-h-11"
				aria-pressed={range === filter.value}
				onclick={() => (range = filter.value)}>{filter.label}</button
			>
		{/each}
	</div>
	<label class="mt-3 flex items-center gap-2 text-xs"
		>b-value
		<select class="input min-w-0 flex-1 py-2 text-xs" bind:value={range}>
			<option value="all">All acquired values</option><option value="low">0–100 s/mm²</option
			><option value="high">&gt;100 s/mm²</option>
			{#each [...new Set(dataset.bValues)] as b (b)}<option value={String(b)}>{b} s/mm²</option
				>{/each}
		</select>
	</label>
	{#if search.trim() || range !== 'all'}
		<p class="mt-3 text-xs text-muted-foreground">
			{filtered.length} of {dataset.bValues.length} volumes
		</p>
	{/if}
	<div class="mt-3 flex items-center justify-between gap-2">
		<button
			type="button"
			role="switch"
			aria-label="Selection mode"
			aria-checked={selecting}
			class="button button-ghost h-8 px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			onclick={() => (selecting = !selecting)}
			><span
				aria-hidden="true"
				class="relative h-4 w-7 rounded-full {selecting ? 'bg-selection' : 'bg-muted-foreground'}"
				><span
					class="absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform motion-reduce:transition-none {selecting
						? 'translate-x-3'
						: ''}"
				></span></span
			>Select</button
		>
		<span class="text-xs text-muted-foreground" role="status">
			{selected.length} selected
		</span>
	</div>
	{#if selecting}
		<div class="mt-1 flex items-center gap-1">
			<button
				class="button button-ghost h-8 px-2 text-xs max-[899px]:min-h-11"
				onclick={() => onselectmany(filtered.map((v) => v.index))}>Select filtered</button
			>
			<button
				class="button button-ghost h-8 px-2 text-xs max-[899px]:min-h-11"
				aria-label="Clear selection"
				onclick={onclear}>Clear</button
			>
		</div>
	{/if}
</div>
<div class="series-grid grid gap-2 p-3 {layout === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}">
	{#each filtered as series (series.index)}
		<button
			type="button"
			class="series-card w-full min-w-0 overflow-hidden rounded-[7px] border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring {selected.includes(
				series.index
			)
				? 'border-selection bg-selection-surface ring-1 ring-selection'
				: 'bg-card hover:border-muted-foreground hover:bg-muted'} {layout === 'list'
				? 'flex items-center'
				: ''}"
			aria-pressed={selecting ? selected.includes(series.index) : undefined}
			aria-current={active === series.index ? 'true' : undefined}
			aria-label="{selecting ? 'Compare' : 'Open'} volume {series.index +
				1}, b-value {series.b} s/mm²"
			title="Volume {series.index + 1}{active === series.index
				? ' · Active volume'
				: ''} · {selecting
				? `Click to ${selected.includes(series.index) ? 'remove from' : 'add to'} comparison`
				: 'Click to open in the active pane'}"
			onclick={() => (selecting ? ontoggle(series.index) : onselect(series.index))}
		>
			<div
				class="relative bg-black {layout === 'list' ? 'w-20 shrink-0' : ''}"
				style:aspect-ratio={aspect}
			>
				<IvimImage
					thumbnail
					volume={volumes[series.index]}
					{dataset}
					center={dataset.window[0]}
					width={dataset.window[1]}
					slice={Math.floor(slices / 2)}
					label="IVIM volume {series.index + 1}, b={series.b}, middle native slice"
				/>
				{#if active === series.index}
					<span
						class="absolute top-2 right-2 size-2 rounded-full bg-selection ring-2 ring-black"
						aria-hidden="true"
					></span>
				{/if}
			</div>
			<div class="px-2 py-2 text-left">
				<span class="block text-xs font-semibold">b = {series.b}</span><span
					class="block text-xs text-muted-foreground">Vol {series.index + 1}</span
				>
			</div>
		</button>
	{:else}
		<p class="col-span-full py-6 text-center text-xs text-muted-foreground">
			No matching series.<button
				class="mt-2 block w-full text-primary underline"
				onclick={() => {
					search = '';
					range = 'all';
				}}>Clear filters</button
			>
		</p>
	{/each}
</div>
