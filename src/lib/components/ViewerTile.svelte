<script lang="ts">
	import IvimImage from './IvimImage.svelte';
	import type { Dataset } from '$lib/ivim';
	import { zoomAtPointer, type Display } from '$lib/workspace';
	import { on } from 'svelte/events';
	let {
		volume,
		dataset,
		index,
		slice,
		x,
		y,
		view,
		tool,
		temporaryPan = false,
		active = true,
		scrollable = false,
		onselect,
		onview,
		onactivate,
		onlayout
	}: {
		volume: Int16Array;
		dataset: Dataset;
		index: number;
		slice: number;
		x: number;
		y: number;
		view: Display;
		tool: 'inspect' | 'pan';
		temporaryPan?: boolean;
		active?: boolean;
		scrollable?: boolean;
		onselect: (x: number, y: number) => void;
		onview: (view: Display) => void;
		onactivate: () => void;
		onlayout: () => void;
	} = $props();
	let layer: HTMLDivElement;
	let drag: { id: number; x: number; y: number; view: Display } | undefined;
	const panning = $derived(tool === 'pan' || temporaryPan);
	$effect(() => {
		if (!panning) drag = undefined;
	});
	const nx = $derived(dataset.dimensions[0]);
	const ny = $derived(dataset.dimensions[1]);
	const aspect = $derived((nx * dataset.spacing[0]) / (ny * dataset.spacing[1]));
	function wheelZoom(node: HTMLButtonElement) {
		const destroy = on(
			node,
			'wheel',
			(event) => {
				const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
				if (event.shiftKey) {
					event.preventDefault();
					node.closest('.image-stage')?.scrollBy({ top: (event.deltaY || event.deltaX) * unit });
					return;
				}
				if (!event.deltaY) return;
				event.preventDefault();
				event.stopPropagation();
				const bounds = layer.getBoundingClientRect();
				onactivate();
				onview(
					zoomAtPointer(
						view,
						event.deltaY * unit,
						event.clientX - bounds.left - bounds.width / 2,
						event.clientY - bounds.top - bounds.height / 2
					)
				);
			},
			{ passive: false }
		);
		return { destroy };
	}
	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		onactivate();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		if (panning) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, view: { ...view } };
		else {
			const r = layer.getBoundingClientRect();
			const vx = Math.floor(((e.clientX - r.left) / r.width) * nx);
			const vy = Math.floor(((e.clientY - r.top) / r.height) * ny);
			if (vx >= 0 && vx < nx && vy >= 0 && vy < ny) onselect(vx, vy);
		}
	}
	function move(e: PointerEvent) {
		if (drag?.id === e.pointerId)
			onview({
				...drag.view,
				panX: Math.max(-10000, Math.min(10000, drag.view.panX + e.clientX - drag.x)),
				panY: Math.max(-10000, Math.min(10000, drag.view.panY + e.clientY - drag.y))
			});
	}
	function keyboard(e: KeyboardEvent) {
		const delta = (
			{ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<
				string,
				number[]
			>
		)[e.key];
		if (!delta) return;
		e.preventDefault();
		onactivate();
		if (panning)
			onview({
				...view,
				panX: Math.max(-10000, Math.min(10000, view.panX + delta[0] * 12)),
				panY: Math.max(-10000, Math.min(10000, view.panY + delta[1] * 12))
			});
		else
			onselect(
				Math.max(0, Math.min(nx - 1, x + delta[0])),
				Math.max(0, Math.min(ny - 1, y + delta[1]))
			);
	}
</script>

<button
	data-viewer-tile
	use:wheelZoom
	title="Scroll to zoom. Hold Space + drag to pan. Shift+scroll moves through the multiview grid."
	class="[container-type:size] relative grid size-full min-h-0 place-items-center overflow-hidden border bg-[#080808] text-[#ddd] {active
		? 'border-selection'
		: 'border-transparent'} {panning
		? 'cursor-grab touch-none active:cursor-grabbing'
		: scrollable
			? 'cursor-crosshair touch-pan-y'
			: 'cursor-crosshair touch-none'}"
	aria-label="Volume {index + 1}, b {dataset.bValues[index]}, slice {slice + 1}. {panning
		? 'Drag or arrow keys to pan'
		: 'Click or arrow keys to select voxel'}"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={(e) => {
		drag = undefined;
		if (e.button === 2) setTimeout(onlayout, 0);
	}}
	onpointercancel={() => (drag = undefined)}
	onlostpointercapture={() => (drag = undefined)}
	onkeydown={keyboard}
	onclick={onactivate}
	oncontextmenu={(e) => {
		e.preventDefault();
		if (e.button !== 2) onlayout();
	}}
>
	<div
		class="relative"
		bind:this={layer}
		style:width="min(86cqw, {86 * aspect}cqh)"
		style:aspect-ratio={aspect}
		style:transform="translate({view.panX}px, {view.panY}px) scale({view.zoom})"
	>
		<IvimImage
			{volume}
			{dataset}
			{slice}
			center={view.center}
			width={view.width}
			label="Acquired native slice"
		/>
		<svg
			class="pointer-events-none absolute inset-0 size-full fill-none stroke-selection stroke-[0.4]"
			viewBox="0 0 {nx} {ny}"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<circle cx={x + 0.5} cy={y + 0.5} r="2.4" /><path
				d="M {x - 4} {y + 0.5} h 3 M {x + 2} {y + 0.5} h 3 M {x + 0.5} {y - 4} v 3 M {x + 0.5} {y +
					2} v 3"
			/>
		</svg>
	</div>
	<span
		class="pointer-events-none absolute top-1.5 right-2 left-2 text-left font-mono text-[10px] leading-normal [text-shadow:0_1px_3px_#000]"
		>Vol {index + 1} · b {dataset.bValues[index]} s/mm²</span
	>
	<span
		class="pointer-events-none absolute right-2 bottom-1.5 left-2 text-left font-mono text-[10px] leading-normal [text-shadow:0_1px_3px_#000]"
		>Slice {slice + 1}/{dataset.dimensions[2]} · ({x}, {y}, {slice}) · {view.zoom.toFixed(1)}×</span
	>
</button>
