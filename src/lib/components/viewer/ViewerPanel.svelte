<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Dataset } from '$lib/ivim';
	import { GRID_LAYOUTS, gridVolumes, type GridLayout, type Display } from '$lib/workspace';
	import ViewerTile from '../ViewerTile.svelte';
	import SpatialViewer from './SpatialViewer.svelte';
	import CrosshairIcon from '~icons/lucide/crosshair';
	import HandIcon from '~icons/lucide/hand';
	import RotateCcwIcon from '~icons/lucide/rotate-ccw';
	import GridIcon from '~icons/lucide/layout-grid';
	let {
		dataset,
		volumes,
		active = $bindable(0),
		selected,
		slice,
		x,
		y,
		display,
		tiles,
		linked,
		gridLayout = $bindable('auto'),
		tool = $bindable('inspect'),
		panel,
		controls,
		onselect,
		onspatialselect,
		ondisplay,
		onreset
	}: {
		dataset: Dataset;
		volumes: Int16Array[];
		active: number;
		selected: number[];
		slice: number;
		x: number;
		y: number;
		display: Display;
		tiles: Record<string, Display>;
		linked: boolean;
		gridLayout: GridLayout;
		tool: 'inspect' | 'pan';
		panel: string;
		controls: Snippet;
		onselect: (x: number, y: number) => void;
		onspatialselect: (x: number, y: number, z: number) => void;
		ondisplay: (view: Display, index: number) => void;
		onreset: () => void;
	} = $props();
	let layoutMenu: HTMLDivElement;
	let imageStage = $state<HTMLDivElement>();
	let spacePan = $state(false);
	let spatial = $state(false);
	function startSpacePan(event: KeyboardEvent) {
		if (
			event.code !== 'Space' ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.defaultPrevented
		)
			return;
		const target = event.target instanceof Element ? event.target : undefined;
		const imageFocused = target?.closest('[data-viewer-tile]');
		if (
			!imageFocused &&
			(!imageStage?.matches(':hover') ||
				target?.closest(
					'input, textarea, select, button, a, summary, [contenteditable], [role="textbox"]'
				))
		)
			return;
		event.preventDefault();
		spacePan = true;
	}
	function endSpacePan(event: KeyboardEvent) {
		if (event.code !== 'Space') return;
		if (spacePan) event.preventDefault();
		spacePan = false;
	}
	const montage = $derived(selected.length > 1);
	const grid = $derived(GRID_LAYOUTS.find((g) => g.id === gridLayout)!);
	const gridPage = $derived(
		grid.capacity ? Math.floor(Math.max(0, selected.indexOf(active)) / grid.capacity) : 0
	);
	const gridPages = $derived(
		grid.capacity ? Math.max(1, Math.ceil(selected.length / grid.capacity)) : 1
	);
	const visible = $derived(gridVolumes(selected, active, gridLayout));
</script>

<svelte:window
	onkeydown={startSpacePan}
	onkeyup={endSpacePan}
	onblur={() => (spacePan = false)}
	onfocusin={(event) => {
		if (
			event.target instanceof Element &&
			event.target.closest('input, textarea, select, [contenteditable]')
		)
			spacePan = false;
	}}
/>
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) spacePan = false;
	}}
/>

<section
	class="viewer-panel card min-h-0 min-w-0 flex-col overflow-hidden {panel === 'Image' ||
	panel === 'Controls'
		? 'flex'
		: 'hidden min-[900px]:flex'}"
	aria-label="Image viewer"
>
	<div
		class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 max-[899px]:px-2 max-[899px]:py-1"
	>
		<button
			class="button button-ghost"
			popovertarget="grid-layout-menu"
			aria-label="Choose view layout"
			onclick={() => (spatial = false)}
			><GridIcon class="size-4" />{montage ? 'Multiview' : 'Native view'} ▾</button
		>
		<button
			class="button button-ghost text-xs max-[899px]:h-11"
			aria-pressed={spatial}
			onclick={() => (spatial = !spatial)}>3D + slices</button
		>
		{#if !spatial && gridPages > 1}<div class="flex items-center gap-1 text-xs">
				<button
					class="button button-ghost"
					aria-label="Previous grid page"
					disabled={gridPage === 0}
					onclick={() => (active = selected[(gridPage - 1) * grid.capacity])}>‹</button
				><span>{gridPage + 1}/{gridPages}</span><button
					class="button button-ghost"
					aria-label="Next grid page"
					disabled={gridPage >= gridPages - 1}
					onclick={() => (active = selected[(gridPage + 1) * grid.capacity])}>›</button
				>
			</div>{/if}
		{#if !spatial}<div
				class="flex items-center gap-1 max-[899px]:ml-auto [&_.button]:px-2.5 [&_.button]:text-xs max-[899px]:[&_.button]:h-11 max-[899px]:[&_.button]:gap-1 max-[899px]:[&_.button]:px-1"
			>
				<button
					class="button button-ghost"
					aria-pressed={tool === 'inspect'}
					onclick={() => (tool = 'inspect')}><CrosshairIcon class="size-4" />Voxel</button
				>
				<button
					class="button button-ghost"
					aria-pressed={tool === 'pan'}
					title="Pan tool. Hold Space over an image to pan temporarily."
					onclick={() => (tool = 'pan')}><HandIcon class="size-4" />Pan</button
				>
				<button class="button button-ghost" onclick={onreset}
					><RotateCcwIcon class="size-4" />Reset</button
				>
			</div>{/if}
	</div>
	{#if spatial}
		<div
			class="min-h-0 flex-1 flex-col {panel === 'Controls' ? 'hidden min-[900px]:flex' : 'flex'}"
		>
			<svelte:boundary>
				<SpatialViewer
					{dataset}
					volume={volumes[active]}
					{active}
					voxel={[x, y, slice]}
					display={linked ? display : (tiles[active] ?? display)}
					onselect={onspatialselect}
				/>
				{#snippet failed(error)}
					<p role="alert" class="overflow-auto p-4 text-sm">
						{error instanceof Error ? error.message : 'Spatial viewing is unavailable.'} Use Native view
						to continue inspecting acquired slices.
					</p>
				{/snippet}
			</svelte:boundary>
		</div>
	{:else}
		<div
			bind:this={imageStage}
			class="image-stage min-h-0 flex-1 bg-[#080808] text-[#e0e0e0] {panel === 'Controls'
				? 'hidden min-[900px]:grid'
				: 'grid'} {montage && grid.capacity
				? 'auto-rows-[minmax(0,1fr)] grid-cols-[repeat(var(--grid-columns),minmax(0,1fr))] grid-rows-[repeat(var(--grid-rows),minmax(0,1fr))] gap-1 overflow-hidden'
				: montage
					? 'auto-rows-[minmax(190px,1fr)] grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-1 overflow-auto'
					: 'overflow-auto'}"
			style:--grid-columns={grid.columns}
			style:--grid-rows={grid.rows}
		>
			{#each visible as index (index)}<div class="min-h-0 min-w-0">
					<ViewerTile
						volume={volumes[index]}
						{dataset}
						{index}
						{slice}
						{x}
						{y}
						{tool}
						temporaryPan={spacePan}
						active={montage && index === active}
						scrollable={montage}
						view={linked ? display : (tiles[index] ?? display)}
						onactivate={() => (active = index)}
						{onselect}
						onview={(v) => ondisplay(v, index)}
						onlayout={() => layoutMenu.showPopover()}
					/>
				</div>{/each}
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="viewer-controls @container min-h-0 flex-[0_1_auto] space-y-2 overflow-auto overscroll-contain border-t p-3 max-[899px]:flex-1 {spatial
			? 'min-[900px]:max-h-[25%]'
			: 'min-[900px]:max-h-[35%]'} {panel === 'Image' ? 'hidden min-[900px]:block' : ''}"
		tabindex="0"
		role="region"
		aria-label="Image controls"
	>
		{@render controls()}
	</div>
</section>

<div
	id="grid-layout-menu"
	bind:this={layoutMenu}
	popover="auto"
	class="fixed inset-auto top-[110px] left-1/2 m-0 max-h-[calc(100dvh-130px)] w-[min(340px,calc(100vw-24px))] -translate-x-1/2 overflow-auto rounded-xl border bg-card p-4 text-foreground shadow-[0_8px_32px_#0005]"
	aria-label="View layout"
>
	<h2 class="mb-3 text-sm font-semibold">Arrange selected volumes</h2>
	<div class="grid grid-cols-2 gap-2">
		{#each GRID_LAYOUTS as option (option.id)}
			<button
				class="grid gap-2 rounded-lg border p-2.5 text-left text-xs aria-pressed:border-selection aria-pressed:bg-selection-surface aria-pressed:text-selection"
				aria-pressed={gridLayout === option.id}
				onclick={() => {
					gridLayout = option.id;
					layoutMenu.hidePopover();
				}}
			>
				<span
					class="grid h-[42px] gap-[3px]"
					style:grid-template-columns="repeat({option.columns},1fr)"
					aria-hidden="true"
					>{#each [...Array(option.columns * option.rows).keys()] as i (i)}<span
							class="rounded-xs border border-current opacity-70"
						></span>{/each}</span
				><span>{option.label}</span>
			</button>
		{/each}
	</div>
	<p class="mt-3 text-xs text-muted-foreground">
		Automatic shows all selections together. Fixed grids page through additional volumes. Slice and
		voxel stay linked.
	</p>
</div>
