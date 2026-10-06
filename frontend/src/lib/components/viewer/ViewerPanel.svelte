<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { GRID_LAYOUTS, gridVolumes, type GridLayout, type Display } from '$lib/workspace';
	import ViewerTile from '../ViewerTile.svelte';
	import type { ImageOverlay } from '$lib/analysis';
	import type { ViewerTool, PixelPoint, RoiOverlay } from '$lib/roi';
	import SpatialViewer from './SpatialViewer.svelte';
	import CrosshairIcon from '~icons/lucide/crosshair';
	import HandIcon from '~icons/lucide/hand';
	import RotateCcwIcon from '~icons/lucide/rotate-ccw';
	import GridIcon from '~icons/lucide/layout-grid';
	import BoxIcon from '~icons/lucide/box';
	import CircleHelpIcon from '~icons/lucide/circle-help';
	import XIcon from '~icons/lucide/x';
	import MouseIcon from '~icons/lucide/mouse';
	import KeyboardIcon from '~icons/lucide/keyboard';
	let {
		dataset,
		volumes,
		active = $bindable(0),
		selected,
		slice,
		x,
		y,
		display,
		overlay,
		roi,
		onroi,
		onundo,
		tiles,
		linked,
		showLink = true,
		navigationOpen = $bindable(false),
		onlink,
		singleScan = false,
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
		volumes: VoxelVolume[];
		active: number;
		selected: number[];
		slice: number;
		x: number;
		y: number;
		display: Display;
		overlay?: ImageOverlay;
		roi?: RoiOverlay;
		onroi?: (points: PixelPoint[], slice: number, rectangle: boolean) => void;
		onundo?: () => void;
		tiles: Record<string, Display>;
		linked: boolean;
		showLink?: boolean;
		navigationOpen: boolean;
		onlink?: () => void;
		singleScan?: boolean;
		gridLayout: GridLayout;
		tool: ViewerTool;
		panel: string;
		controls: Snippet;
		onselect: (x: number, y: number) => void;
		onspatialselect: (x: number, y: number, z: number) => void;
		ondisplay: (view: Display, index: number) => void;
		onreset: () => void;
	} = $props();
	let layoutMenu: HTMLDivElement;
	let layoutTrigger = $state<HTMLButtonElement>();
	let menuPosition = $state({ left: 12, top: 12, width: 340, height: 400 });
	function positionLayoutMenu() {
		if (!layoutTrigger || !layoutMenu?.matches(':popover-open')) return;
		const trigger = layoutTrigger.getBoundingClientRect();
		const width = Math.min(340, window.innerWidth - 24);
		const below = window.innerHeight - trigger.bottom - 20;
		const above = trigger.top - 20;
		const flip = below < 120 && above > below;
		const height = Math.max(0, flip ? above : below);
		const top = flip
			? Math.max(12, trigger.top - Math.min(layoutMenu.scrollHeight, height) - 8)
			: trigger.bottom + 8;
		menuPosition = {
			left: Math.max(12, Math.min(trigger.left, window.innerWidth - width - 12)),
			top,
			width,
			height
		};
	}
	const menuId = $props.id();
	let imageStage = $state<HTMLDivElement>();
	let spacePan = $state(false);
	let spatial = $state(false);
	function startSpacePan(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		const target = event.target instanceof Element ? event.target : undefined;
		const imageFocused = target?.closest('[data-viewer-tile]') && imageStage?.contains(target);
		if (
			!imageFocused &&
			(!imageStage?.matches(':hover') ||
				target?.closest(
					'input, textarea, select, button, a, summary, [contenteditable], [role="textbox"]'
				))
		)
			return;
		if (
			onundo &&
			(event.ctrlKey || event.metaKey) &&
			event.key.toLowerCase() === 'z' &&
			!event.shiftKey
		) {
			event.preventDefault();
			onundo();
			return;
		}
		if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
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
	onresize={positionLayoutMenu}
	onscroll={positionLayoutMenu}
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
	class="viewer-panel card @container min-h-0 min-w-0 flex-col overflow-hidden {panel === 'Image' ||
	panel === 'Controls'
		? 'flex'
		: 'hidden min-[900px]:flex'}"
	aria-label="Image viewer"
>
	<div
		class="relative flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5 max-[899px]:px-2 max-[899px]:py-1"
	>
		{#if singleScan}<h3 class="text-xs font-semibold">Native view</h3>{:else}<div
				class="flex items-center gap-1"
				role="group"
				aria-label="View modes"
			>
				<button
					class="button button-ghost"
					popovertarget={menuId}
					bind:this={layoutTrigger}
					aria-label="Choose view layout"
					onclick={() => (spatial = false)}
					><GridIcon class="size-4" />{montage ? 'Multiview' : 'Native view'} ▾</button
				>
				<button
					class="button button-ghost text-xs max-[899px]:h-11"
					aria-pressed={spatial}
					title="Open linked spatial views (overlays are shown in Native view)"
					onclick={() => (spatial = !spatial)}
					><BoxIcon class="size-4" aria-hidden="true" />3D + slices</button
				>
			</div>{/if}
		{#if showLink && selected.length > 1}<button
				class="button button-ghost gap-2 px-2 text-xs max-[899px]:h-11 @min-[760px]:absolute @min-[760px]:top-1/2 @min-[760px]:left-1/2 @min-[760px]:-translate-x-1/2 @min-[760px]:-translate-y-1/2"
				aria-label="Link views: zoom, pan, window and level"
				aria-pressed={linked}
				title="Link zoom, pan, window and level across views. Slice and voxel stay linked."
				onclick={onlink}
				>Link views
				<span
					class="relative h-5 w-9 rounded-full transition-colors {linked
						? 'bg-selection'
						: 'bg-muted'}"
					aria-hidden="true"
					><span
						class="absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left] {linked
							? 'left-[18px]'
							: 'left-0.5'}"
					></span></span
				></button
			>{/if}
		<div class="ml-auto flex flex-wrap items-center justify-end gap-1 max-[899px]:[&_.button]:h-11">
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
					class="flex items-center gap-0.5 rounded-lg border bg-muted/20 p-0.5 [&_.button]:px-2.5 [&_.button]:text-xs max-[899px]:[&_.button]:gap-1 max-[899px]:[&_.button]:px-1"
					role="group"
					aria-label="Image tools"
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
			<details class="relative text-xs" bind:open={navigationOpen}>
				<summary
					class="button button-ghost flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground max-[899px]:h-11 [&::-webkit-details-marker]:hidden"
					aria-label="View navigation shortcuts"
					title="View navigation shortcuts"
					><CircleHelpIcon class="size-4" aria-hidden="true" /></summary
				>
				<div
					class="fixed inset-3 z-50 overflow-auto rounded-md border bg-background p-3 text-left leading-5 text-foreground shadow-lg min-[900px]:absolute min-[900px]:inset-auto min-[900px]:right-0 min-[900px]:mt-2 min-[900px]:max-h-[min(70dvh,24rem)] min-[900px]:w-[min(22rem,calc(100vw-2rem))]"
				>
					<div class="mb-2 flex items-center justify-between gap-2 font-semibold">
						<span>Navigate the image</span>
						<button
							class="button button-ghost h-9 px-2 max-[899px]:h-11"
							aria-label="Close navigation shortcuts"
							onclick={() => (navigationOpen = false)}><XIcon class="size-4" /></button
						>
					</div>
					<ul
						class="space-y-2 text-muted-foreground [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
					>
						<li class="flex gap-2">
							<MouseIcon aria-hidden="true" /><span
								><strong class="text-foreground">Scroll</strong> · Zoom at pointer (1–4×)</span
							>
						</li>
						<li class="flex gap-2">
							<HandIcon aria-hidden="true" /><span><kbd>Space</kbd> + drag · Pan temporarily</span>
						</li>
						<li class="flex gap-2">
							<KeyboardIcon aria-hidden="true" /><span
								><kbd>Arrow keys</kbd> · {tool === 'pan'
									? 'Pan the focused image'
									: 'Move the selected voxel'}</span
							>
						</li>
						<li class="flex gap-2">
							<CrosshairIcon aria-hidden="true" /><span
								><strong class="text-foreground">Click</strong> · Inspect a voxel</span
							>
						</li>
						<li class="flex gap-2">
							<KeyboardIcon aria-hidden="true" /><span
								><kbd>Shift</kbd> + scroll · Move through a multiview grid</span
							>
						</li>
						<li class="flex gap-2">
							<RotateCcwIcon aria-hidden="true" /><span
								><strong class="text-foreground">Reset</strong> · Restore zoom, pan and windowing</span
							>
						</li>
					</ul>
					<p class="mt-3 border-t pt-2 text-muted-foreground">
						{showLink
							? 'Slice and voxel stay linked.'
							: 'Scan navigation links only with a verified physical-position match.'}
						{showLink &&
							(linked
								? ' Display applies to all linked views.'
								: ` Display applies to volume ${active + 1}.`)}
						Native indices · {dataset.axisCodes.join(' / ')} · No reorientation.
					</p>
				</div>
			</details>
		</div>
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
						{roi}
						{onroi}
						{overlay}
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
						onlayout={() => {
							if (!singleScan) layoutMenu.showPopover();
						}}
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
	id={menuId}
	bind:this={layoutMenu}
	popover="auto"
	ontoggle={positionLayoutMenu}
	style:left="{menuPosition.left}px"
	style:top="{menuPosition.top}px"
	style:width="{menuPosition.width}px"
	style:max-height="{menuPosition.height}px"
	class="fixed inset-auto m-0 overflow-auto rounded-xl border bg-card p-4 text-foreground shadow-[0_8px_32px_#0005]"
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
