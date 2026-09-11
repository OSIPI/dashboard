<script lang="ts">
	import { onMount } from 'svelte';
	import ChartScatterIcon from '~icons/lucide/chart-scatter';
	import ExpandIcon from '~icons/lucide/expand';
	import DownloadIcon from '~icons/lucide/download';
	import TableIcon from '~icons/lucide/table-2';
	import type { Dataset, Bookmark, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { chartSvg, download, voxelCsv } from '$lib/workspace';
	import type { SignalSeries } from '$lib/workspace';
	import type { FitResult } from '$lib/analysis';
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
		valuesOpen = $bindable(false),
		onerror
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
		valuesOpen: boolean;
		onerror: (message: string) => void;
	} = $props();
	let dark = $state(true);
	let pngBusy = $state(false);
	let dialog: HTMLDialogElement;
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
	<div class="chart-svg [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html expanded ? chart : preview}
	</div>
{/snippet}
<section class="card overflow-hidden">
	<div class="p-3 pb-1">
		<div class="flex items-center justify-between gap-2">
			<div>
				<h2 class="flex items-center gap-2 text-sm font-semibold">
					<ChartScatterIcon class="size-4 shrink-0" aria-hidden="true" />Voxel signal
				</h2>
				<p class="mt-0.5 text-xs text-muted-foreground tabular-nums" aria-label="Voxel coordinates">
					({x}, {y}, {slice})
				</p>
			</div>
			<button class="button button-ghost px-2 text-xs" onclick={() => dialog.showModal()}
				><ExpandIcon class="size-4 shrink-0" aria-hidden="true" />Expand chart</button
			>
		</div>
		<p
			class="mt-2 flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-selection tabular-nums"
		>
			{signals[active].toFixed(1)} a.u.
			<span class="text-xs font-normal text-muted-foreground"
				>Vol {active + 1} · b {dataset.bValues[active]} s/mm²</span
			>
		</p>
	</div>
	{@render plot()}
	<div class="px-3 pb-3 text-xs">
		<div class="mb-2 rounded-md bg-muted/50 px-2.5 py-2 text-muted-foreground">
			{#if fitted}
				<p>
					{fitted.valid ? 'Fitted curve shown' : 'Flagged fit · inspect voxel quality'} ·
					<a class="underline underline-offset-2" href="#ivim-analysis">IVIM analysis</a>
				</p>
			{:else}
				<p class="font-medium text-foreground">No fitted curve yet</p>
				<p class="mt-1">
					Run this voxel in <a class="underline underline-offset-2" href="#ivim-analysis"
						>IVIM analysis</a
					> to show the model line.
				</p>
			{/if}
		</div>
		<details class="border-t" bind:open={valuesOpen}>
			<summary class="min-h-9 cursor-pointer py-2 font-medium"
				><TableIcon class="mr-1 inline-block size-4 align-middle" aria-hidden="true" />Signal values
				<span class="font-normal text-muted-foreground">· {signals.length} samples</span></summary
			>
			<p class="mb-2 leading-relaxed text-muted-foreground">
				Each point is one acquisition; the larger ring marks the selected volume. Repeated b-values
				remain separate and may overlap. A line represents an actual model fit.
			</p>
			<table class="mt-2 w-full text-right">
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
		</details>
		<details class="border-t">
			<summary class="min-h-9 cursor-pointer py-2 font-medium"
				><DownloadIcon
					class="mr-1 inline-block size-4 align-middle"
					aria-hidden="true"
				/>Export</summary
			>
			<div class="flex flex-wrap gap-1 pb-1">
				<button class="button button-outline text-xs" onclick={() => exportChart(false)}>SVG</button
				>
				<button
					class="button button-outline text-xs"
					disabled={pngBusy}
					onclick={() => exportChart(true)}>{pngBusy ? 'Exporting…' : 'PNG'}</button
				>
				<button class="button button-outline text-xs" onclick={exportCsv}>Voxel CSV</button>
			</div>
		</details>
	</div>
</section>
<dialog
	bind:this={dialog}
	class="m-auto max-h-[calc(100dvh-24px)] w-[min(1000px,calc(100vw-24px))] overflow-auto rounded-xl border bg-card p-0 text-foreground backdrop:bg-black/65"
	aria-labelledby="chart-title"
>
	<div class="flex flex-wrap items-center justify-between gap-2 border-b p-3">
		<div>
			<h2 id="chart-title" class="flex items-center gap-2 font-semibold">
				<ChartScatterIcon class="size-4 shrink-0" aria-hidden="true" />Voxel signal
			</h2>
			<p class="text-xs text-muted-foreground">
				({x}, {y}, {slice}) · {signals.length} acquisitions
			</p>
		</div>
		<form method="dialog"><button class="button button-outline">Close chart</button></form>
	</div>
	<div class="min-h-0 overflow-auto">
		<div class="flex flex-wrap gap-2 p-3">
			<button class="button button-outline" onclick={() => exportChart(false)}>Export SVG</button
			><button class="button button-outline" disabled={pngBusy} onclick={() => exportChart(true)}
				>Export PNG</button
			><button class="button button-outline" onclick={exportCsv}>Current voxel CSV</button>
		</div>
		{@render plot(true)}
		<p class="p-3 text-xs text-muted-foreground">
			Acquisitions remain separate; spatial ROI means are labelled. No jitter. A model curve appears
			only for an actual fit. Larger markers identify the active volume.
		</p>
	</div>
</dialog>
