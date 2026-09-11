<script lang="ts">
	import { onMount } from 'svelte';
	import type { Dataset } from '$lib/ivim';
	import type { Display } from '$lib/workspace';
	import {
		createGeometry,
		createPlane,
		nearestVoxel,
		reslice,
		toWorld,
		VIEWS,
		type Point
	} from '$lib/spatial';
	import type { SpatialRenderer } from '$lib/spatial-renderer';
	import SpatialSlice from './SpatialSlice.svelte';
	import NumericControl from '../NumericControl.svelte';
	let {
		dataset,
		volume,
		active,
		voxel,
		display,
		onselect
	}: {
		dataset: Dataset;
		volume: import('$lib/ivim').VoxelVolume;
		active: number;
		voxel: Point;
		display: Display;
		onselect: (x: number, y: number, z: number) => void;
	} = $props();
	const geometry = $derived(createGeometry(dataset));
	const world = $derived(toWorld(geometry, voxel));
	const planes = $derived(VIEWS.map((view) => createPlane(geometry, view.axis, world)));
	const pixels = $derived(
		planes.map((plane) => reslice(volume, dataset, geometry, plane, display.center, display.width))
	);
	let container: HTMLDivElement;
	let engine = $state.raw<SpatialRenderer>();
	let error = $state('');
	let mobileView = $state('3D');
	let selectionOpen = $state(false);
	function pick(point: Point) {
		const next = nearestVoxel(geometry, point);
		if (next) onselect(...next);
	}
	$effect(() => {
		engine?.update(planes, pixels, world);
	});
	onMount(() => {
		let disposed = false;
		let renderer: SpatialRenderer | undefined;
		import('$lib/spatial-renderer')
			.then(({ createSpatialRenderer }) => {
				if (disposed) return;
				const probe = document.createElement('canvas');
				const gl = probe.getContext('webgl2');
				if (!gl) throw new Error('WebGL 2 is unavailable. Linked slice views remain usable.');
				gl.getExtension('WEBGL_lose_context')?.loseContext();
				renderer = createSpatialRenderer(container, geometry, pick);
				renderer.update(planes, pixels, world);
				renderer.reset();
				engine = renderer;
			})
			.catch((reason) => {
				if (!disposed)
					error = reason instanceof Error ? reason.message : '3D rendering could not start.';
			});
		return () => {
			disposed = true;
			renderer?.delete();
		};
	});
</script>

<div
	class="flex min-h-0 flex-1 flex-col bg-[#080808] text-[#e0e0e0]"
	aria-label="Linked spatial viewer"
>
	<div
		class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/15 px-3 py-1 text-[11px]"
	>
		<span>Volume {active + 1} · b={dataset.bValues[active]}</span>
		<span class="text-[#a5a5a5]">RAS+ · nearest-neighbour</span>
	</div>
	<nav class="flex shrink-0 border-b border-white/15 min-[900px]:hidden" aria-label="Spatial views">
		{#each ['3D', ...VIEWS.map((view) => view.name)] as name (name)}
			<button
				class="button button-ghost h-11 min-w-0 flex-1 px-1 text-xs"
				aria-pressed={mobileView === name}
				onclick={() => (mobileView = name)}>{name}</button
			>
		{/each}
	</nav>
	<div
		class="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-px bg-white/15 min-[900px]:grid-cols-2 min-[900px]:grid-rows-2"
	>
		<section
			class="min-h-0 min-w-0 flex-col bg-[#080808] {mobileView === '3D'
				? 'flex'
				: 'hidden min-[900px]:flex'}"
			aria-label="3D slice planes"
		>
			<div class="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1 text-xs">
				<strong class="mr-auto">3D planes</strong>
				<button
					class="button button-ghost h-8 px-2 max-[899px]:h-11"
					aria-label="Rotate 3D left"
					disabled={!engine}
					onclick={() => engine?.rotate(-15)}>↶</button
				>
				<button
					class="button button-ghost h-8 px-2 max-[899px]:h-11"
					aria-label="Rotate 3D right"
					disabled={!engine}
					onclick={() => engine?.rotate(15)}>↷</button
				>
				<button
					class="button button-ghost h-8 px-2 max-[899px]:h-11"
					aria-label="Zoom 3D out"
					disabled={!engine}
					onclick={() => engine?.zoom(1 / 1.2)}>−</button
				>
				<button
					class="button button-ghost h-8 px-2 max-[899px]:h-11"
					aria-label="Zoom 3D in"
					disabled={!engine}
					onclick={() => engine?.zoom(1.2)}>+</button
				>
				<button
					class="button button-ghost h-8 px-2 text-[11px] max-[899px]:h-11"
					disabled={!engine}
					onclick={() => engine?.reset()}>Reset 3D</button
				>
			</div>
			<div class="relative min-h-0 flex-1">
				<div
					bind:this={container}
					class="absolute inset-0 touch-none overflow-hidden [&_canvas]:block"
					role="img"
					aria-label="Interactive 3D scan. Drag to orbit, Shift-drag to pan, scroll or pinch to zoom. Click a plane to select a voxel."
				></div>
				{#if error}<p role="alert" class="absolute inset-0 overflow-auto bg-[#080808] p-4 text-sm">
						{error}
					</p>
				{:else if !engine}<p
						role="status"
						class="pointer-events-none absolute inset-0 grid place-items-center text-xs"
					>
						Loading 3D renderer…
					</p>{/if}
			</div>
			<p class="shrink-0 px-2 py-1 text-[10px] text-[#a5a5a5]">
				<span class="max-[899px]:hidden"
					>Drag: orbit · Shift-drag: pan · scroll: zoom · click plane: voxel</span
				>
				<span class="min-[900px]:hidden">Drag: orbit · pinch: zoom · tap plane: voxel</span>
			</p>
		</section>
		{#each VIEWS as view, i (view.axis)}
			<section
				class="min-h-0 min-w-0 flex-col bg-[#080808] {mobileView === view.name
					? 'flex'
					: 'hidden min-[900px]:flex'}"
				aria-label="{view.name} reformat"
			>
				<div class="flex shrink-0 justify-between px-2 py-2 text-xs">
					<strong>{view.name}</strong><span class="text-[#a5a5a5]"
						>{world[view.axis].toFixed(1)} mm</span
					>
				</div>
				<SpatialSlice
					plane={planes[i]}
					pixels={pixels[i]}
					{world}
					name={view.name}
					edges={view.edges}
					onpick={pick}
				/>
			</section>
		{/each}
	</div>
	<details
		class="max-h-[45%] shrink-0 overflow-auto border-t border-white/15 bg-card text-foreground"
		bind:open={selectionOpen}
	>
		<summary class="cursor-pointer px-3 py-2 text-xs max-[899px]:min-h-11"
			>Move linked planes · voxel {voxel.map((n) => n + 1).join(' / ')}</summary
		>
		<div class="@container space-y-2 px-3 pb-3">
			{#each ['Voxel X', 'Voxel Y', 'Voxel Z'] as label, i (label)}
				<NumericControl
					{label}
					value={voxel[i] + 1}
					min={1}
					max={dataset.dimensions[i]}
					onchange={(value) => {
						const next = [...voxel] as Point;
						next[i] = value - 1;
						onselect(...next);
					}}
				/>
			{/each}
			<p class="text-[11px] text-muted-foreground">
				Original voxel indices (1-based). Slice arrow keys move in-plane; Page Up/Down steps through
				the plane. Signal plots always use original acquired samples.
			</p>
		</div>
	</details>
</div>
