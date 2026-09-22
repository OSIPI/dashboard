<script lang="ts">
	import ScanIcon from '~icons/lucide/scan';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import SquareDashedIcon from '~icons/lucide/square-dashed';
	import PencilLineIcon from '~icons/lucide/pencil-line';
	import CrosshairIcon from '~icons/lucide/crosshair';
	import { onDestroy } from 'svelte';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import type { RoiSession } from '$lib/roi-session.svelte';
	import { maskRois, roiStatistics, type Roi, type ViewerTool } from '$lib/roi';
	import type { FitResult } from '$lib/analysis';
	import { loadLocal } from '$lib/imports/load-local';
	import { niftiBytes } from '$lib/nifti-export';
	import { download } from '$lib/workspace';
	let {
		session,
		dataset,
		volumes,
		active,
		slice,
		tool,
		onstart,
		visible = $bindable(true),
		opacity = $bindable(0.25),
		meanVisible = $bindable(false),
		open = $bindable(true),
		result
	}: {
		session: RoiSession;
		dataset: Dataset;
		volumes: VoxelVolume[];
		active: number;
		slice: number;
		tool: ViewerTool;
		onstart: (tool: ViewerTool) => void;
		visible: boolean;
		opacity: number;
		meanVisible: boolean;
		open: boolean;
		result?: FitResult;
	} = $props();
	let metric = $state('signal');
	let rectangle = $state([0, 0, 1, 1]);
	let importing = $state(false);
	let pending = $state.raw<Roi[]>([]);
	let dialog: HTMLDialogElement;
	let controller: AbortController | undefined;
	const current = $derived(session.current);
	$effect(() => {
		if (metric !== 'signal' && !result?.maps[metric]) metric = 'signal';
	});
	const stats = $derived(
		roiStatistics(current?.indices ?? [], (i) =>
			metric === 'signal'
				? volumes[active][i] * dataset.slope + dataset.intercept
				: result?.maps.Valid[i] === 1
					? result.maps[metric][i]
					: NaN
		)
	);
	const unit = $derived(
		metric === 'signal' ? 'a.u.' : (result?.report.maps.find((m) => m.name === metric)?.unit ?? '')
	);
	onDestroy(() => controller?.abort());
	function exportMask() {
		if (!current) return;
		const mask = new Uint16Array(dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1));
		for (const i of current.indices) mask[i] = current.label;
		download(
			new Blob([niftiBytes(dataset, [mask], true)], { type: 'application/octet-stream' }),
			`roi-${current.label}.nii`
		);
	}
	async function importMask(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		controller = new AbortController();
		importing = true;
		session.error = '';
		try {
			const decoded = await loadLocal(
				file,
				new File(['0'], 'mask.bval'),
				undefined,
				128 * 1024 * 1024,
				controller.signal
			);
			pending = maskRois(decoded.volumes[0], decoded.dataset, dataset);
			if (!pending.length) throw new Error('The mask has no nonzero labels.');
			dialog.showModal();
		} catch (e) {
			session.error = e instanceof Error ? e.message : 'Mask import failed';
		} finally {
			importing = false;
		}
	}
	function exportMean() {
		if (!current?.indices.length) return;
		const rows = ['volume,b_s_per_mm2,roi_voxels,mean_signal_au'];
		volumes.forEach((v, i) => {
			let mean = 0;
			current.indices.forEach(
				(index, n) => (mean += (v[index] * dataset.slope + dataset.intercept - mean) / (n + 1))
			);
			rows.push(`${i + 1},${dataset.bValues[i]},${current.indices.length},${mean}`);
		});
		download(new Blob([rows.join('\r\n')], { type: 'text/csv' }), 'roi-mean-signal.csv');
	}
</script>

<section class="card space-y-3 p-3 {open ? '' : '[&>*:not(:first-child)]:hidden'}">
	<h2>
		<button
			type="button"
			class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			aria-label="{open ? 'Collapse' : 'Expand'} regions of interest panel"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<ScanIcon class="size-4 shrink-0" aria-hidden="true" />Regions of interest
			{#if open}<ChevronDownIcon class="ml-auto size-4" />{:else}<ChevronRightIcon
					class="ml-auto size-4"
				/>{/if}
		</button>
	</h2>
	<div class="flex justify-end">
		<button
			class="button button-outline h-8 px-2 text-xs"
			onclick={() => {
				session.add();
				onstart('rectangle');
			}}>New ROI</button
		>
	</div>
	{#if session.rois.length}
		<select class="input w-full text-xs" aria-label="Active ROI" bind:value={session.selected}
			>{#each session.rois as roi (roi.id)}<option value={roi.id}
					>{roi.name} · {roi.indices.length} voxels</option
				>{/each}</select
		>
		{#if current}
			<div class="flex gap-2">
				<input
					class="input min-w-0 flex-1 px-2 py-1 text-xs"
					aria-label="ROI name"
					maxlength="80"
					value={current.name}
					onchange={(e) =>
						session.update(
							session.rois.map((r) =>
								r.id === current.id
									? { ...r, name: e.currentTarget.value.trim() || `ROI ${r.label}` }
									: r
							)
						)}
				/><input
					class="h-8 w-10"
					aria-label="ROI color"
					type="color"
					value={current.color}
					onchange={(e) =>
						session.update(
							session.rois.map((r) =>
								r.id === current.id ? { ...r, color: e.currentTarget.value } : r
							)
						)}
				/>
			</div>
			<div class="flex flex-wrap gap-1">
				<button
					class="button button-ghost h-8 px-2 text-xs"
					aria-pressed={tool === 'rectangle'}
					onclick={() => onstart('rectangle')}
					><SquareDashedIcon class="size-4 shrink-0" aria-hidden="true" />Rectangle</button
				><button
					class="button button-ghost h-8 px-2 text-xs"
					aria-pressed={tool === 'freehand'}
					onclick={() => onstart('freehand')}
					><PencilLineIcon class="size-4 shrink-0" aria-hidden="true" />Freehand</button
				><button class="button button-ghost h-8 px-2 text-xs" onclick={() => onstart('inspect')}
					><CrosshairIcon class="size-4 shrink-0" aria-hidden="true" />Inspect voxel</button
				>
			</div>
			<div class="flex flex-wrap items-center gap-3 text-xs">
				<label class="flex items-center gap-1"
					><input type="checkbox" bind:checked={session.erase} />Erase from ROI</label
				><label class="flex items-center gap-1"
					><input type="checkbox" bind:checked={visible} />Show ROI</label
				><button class="underline" disabled={!session.history.length} onclick={() => session.undo()}
					>Undo</button
				>
			</div>
			<label class="block text-xs"
				>ROI opacity<input
					class="w-full accent-selection"
					type="range"
					min="0"
					max="1"
					step="0.05"
					bind:value={opacity}
				/></label
			>
			<p class="text-xs text-muted-foreground">
				Draw on native slices; freehand regions close on release. Escape cancels a stroke. Undo
				retains 10 edits. Regions may span slices; no automatic propagation.
			</p>
			<details class="text-xs">
				<summary class="cursor-pointer">Numeric rectangle (keyboard input)</summary>
				<p class="my-2 text-muted-foreground">
					Zero-based voxel-edge bounds; end edges are exclusive. Applies on slice {slice + 1}.
				</p>
				<div class="grid grid-cols-2 gap-2">
					{#each ['X start', 'Y start', 'X end', 'Y end'] as label, i (label)}<label
							>{label}<input
								class="input mt-1 w-full px-1 py-1"
								type="number"
								min="0"
								max={dataset.dimensions[i % 2]}
								step="1"
								bind:value={rectangle[i]}
							/></label
						>{/each}
				</div>
				<button
					class="button button-outline mt-2"
					onclick={() =>
						session.draw(
							[
								[rectangle[0], rectangle[1]],
								[rectangle[2], rectangle[3]]
							],
							slice,
							true
						)}>Apply rectangle</button
				>
			</details>
			<div class="flex gap-2 text-xs">
				<button
					class="underline"
					onclick={() =>
						session.update(
							session.rois.map((r) => (r.id === current.id ? { ...r, indices: [] } : r))
						)}>Clear ROI</button
				><button
					class="underline"
					onclick={() => session.update(session.rois.filter((r) => r.id !== current.id))}
					>Delete ROI</button
				>
			</div>
		{/if}
	{/if}
	{#if session.error}<p class="text-xs text-destructive" role="alert">{session.error}</p>{/if}
	<details class="text-xs">
		<summary class="cursor-pointer font-medium">Mask import / export</summary>
		<p class="my-2 text-muted-foreground">
			Import a 3D integer-label NIfTI matching this dataset's dimensions and affine. Exported ROI
			masks preserve geometry; names and colors can be included in a bundle.
		</p>
		<input
			class="block w-full text-xs"
			aria-label="Import ROI mask"
			type="file"
			accept=".nii,.gz"
			disabled={importing}
			onchange={importMask}
		/>{#if importing}<span role="status">Validating mask…</span>{/if}<button
			class="button button-outline mt-2"
			disabled={!current?.indices.length}
			onclick={exportMask}>Export selected ROI mask</button
		>
	</details>
	{#if current?.indices.length}
		<div class="space-y-2 border-t pt-2 text-xs">
			<h3 class="font-semibold">ROI summary</h3>
			<label class="flex items-center gap-2"
				><input type="checkbox" bind:checked={meanVisible} />Compare ROI mean signal in chart</label
			>
			<label
				>Measure<select class="input mt-1 w-full text-xs" bind:value={metric}
					><option value="signal">Current acquisition signal</option
					>{#each result?.report.maps.filter((m) => !['Valid', 'Status'].includes(m.name)) ?? [] as map (map.name)}<option
							value={map.name}>{map.name} · {map.unit}</option
						>{/each}</select
				></label
			>
			<p>
				{stats.count}/{stats.selected} finite {metric === 'signal' ? 'signal' : 'quality-valid map'}
				voxels · {unit}
			</p>
			<dl class="grid grid-cols-2 gap-1">
				{#each [['Mean', stats.mean], ['Median', stats.median], ['SD (population)', stats.sd], ['Minimum', stats.min], ['Maximum', stats.max]] as [label, value] (label)}<div
					>
						<dt class="text-muted-foreground">{label}</dt>
						<dd>{typeof value === 'number' ? value.toPrecision(5) : 'Unavailable'}</dd>
					</div>{/each}
			</dl>
			<button class="button button-outline" onclick={exportMean}>Export ROI mean signal CSV</button>
			<p class="text-muted-foreground">
				Signal means are not fits. Map summaries average voxelwise estimates; they are not
				parameters fitted to an averaged signal.
			</p>
		</div>
	{/if}
</section>
<dialog
	bind:this={dialog}
	class="m-auto max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] overflow-auto rounded-xl border bg-card p-4 text-foreground backdrop:bg-black/65"
	aria-labelledby="mask-import-title"
>
	<h2 id="mask-import-title" class="font-semibold">Replace ROI labels?</h2>
	<p class="my-3 text-sm">
		Geometry verified. Import {pending.length} labels, replacing this session's regions. You can undo
		this replacement.
	</p>
	<div class="flex gap-2">
		<button
			class="button button-primary"
			onclick={() => {
				session.update(pending);
				onstart('inspect');
				dialog.close();
			}}>Import labels</button
		><button class="button button-outline" onclick={() => dialog.close()}>Cancel mask import</button
		>
	</div>
</dialog>
