<script lang="ts">
	import { onMount } from 'svelte';
	import CrosshairIcon from '~icons/lucide/crosshair';
	import HandIcon from '~icons/lucide/hand';
	import RotateCcwIcon from '~icons/lucide/rotate-ccw';
	import BookmarkIcon from '~icons/lucide/bookmark';
	import GridIcon from '~icons/lucide/layout-grid';
	import ListIcon from '~icons/lucide/list';
	import IvimImage from '$lib/components/IvimImage.svelte';
	import Header from '$lib/components/ui/Header.svelte';
	import {
		B_VALUES,
		SIZE,
		SLICES,
		BOOKMARK_KEY,
		createVolumes,
		parametersAt,
		voxelIndex,
		parseBookmarks,
		type Bookmark
	} from '$lib/ivim';

	const techniques = {
		DCE: 'Dynamic contrast-enhanced',
		DSC: 'Dynamic susceptibility contrast',
		ASL: 'Arterial spin labeling',
		IVIM: 'Intravoxel incoherent motion'
	};
	let technique = $state<keyof typeof techniques>('IVIM');
	let panel = $state('Image');
	let volumes = $state.raw<Float32Array[]>([]);
	let bIndex = $state(0);
	let slice = $state(16);
	let x = $state(35);
	let y = $state(44);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let center = $state(500);
	let width = $state(1000);
	let tool = $state<'inspect' | 'pan'>('inspect');
	let search = $state('');
	let range = $state('all');
	let layout = $state<'grid' | 'list'>('grid');
	let bookmarks = $state<Bookmark[]>([]);
	let note = $state('');
	let storageMessage = $state('Saved only in this browser.');
	let imageLayer = $state<HTMLDivElement>();
	let drag: { id: number; x: number; y: number; px: number; py: number } | undefined;
	const p = $derived(parametersAt(x, y, slice));
	const signals = $derived(volumes.map((volume) => volume[voxelIndex(x, y, slice)]));
	const points = $derived(
		signals
			.map((value, i) => `${42 + (B_VALUES[i] / 800) * 270},${174 - (value / 1100) * 146}`)
			.join(' ')
	);
	const filtered = $derived(
		B_VALUES.map((b, index) => ({ b, index })).filter(
			({ b }) =>
				`ivim b ${b} synthetic axial`.includes(search.trim().toLowerCase()) &&
				(range === 'all' || (range === 'low' ? b <= 100 : b > 100))
		)
	);

	onMount(() => {
		volumes = createVolumes();
		try {
			const saved = localStorage.getItem(BOOKMARK_KEY);
			if (saved) bookmarks = parseBookmarks(saved);
		} catch {
			storageMessage = 'Saved views could not be loaded. New views still work for this session.';
		}
	});

	function resetView() {
		zoom = 1;
		panX = 0;
		panY = 0;
		center = 500;
		width = 1000;
	}
	function selectVoxel(event: PointerEvent) {
		if (!imageLayer) return;
		const bounds = imageLayer.getBoundingClientRect();
		const nextX = Math.floor(((event.clientX - bounds.left) / bounds.width) * SIZE);
		const nextY = Math.floor(((event.clientY - bounds.top) / bounds.height) * SIZE);
		if (nextX >= 0 && nextX < SIZE && nextY >= 0 && nextY < SIZE) {
			x = nextX;
			y = nextY;
		}
	}
	function pointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		if (tool === 'inspect') selectVoxel(event);
		else drag = { id: event.pointerId, x: event.clientX, y: event.clientY, px: panX, py: panY };
	}
	function pointerMove(event: PointerEvent) {
		if (drag?.id === event.pointerId) {
			panX = drag.px + event.clientX - drag.x;
			panY = drag.py + event.clientY - drag.y;
		}
	}
	function keyboard(event: KeyboardEvent) {
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		if (tool === 'pan') {
			panX += move[0] * 12;
			panY += move[1] * 12;
		} else {
			x = Math.max(0, Math.min(SIZE - 1, x + move[0]));
			y = Math.max(0, Math.min(SIZE - 1, y + move[1]));
		}
	}
	function persist(next: Bookmark[]) {
		bookmarks = next;
		try {
			localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
			storageMessage = 'Saved only in this browser.';
		} catch {
			storageMessage = 'Browser storage unavailable. Changes last for this session only.';
		}
	}
	function saveView() {
		persist([
			...bookmarks,
			{ id: crypto.randomUUID(), b: bIndex, z: slice, x, y, note: note.trim() }
		]);
		note = '';
	}
	function restore(view: Bookmark) {
		bIndex = view.b;
		slice = view.z;
		x = view.x;
		y = view.y;
		resetView();
		tool = 'inspect';
		panel = 'Image';
	}
</script>

<svelte:head>
	<title>Synthetic IVIM Viewer | OSIPY Dashboard</title>
	<meta
		name="description"
		content="Explore synthetic IVIM image volumes and voxel signal curves locally. Educational phantom only, not for diagnosis."
	/>
</svelte:head>

<Header bind:technique>
	<h1 class="workspace-title text-xs font-semibold">
		{technique} / {technique === 'IVIM' ? 'Synthetic phantom 01' : 'Not implemented'}
	</h1>
	{#if technique === 'IVIM'}
		<div class="viewer-tools flex items-center gap-1">
			<button
				class="button {tool === 'inspect' ? 'button-primary' : 'button-ghost'}"
				aria-pressed={tool === 'inspect'}
				onclick={() => (tool = 'inspect')}><CrosshairIcon class="size-4" />Voxel</button
			>
			<button
				class="button {tool === 'pan' ? 'button-primary' : 'button-ghost'}"
				aria-pressed={tool === 'pan'}
				onclick={() => (tool = 'pan')}><HandIcon class="size-4" />Pan</button
			>
			<button class="button button-ghost" onclick={resetView}
				><RotateCcwIcon class="size-4" />Reset</button
			>
		</div>
	{/if}
</Header>
<main class="viewer-main">
	<p class="safety-notice">
		<strong>Synthetic only. Not for diagnosis.</strong> No patient data, uploads or DICOM / NIfTI / BIDS
		import.
	</p>
	{#if technique !== 'IVIM'}
		<section class="modality-state card space-y-3 p-6 text-center">
			<span class="text-xs font-semibold tracking-widest text-primary"
				>{technique} / NOT IMPLEMENTED</span
			>
			<h2 class="text-2xl font-semibold">{techniques[technique]}</h2>
			<p class="mx-auto max-w-lg text-sm leading-6 text-muted-foreground">
				No acquisition data, signal model, or analysis workflow is implemented for {technique}. The
				working example currently covers synthetic IVIM only.
			</p>
			<button class="button button-primary mx-auto mt-3" onclick={() => (technique = 'IVIM')}
				>Explore the IVIM demo</button
			>
		</section>
	{:else if !volumes.length}
		<p class="card p-10 text-center" role="status">Generating synthetic IVIM volumes...</p>
	{:else}
		<nav class="panel-switcher" aria-label="Workspace panels">
			{#each ['Image', 'Controls', 'Series', 'Inspector'] as name (name)}
				<button
					class="button {panel === name ? 'button-primary' : 'button-ghost'}"
					aria-pressed={panel === name}
					onclick={() => (panel = name)}>{name}</button
				>
			{/each}
		</nav>
		<div class="workspace" data-panel={panel}>
			<!-- Independent scroll region needs keyboard scrolling. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<aside class="series-panel card min-w-0" aria-label="Series browser" tabindex="0">
				<div class="border-b p-3">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-sm font-semibold">
							Series browser <span class="text-muted-foreground">/ 09</span>
						</h2>
						<div class="flex">
							<button
								class="button button-ghost button-icon"
								aria-label="Grid view"
								aria-pressed={layout === 'grid'}
								onclick={() => (layout = 'grid')}><GridIcon class="size-4" /></button
							><button
								class="button button-ghost button-icon"
								aria-label="List view"
								aria-pressed={layout === 'list'}
								onclick={() => (layout = 'list')}><ListIcon class="size-4" /></button
							>
						</div>
					</div>
					<label class="sr-only" for="series-search">Search series</label><input
						id="series-search"
						type="search"
						class="input w-full px-3 py-2 text-xs"
						placeholder="Search series or b-value"
						bind:value={search}
					/>
					<label class="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
						>Filter<select class="input min-w-0 flex-1 py-1.5 text-xs" bind:value={range}
							><option value="all">All b-values</option><option value="low">Low b (0-100)</option
							><option value="high">High b (200-800)</option></select
						></label
					>
				</div>
				<div class="series-grid p-3" class:list={layout === 'list'}>
					{#each filtered as series (series.b)}
						<button
							class="series-card"
							class:selected={bIndex === series.index}
							aria-pressed={bIndex === series.index}
							aria-label="Select b-value {series.b} s/mm²"
							onclick={() => {
								bIndex = series.index;
								panel = 'Image';
							}}
						>
							<div class="thumbnail">
								<IvimImage
									volume={volumes[series.index]}
									slice={16}
									label="Synthetic IVIM b={series.b} overview, slice 17"
								/>
							</div>
							<div class="px-2 py-2 text-left">
								<span class="block text-xs font-semibold">b = {series.b}</span><span
									class="block text-[10px] text-muted-foreground">s/mm² · 32 slices</span
								>
							</div>
						</button>
					{:else}<p class="col-span-2 py-6 text-center text-xs text-muted-foreground">
							No matching series.<button
								class="mt-2 block w-full text-primary underline"
								onclick={() => {
									search = '';
									range = 'all';
								}}>Clear filters</button
							>
						</p>{/each}
				</div>
				<p class="border-t px-3 py-3 text-[11px] leading-5 text-muted-foreground">
					{filtered.length} of 9 volumes · Axial only<br />96 × 96 × 32 voxels · Noise-free phantom<br
					/>Previews use slice 17 and default window.
				</p>
			</aside>

			<section class="viewer-panel card min-w-0 overflow-hidden" aria-label="Image viewer">
				<div class="image-stage">
					<button
						class="image-interaction"
						class:panning={tool === 'pan'}
						aria-label="Synthetic axial image. In voxel mode, click to select or use arrow keys. In pan mode, drag or use arrow keys."
						onpointerdown={pointerDown}
						onpointermove={pointerMove}
						onpointerup={() => (drag = undefined)}
						onpointercancel={() => (drag = undefined)}
						onlostpointercapture={() => (drag = undefined)}
						onkeydown={keyboard}
					>
						<div
							class="image-layer"
							bind:this={imageLayer}
							style:transform="translate({panX}px, {panY}px) scale({zoom})"
						>
							<IvimImage
								volume={volumes[bIndex]}
								{slice}
								{center}
								{width}
								label="Synthetic axial slice {slice + 1}, b={B_VALUES[bIndex]} s/mm²"
							/>
							<svg class="crosshair" viewBox="0 0 96 96" aria-hidden="true"
								><circle cx={x + 0.5} cy={y + 0.5} r="2.4" /><path
									d="M {x - 4} {y + 0.5} h 3 M {x + 2} {y + 0.5} h 3 M {x + 0.5} {y - 4} v 3 M {x +
										0.5} {y + 2} v 3"
								/></svg
							>
						</div>
					</button>
					<div class="stage-label top-3 left-3">
						SYNTHETIC / IVIM<br />b {B_VALUES[bIndex]} s/mm²
					</div>
					<div class="stage-label top-3 right-3 text-right">
						AXIAL · z {slice}<br />{Math.round(zoom * 100)}%
					</div>
					<div class="stage-label bottom-3 left-3">
						x {x} / y {y}<br />S {signals[bIndex].toFixed(1)} a.u.
					</div>
					<div class="stage-label right-3 bottom-3">Slice {slice + 1} / {SLICES}</div>
				</div>
				<!-- Independent scroll region needs keyboard scrolling. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="viewer-controls space-y-4 p-4"
					tabindex="0"
					role="region"
					aria-label="Image controls"
				>
					<label class="control"
						><span>Slice <strong>{slice + 1} / {SLICES}</strong></span><input
							type="range"
							min="0"
							max={SLICES - 1}
							step="1"
							bind:value={slice}
						/></label
					>
					<label class="control"
						><span>b-value <strong>{B_VALUES[bIndex]} s/mm²</strong></span><input
							type="range"
							min="0"
							max={B_VALUES.length - 1}
							step="1"
							bind:value={bIndex}
						/></label
					>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<label class="control"
							><span>Zoom <strong>{zoom.toFixed(1)}×</strong></span><input
								type="range"
								min="1"
								max="4"
								step="0.1"
								bind:value={zoom}
							/></label
						><label class="control"
							><span>Window <strong>{width} a.u.</strong></span><input
								type="range"
								min="100"
								max="2000"
								step="10"
								bind:value={width}
							/></label
						><label class="control"
							><span>Level <strong>{center} a.u.</strong></span><input
								type="range"
								min="0"
								max="1200"
								step="10"
								bind:value={center}
							/></label
						>
					</div>
					<p class="text-[11px] leading-5 text-muted-foreground">
						{tool === 'inspect'
							? 'Click the image to inspect a voxel. Arrow keys move the selection when the image is focused.'
							: 'Drag to pan. Arrow keys pan when the image is focused.'} Reset restores zoom, pan, window
						and level. Coordinates are phantom indices, not patient orientation.
					</p>
				</div>
			</section>

			<!-- Independent scroll region needs keyboard scrolling. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<aside
				class="inspector-panel min-w-0 space-y-4"
				aria-label="Signal and saved views"
				tabindex="0"
			>
				<section class="card overflow-hidden">
					<div class="border-b p-3">
						<h2 class="text-sm font-semibold">Voxel signal</h2>
						<p class="mt-1 text-xs text-muted-foreground">({x}, {y}, {slice}) · {p.region}</p>
					</div>
					<svg
						class="w-full text-primary"
						viewBox="0 0 340 214"
						role="img"
						aria-label="Selected voxel signal over nine b-values. Exact values are in the table below."
						><title>Synthetic voxel signal, not a fitted curve</title>
						{#each [0, 500, 1000] as tick (tick)}<line
								x1="42"
								x2="312"
								y1={174 - (tick / 1100) * 146}
								y2={174 - (tick / 1100) * 146}
								stroke="var(--border)"
							/><text x="35" y={178 - (tick / 1100) * 146} text-anchor="end">{tick}</text>{/each}
						<text x="42" y="17">Signal (a.u.)</text><line
							x1="42"
							x2="312"
							y1="174"
							y2="174"
							stroke="var(--muted-foreground)"
						/>
						{#each [0, 200, 400, 600, 800] as tick (tick)}<text
								x={42 + (tick / 800) * 270}
								y="191"
								text-anchor="middle">{tick}</text
							>{/each}<text x="180" y="208" text-anchor="middle">b-value (s/mm²)</text>
						<polyline {points} fill="none" stroke="currentColor" stroke-width="2" />
						{#each signals as value, i (i)}<circle
								cx={42 + (B_VALUES[i] / 800) * 270}
								cy={174 - (value / 1100) * 146}
								r={i === bIndex ? 5 : 2.5}
								fill={i === bIndex ? 'var(--primary)' : 'var(--card)'}
								stroke="currentColor"
								stroke-width="1.5"
							/>{/each}
					</svg>
					<div class="px-3 pb-3">
						<p class="text-[11px] text-muted-foreground">
							Noise-free samples; lines connect b-values. No fitting.
						</p>
						<details class="mt-3 text-xs">
							<summary class="cursor-pointer font-medium">Signal values</summary>
							<table class="mt-2 w-full text-right">
								<caption class="sr-only">Selected voxel values</caption><thead
									><tr><th class="py-1 text-left">b (s/mm²)</th><th>Signal (a.u.)</th></tr></thead
								><tbody
									>{#each signals as value, i (i)}<tr class="border-t"
											><td class="py-1 text-left">{B_VALUES[i]}</td><td>{value.toFixed(3)}</td></tr
										>{/each}</tbody
								>
							</table>
						</details>
					</div>
					<div class="border-t bg-muted/40 p-3">
						<h3 class="text-xs font-semibold">Synthetic ground truth</h3>
						<p class="mt-1 text-[11px] text-muted-foreground">
							Generator inputs at the selected voxel, not estimates.
						</p>
						<dl class="mt-3 grid grid-cols-2 gap-3 text-xs">
							<div>
								<dt class="text-muted-foreground">S₀</dt>
								<dd class="mt-1 font-mono font-semibold">{p.s0.toFixed(1)} a.u.</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">f · fraction</dt>
								<dd class="mt-1 font-mono font-semibold">{(p.f * 100).toFixed(1)} %</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">D · diffusion</dt>
								<dd class="mt-1 font-mono font-semibold">{p.d.toFixed(4)} mm²/s</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">D* · pseudo-diffusion</dt>
								<dd class="mt-1 font-mono font-semibold">{p.dStar.toFixed(3)} mm²/s</dd>
							</div>
						</dl>
						{#if p.s0 === 0}<p class="mt-3 text-xs text-muted-foreground">
								Outside the phantom. Zero parameters denote background.
							</p>{/if}
						<p class="mt-3 font-mono text-[10px] leading-5 break-words text-muted-foreground">
							S(b) = S₀ [(1-f) exp(-bD) + f exp(-bD*)]
						</p>
					</div>
				</section>
				<section class="card p-3">
					<h2 class="flex items-center gap-2 text-sm font-semibold">
						<BookmarkIcon class="size-4 text-primary" />Saved voxels
						<span class="ml-auto text-xs text-muted-foreground">{bookmarks.length}/30</span>
					</h2>
					<label class="mt-3 block text-xs" for="voxel-note">Note for current voxel</label><textarea
						id="voxel-note"
						class="input mt-1 w-full resize-y px-2 py-2 text-xs"
						rows="2"
						maxlength="240"
						placeholder="e.g. Compare low-b signal decay"
						bind:value={note}
					></textarea><button
						class="button button-outline mt-2 w-full"
						disabled={bookmarks.length >= 30}
						onclick={saveView}>Save voxel + note</button
					>
					<p class="mt-2 text-[10px] leading-4 text-muted-foreground" role="status">
						{storageMessage}
					</p>
					<div class="mt-3 space-y-2">
						{#each bookmarks as view (view.id)}<div class="rounded-md border p-2">
								<button
									class="w-full text-left text-xs hover:text-primary"
									onclick={() => restore(view)}
									><span class="font-semibold"
										>b {B_VALUES[view.b]} · Slice {view.z + 1} · ({view.x}, {view.y})</span
									><span class="mt-1 block break-words text-muted-foreground"
										>{view.note || 'Saved voxel'}</span
									><span class="mt-1 block text-[10px] text-primary">Restore selection</span
									></button
								><button
									class="mt-2 text-[10px] text-muted-foreground underline hover:text-destructive"
									aria-label="Delete saved voxel {view.note || view.id}"
									onclick={() => persist(bookmarks.filter((b) => b.id !== view.id))}>Delete</button
								>
							</div>{/each}
					</div>
				</section>
			</aside>
		</div>
	{/if}
</main>

<style>
	.viewer-main {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		padding: 8px;
		gap: 8px;
	}
	.safety-notice {
		flex-shrink: 0;
		color: var(--muted-foreground);
		font-size: 11px;
		padding: 0 4px;
	}
	.modality-state {
		min-height: 0;
		overflow: auto;
		margin: auto;
	}
	.panel-switcher {
		display: none;
	}
	.workspace {
		display: grid;
		grid-template-columns: 210px minmax(0, 1fr) 290px;
		gap: 8px;
		flex: 1;
		min-height: 0;
	}
	.series-panel,
	.inspector-panel,
	.viewer-controls {
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}
	.viewer-panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.viewer-controls {
		flex: 0 1 auto;
		max-height: 42%;
	}
	.viewer-controls > .control {
		display: grid;
		grid-template-columns: 120px 1fr;
		align-items: center;
		gap: 16px;
	}
	.viewer-controls > .control input {
		margin-top: 0;
	}
	.inspector-panel {
		overflow-wrap: anywhere;
	}
	.series-panel,
	.inspector-panel {
		scrollbar-width: thin;
	}
	.series-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.series-card {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--card);
	}
	.series-card:hover,
	.series-card.selected {
		border-color: var(--primary);
		background: var(--accent);
	}
	.series-card.selected {
		box-shadow: 0 0 0 1px var(--primary);
	}
	.thumbnail {
		aspect-ratio: 1;
		background: #000;
	}
	.series-grid.list {
		grid-template-columns: 1fr;
	}
	.list .series-card {
		display: flex;
		align-items: center;
	}
	.list .thumbnail {
		width: 56px;
		flex-shrink: 0;
	}
	.image-stage {
		position: relative;
		flex: 1;
		min-height: 0;
		container-type: size;
		background: #070a0e;
		color: #d5dfe8;
	}
	.image-interaction {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		overflow: hidden;
		cursor: crosshair;
		touch-action: none;
	}
	.image-interaction.panning {
		cursor: grab;
	}
	.image-interaction.panning:active {
		cursor: grabbing;
	}
	.image-interaction:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -3px;
	}
	.image-layer {
		position: relative;
		width: min(86cqw, 86cqh);
		aspect-ratio: 1;
		flex-shrink: 0;
	}
	.crosshair {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: #63e3cf;
		stroke-width: 0.4;
		pointer-events: none;
	}
	.stage-label {
		position: absolute;
		pointer-events: none;
		font:
			10px/1.7 ui-monospace,
			monospace;
		text-shadow: 0 1px 3px #000;
	}
	.control {
		display: block;
		min-width: 0;
		font-size: 11px;
	}
	.control span {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		color: var(--muted-foreground);
	}
	.control strong {
		color: var(--foreground);
		font-weight: 500;
	}
	.control input {
		display: block;
		width: 100%;
		margin-top: 10px;
		accent-color: var(--primary);
	}
	svg text {
		font:
			10px ui-sans-serif,
			sans-serif;
		fill: var(--muted-foreground);
	}
	@media (max-width: 899px) {
		.workspace-title {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.viewer-main {
			padding: 4px;
			gap: 4px;
		}
		.viewer-tools {
			margin-left: auto;
		}
		.viewer-tools .button {
			height: 44px;
			padding-inline: 10px;
		}
		.panel-switcher {
			display: flex;
			flex-shrink: 0;
		}
		.panel-switcher .button {
			flex: 1;
			height: 44px;
			padding-inline: 8px;
			font-size: 12px;
		}
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
		.workspace[data-panel='Image'] .series-panel,
		.workspace[data-panel='Image'] .inspector-panel,
		.workspace[data-panel='Image'] .viewer-controls,
		.workspace[data-panel='Controls'] .series-panel,
		.workspace[data-panel='Controls'] .inspector-panel,
		.workspace[data-panel='Controls'] .image-stage,
		.workspace[data-panel='Series'] .viewer-panel,
		.workspace[data-panel='Series'] .inspector-panel,
		.workspace[data-panel='Inspector'] .viewer-panel,
		.workspace[data-panel='Inspector'] .series-panel {
			display: none;
		}
		.viewer-controls {
			max-height: none;
			flex: 1;
		}
		.viewer-controls > .control {
			display: block;
		}
		.control input {
			min-height: 28px;
			margin-top: 4px;
		}
		.inspector-panel :is(button, summary) {
			min-height: 44px;
		}
		.series-panel .button {
			min-height: 44px;
			min-width: 44px;
		}
		.series-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.series-grid.list {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
