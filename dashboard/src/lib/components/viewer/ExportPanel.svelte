<script lang="ts">
	import PackageIcon from '~icons/lucide/package-open';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import { onDestroy } from 'svelte';
	import type { Dataset, VoxelVolume, Bookmark } from '$lib/ivim';
	import type { Roi } from '$lib/roi';
	import type { FitResult } from '$lib/analysis';
	import type { ScanMetadata } from '$lib/imports/scan';
	import type { Point } from '$lib/spatial';
	import { download, type Workspace } from '$lib/workspace';
	let {
		dataset,
		volumes,
		rois,
		bookmarks,
		point,
		result,
		metadata,
		open = $bindable(true),
		getworkspace
	}: {
		dataset: Dataset;
		volumes: VoxelVolume[];
		rois: Roi[];
		bookmarks: Bookmark[];
		point: Point;
		result?: FitResult;
		metadata?: ScanMetadata;
		open: boolean;
		getworkspace: () => Workspace;
	} = $props();
	let busy = $state(false),
		stage = $state(''),
		error = $state('');
	let worker: Worker | undefined;
	onDestroy(() => worker?.terminate());
	function cancel() {
		worker?.terminate();
		worker = undefined;
		busy = false;
		stage = 'Export cancelled';
	}
	function exportBundle() {
		busy = true;
		error = '';
		stage = 'Preparing export worker…';
		try {
			worker = new Worker(new URL('../../export-bundle.worker.ts', import.meta.url), {
				type: 'module'
			});
			worker.onmessage = (event) => {
				if (event.data.stage) {
					stage = event.data.stage;
					return;
				}
				busy = false;
				worker?.terminate();
				worker = undefined;
				if (event.data.error) {
					error = event.data.error;
					return;
				}
				download(
					new Blob([event.data.bytes], { type: 'application/zip' }),
					'osipy-viewer-bundle.zip'
				);
				stage = 'Bundle exported';
			};
			worker.onerror = () => {
				cancel();
				error = 'Export worker failed.';
			};
			worker.postMessage(
				$state.snapshot({
					dataset,
					volumes,
					rois,
					bookmarks,
					point,
					fit: result,
					metadata,
					workspace: getworkspace()
				})
			);
		} catch (e) {
			cancel();
			error = e instanceof Error ? e.message : 'Export failed';
		}
	}
</script>

<section class="card space-y-3 p-3 text-xs {open ? '' : '[&>*:not(:first-child)]:hidden'}">
	<h2>
		<button
			type="button"
			class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			aria-label="{open ? 'Collapse' : 'Expand'} export panel"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<PackageIcon class="size-4 shrink-0" aria-hidden="true" />Export & external tools
			{#if open}<ChevronDownIcon class="ml-auto size-4" />{:else}<ChevronRightIcon
					class="ml-auto size-4"
				/>{/if}
		</button>
	</h2>
	<p class="text-muted-foreground">
		Download a ZIP with the source image, {result
			? 'actual parameter/quality maps and report, '
			: ''}ROI masks, notes, selected-voxel CSV, and Slicer/ITK-SNAP handoff files. No application
		is launched.
	</p>
	<button class="button button-primary w-full" disabled={busy} onclick={exportBundle}
		>Export {result ? 'analysis' : 'viewer'} bundle</button
	>
	{#if busy}<button class="button button-outline" onclick={cancel}>Cancel export</button>{/if}
	{#if stage}<p role="status">{stage}</p>{/if}{#if error}<p class="text-destructive" role="alert">
			{error}
		</p>{/if}
	<p class="text-muted-foreground">
		Overlapping ROIs are separate NIfTI masks. The ZIP contains load-in-slicer.py and step-by-step
		ITK-SNAP instructions; imaging data stays local.
	</p>
</section>
