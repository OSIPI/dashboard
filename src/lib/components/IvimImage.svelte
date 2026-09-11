<script lang="ts">
	import { windowPixel, type Dataset } from '$lib/ivim';
	let {
		volume,
		dataset,
		slice,
		center = 500,
		width = 1000,
		label
	}: {
		volume: Int16Array;
		dataset: Dataset;
		slice: number;
		center?: number;
		width?: number;
		label: string;
	} = $props();
	let canvas: HTMLCanvasElement;
	$effect(() => {
		const context = canvas?.getContext('2d');
		if (!context) return;
		const [nx, ny] = dataset.dimensions;
		const image = context.createImageData(nx, ny);
		const offset = slice * nx * ny;
		for (let i = 0; i < nx * ny; i++) {
			const value = windowPixel(
				volume[offset + i] * dataset.slope + dataset.intercept,
				center,
				width
			);
			image.data[i * 4] = value;
			image.data[i * 4 + 1] = value;
			image.data[i * 4 + 2] = value;
			image.data[i * 4 + 3] = 255;
		}
		context.putImageData(image, 0, 0);
	});
</script>

<canvas
	class="block size-full [image-rendering:pixelated]"
	bind:this={canvas}
	width={dataset.dimensions[0]}
	height={dataset.dimensions[1]}
	aria-label={label}>{label}</canvas
>
