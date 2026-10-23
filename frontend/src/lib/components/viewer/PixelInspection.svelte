<script lang="ts">
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { displayGeometry, nativeToDisplay, sourceWorld } from '$lib/display-coordinates';
	import type { Display } from '$lib/workspace';
	import IvimImage from '../IvimImage.svelte';
	let {
		dataset,
		volume,
		x,
		y,
		slice,
		index,
		view,
		magnification,
		imageWidth,
		imageHeight,
		windowMessage = '',
		showWindow = false
	}: {
		dataset: Dataset;
		volume: VoxelVolume;
		x: number;
		y: number;
		slice: number;
		index: number;
		view: Display;
		magnification: number;
		imageWidth: number;
		imageHeight: number;
		windowMessage?: string;
		showWindow?: boolean;
	} = $props();
	const value = $derived(
		volume[voxelIndex(x, y, slice, dataset.dimensions)] * dataset.slope + dataset.intercept
	);
	const world = $derived(sourceWorld(dataset, x, y, slice));
	const geometry = $derived(displayGeometry(dataset, view));
	const point = $derived(
		nativeToDisplay([(x + 0.5) / dataset.dimensions[0], (y + 0.5) / dataset.dimensions[1]], view)
	);
	const width = $derived(imageWidth * view.zoom * magnification);
	const height = $derived(imageHeight * view.zoom * magnification);
</script>

{#if magnification > 0}
	<div
		data-inspection-lens
		class="pointer-events-none absolute top-[min(2rem,10cqh)] right-2 z-10 size-[min(8rem,40cqw,50cqh)] overflow-hidden rounded-md border border-white/50 bg-[#080808] shadow-lg"
		aria-label="Local inspection lens, {magnification} times current image magnification"
	>
		<div
			class="absolute"
			style:width="{width}px"
			style:height="{height}px"
			style:left="calc(50% - {point[0] * width}px)"
			style:top="calc(50% - {point[1] * height}px)"
		>
			<div
				class="absolute top-1/2 left-1/2"
				style:width="{geometry.width}%"
				style:height="{geometry.height}%"
				style:transform={geometry.transform}
			>
				<IvimImage
					{dataset}
					{volume}
					{slice}
					center={view.center}
					width={view.width}
					invert={view.invert}
					label="Magnified source slice, nearest-neighbor display"
				/>
			</div>
		</div>
		<span class="absolute inset-0 grid place-items-center text-selection" aria-hidden="true">+</span
		>
		<span class="absolute right-0 bottom-0 left-0 bg-black/80 px-1 py-0.5 text-center text-[10px]"
			>Lens {magnification}× · global {view.zoom.toFixed(1)}×</span
		>
	</div>
{/if}
<span
	data-pixel-probe
	class="pointer-events-none absolute right-2 bottom-1.5 left-2 text-left font-mono text-[10px] leading-normal break-words [text-shadow:0_1px_3px_#000]"
>
	{#if showWindow}<span class="block"
			>W {Number(view.width.toPrecision(5))} · L {Number(view.center.toPrecision(5))}</span
		>{/if}
	{#if windowMessage}<span class="block" role="status">{windowMessage}</span>{/if}
	<span class="block">Source intensity: {value} · units unknown</span>
	<span class="block"
		>Index (0-based): ({x}, {y}, {slice}) · volume {index + 1} · {view.zoom.toFixed(1)}×</span
	>
	<span class="block"
		>{dataset.xformCode === 0 ? 'Unspecified frame' : 'RAS'}: ({world.join(', ')}) {dataset.spatialUnit ||
			'(spatial units unknown)'}</span
	>
</span>
