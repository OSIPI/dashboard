<script lang="ts">
	import { SIZE, windowPixel } from '$lib/ivim';
	let {
		volume,
		slice,
		center = 500,
		width = 1000,
		label
	}: {
		volume: Float32Array;
		slice: number;
		center?: number;
		width?: number;
		label: string;
	} = $props();
	let canvas: HTMLCanvasElement;
	$effect(() => {
		const context = canvas?.getContext('2d');
		if (!context) return;
		const image = context.createImageData(SIZE, SIZE);
		const offset = slice * SIZE * SIZE;
		for (let i = 0; i < SIZE * SIZE; i++) {
			const value = windowPixel(volume[offset + i], center, width);
			image.data[i * 4] = value;
			image.data[i * 4 + 1] = value;
			image.data[i * 4 + 2] = value;
			image.data[i * 4 + 3] = 255;
		}
		context.putImageData(image, 0, 0);
	});
</script>

<canvas bind:this={canvas} width={SIZE} height={SIZE} aria-label={label}>{label}</canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
	}
</style>
