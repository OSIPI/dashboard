<script lang="ts">
	import { onMount } from 'svelte';
	import { base, resolve } from '$app/paths';
	import CrosshairIcon from '~icons/lucide/crosshair';
	import HandIcon from '~icons/lucide/hand';
	import RotateCcwIcon from '~icons/lucide/rotate-ccw';
	import BookmarkIcon from '~icons/lucide/bookmark';
	import GridIcon from '~icons/lucide/layout-grid';
	import ListIcon from '~icons/lucide/list';
	import IvimImage from '$lib/components/IvimImage.svelte';
	import NumericControl from '$lib/components/NumericControl.svelte';
	import Header from '$lib/components/ui/Header.svelte';
	import {
		BOOKMARK_KEY,
		loadDataset,
		type Dataset,
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
	let volumes = $state.raw<Int16Array[]>([]);
	let dataset = $state.raw<Dataset>();
	let dataError = $state('');
	const B_VALUES = $derived(dataset?.bValues ?? []);
	const NX = $derived(dataset?.dimensions[0] ?? 0);
	const NY = $derived(dataset?.dimensions[1] ?? 0);
	const SLICES = $derived(dataset?.dimensions[2] ?? 0);
	const maxB = $derived(Math.max(1, ...B_VALUES));
	const aspect = $derived(dataset ? (NX * dataset.spacing[0]) / (NY * dataset.spacing[1]) : 1);
	let bIndex = $state(0);
	let slice = $state(0);
	let x = $state(0);
	let y = $state(0);
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
	const signals = $derived(
		dataset
			? volumes.map(
					(volume) =>
						volume[voxelIndex(x, y, slice, dataset!.dimensions)] * dataset!.slope +
						dataset!.intercept
				)
			: []
	);
	const signalMin = $derived(Math.min(0, ...signals));
	const signalMax = $derived(Math.max(signalMin + 1, ...signals));
	const signalY = (value: number) => 260 - ((value - signalMin) / (signalMax - signalMin)) * 220;
	const filtered = $derived(
		B_VALUES.map((b, index) => ({ b, index })).filter(
			({ b, index }) =>
				`ivim b ${b} in-vivo brain volume ${index + 1}`.includes(search.trim().toLowerCase()) &&
				(range === 'all' ||
					(range === 'low' ? b <= 100 : range === 'high' ? b > 100 : b === Number(range)))
		)
	);

	onMount(() => {
		const controller = new AbortController();
		loadDataset(`${base}/datasets/ivim-brain`, controller.signal)
			.then((loaded) => {
				if (controller.signal.aborted) return;
				dataset = loaded.dataset;
				x = Math.floor(dataset.dimensions[0] / 2);
				y = Math.floor(dataset.dimensions[1] / 2);
				slice = Math.floor(dataset.dimensions[2] / 2);
				resetView();
				volumes = loaded.volumes;
				try {
					const saved = localStorage.getItem(BOOKMARK_KEY);
					if (saved) bookmarks = parseBookmarks(saved, dataset);
				} catch {
					storageMessage =
						'Saved views unavailable or for another dataset. New views work for this session.';
				}
			})
			.catch((error) => {
				if (!controller.signal.aborted)
					dataError = error instanceof Error ? error.message : 'Dataset could not be loaded';
			});
		return () => controller.abort();
	});

	function resetView() {
		zoom = 1;
		panX = 0;
		panY = 0;
		center = dataset?.window[0] ?? 500;
		width = dataset?.window[1] ?? 1000;
	}
	function selectVoxel(event: PointerEvent) {
		if (!imageLayer) return;
		const bounds = imageLayer.getBoundingClientRect();
		const nextX = Math.floor(((event.clientX - bounds.left) / bounds.width) * NX);
		const nextY = Math.floor(((event.clientY - bounds.top) / bounds.height) * NY);
		if (nextX >= 0 && nextX < NX && nextY >= 0 && nextY < NY) {
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
			x = Math.max(0, Math.min(NX - 1, x + move[0]));
			y = Math.max(0, Math.min(NY - 1, y + move[1]));
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
		if (!dataset) return;
		persist([
			...bookmarks,
			{
				id: crypto.randomUUID(),
				datasetId: dataset.id,
				b: bIndex,
				z: slice,
				x,
				y,
				note: note.trim()
			}
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
	<title>In-Vivo IVIM Viewer | OSIPY Dashboard</title>
	<meta
		name="description"
		content="Explore the public OSIPI in-vivo brain IVIM series and acquired voxel signals. Research viewing only, not for diagnosis."
	/>
</svelte:head>

<Header bind:technique>
	<h1 class="workspace-title text-sm font-semibold">
		{technique} explorer <span class="text-muted-foreground">/</span>
		<span class="dataset-title"
			>{technique === 'IVIM'
				? (dataset?.name.replace(/^OSIPI TF2\.4 /, '') ?? 'Loading dataset')
				: 'Not implemented'}</span
		>
	</h1>
	{#if technique === 'IVIM' && dataset && volumes.length}
		<div class="dataset-badges flex flex-wrap gap-2 text-muted-foreground">
			<span class="badge">{B_VALUES.length} volumes</span>
			<span class="badge">{SLICES} slices</span>
		</div>
	{/if}
	<span
		class="research-badge badge text-muted-foreground"
		title="Not for diagnosis. Viewing only; no fitting or uploads.">Research only</span
	>
</Header>
<main class="viewer-main">
	{#if technique !== 'IVIM'}
		<section class="modality-state card space-y-3 p-6 text-center">
			<span class="text-xs font-semibold tracking-widest text-primary"
				>{technique} / NOT IMPLEMENTED</span
			>
			<h2 class="text-2xl font-semibold">{techniques[technique]}</h2>
			<p class="mx-auto max-w-lg text-sm leading-6 text-muted-foreground">
				No acquisition data, signal model, or analysis workflow is implemented for {technique}. The
				working viewer currently covers acquired IVIM only.
			</p>
			<button class="button button-primary mx-auto mt-3" onclick={() => (technique = 'IVIM')}
				>Explore the IVIM demo</button
			>
		</section>
	{:else if dataError}
		<section class="modality-state card space-y-3 p-6" role="alert">
			<h2 class="font-semibold">Brain dataset unavailable</h2>
			<p>{dataError}</p>
			<p class="text-sm">
				Prepare the static dataset with scripts/prepare_ivim.py before serving or deploying, then
				reload. No mock data is substituted.
			</p>
			<button class="button button-outline" onclick={() => location.reload()}>Reload dataset</button
			>
		</section>
	{:else if !dataset || !volumes.length}
		<p class="card p-10 text-center" role="status">
			Loading and verifying acquired IVIM volumes...
		</p>
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
						<h2 class="text-base font-semibold">
							Series browser <span class="text-muted-foreground">/ {B_VALUES.length}</span>
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
					<div class="quick-filters" aria-label="Quick b-value filters">
						{#each [{ value: 'all', label: 'All' }, { value: 'low', label: 'b ≤ 100' }, { value: 'high', label: 'b > 100' }] as filter (filter.value)}
							<button
								class="button button-ghost"
								aria-pressed={range === filter.value}
								onclick={() => (range = filter.value)}>{filter.label}</button
							>
						{/each}
					</div>
					<label class="mt-3 flex items-center gap-2 text-xs"
						>b-value
						<select class="input min-w-0 flex-1 py-2 text-xs" bind:value={range}>
							<option value="all">All acquired values</option><option value="low"
								>0–100 s/mm²</option
							><option value="high">&gt;100 s/mm²</option>
							{#each [...new Set(B_VALUES)] as b (b)}<option value={String(b)}>{b} s/mm²</option
								>{/each}
						</select>
					</label>
					<p class="mt-3 text-xs text-muted-foreground">
						{filtered.length} of {B_VALUES.length} volumes · selected {bIndex + 1}
					</p>
				</div>
				<div class="series-grid p-3" class:list={layout === 'list'}>
					{#each filtered as series (series.index)}
						<button
							class="series-card"
							class:selected={bIndex === series.index}
							aria-pressed={bIndex === series.index}
							aria-label="Select volume {series.index + 1}, b-value {series.b} s/mm²"
							onclick={() => {
								bIndex = series.index;
								panel = 'Image';
							}}
						>
							<div class="thumbnail" style:aspect-ratio={aspect}>
								<IvimImage
									volume={volumes[series.index]}
									{dataset}
									center={dataset.window[0]}
									width={dataset.window[1]}
									slice={Math.floor(SLICES / 2)}
									label="IVIM volume {series.index + 1}, b={series.b}, middle native slice"
								/>
							</div>
							<div class="px-2 py-2 text-left">
								<span class="block text-xs font-semibold">b = {series.b}</span><span
									class="block text-xs text-muted-foreground"
									>Vol {series.index + 1} · {SLICES} slices</span
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
			</aside>

			<section class="viewer-panel card min-w-0 overflow-hidden" aria-label="Image viewer">
				<div class="viewport-header">
					<h2 class="text-sm font-semibold">Native view</h2>
					<div class="viewer-tools flex items-center gap-1">
						<button
							class="button button-ghost"
							aria-pressed={tool === 'inspect'}
							onclick={() => (tool = 'inspect')}><CrosshairIcon class="size-4" />Voxel</button
						>
						<button
							class="button button-ghost"
							aria-pressed={tool === 'pan'}
							onclick={() => (tool = 'pan')}><HandIcon class="size-4" />Pan</button
						>
						<button class="button button-ghost" onclick={resetView}
							><RotateCcwIcon class="size-4" />Reset</button
						>
					</div>
				</div>
				<div class="image-stage">
					<button
						class="image-interaction"
						class:panning={tool === 'pan'}
						aria-label="Native oblique brain image. In voxel mode, click to select or use arrow keys. In pan mode, drag or use arrow keys."
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
							style:width="min(86cqw, {86 * aspect}cqh)"
							style:aspect-ratio={aspect}
							style:transform="translate({panX}px, {panY}px) scale({zoom})"
						>
							<IvimImage
								volume={volumes[bIndex]}
								{dataset}
								{slice}
								{center}
								{width}
								label="Native slice {slice + 1}, volume {bIndex + 1}, b={B_VALUES[bIndex]} s/mm²"
							/>
							<svg
								class="crosshair"
								viewBox="0 0 {NX} {NY}"
								preserveAspectRatio="none"
								aria-hidden="true"
								><circle cx={x + 0.5} cy={y + 0.5} r="2.4" /><path
									d="M {x - 4} {y + 0.5} h 3 M {x + 2} {y + 0.5} h 3 M {x + 0.5} {y - 4} v 3 M {x +
										0.5} {y + 2} v 3"
								/></svg
							>
						</div>
					</button>
					<div class="stage-label top-3 left-3">
						IN-VIVO / IVIM<br />Vol {bIndex + 1} · b {B_VALUES[bIndex]} s/mm²
					</div>
					<div class="stage-label top-3 right-3 text-right">
						NATIVE · z {slice}<br />{Math.round(zoom * 100)}%
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
					<fieldset class="space-y-3">
						<legend class="mb-3 text-sm font-semibold">Acquisition</legend>
						<NumericControl
							label="Slice"
							value={slice + 1}
							min={1}
							max={SLICES}
							detail="of {SLICES}"
							onchange={(value) => (slice = value - 1)}
						/>
						<NumericControl
							label="Volume"
							value={bIndex + 1}
							min={1}
							max={B_VALUES.length}
							detail="b = {B_VALUES[bIndex]} s/mm²"
							onchange={(value) => (bIndex = value - 1)}
						/>
					</fieldset>
					<fieldset class="space-y-3 border-t pt-3">
						<legend class="pr-3 text-sm font-semibold">Display</legend>
						<NumericControl
							label="Zoom"
							value={zoom}
							min={1}
							max={4}
							step={0.1}
							detail="×"
							onchange={(value) => (zoom = value)}
						/>
						<NumericControl
							label="Window"
							step={0.1}
							value={width}
							min={1}
							max={2 * (dataset.signalRange[1] - dataset.signalRange[0])}
							detail="a.u."
							onchange={(value) => (width = value)}
						/>
						<NumericControl
							label="Level"
							step={0.1}
							value={center}
							min={dataset.signalRange[0]}
							max={dataset.signalRange[1]}
							detail="a.u."
							onchange={(value) => (center = value)}
						/>
					</fieldset>
					<details class="text-xs leading-5 text-muted-foreground">
						<summary class="cursor-pointer font-medium">Navigation & native orientation</summary>
						<p class="mt-2">
							{tool === 'inspect'
								? 'Click the image to inspect a voxel. Arrow keys move the selection when the image is focused.'
								: 'Drag to pan. Arrow keys pan when the image is focused.'} Reset restores zoom, pan,
							window and level. Coordinates are original NIfTI indices. Oblique native plane, not a resliced
							anatomical axial view. Increasing x / y / z points approximately {dataset.axisCodes.join(
								' / '
							)}; x runs right and y runs down on screen. No reorientation.
						</p>
					</details>
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
						<div class="signal-heading">
							<h2 class="text-sm font-semibold">Voxel signal</h2>
							<p class="text-xs text-muted-foreground" aria-label="Voxel coordinates">
								({x}, {y}, {slice})
							</p>
						</div>
						<p class="signal-highlight mt-2 text-sm font-semibold">
							{signals[bIndex].toFixed(1)} a.u.
							<span class="text-xs font-normal text-muted-foreground"
								>/ volume {bIndex + 1} · b {B_VALUES[bIndex]}</span
							>
						</p>
					</div>
					<svg
						class="signal-chart w-full"
						viewBox="0 0 420 308"
						role="img"
						aria-label="Selected voxel signal over all acquired volumes. Values are in the table below."
						><title>Acquired voxel signal, not a fitted curve</title>
						{#each [signalMin, (signalMin + signalMax) / 2, signalMax] as tick (tick)}<line
								x1="70"
								x2="396"
								y1={signalY(tick)}
								y2={signalY(tick)}
								stroke="var(--border)"
							/><text x="62" y={signalY(tick) + 4} text-anchor="end">{tick.toPrecision(3)}</text
							>{/each}
						<text x="70" y="20">Signal (a.u.)</text><line
							x1="70"
							x2="396"
							y1="260"
							y2="260"
							stroke="var(--muted-foreground)"
						/>
						{#each [0, maxB / 4, maxB / 2, maxB * 0.75, maxB] as tick (tick)}<text
								x={70 + (tick / maxB) * 326}
								y="281"
								text-anchor="middle">{tick}</text
							>{/each}<text x="233" y="301" text-anchor="middle">b-value (s/mm²)</text>
						{#each signals as value, i (i)}<circle
								cx={70 + (B_VALUES[i] / maxB) * 326}
								cy={signalY(value)}
								r={i === bIndex ? 6 : 3.5}
								fill="none"
								stroke="currentColor"
								stroke-width={i === bIndex ? 2.5 : 1.5}
								><title>Volume {i + 1} · b {B_VALUES[i]} s/mm² · {value} a.u.</title></circle
							>{/each}
					</svg>
					<div class="px-3 pb-3">
						<p class="text-[11px] text-muted-foreground">
							{signals.length} acquired samples. Larger ring: selected volume. Repeated b-values remain
							separate; coincident samples may overlap. No averaging or fitting.
						</p>
						<details class="mt-3 text-xs">
							<summary class="cursor-pointer font-medium">Signal values</summary>
							<table class="mt-2 w-full text-right">
								<caption class="sr-only">Selected voxel values</caption><thead
									><tr
										><th>Vol</th><th class="py-1 text-left">b (s/mm²)</th><th>Signal (a.u.)</th></tr
									></thead
								><tbody
									>{#each signals as value, i (i)}<tr class="border-t"
											><td>{i + 1}</td><td class="py-1 text-left">{B_VALUES[i]}</td><td>{value}</td
											></tr
										>{/each}</tbody
								>
							</table>
						</details>
					</div>
				</section>
				<section class="card p-3">
					<h2 class="flex items-center gap-2 text-base font-semibold">
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
						class="button button-primary mt-2 w-full"
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
										>Vol {view.b + 1} · b {B_VALUES[view.b]} · Slice {view.z + 1} · ({view.x}, {view.y})</span
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
				<details class="card p-4 text-xs leading-6 text-muted-foreground">
					<summary class="cursor-pointer text-sm font-semibold text-foreground"
						>Dataset & acquisition metadata</summary
					>
					<p class="mt-3 font-medium text-foreground">{dataset.name}</p>
					<p>
						<strong>Public in-vivo brain. Not for diagnosis.</strong> Viewing only; no fitting or uploads.
						Saved coordinates and notes stay in this browser.
					</p>
					<p>{NX} × {NY} × {SLICES} voxels · {B_VALUES.length} volumes</p>
					<p>{dataset.spacing.map((s) => s.toFixed(6)).join(' × ')} {dataset.spatialUnit}</p>
					<p>
						{new Set(B_VALUES).size} distinct b-values: {[...new Set(B_VALUES)].join(', ')} s/mm²
					</p>
					<p>Selected volume {bIndex + 1} b-vector: {dataset.bVectors[bIndex].join(', ')}</p>
					<p>
						Native oblique plane · axes {dataset.axisCodes.join(' / ')}. Original NIfTI indices
						(zero-based); displayed slice and volume numbers start at 1.
					</p>
					<p>
						Previews: slice {Math.floor(SLICES / 2) + 1}, default window. Repeated b-values are
						separate acquired volumes.
					</p>
					<a class="underline" href="https://doi.org/10.5281/zenodo.14605039"
						>OSIPI TF2.4 · Zenodo 14605039 · CC BY 4.0</a
					>
					<a class="ml-3 underline" href={resolve('/about')}>About OSIPY</a>
				</details>
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
		padding: 12px;
		gap: 12px;
	}
	.workspace-title {
		min-width: 0;
	}
	.dataset-title {
		display: inline-block;
	}
	.dataset-title::first-letter {
		text-transform: uppercase;
	}
	.research-badge {
		margin-left: auto;
		white-space: nowrap;
	}
	.signal-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
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
		grid-template-columns: 240px minmax(0, 1fr) 340px;
		gap: 12px;
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
		max-height: 48%;
		border-top: 1px solid var(--border);
		container-type: inline-size;
	}
	.viewport-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
	}
	.viewer-tools .button {
		padding-inline: 10px;
		font-size: 12px;
	}
	.quick-filters {
		display: flex;
		gap: 4px;
		margin-top: 12px;
	}
	.quick-filters .button {
		flex: 1;
		padding-inline: 6px;
		font-size: 12px;
	}
	.signal-chart,
	.signal-highlight {
		color: var(--selection);
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
		border-color: var(--selection);
		background: var(--selection-surface);
	}
	.series-card.selected {
		box-shadow: 0 0 0 1px var(--selection);
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
		width: 80px;
		flex-shrink: 0;
	}
	.image-stage {
		position: relative;
		flex: 1;
		min-height: 0;
		container-type: size;
		background: #080808;
		color: #e0e0e0;
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
		stroke: var(--selection);
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
	svg text {
		font:
			11px ui-sans-serif,
			sans-serif;
		fill: var(--muted-foreground);
	}
	@media (min-width: 1200px) {
		.workspace {
			grid-template-columns: clamp(260px, 19vw, 300px) minmax(0, 1fr) clamp(360px, 29vw, 440px);
		}
	}
	@media (max-width: 899px) {
		svg text {
			font-size: 14px;
		}
		.workspace-title {
			font-size: 12px;
			width: 100%;
		}
		.dataset-badges {
			gap: 4px;
		}
		.viewport-header {
			padding: 4px 8px;
		}
		.viewport-header h2 {
			font-size: 12px;
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
			padding-inline: 4px;
			gap: 4px;
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
		.inspector-panel :is(button, summary) {
			min-height: 44px;
		}
		.series-panel .button {
			min-height: 44px;
			min-width: 44px;
		}
		.series-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.series-grid.list {
			grid-template-columns: 1fr;
		}
	}
</style>
