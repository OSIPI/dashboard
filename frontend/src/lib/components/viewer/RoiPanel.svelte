<script lang="ts">
	import ScanIcon from '~icons/lucide/scan';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import InfoIcon from '~icons/lucide/info';
	import PlusIcon from '~icons/lucide/plus';
	import { onDestroy, tick } from 'svelte';
	import RoiLayer from './RoiLayer.svelte';
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
		onstart,
		defaultVisible,
		defaultOpacity,
		meanVisible = $bindable(false),
		open = $bindable(true),
		result
	}: {
		session: RoiSession;
		dataset: Dataset;
		volumes: VoxelVolume[];
		active: number;
		slice: number;
		onstart: (tool: ViewerTool) => void;
		defaultVisible: boolean;
		defaultOpacity: number;
		meanVisible: boolean;
		open: boolean;
		result?: FitResult;
	} = $props();
	let metric = $state('signal');
	let rectangle = $state([0, 0, 1, 1]);
	let importing = $state(false);
	let pending = $state.raw<Roi[]>([]);
	let dialog: HTMLDialogElement;
	let undoButton: HTMLButtonElement;
	let addButton: HTMLButtonElement;
	let actions = $state('');
	let controller: AbortController | undefined;
	const current = $derived(session.current);
	const notice = $derived(session.history.at(-1)?.notice);
	async function removeLayer(roi: Roi, clear: boolean) {
		actions = '';
		if (clear) session.edit(roi.id, { indices: [] }, `${roi.name} mask cleared.`);
		else
			session.update(
				session.rois.filter((r) => r.id !== roi.id),
				`${roi.name} deleted.`
			);
		await tick();
		undoButton?.focus();
	}
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

<section
	data-diagnostic="roi-edit"
	class="card space-y-2.5 p-3 {open ? '' : '[&>*:not(:first-child)]:hidden'}"
>
	<div class="flex items-center gap-2">
		<h2 class="min-w-0 flex-1">
			<button
				type="button"
				class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
				aria-label="{open ? 'Collapse' : 'Expand'} regions of interest panel"
				aria-expanded={open}
				onclick={() => (open = !open)}
			>
				<ScanIcon class="size-4 shrink-0" aria-hidden="true" />ROI layers
				<span class="text-xs font-normal text-muted-foreground">{session.rois.length}</span>
				{#if open}<ChevronDownIcon class="ml-auto size-4" />{:else}<ChevronRightIcon
						class="ml-auto size-4"
					/>{/if}
			</button>
		</h2>
		{#if open}
			<button
				bind:this={addButton}
				class="button button-outline h-8 gap-1 px-2 text-xs max-[899px]:h-11"
				onclick={() => {
					if (session.add()) onstart('rectangle');
				}}><PlusIcon class="size-4" aria-hidden="true" />New ROI</button
			>
		{/if}
	</div>
	{#if session.rois.length}
		<ul class="space-y-1" aria-label="ROI layers">
			{#each [...session.rois].reverse() as roi (roi.id)}
				<RoiLayer
					{roi}
					{session}
					{defaultVisible}
					{defaultOpacity}
					open={actions === roi.id}
					ontoggle={() => (actions = actions === roi.id ? '' : roi.id)}
					onremove={(clear) => removeLayer(roi, clear)}
				/>
			{/each}
		</ul>
	{:else}
		<p class="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
			No layers yet. Add an ROI to start drawing on the image.
		</p>
	{/if}
	{#if notice}
		<div
			class="flex items-center justify-between gap-2 rounded-md border bg-muted/35 px-2 py-1 text-xs"
		>
			<p role="status" class="min-w-0 wrap-break-word">{notice}</p>
			<button
				type="button"
				bind:this={undoButton}
				class="button button-ghost h-8 px-2 text-xs max-[899px]:h-11"
				onclick={async () => {
					session.undo();
					await tick();
					addButton?.focus();
				}}>Undo</button
			>
		</div>
	{/if}
	{#if session.rois.length}
		{#if current}
			<details class="text-xs">
				<summary class="cursor-pointer">Coordinates</summary>
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
							true,
							defaultVisible
						)}>Apply rectangle</button
				>
			</details>
		{/if}
	{/if}
	{#if session.error}<p class="text-xs text-destructive" role="alert">{session.error}</p>{/if}
	<details class="text-xs">
		<summary class="cursor-pointer font-medium">Mask files</summary>
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
		<details class="space-y-2 border-t pt-2 text-xs">
			<summary class="cursor-pointer font-medium">
				Measurements
				<span class="text-muted-foreground">{current.indices.length} voxels</span>
			</summary>
			<label class="flex items-center gap-2"
				><input type="checkbox" bind:checked={meanVisible} />Show mean in chart</label
			>
			<label class="sr-only" for="roi-measure">Measure</label><select
				id="roi-measure"
				class="input w-full text-xs"
				bind:value={metric}
				><option value="signal">Current acquisition signal</option
				>{#each result?.report.maps.filter((m) => !['Valid', 'Status'].includes(m.name)) ?? [] as map (map.name)}<option
						value={map.name}>{map.name} · {map.unit}</option
					>{/each}</select
			>
			<div class="rounded-md border bg-background/40 px-3 py-2">
				<div class="flex items-baseline justify-between gap-2">
					<span class="text-muted-foreground">Mean</span><span class="text-muted-foreground"
						>{stats.count}/{stats.selected} valid · {unit}</span
					>
				</div>
				<strong class="block text-lg font-semibold tabular-nums"
					>{typeof stats.mean === 'number' ? stats.mean.toPrecision(5) : 'Unavailable'}</strong
				>
			</div>
			<dl class="grid grid-cols-4 gap-1 text-center tabular-nums">
				{#each [['Median', stats.median], ['SD', stats.sd], ['Min', stats.min], ['Max', stats.max]] as [label, value] (label)}<div
						class="min-w-0"
					>
						<dt
							class="text-muted-foreground"
							title={label === 'SD' ? 'Population standard deviation' : String(label)}
						>
							{label}
						</dt>
						<dd
							class="truncate"
							title={typeof value === 'number' ? value.toPrecision(5) : 'Unavailable'}
						>
							{typeof value === 'number' ? value.toPrecision(4) : '—'}
						</dd>
					</div>{/each}
			</dl>
			<div class="flex items-center justify-between gap-2">
				<button class="button button-outline h-8 px-2 text-xs" onclick={exportMean}
					>Export mean CSV</button
				>
				<details class="min-w-0 flex-1 text-right text-muted-foreground">
					<summary
						class="inline-flex cursor-pointer items-center gap-1"
						aria-label="About ROI statistics"
						><InfoIcon class="size-4" aria-hidden="true" />About</summary
					>
					<p class="mt-2 text-left">
						Signal means are not fits. Map summaries average voxelwise estimates, not parameters
						fitted to an averaged signal.
					</p>
				</details>
			</div>
		</details>
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
