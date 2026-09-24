<script lang="ts">
	import { onDestroy } from 'svelte';
	import Header from '$lib/components/ui/Header.svelte';
	import SpatialSlice from '$lib/components/viewer/SpatialSlice.svelte';
	import NumericControl from '$lib/components/NumericControl.svelte';
	import { loadLocal } from '$lib/imports/load-local';
	import { FILE_LIMIT } from '$lib/imports/nifti';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { autoWindow } from '$lib/workspace';
	import {
		createGeometry,
		createPlane,
		nearestVoxel,
		reslice,
		toWorld,
		VIEWS,
		type Point
	} from '$lib/spatial';

	let dataset = $state<Dataset>();
	let volumes = $state.raw<VoxelVolume[]>([]);
	let voxel = $state<Point>([0, 0, 0]);
	let volume = $state(0);
	let center = $state(0);
	let width = $state(1);
	let zoom = $state(1);
	let pans = $state(VIEWS.map(() => ({ x: 0, y: 0 })));
	let smooth = $state(false);
	let panMode = $state(false);
	let mobileView = $state<(typeof VIEWS)[number]['name']>('Axial');
	let busy = $state(false);
	let error = $state('');
	let controller: AbortController | undefined;
	const geometry = $derived(dataset ? createGeometry(dataset) : undefined);
	const world = $derived(geometry ? toWorld(geometry, voxel) : undefined);
	const planes = $derived(
		geometry && world ? VIEWS.map((view) => createPlane(geometry, view.axis, world)) : []
	);
	// TODO: Offer trilinear world-space reslicing and distance annotations; the current
	// smooth option only scales rendered pixels and must not be mistaken for new detail.
	const pixels = $derived.by(() => {
		const image = dataset,
			space = geometry,
			samples = volumes[volume];
		return image && space && samples
			? planes.map((plane) => reslice(samples, image, space, plane, center, width))
			: [];
	});
	const sample = $derived(
		dataset && volumes[volume]
			? volumes[volume][voxelIndex(...voxel, dataset.dimensions)] * dataset.slope +
					dataset.intercept
			: undefined
	);
	onDestroy(() => controller?.abort());
	function pick(point: Point) {
		if (!geometry) return;
		const selected = nearestVoxel(geometry, point);
		if (selected) voxel = selected;
	}
	function auto(robust: boolean) {
		if (!dataset || !volumes[volume]) return;
		({ center, width } = autoWindow(volumes[volume], dataset, undefined, robust));
	}

	async function open(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		controller?.abort();
		const current = new AbortController();
		controller = current;
		error = '';
		busy = true;
		try {
			if (!/\.nii(?:\.gz)?$/i.test(file.name)) throw new Error('Choose a .nii or .nii.gz file.');
			const result = await loadLocal(file, undefined, undefined, FILE_LIMIT, current.signal);
			if (current.signal.aborted) return;
			volumes = result.volumes;
			dataset = result.dataset;
			volume = 0;
			voxel = result.dataset.dimensions.slice(0, 3).map((n) => Math.floor(n / 2)) as Point;
			[center, width] = result.dataset.window;
			zoom = 1;
			pans = VIEWS.map(() => ({ x: 0, y: 0 }));
		} catch (cause) {
			if (!current.signal.aborted)
				error = cause instanceof Error ? cause.message : 'Could not open this image.';
		} finally {
			if (controller === current) {
				busy = false;
				controller = undefined;
			}
		}
	}
</script>

<svelte:head>
	<title>NIfTI viewer | OSIPY</title>
	<meta
		name="description"
		content="View a local 3D or 4D NIfTI image without uploading it or providing diffusion metadata."
	/>
</svelte:head>

<Header><span class="text-sm font-semibold">Standalone NIfTI viewer</span></Header>
<main class="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-5">
	<div class="mx-auto flex w-full max-w-6xl shrink-0 flex-wrap items-center gap-3 pb-3">
		<label
			class="button button-outline relative cursor-pointer overflow-hidden focus-within:ring-2 focus-within:ring-selection"
		>
			{dataset ? 'Open another image' : 'Open NIfTI image'}
			<input
				class="absolute inset-0 cursor-pointer opacity-0"
				type="file"
				accept=".nii,.nii.gz"
				aria-label="Open NIfTI image"
				onchange={open}
			/>
		</label>
		{#if busy}<span role="status" class="text-sm text-muted-foreground">Opening image…</span><button
				class="button button-ghost"
				onclick={() => controller?.abort()}>Cancel</button
			>{/if}
		<span class="text-xs text-muted-foreground"
			>3D/4D scalar .nii or .nii.gz · browser-local · no b-values required</span
		>
	</div>
	{#if error}<p
			role="alert"
			class="mx-auto mb-3 w-full max-w-6xl rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
		>
			{error}
		</p>{/if}
	{#if dataset}
		<div class="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 md:flex-row">
			<section
				class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-[#080808] text-[#ddd]"
				aria-label="Linked NIfTI views"
			>
				<nav class="flex shrink-0 border-b border-white/15 sm:hidden" aria-label="Slice planes">
					{#each VIEWS as view (view.name)}<button
							class="button button-ghost h-11 flex-1"
							aria-pressed={mobileView === view.name}
							onclick={() => (mobileView = view.name)}>{view.name}</button
						>{/each}
				</nav>
				<div class="grid min-h-0 flex-1 grid-cols-1 gap-px bg-white/15 sm:grid-cols-3">
					{#each VIEWS as view, i (view.name)}
						<div
							class="min-h-0 min-w-0 flex-col bg-[#080808] {mobileView === view.name
								? 'flex'
								: 'hidden sm:flex'}"
							aria-label="{view.name} view"
						>
							<div class="flex shrink-0 justify-between px-3 py-2 text-xs">
								<strong>{view.name}</strong><span
									>{voxel[view.axis] + 1} / {dataset.dimensions[view.axis]} · {world?.[
										view.axis
									].toFixed(1)} mm</span
								>
							</div>
							{#if planes[i] && pixels[i] && world}<SpatialSlice
									plane={planes[i]}
									pixels={pixels[i]}
									{world}
									name={view.name}
									edges={view.edges}
									onpick={pick}
									{zoom}
									pan={pans[i]}
									{smooth}
									{panMode}
									onzoom={(value) => (zoom = value)}
									onpan={(value) => (pans = pans.map((pan, j) => (j === i ? value : pan)))}
								/>{/if}
						</div>
					{/each}
				</div>
			</section>
			<aside
				class="max-h-[38%] w-full shrink-0 space-y-4 overflow-auto rounded-lg border bg-card p-4 md:max-h-none md:w-64"
				aria-label="Image controls"
			>
				<h1 class="text-sm font-semibold break-all">{dataset.name}</h1>
				<p class="text-xs text-muted-foreground">
					{dataset.dimensions.slice(0, 3).join(' × ')} voxels · {dataset.dimensions[3]}
					{dataset.dimensions[3] === 1 ? 'volume' : 'volumes'}<br />Spacing {dataset.spacing
						.map((n) => n.toFixed(2))
						.join(' × ')} mm<br />Orientation {dataset.axisCodes.join(' / ')} · {dataset.dtype}
				</p>
				<p class="text-xs">
					Selected voxel: {voxel.map((n) => n + 1).join(' / ')}<br />RAS: {world
						?.map((n) => n.toFixed(1))
						.join(' / ')} mm<br />Value: {sample?.toPrecision(6) ?? '—'}
				</p>
				{#each ['X', 'Y', 'Z'] as axis, i (axis)}<NumericControl
						label="Voxel {axis}"
						value={voxel[i] + 1}
						min={1}
						max={dataset.dimensions[i]}
						onchange={(value) => (voxel = voxel.map((n, j) => (j === i ? value - 1 : n)) as Point)}
					/>{/each}
				{#if dataset.dimensions[3] > 1}<label class="block text-sm"
						>Volume {volume + 1} / {dataset.dimensions[3]}
						<input
							class="mt-2 w-full accent-selection"
							type="range"
							min="0"
							max={dataset.dimensions[3] - 1}
							step="1"
							bind:value={volume}
						/>
					</label>{/if}
				<label class="block text-sm"
					>Zoom {zoom.toFixed(1)}×<input
						class="mt-2 w-full accent-selection"
						type="range"
						min="1"
						max="8"
						step="0.1"
						bind:value={zoom}
					/></label
				>
				<div class="flex flex-wrap gap-2">
					<button
						class="button button-outline"
						aria-pressed={panMode}
						onclick={() => (panMode = !panMode)}>{panMode ? 'Pan on' : 'Pan off'}</button
					>
					<button
						class="button button-outline"
						onclick={() => {
							zoom = 1;
							pans = VIEWS.map(() => ({ x: 0, y: 0 }));
						}}>Reset view</button
					><label class="flex items-center gap-2 text-xs"
						><input type="checkbox" bind:checked={smooth} /> Smooth screen scaling</label
					>
				</div>
				<label class="block text-sm"
					>Window center
					<input
						class="input mt-1 w-full px-2"
						type="number"
						step="any"
						value={center}
						onchange={(e) => {
							const n = e.currentTarget.valueAsNumber;
							if (Number.isFinite(n)) center = n;
						}}
					/>
				</label>
				<label class="block text-sm"
					>Window width
					<input
						class="input mt-1 w-full px-2"
						type="number"
						min="0"
						step="any"
						value={width}
						onchange={(e) => {
							const n = e.currentTarget.valueAsNumber;
							if (Number.isFinite(n) && n > 0) width = n;
						}}
					/>
				</label>
				<button
					class="button button-outline"
					onclick={() => {
						if (dataset) [center, width] = dataset.window;
					}}>Reset window</button
				>
				<div class="flex flex-wrap gap-2">
					<button class="button button-outline" onclick={() => auto(true)}>Auto 2–98%</button
					><button class="button button-outline" onclick={() => auto(false)}>Full range</button>
				</div>
				<p class="text-xs leading-5 text-muted-foreground">
					Click a plane to move all crosshairs. Arrow keys move within it; Page Up/Down steps
					through. Scroll over a plane to zoom; enable Pan to drag with mouse or touch (or
					Shift-drag). Smooth scaling changes the screen display only; reformatting uses
					nearest-neighbor samples.
				</p>
				<p class="text-xs leading-5 text-muted-foreground">
					Viewing only. No data is saved or sent to the analysis companion. Reloading clears the
					image.
				</p>
			</aside>
		</div>
	{:else}
		<div
			class="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground"
		>
			Choose a NIfTI image to browse its slices and volumes.
		</div>
	{/if}
</main>
