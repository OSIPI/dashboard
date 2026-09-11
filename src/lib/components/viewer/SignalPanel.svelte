<script lang="ts">
	import { onMount } from 'svelte';
	import type { Dataset, Bookmark } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import { chartSvg, download, voxelCsv } from '$lib/workspace';
	let {
		dataset,
		volumes,
		active,
		x,
		y,
		slice,
		bookmarks,
		compared,
		valuesOpen = $bindable(false),
		onerror
	}: {
		dataset: Dataset;
		volumes: Int16Array[];
		active: number;
		x: number;
		y: number;
		slice: number;
		bookmarks: Bookmark[];
		compared: string[];
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
			}))
	]);
	const chart = $derived(chartSvg(dataset, series, active, dark));
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

{#snippet plot()}
	<!-- chartSvg escapes user/dataset text and emits controlled SVG; never interpolate external markup. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class="chart-svg [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">{@html chart}</div>
{/snippet}
<section class="card overflow-hidden">
	<div class="border-b p-3">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-sm font-semibold">Voxel signal</h2>
			<p class="text-xs text-muted-foreground" aria-label="Voxel coordinates">
				({x}, {y}, {slice})
			</p>
		</div>
		<p class="mt-2 text-sm font-semibold text-selection">
			{signals[active].toFixed(1)} a.u.
			<span class="text-xs font-normal text-muted-foreground"
				>/ volume {active + 1} · b {dataset.bValues[active]}</span
			>
		</p>
	</div>
	<div class="flex flex-wrap gap-1 p-2">
		<button class="button button-ghost" onclick={() => dialog.showModal()}>Expand chart</button
		><button class="button button-ghost" onclick={() => exportChart(false)}>SVG</button><button
			class="button button-ghost"
			disabled={pngBusy}
			onclick={() => exportChart(true)}>PNG</button
		><button class="button button-ghost" onclick={exportCsv}>Voxel CSV</button>
	</div>
	{@render plot()}
	<div class="px-3 pb-3">
		<p class="text-[11px] text-muted-foreground">
			{signals.length} acquired samples. Larger ring: selected volume. Repeated b-values remain separate;
			coincident samples may overlap. No averaging or fitting.
		</p>
		<details class="mt-3 text-xs" bind:open={valuesOpen}>
			<summary class="cursor-pointer font-medium">Signal values</summary>
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
	</div>
</section>
<dialog
	bind:this={dialog}
	class="m-auto max-h-[calc(100dvh-24px)] w-[min(1000px,calc(100vw-24px))] overflow-auto rounded-xl border bg-card p-0 text-foreground backdrop:bg-black/65"
	aria-labelledby="chart-title"
>
	<div class="flex flex-wrap items-center justify-between gap-2 border-b p-3">
		<h2 id="chart-title" class="font-semibold">Acquired voxel signals</h2>
		<form method="dialog"><button class="button button-outline">Close chart</button></form>
	</div>
	<div class="min-h-0 overflow-auto">
		<div class="flex flex-wrap gap-2 p-3">
			<button class="button button-outline" onclick={() => exportChart(false)}>Export SVG</button
			><button class="button button-outline" disabled={pngBusy} onclick={() => exportChart(true)}
				>Export PNG</button
			><button class="button button-outline" onclick={exportCsv}>Current voxel CSV</button>
		</div>
		{@render plot()}
		<p class="p-3 text-xs text-muted-foreground">
			Individual acquired samples; no averaging, jitter or fitted curves. Larger markers identify
			the active volume.
		</p>
	</div>
</dialog>
