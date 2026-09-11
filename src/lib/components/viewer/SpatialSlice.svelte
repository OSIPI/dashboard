<script lang="ts">
	import { planeWorld, type Plane, type Point } from '$lib/spatial';
	let {
		plane,
		pixels,
		world,
		name,
		edges,
		onpick
	}: {
		plane: Plane;
		pixels: Uint8ClampedArray;
		world: Point;
		name: string;
		edges: readonly string[];
		onpick: (point: Point) => void;
	} = $props();
	let canvas: HTMLCanvasElement;
	let stageWidth = $state(0),
		stageHeight = $state(0);
	const ratio = $derived(Math.abs(plane.horizontal / plane.vertical));
	const size = $derived(Math.max(0, Math.min(stageWidth - 32, (stageHeight - 32) * ratio)));
	const u = $derived((world[plane.u] - plane.origin[plane.u]) / plane.horizontal);
	const v = $derived((world[plane.v] - plane.origin[plane.v]) / plane.vertical);
	$effect(() => {
		canvas
			?.getContext('2d')
			?.putImageData(new ImageData(new Uint8ClampedArray(pixels), plane.width, plane.height), 0, 0);
	});
	function pick(event: MouseEvent) {
		if (!event.detail) return;
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
	class="relative grid min-h-0 flex-1 place-items-center"
	bind:clientWidth={stageWidth}
	bind:clientHeight={stageHeight}
>
	<button
		class="relative block cursor-crosshair bg-black p-0 focus-visible:outline-2 focus-visible:outline-selection"
		style:width="{size}px"
		style:aspect-ratio={ratio}
		aria-label="Select voxel in {name} view. Arrow keys move within plane; Page Up and Page Down move through it."
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
			class="block size-full [image-rendering:pixelated]"
			aria-label="{name} nearest-neighbour reformat">{name} slice</canvas
		>
		<span
			class="pointer-events-none absolute inset-y-0 w-px bg-selection/70"
			style:left="{u * 100}%"
		></span>
		<span class="pointer-events-none absolute inset-x-0 h-px bg-selection/70" style:top="{v * 100}%"
		></span>
		<span class="pointer-events-none absolute top-1/2 -left-3 -translate-y-1/2 text-[10px]"
			>{edges[0]}</span
		>
		<span class="pointer-events-none absolute top-1/2 -right-3 -translate-y-1/2 text-[10px]"
			>{edges[1]}</span
		>
		<span class="pointer-events-none absolute -top-3 left-1/2 text-[10px]">{edges[2]}</span>
		<span class="pointer-events-none absolute -bottom-3 left-1/2 text-[10px]">{edges[3]}</span>
	</button>
</div>
