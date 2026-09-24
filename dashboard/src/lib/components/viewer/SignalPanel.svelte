<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ChartScatterIcon from '~icons/lucide/chart-scatter';
	import XIcon from '~icons/lucide/x';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import TableIcon from '~icons/lucide/table-2';
	import type { Dataset, Bookmark, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { chartSvg, download, voxelCsv } from '$lib/workspace';
	import type { SignalSeries } from '$lib/workspace';
	import { predictIvim, type FitResult } from '$lib/analysis';
	let {
		dataset,
		volumes,
		active,
		x,
		y,
		slice,
		bookmarks,
		compared,
		fit,
		roiMean,
		open = $bindable(true),
		valuesOpen = $bindable(false),
		onerror,
		onselect,
		onanalysis
	}: {
		dataset: Dataset;
		volumes: VoxelVolume[];
		active: number;
		x: number;
		y: number;
		slice: number;
		bookmarks: Bookmark[];
		compared: string[];
		fit?: FitResult;
		roiMean?: SignalSeries;
		open: boolean;
		valuesOpen: boolean;
		onerror: (message: string) => void;
		onselect: (index: number) => void;
		onanalysis: () => void;
	} = $props();
	let dark = $state(true);
	let pngBusy = $state(false);
	let dialog: HTMLDialogElement;
	let chartContainer: HTMLSpanElement;
	let hovered = $state<{
		series: number;
		volume: number;
		residual: boolean;
		left: number;
		top: number;
	} | null>(null);
	let curveHover = $state<{ b: number; left: number; top: number } | null>(null);
	let zoom = $state<[number, number] | null>(null);
	let brush = $state<{ start: number; end: number; top: number; height: number } | null>(null);
	let rangeDrag: {
		kind: 'move' | 'start' | 'end';
		clientX: number;
		initial: [number, number];
		pointerId: number;
	} | null = null;
	let suppressClick = false;
	const fullB = $derived(Math.max(1, ...dataset.bValues));
	const domain = $derived(zoom ?? ([0, fullB] as [number, number]));
	const rangeLabel = $derived(
		zoom
			? `b ${Number(zoom[0].toFixed(1))}–${Number(zoom[1].toFixed(1))} of 0–${fullB} s/mm²`
			: `Full b-range · 0–${fullB} s/mm²`
	);
	let zoomDataset = dataset.sha256;
	$effect(() => {
		if (dataset.sha256 !== zoomDataset) {
			zoomDataset = dataset.sha256;
			setZoom(null);
		}
	});
	function setZoom(range: [number, number] | null) {
		zoom = range;
		hovered = null;
		curveHover = null;
	}
	function rangeHandle(target: EventTarget | null) {
		const node =
			target instanceof Element ? target.closest<SVGElement>('[data-chart-range]') : null;
		if (!node || !chartContainer.contains(node)) return null;
		const kind = node.dataset.chartRange;
		return kind === 'move' || kind === 'start' || kind === 'end' ? kind : null;
	}
	function adjustRange(kind: 'move' | 'start' | 'end', initial: [number, number], change: number) {
		const minimum = fullB * 0.01;
		let [start, end] = initial;
		if (kind === 'move') {
			start = Math.max(0, Math.min(fullB - (end - start), start + change));
			end = start + (initial[1] - initial[0]);
		} else if (kind === 'start') start = Math.max(0, Math.min(end - minimum, start + change));
		else end = Math.max(start + minimum, Math.min(fullB, end + change));
		setZoom(start === 0 && end === fullB ? null : [start, end]);
	}
	function startRangeDrag(event: PointerEvent) {
		const kind = rangeHandle(event.target);
		if (!kind || (event.pointerType === 'mouse' && event.button !== 0)) return false;
		event.preventDefault();
		rangeDrag = { kind, clientX: event.clientX, initial: [...domain], pointerId: event.pointerId };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		return true;
	}
	function moveRangeDrag(event: PointerEvent) {
		if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return false;
		const svg = chartContainer.querySelector('svg');
		if (!svg) return true;
		adjustRange(
			rangeDrag.kind,
			rangeDrag.initial,
			((event.clientX - rangeDrag.clientX) / ((svg.getBoundingClientRect().width * 650) / 800)) *
				fullB
		);
		return true;
	}
	async function rangeKeydown(event: KeyboardEvent) {
		const kind = rangeHandle(event.target);
		if (!kind || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return false;
		event.preventDefault();
		adjustRange(
			kind,
			[...domain],
			(event.key === 'ArrowRight' ? 1 : -1) * fullB * (event.shiftKey ? 0.1 : 0.01)
		);
		await tick();
		chartContainer.querySelector<SVGElement>(`[data-chart-range="${kind}"]`)?.focus();
		return true;
	}
	const samples = (vx: number, vy: number, vz: number) =>
		volumes.map(
			(v) => v[voxelIndex(vx, vy, vz, dataset.dimensions)] * dataset.slope + dataset.intercept
		);
	const signals = $derived(samples(x, y, slice));
	const series = $derived([
		{ label: `Current (${x}, ${y}, ${slice})`, values: signals },
		...bookmarks
			.filter((b) => compared.includes(b.id))
			.map((b) => ({
				label: `Saved (${b.x}, ${b.y}, ${b.z})${b.note ? ' · ' + b.note.slice(0, 30) : ''}`,
				values: samples(b.x, b.y, b.z)
			})),
		...(roiMean ? [roiMean] : [])
	]);
	const fitIndex = $derived(voxelIndex(x, y, slice, dataset.dimensions));
	const fitted = $derived(
		fit && ['S0', 'D', 'D*', 'f'].every((p) => Number.isFinite(fit.maps[p][fitIndex]))
			? {
					parameters: Object.fromEntries(
						['S0', 'D', 'D*', 'f'].map((p) => [p, fit.maps[p][fitIndex]])
					),
					valid: fit.maps.Valid[fitIndex] === 1,
					model: 'OSIPY biexponential'
				}
			: undefined
	);
	const chart = $derived(chartSvg(dataset, series, active, dark, fitted));
	const preview = $derived(chartSvg(dataset, series, active, dark, fitted, true));
	const interactiveChart = $derived(
		chartSvg(dataset, series, active, dark, fitted, false, true, zoom ?? undefined)
	);
	function plotPosition(event: { clientX: number; clientY: number }) {
		const svg = chartContainer.querySelector('svg');
		if (!svg) return null;
		const bounds = svg.getBoundingClientRect();
		const x = ((event.clientX - bounds.left) / bounds.width) * 800;
		const y = ((event.clientY - bounds.top) / bounds.height) * Number(svg.viewBox.baseVal.height);
		if (x < 90 || x > 740 || y < 85 || y > 355) return null;
		const [start, end] = domain;
		return {
			b: start + ((x - 90) / 650) * (end - start),
			left: event.clientX - chartContainer.getBoundingClientRect().left,
			top: bounds.top + (85 / 800) * bounds.width - chartContainer.getBoundingClientRect().top,
			height: (270 / 800) * bounds.width
		};
	}
	function wheelZoom(node: HTMLElement) {
		function onWheel(event: WheelEvent) {
			if (
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				Math.abs(event.deltaX) > Math.abs(event.deltaY)
			)
				return;
			const position = plotPosition(event);
			if (!position && !rangeHandle(event.target)) return;
			const [start, end] = domain;
			const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
			const width = Math.max(
				fullB * 0.01,
				Math.min(fullB, (end - start) * Math.exp(Math.max(-120, Math.min(120, delta)) * 0.002))
			);
			if (Math.abs(width - (end - start)) < fullB * 1e-8) return;
			event.preventDefault();
			const fraction = position ? (position.b - start) / (end - start) : 0.5;
			const nextStart = Math.max(
				0,
				Math.min(fullB - width, (position?.b ?? (start + end) / 2) - fraction * width)
			);
			setZoom(width >= fullB ? null : [nextStart, nextStart + width]);
		}
		node.addEventListener('wheel', onWheel, { passive: false });
		return { destroy: () => node.removeEventListener('wheel', onWheel) };
	}
	function startBrush(event: PointerEvent) {
		if (event.button !== 0 || event.pointerType === 'touch') return;
		const position = plotPosition(event);
		if (position)
			brush = {
				start: position.left,
				end: position.left,
				top: position.top,
				height: position.height
			};
	}
	function moveBrush(event: PointerEvent) {
		if (!brush) return false;
		const svg = chartContainer.querySelector('svg');
		if (!svg) return true;
		const bounds = svg.getBoundingClientRect();
		const containerLeft = chartContainer.getBoundingClientRect().left;
		brush.end =
			Math.max(
				bounds.left + (bounds.width * 90) / 800,
				Math.min(bounds.left + (bounds.width * 740) / 800, event.clientX)
			) - containerLeft;
		if (Math.abs(brush.end - brush.start) >= 6) {
			hovered = null;
			curveHover = null;
		}
		return true;
	}
	function finishBrush() {
		if (!brush) return;
		const { start, end } = brush;
		brush = null;
		if (Math.abs(end - start) < 12) return;
		const svg = chartContainer.querySelector('svg');
		if (!svg) return;
		const bounds = svg.getBoundingClientRect();
		const chartLeft = bounds.left - chartContainer.getBoundingClientRect().left;
		const [low, high] = domain;
		const toB = (left: number) =>
			low + ((((left - chartLeft) / bounds.width) * 800 - 90) / 650) * (high - low);
		const range: [number, number] = [toB(Math.min(start, end)), toB(Math.max(start, end))];
		if (range[1] - range[0] >= (high - low) * 0.01) setZoom(range);
		suppressClick = true;
	}
	function point(target: EventTarget | null) {
		const node =
			target instanceof Element ? target.closest<SVGElement>('[data-chart-point]') : null;
		if (!node || !chartContainer.contains(node)) return null;
		const volume = Number(node.dataset.volume);
		const seriesIndex = Number(node.dataset.series);
		if (
			!Number.isInteger(volume) ||
			!Number.isInteger(seriesIndex) ||
			!Number.isFinite(series[seriesIndex]?.values[volume])
		)
			return null;
		return { node, volume, seriesIndex };
	}
	function showPoint(target: EventTarget | null) {
		const found = point(target);
		if (!found) return;
		curveHover = null;
		const bounds = chartContainer.getBoundingClientRect();
		const dot = found.node.getBoundingClientRect();
		hovered = {
			series: found.seriesIndex,
			volume: found.volume,
			residual: found.node.hasAttribute('data-residual'),
			left: Math.max(112, Math.min(bounds.width - 112, dot.left + dot.width / 2 - bounds.left)),
			top: dot.top + dot.height / 2 - bounds.top
		};
	}
	function curve(target: EventTarget | null) {
		const node = target instanceof Element ? target.closest<SVGElement>('[data-chart-fit]') : null;
		return node && chartContainer.contains(node) && fitted ? node : null;
	}
	function showCurve(
		target: EventTarget | null,
		clientX?: number,
		clientY?: number,
		bValue?: number
	) {
		const node = curve(target);
		if (!node) return;
		const svg = node.ownerSVGElement;
		if (!svg) return;
		const bounds = chartContainer.getBoundingClientRect();
		const svgBounds = svg.getBoundingClientRect();
		const [startB, endB] = domain;
		const b =
			bValue ??
			Math.max(
				startB,
				Math.min(
					endB,
					(((((clientX ?? svgBounds.left + svgBounds.width / 2) - svgBounds.left) /
						svgBounds.width) *
						800 -
						90) /
						650) *
						(endB - startB) +
						startB
				)
			);
		const left =
			svgBounds.left +
			((90 + ((b - startB) / (endB - startB)) * 650) * svgBounds.width) / 800 -
			bounds.left;
		hovered = null;
		curveHover = {
			b,
			left: Math.max(112, Math.min(bounds.width - 112, left)),
			top:
				(clientY ?? node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2) -
				bounds.top
		};
	}
	function selectPoint(target: EventTarget | null) {
		const found = point(target);
		if (found) onselect(found.volume);
	}
	const repeats = $derived.by(() => {
		if (!hovered) return { position: 0, count: 0 };
		const bValue = dataset.bValues[hovered.volume];
		return {
			position: dataset.bValues.slice(0, hovered.volume + 1).filter((b) => b === bValue).length,
			count: dataset.bValues.filter((b) => b === bValue).length
		};
	});
	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
		const observer = new MutationObserver(
			() => (dark = document.documentElement.classList.contains('dark'))
		);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});
	function exportCsv() {
		download(
			new Blob([voxelCsv(dataset, signals, x, y, slice)], { type: 'text/csv;charset=utf-8' }),
			`voxel-${x}-${y}-${slice}.csv`
		);
	}
	async function exportChart(png: boolean) {
		const source = chart;
		const filename = `voxel-${x}-${y}-${slice}`;
		if (!png) {
			download(new Blob([source], { type: 'image/svg+xml' }), filename + '.svg');
			return;
		}
		pngBusy = true;
		const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
		try {
			const image = new Image();
			image.src = url;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width * 2;
			canvas.height = image.height * 2;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Image export unavailable.');
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			if (!blob) throw new Error('Image export failed.');
			download(blob, filename + '.png');
		} catch (e) {
			onerror(e instanceof Error ? e.message : 'PNG export failed.');
		} finally {
			URL.revokeObjectURL(url);
			pngBusy = false;
		}
	}
</script>

{#snippet plot(expanded = false)}
	<!-- chartSvg escapes user/dataset text and emits controlled SVG; never interpolate external markup. -->
	<span
		class="chart-svg block [&_svg]:block [&_svg]:h-auto [&_svg]:w-full {expanded
			? 'mx-auto max-w-[800px] min-w-[720px]'
			: ''}"
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html expanded ? interactiveChart : preview}
	</span>
{/snippet}
<section class="card overflow-hidden {open ? '' : '[&>*:not(:first-child)]:hidden'}">
	<div class="p-3 pb-1">
		<div class="flex items-start gap-0.5">
			<h2
				class="flex min-h-8 min-w-0 flex-1 items-center gap-0.5 text-[13px] font-semibold max-[899px]:min-h-11"
			>
				<ChartScatterIcon class="size-4 shrink-0" aria-hidden="true" />
				<span class="min-w-0">
					<span class="block whitespace-nowrap">Voxel signal</span>
					<span
						class="mt-0.5 block text-xs font-normal text-muted-foreground tabular-nums {open
							? ''
							: 'hidden'}"
						aria-label="Voxel coordinates"
					>
						({x}, {y}, {slice})
					</span>
				</span>
			</h2>
			<div
				class="flex shrink-0 gap-0.5 rounded-md border bg-muted/40 p-0.5"
				role="group"
				aria-label="Export voxel signal"
			>
				<button
					type="button"
					class="min-h-8 min-w-8 rounded px-1.5 text-[11px] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring max-[899px]:min-h-11 max-[899px]:min-w-11"
					aria-label="Download voxel signal SVG"
					title="Download SVG"
					onclick={() => exportChart(false)}>SVG</button
				>
				<button
					type="button"
					class="min-h-8 min-w-8 rounded px-1.5 text-[11px] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 max-[899px]:min-h-11 max-[899px]:min-w-11"
					aria-label="Download voxel signal PNG"
					title="Download PNG"
					disabled={pngBusy}
					onclick={() => exportChart(true)}>{pngBusy ? '…' : 'PNG'}</button
				>
				<button
					type="button"
					class="min-h-8 min-w-8 rounded px-1.5 text-[11px] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring max-[899px]:min-h-11 max-[899px]:min-w-11"
					aria-label="Download voxel signal CSV"
					title="Download voxel CSV"
					onclick={exportCsv}>CSV</button
				>
			</div>
			<button
				type="button"
				class="flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring max-[899px]:size-11"
				aria-label="{open ? 'Collapse' : 'Expand'} voxel signal panel"
				aria-expanded={open}
				onclick={() => (open = !open)}
			>
				{#if open}<ChevronDownIcon class="size-4" />{:else}<ChevronRightIcon class="size-4" />{/if}
			</button>
		</div>
		<p
			class="mt-2 flex-wrap items-baseline gap-x-2 text-base font-semibold text-selection tabular-nums {open
				? 'flex'
				: 'hidden'}"
		>
			{signals[active].toFixed(1)} a.u.
			<span class="text-xs font-normal text-muted-foreground"
				>Vol {active + 1} · b {dataset.bValues[active]} s/mm²</span
			>
		</p>
	</div>
	<button
		type="button"
		class="block w-full cursor-zoom-in text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
		aria-label="Expand voxel signal chart"
		aria-haspopup="dialog"
		title="Expand chart"
		onclick={() => dialog.showModal()}
	>
		{@render plot()}
	</button>
	<div class="px-3 pb-2 text-xs">
		<p class="flex flex-wrap items-baseline gap-x-1.5 py-1.5 text-muted-foreground">
			<span
				>{fitted
					? fitted.valid
						? 'Fitted curve shown'
						: 'Flagged fit · inspect quality'
					: 'No fit yet'}</span
			>
			<span aria-hidden="true">·</span>
			<a
				class="underline underline-offset-2"
				href="#ivim-analysis"
				onclick={(event) => {
					event.preventDefault();
					onanalysis();
				}}>{fitted ? 'IVIM analysis' : 'Run in IVIM analysis'}</a
			>
		</p>
	</div>
</section>
<dialog
	bind:this={dialog}
	onclose={() => {
		hovered = null;
		curveHover = null;
	}}
	class="m-auto max-h-[calc(100dvh-24px)] w-[min(900px,calc(100vw-24px))] overflow-hidden rounded-xl border bg-card p-0 text-foreground backdrop:bg-black/65"
	aria-labelledby="chart-title"
>
	<div class="flex flex-wrap items-center justify-between gap-2 border-b p-3">
		<div class="min-w-0">
			<h2 id="chart-title" class="flex items-center gap-2 font-semibold">
				<ChartScatterIcon class="size-4 shrink-0" aria-hidden="true" />Voxel signal
			</h2>
			<p class="text-xs text-muted-foreground">
				({x}, {y}, {slice}) · {signals.length} acquisitions
			</p>
		</div>
		<div
			class="ml-auto flex shrink-0 gap-0.5 rounded-md border bg-muted/40 p-0.5 max-[480px]:order-3 max-[480px]:ml-0"
			role="group"
			aria-label="Export voxel signal"
		>
			<button
				type="button"
				class="min-h-8 min-w-8 rounded px-1.5 text-[11px] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring max-[899px]:min-h-11 max-[899px]:min-w-11"
				aria-label="Download voxel signal SVG"
				onclick={() => exportChart(false)}>SVG</button
			>
			<button
				type="button"
				class="min-h-8 min-w-8 rounded px-1.5 text-[11px] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 max-[899px]:min-h-11 max-[899px]:min-w-11"
				aria-label="Download voxel signal PNG"
				disabled={pngBusy}
				onclick={() => exportChart(true)}>{pngBusy ? '…' : 'PNG'}</button
			>
			<button
				type="button"
				class="min-h-8 min-w-8 rounded px-1.5 text-[11px] hover:bg-card focus-visible:outline-2 focus-visible:outline-ring max-[899px]:min-h-11 max-[899px]:min-w-11"
				aria-label="Download voxel signal CSV"
				onclick={exportCsv}>CSV</button
			>
		</div>
		<form method="dialog">
			<button
				class="button button-ghost button-icon size-11"
				aria-label="Close chart"
				title="Close chart"><XIcon class="size-5" aria-hidden="true" /></button
			>
		</form>
	</div>
	<div class="min-h-0 overflow-auto">
		<div class="flex flex-wrap items-center gap-2 px-3 pt-3 text-xs sm:px-4">
			<span class="text-muted-foreground tabular-nums" role="status">{rangeLabel}</span>
			{#if zoom}<button
					type="button"
					class="button button-outline text-xs"
					onclick={() => setZoom(null)}>Reset zoom</button
				>{/if}
			{#if fullB > 100}<button
					type="button"
					class="button button-outline text-xs aria-pressed:border-selection aria-pressed:text-selection"
					aria-pressed={zoom?.[0] === 0 && zoom?.[1] === 100}
					onclick={() => setZoom([0, 100])}>Low b · 0–100</button
				>{/if}
		</div>
		<div class="overflow-x-auto p-3 sm:p-4">
			<div
				role="presentation"
				use:wheelZoom
				onpointerdown={(event) => {
					if (!startRangeDrag(event)) startBrush(event);
				}}
				onpointerup={(event) => {
					if (rangeDrag?.pointerId === event.pointerId) {
						rangeDrag = null;
						(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
					} else finishBrush();
				}}
				onpointercancel={() => {
					brush = null;
					rangeDrag = null;
				}}
				onlostpointercapture={() => (rangeDrag = null)}
				onpointerover={(event) => {
					if (brush || rangeDrag) return;
					if (point(event.target)) showPoint(event.target);
					else if (curve(event.target)) showCurve(event.target, event.clientX, event.clientY);
					else {
						hovered = null;
						curveHover = null;
					}
				}}
				onpointermove={(event) => {
					if (moveRangeDrag(event)) return;
					if (moveBrush(event)) return;
					if (curve(event.target)) showCurve(event.target, event.clientX, event.clientY);
				}}
				onpointerleave={() => {
					hovered = null;
					curveHover = null;
					brush = null;
				}}
				onfocusin={(event) => {
					if (point(event.target)) showPoint(event.target);
					else showCurve(event.target);
				}}
				onfocusout={(event) => {
					if (!point(event.relatedTarget) && !curve(event.relatedTarget)) {
						hovered = null;
						curveHover = null;
					}
				}}
				onclick={(event) => {
					if (suppressClick) suppressClick = false;
					else selectPoint(event.target);
				}}
				onkeydown={(event) => {
					if (rangeHandle(event.target)) {
						void rangeKeydown(event);
						return;
					}
					if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && curve(event.target)) {
						event.preventDefault();
						const [low, high] = domain;
						showCurve(
							event.target,
							undefined,
							undefined,
							Math.max(
								low,
								Math.min(
									high,
									(curveHover?.b ?? (low + high) / 2) +
										((event.key === 'ArrowRight' ? 1 : -1) * (high - low)) / 20
								)
							)
						);
					}
					if (event.key === 'Enter' || event.key === ' ') {
						if (point(event.target)) {
							event.preventDefault();
							selectPoint(event.target);
						}
					}
				}}
			>
				<span bind:this={chartContainer} class="relative mx-auto block max-w-[800px] min-w-[720px]">
					{@render plot(true)}
					{#if brush && Math.abs(brush.end - brush.start) >= 6}<div
							class="pointer-events-none absolute border border-selection bg-selection/20"
							style:left="{Math.min(brush.start, brush.end)}px"
							style:top="{brush.top}px"
							style:width="{Math.abs(brush.end - brush.start)}px"
							style:height="{brush.height}px"
							aria-hidden="true"
						></div>{/if}
					{#if hovered}
						<div
							class="pointer-events-none absolute z-10 w-52 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg"
							style:left="{hovered.left}px"
							style:top="{hovered.top}px"
							style:transform="translate(-50%, {hovered.top < 115 ? '20px' : 'calc(-100% - 14px)'})"
							role="status"
						>
							<p class="font-semibold text-selection">{series[hovered.series].label}</p>
							<p class="mt-1 font-medium">
								Volume {hovered.volume + 1}
								<span class="text-muted-foreground"
									>· b {dataset.bValues[hovered.volume]} s/mm²</span
								>
							</p>
							<p>
								Signal {series[hovered.series].values[hovered.volume].toLocaleString(undefined, {
									maximumFractionDigits: 3
								})} a.u.
							</p>
							{#if hovered.residual && fitted}<p>
									Residual {(
										signals[hovered.volume] -
										predictIvim(dataset.bValues[hovered.volume], fitted.parameters)
									).toFixed(3)} a.u.
								</p>{/if}
							{#if repeats.count > 1}<p class="text-muted-foreground">
									Repeat {repeats.position} of {repeats.count} at this b-value
								</p>{/if}
							<p class="mt-1 text-muted-foreground">Click / Enter to select volume</p>
						</div>
					{/if}
					{#if curveHover && fitted}
						<div
							class="pointer-events-none absolute z-10 w-52 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg"
							style:left="{curveHover.left}px"
							style:top="{curveHover.top}px"
							style:transform="translate(-50%, {curveHover.top < 115
								? '20px'
								: 'calc(-100% - 14px)'})"
							role="status"
						>
							<p class="font-semibold text-foreground">{fitted.model} fit</p>
							<p class="mt-1">
								b {curveHover.b.toLocaleString(undefined, { maximumFractionDigits: 1 })} s/mm²
							</p>
							<p>
								Predicted {predictIvim(curveHover.b, fitted.parameters).toLocaleString(undefined, {
									maximumFractionDigits: 3
								})} a.u.
							</p>
							<p class="mt-1 text-muted-foreground">
								{fitted.valid ? 'Quality checks passed' : 'Flagged estimate · inspect quality'}
							</p>
						</div>
					{/if}
				</span>
			</div>
		</div>
		<details class="border-t px-3 text-xs sm:px-4" bind:open={valuesOpen}>
			<summary class="min-h-11 cursor-pointer py-3 font-medium"
				><TableIcon class="mr-1 inline-block size-4 align-middle" aria-hidden="true" />Signal values
				<span class="font-normal text-muted-foreground">· {signals.length} samples</span></summary
			>
			<p class="mb-2 leading-relaxed text-muted-foreground">
				Each point is one acquisition; the larger ring marks the selected volume. Repeated b-values
				remain separate and may overlap. A line represents an actual model fit.
			</p>
			<div class="max-h-64 overflow-auto">
				<table class="w-full text-right">
					<caption class="sr-only">Selected voxel values</caption><thead
						><tr><th>Vol</th><th class="py-1 text-left">b (s/mm²)</th><th>Signal (a.u.)</th></tr
						></thead
					><tbody
						>{#each signals as value, i (i)}<tr class="border-t"
								><td>{i + 1}</td><td class="py-1 text-left">{dataset.bValues[i]}</td><td>{value}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
		</details>
		<div class="border-t bg-muted/20 p-3">
			<p class="max-w-xl text-xs leading-relaxed text-muted-foreground">
				Drag or scroll over the plot to zoom. Move the highlighted range to pan, or drag its ends to
				resize it; arrow keys also adjust focused handles. Click a dot to select its acquisition.
				Repeats stay separate; a curve appears only after a successful fit.
			</p>
		</div>
	</div>
</dialog>
