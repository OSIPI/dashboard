<script lang="ts">
	import { on } from 'svelte/events';
	import { planeWorld, type Plane, type Point } from '$lib/spatial';
	let {
		plane,
		pixels,
		world,
		name,
		edges,
		onpick,
		zoom = 1,
		pan = { x: 0, y: 0 },
		smooth = false,
		panMode = false,
		onzoom,
		onpan
	}: {
		plane: Plane;
		pixels: Uint8ClampedArray;
		world: Point;
		name: string;
		edges: readonly string[];
		onpick: (point: Point) => void;
		zoom?: number;
		pan?: { x: number; y: number };
		smooth?: boolean;
		panMode?: boolean;
		onzoom?: (value: number) => void;
		onpan?: (value: { x: number; y: number }) => void;
	} = $props();
	let canvas: HTMLCanvasElement;
	let stageWidth = $state(0),
		stageHeight = $state(0);
	const ratio = $derived(Math.abs(plane.horizontal / plane.vertical));
	const size = $derived(Math.max(0, Math.min(stageWidth - 32, (stageHeight - 32) * ratio)));
	const u = $derived((world[plane.u] - plane.origin[plane.u]) / plane.horizontal);
	const v = $derived((world[plane.v] - plane.origin[plane.v]) / plane.vertical);
	let drag: { id: number; x: number; y: number; pan: { x: number; y: number } } | undefined;
	let dragged = false;
	function wheelZoom(node: HTMLElement) {
		const destroy = on(
			node,
			'wheel',
			(event) => {
				if (!onzoom || !event.deltaY) return;
				event.preventDefault();
				onzoom(Math.max(1, Math.min(8, zoom * Math.exp(-event.deltaY * 0.001))));
			},
			{ passive: false }
		);
		return { destroy };
	}
	$effect(() => {
		canvas
			?.getContext('2d')
			?.putImageData(new ImageData(new Uint8ClampedArray(pixels), plane.width, plane.height), 0, 0);
	});
	function pick(event: MouseEvent) {
		if (!event.detail || dragged || panMode) {
			dragged = false;
			return;
		}
		const bounds =
			event.currentTarget instanceof HTMLElement
				? event.currentTarget.getBoundingClientRect()
				: null;
		if (bounds)
			onpick(
				planeWorld(
					plane,
					(event.clientX - bounds.left) / bounds.width,
					(event.clientY - bounds.top) / bounds.height
				)
			);
	}
</script>

<div
	class="relative grid min-h-0 flex-1 place-items-center overflow-hidden"
	bind:clientWidth={stageWidth}
	bind:clientHeight={stageHeight}
>
	<button
		use:wheelZoom
		class="relative block bg-black p-0 focus-visible:outline-2 focus-visible:outline-selection {panMode
			? 'cursor-grab touch-none'
			: 'cursor-crosshair'}"
		style:width="{size}px"
		style:aspect-ratio={ratio}
		style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})"
		aria-label="Select voxel in {name} view. Arrow keys move within plane; Page Up and Page Down move through it."
		onpointerdown={(event) => {
			if (!onpan || (!event.shiftKey && !panMode) || event.button !== 0) return;
			dragged = false;
			drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: { ...pan } };
			event.currentTarget.setPointerCapture(event.pointerId);
		}}
		onpointermove={(event) => {
			if (!drag || drag.id !== event.pointerId) return;
			const dx = event.clientX - drag.x,
				dy = event.clientY - drag.y;
			if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
			onpan?.({ x: drag.pan.x + dx, y: drag.pan.y + dy });
		}}
		onpointerup={() => {
			drag = undefined;
		}}
		onpointercancel={() => {
			drag = undefined;
		}}
		onlostpointercapture={() => {
			drag = undefined;
		}}
		onclick={pick}
		onkeydown={(event) => {
			const point = [...world] as Point;
			const stepU = plane.horizontal / plane.width,
				stepV = plane.vertical / plane.height;
			if (event.key === 'ArrowLeft') point[plane.u] -= stepU;
			else if (event.key === 'ArrowRight') point[plane.u] += stepU;
			else if (event.key === 'ArrowUp') point[plane.v] -= stepV;
			else if (event.key === 'ArrowDown') point[plane.v] += stepV;
			else if (event.key === 'PageUp')
				point[plane.axis] += Math.min(Math.abs(stepU), Math.abs(stepV));
			else if (event.key === 'PageDown')
				point[plane.axis] -= Math.min(Math.abs(stepU), Math.abs(stepV));
			else return;
			event.preventDefault();
			onpick(point);
		}}
	>
		<canvas
			bind:this={canvas}
			width={plane.width}
			height={plane.height}
			class="block size-full {smooth ? '[image-rendering:auto]' : '[image-rendering:pixelated]'}"
			aria-label="{name} nearest-neighbour reformat">{name} slice</canvas
		>
		<span
			class="pointer-events-none absolute inset-y-0 w-px bg-selection/70"
			style:left="{u * 100}%"
		></span>
		<span class="pointer-events-none absolute inset-x-0 h-px bg-selection/70" style:top="{v * 100}%"
		></span>
		<span class="pointer-events-none absolute top-1/2 -left-3 -translate-y-1/2 text-xs"
			>{edges[0]}</span
		>
		<span class="pointer-events-none absolute top-1/2 -right-3 -translate-y-1/2 text-xs"
			>{edges[1]}</span
		>
		<span class="pointer-events-none absolute -top-3 left-1/2 text-xs">{edges[2]}</span>
		<span class="pointer-events-none absolute -bottom-3 left-1/2 text-xs">{edges[3]}</span>
	</button>
</div>
