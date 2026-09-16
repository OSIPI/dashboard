<script lang="ts">
	import { windowPixel, type Dataset, type VoxelVolume } from '$lib/ivim';
	import { overlayColor, type ImageOverlay } from '$lib/analysis';
	import type { RoiOverlay } from '$lib/roi';
	let {
		volume,
		dataset,
		slice,
		center = 500,
		width = 1000,
		overlay,
		roi,
		thumbnail = false,
		label
	}: {
		volume: VoxelVolume;
		dataset: Dataset;
		slice: number;
		center?: number;
		width?: number;
		overlay?: ImageOverlay;
		roi?: RoiOverlay;
		thumbnail?: boolean;
		label: string;
	} = $props();
	let canvas: HTMLCanvasElement;
	const scale = $derived(
		thumbnail ? Math.min(1, 96 / Math.max(dataset.dimensions[0], dataset.dimensions[1])) : 1
	);
	const renderWidth = $derived(Math.max(1, Math.round(dataset.dimensions[0] * scale)));
	const renderHeight = $derived(Math.max(1, Math.round(dataset.dimensions[1] * scale)));
	$effect(() => {
		const context = canvas?.getContext('2d');
		if (!context) return;
		const [nx, ny] = dataset.dimensions;
		const image = context.createImageData(renderWidth, renderHeight);
		const offset = slice * nx * ny;
		for (let i = 0; i < renderWidth * renderHeight; i++) {
			const sourceIndex =
				offset +
				Math.min(ny - 1, Math.floor(((Math.floor(i / renderWidth) + 0.5) / renderHeight) * ny)) *
					nx +
				Math.min(nx - 1, Math.floor((((i % renderWidth) + 0.5) / renderWidth) * nx));
			const value = windowPixel(
				volume[sourceIndex] * dataset.slope + dataset.intercept,
				center,
				width
			);
			image.data[i * 4] = value;
			image.data[i * 4 + 1] = value;
			image.data[i * 4 + 2] = value;
			image.data[i * 4 + 3] = 255;
			if (
				overlay &&
				Number.isFinite(overlay.values[sourceIndex]) &&
				(overlay.showInvalid || overlay.valid[sourceIndex] === 1)
			) {
				const color = overlayColor(overlay.values[sourceIndex], overlay.minimum, overlay.maximum);
				for (let channel = 0; channel < 3; channel++)
					image.data[i * 4 + channel] = Math.round(
						value * (1 - overlay.opacity) + color[channel] * overlay.opacity
					);
			}
			if (roi?.mask[sourceIndex])
				for (let channel = 0; channel < 3; channel++)
					image.data[i * 4 + channel] = Math.round(
						image.data[i * 4 + channel] * (1 - roi.opacity) + roi.color[channel] * roi.opacity
					);
		}
		context.putImageData(image, 0, 0);
	});
</script>

<canvas
	class="block size-full [image-rendering:pixelated]"
	bind:this={canvas}
	width={renderWidth}
	height={renderHeight}
	aria-label={label}>{label}</canvas
>
