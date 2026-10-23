<script lang="ts">
	import IvimImage from './IvimImage.svelte';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { autoWindow, zoomAtPointer, type Display, type WindowRegion } from '$lib/workspace';
	import { dragWindow } from '$lib/windowing';
	import { on } from 'svelte/events';
	import type { ImageOverlay } from '$lib/analysis';
	import type { ViewerTool, PixelPoint, RoiOverlay } from '$lib/roi';
	let {
		volume,
		dataset,
		index,
		slice,
		x,
		y,
		view,
		overlay,
		roi,
		onroi,
		tool,
		wheel = 'zoom',
		dragBinding = 'tool',
		onslice,
		onshortcut,
		temporaryPan = false,
		active = true,
		scrollable = false,
		linkedViews = false,
		onselect,
		onview,
		onactivate,
		onlayout
	}: {
		volume: VoxelVolume;
		dataset: Dataset;
		index: number;
		slice: number;
		x: number;
		y: number;
		view: Display;
		overlay?: ImageOverlay;
		roi?: RoiOverlay;
		onroi?: (points: PixelPoint[], slice: number, rectangle: boolean) => void;
		tool: ViewerTool;
		wheel?: 'zoom' | 'slice';
		dragBinding?: 'tool' | 'slice';
		onslice?: (slice: number) => void;
		onshortcut?: (event: KeyboardEvent) => void;
		temporaryPan?: boolean;
		active?: boolean;
		scrollable?: boolean;
		linkedViews?: boolean;
		onselect: (x: number, y: number) => void;
		onview: (view: Display) => void;
		onactivate: () => void;
		onlayout: () => void;
	} = $props();
	let layer: HTMLDivElement;
	let drag: { id: number; x: number; y: number; view: Display; mode: 'pan' | 'window' } | undefined;
	let drawing = $state<PixelPoint[]>([]);
	let drawMode = $state<'rectangle' | 'freehand' | 'window-region'>();
	let drawSlice = 0;
	let sliceDrag: { id: number; y: number; slice: number } | undefined;
	const slicing = $derived(tool === 'slice' || (tool === 'inspect' && dragBinding === 'slice'));
	function selectSlice(value: number) {
		if (Number.isFinite(value))
			onslice?.(Math.max(0, Math.min(dataset.dimensions[2] - 1, Math.round(value))));
	}
	let windowRegion = $state<{
		bounds: WindowRegion;
		slice: number;
		center: number;
		width: number;
	}>();
	let windowMessage = $state('');
	const panning = $derived(tool === 'pan' || temporaryPan);
	$effect(() => {
		const isPanning = panning;
		const selectedTool = tool;
		if (isPanning || !slicing) sliceDrag = undefined;
		if (drag && (drag.mode === 'pan' ? !isPanning : isPanning || selectedTool !== 'window'))
			drag = undefined;
		if (
			(drawing.length || drawMode) &&
			(isPanning ||
				(drawMode && drawMode !== selectedTool) ||
				slice !== drawSlice ||
				(selectedTool !== 'rectangle' &&
					selectedTool !== 'freehand' &&
					selectedTool !== 'window-region'))
		) {
			drawing = [];
			drawMode = undefined;
		}
	});
	$effect(() => {
		// A selection documents only the window it produced, never an analysis ROI.
		if (
			windowRegion &&
			(slice !== windowRegion.slice ||
				view.center !== windowRegion.center ||
				view.width !== windowRegion.width)
		) {
			windowRegion = undefined;
			windowMessage = '';
		}
	});
	const nx = $derived(dataset.dimensions[0]);
	const ny = $derived(dataset.dimensions[1]);
	const aspect = $derived((nx * dataset.spacing[0]) / (ny * dataset.spacing[1]));
	function wheelZoom(node: HTMLButtonElement) {
		let accumulated = 0;
		let lastWheel = 0;
		const destroy = on(
			node,
			'wheel',
			(event) => {
				if (drawing.length) {
					event.preventDefault();
					return;
				}
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
				if (wheel === 'slice' && onslice) {
					const now = performance.now();
					if (now - lastWheel > 200 || Math.sign(accumulated) !== Math.sign(event.deltaY))
						accumulated = 0;
					lastWheel = now;
					accumulated += event.deltaY * unit;
					const steps = Math.trunc(accumulated / 40);
					if (steps) {
						selectSlice(slice + steps);
						accumulated -= steps * 40;
					}
					return;
				}
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
		if (panning || tool === 'window')
			drag = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				view: { ...view },
				mode: panning ? 'pan' : 'window'
			};
		else if (slicing && onslice) sliceDrag = { id: e.pointerId, y: e.clientY, slice };
		else if (tool === 'window-region' || ((tool === 'rectangle' || tool === 'freehand') && onroi)) {
			const r = layer.getBoundingClientRect();
			const point: [number, number] = [
				((e.clientX - r.left) / r.width) * nx,
				((e.clientY - r.top) / r.height) * ny
			];
			if (point[0] >= 0 && point[0] <= nx && point[1] >= 0 && point[1] <= ny) {
				drawing = [point];
				drawMode = tool;
				drawSlice = slice;
			}
		} else {
			const r = layer.getBoundingClientRect();
			const vx = Math.floor(((e.clientX - r.left) / r.width) * nx);
			const vy = Math.floor(((e.clientY - r.top) / r.height) * ny);
			if (vx >= 0 && vx < nx && vy >= 0 && vy < ny) onselect(vx, vy);
		}
	}
	function move(e: PointerEvent) {
		if (sliceDrag?.id === e.pointerId)
			selectSlice(sliceDrag.slice + Math.trunc((e.clientY - sliceDrag.y) / 24));
		if (drawing.length && drawMode) {
			const r = layer.getBoundingClientRect();
			const point: PixelPoint = [
				Math.max(0, Math.min(nx, ((e.clientX - r.left) / r.width) * nx)),
				Math.max(0, Math.min(ny, ((e.clientY - r.top) / r.height) * ny))
			];
			if (drawMode === 'rectangle' || drawMode === 'window-region') drawing = [drawing[0], point];
			else if (Math.hypot(point[0] - drawing.at(-1)![0], point[1] - drawing.at(-1)![1]) > 0.25) {
				if (drawing.length >= 512) drawing = drawing.filter((_, i) => i % 2 === 0);
				drawing = [...drawing, point];
			}
		}
		if (drag?.id === e.pointerId) {
			if (drag.mode === 'window') {
				const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
				onview(
					dragWindow(
						drag.view,
						dataset,
						e.clientX - drag.x,
						e.clientY - drag.y,
						bounds.width,
						bounds.height
					)
				);
			} else
				onview({
					...drag.view,
					panX: Math.max(-10000, Math.min(10000, drag.view.panX + e.clientX - drag.x)),
					panY: Math.max(-10000, Math.min(10000, drag.view.panY + e.clientY - drag.y))
				});
		}
	}
	function finishRegion() {
		const first = drawing[0],
			last = drawing.at(-1)!;
		const bounds: WindowRegion = {
			x0: Math.max(0, Math.ceil(Math.min(first[0], last[0]) - 0.5)),
			y0: Math.max(0, Math.ceil(Math.min(first[1], last[1]) - 0.5)),
			x1: Math.min(nx, Math.floor(Math.max(first[0], last[0]) - 0.5) + 1),
			y1: Math.min(ny, Math.floor(Math.max(first[1], last[1]) - 0.5) + 1)
		};
		try {
			const result = autoWindow(volume, dataset, drawSlice, true, { region: bounds });
			windowRegion = { bounds, slice: drawSlice, ...result };
			windowMessage = `Region · vol ${index + 1}, slice ${drawSlice + 1} · ${(bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0)} voxels · 2–98% · ${linkedViews ? 'linked displays' : 'active display'}`;
			onview({ ...view, ...result });
		} catch (error) {
			windowRegion = undefined;
			windowMessage = (error as Error).message;
		}
	}
	function keyboard(e: KeyboardEvent) {
		if (e.key === 'Escape' && drawing.length) {
			e.preventDefault();
			drawing = [];
			drawMode = undefined;
			return;
		}
		// Do not navigate away from a partially drawn ROI.
		if (drawing.length) return;
		if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing) onshortcut?.(e);
		if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing)
			return;
		if (tool === 'window' || tool === 'window-region') return;
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
	function cancelGesture() {
		drag = undefined;
		sliceDrag = undefined;
		drawing = [];
		drawMode = undefined;
	}
</script>

<svelte:window onblur={cancelGesture} />
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) cancelGesture();
	}}
/>

<button
	data-viewer-tile
	use:wheelZoom
	title="Scroll to {wheel === 'slice' ? 'step slices' : 'zoom'}. {slicing
		? 'Drag to step slices.'
		: ''} Hold Space + drag to pan. Shift+scroll moves through the multiview grid. Configure bindings in navigation shortcuts."
	class="[container-type:size] relative grid size-full min-h-0 place-items-center overflow-hidden border bg-[#080808] text-[#ddd] {active
		? 'border-selection'
		: 'border-transparent'} {panning
		? 'cursor-grab touch-none active:cursor-grabbing'
		: scrollable && tool === 'inspect' && !slicing
			? 'cursor-crosshair touch-pan-y'
			: 'cursor-crosshair touch-none'}"
	aria-label="Volume {index + 1}, b {dataset.bValues[index]}, slice {slice + 1}. {panning
		? 'Drag or arrow keys to pan'
		: slicing
			? 'Drag to step slices; arrow keys select voxel'
			: tool === 'window'
				? 'Drag right to widen, up to raise level'
				: tool === 'window-region'
					? 'Draw a rectangle for regional 2–98% windowing; Escape cancels'
					: 'Click or arrow keys to select voxel'}"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={(e) => {
		sliceDrag = undefined;
		drag = undefined;
		if (drawMode && drawing.length > 1) {
			if (drawMode === 'window-region') finishRegion();
			else onroi?.(drawing, drawSlice, drawMode === 'rectangle');
		}
		drawing = [];
		drawMode = undefined;
		if (e.button === 2) setTimeout(onlayout, 0);
	}}
	onpointercancel={() => {
		sliceDrag = undefined;
		drag = undefined;
		drawing = [];
		drawMode = undefined;
	}}
	onlostpointercapture={() => {
		sliceDrag = undefined;
		drag = undefined;
		drawing = [];
		drawMode = undefined;
	}}
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
			{roi}
			{overlay}
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
		{#if drawing.length > 1}<svg
				class="pointer-events-none absolute inset-0 size-full fill-selection/15 stroke-selection stroke-[0.5]"
				viewBox="0 0 {nx} {ny}"
				preserveAspectRatio="none"
				aria-hidden="true"
				>{#if drawMode === 'rectangle' || drawMode === 'window-region'}<rect
						x={Math.min(drawing[0][0], drawing.at(-1)![0])}
						y={Math.min(drawing[0][1], drawing.at(-1)![1])}
						width={Math.abs(drawing[0][0] - drawing.at(-1)![0])}
						height={Math.abs(drawing[0][1] - drawing.at(-1)![1])}
					/>{:else}<polygon points={drawing.map((p) => p.join(',')).join(' ')} />{/if}</svg
			>{/if}
		{#if windowRegion}<svg
				class="pointer-events-none absolute inset-0 size-full fill-none stroke-selection stroke-[0.5]"
				viewBox="0 0 {nx} {ny}"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<rect
					x={windowRegion.bounds.x0}
					y={windowRegion.bounds.y0}
					width={windowRegion.bounds.x1 - windowRegion.bounds.x0}
					height={windowRegion.bounds.y1 - windowRegion.bounds.y0}
					stroke-dasharray="2 1"
				/>
			</svg>{/if}
	</div>
	<span
		class="pointer-events-none absolute top-1.5 right-2 left-2 text-left font-mono text-xs leading-normal [text-shadow:0_1px_3px_#000]"
		>Vol {index + 1} · b {dataset.bValues[index]} s/mm²</span
	>
	<span
		class="pointer-events-none absolute right-2 bottom-1.5 left-2 text-left font-mono text-xs leading-normal [text-shadow:0_1px_3px_#000]"
		>Slice {slice + 1}/{dataset.dimensions[2]} · ({x}, {y}, {slice}) · {view.zoom.toFixed(1)}×<br
		/>W {Number(view.width.toPrecision(5))} · L {Number(view.center.toPrecision(5))} a.u.
		{#if tool === 'window'}<br />Drag → widen · ↑ raise level{:else if tool === 'window-region'}<br
			/>Draw window region · Escape cancels · analysis ROIs unchanged{/if}
		{#if windowMessage}<br /><span role="status">{windowMessage}</span>{/if}</span
	>
</button>
