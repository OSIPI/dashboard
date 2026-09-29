<script lang="ts">
	import { onDestroy } from 'svelte';
	import { discoverFiles, type Candidate } from '$lib/imports/discovery';
	import { loadLocal } from '$lib/imports/load-local';
	import { ImportError } from '$lib/imports/nifti';
	import {
		SESSION_LIMIT,
		validDate,
		type Scan,
		type ScanMetadata,
		type ValidationIssue
	} from '$lib/imports/scan';
	import ScanMetadataForm from './ScanMetadataForm.svelte';
	import ScanValidation from './ScanValidation.svelte';
	import FilesIcon from '~icons/lucide/files';
	import FolderOpenIcon from '~icons/lucide/folder-open';
	let {
		scans,
		activeId,
		onadd,
		onselect,
		onmetadata,
		onremove,
		triggerLabel = 'Scans / Import'
	}: {
		scans: Scan[];
		activeId: string;
		onadd: (scan: Scan) => void | Promise<void>;
		onselect: (id: string) => void;
		onmetadata: (id: string, metadata: ScanMetadata) => void;
		onremove: (id: string) => void;
		triggerLabel?: string;
	} = $props();
	let dialog: HTMLDialogElement;
	const titleId = $props.id();
	let candidates = $state<Candidate[]>([]);
	let issues = $state<ValidationIssue[]>([]);
	let busy = $state('');
	let controller: AbortController | undefined;
	const usedBytes = $derived(scans.reduce((n, s) => n + s.dataset.byteLength, 0));
	onDestroy(() => controller?.abort());
	function close() {
		controller?.abort();
		dialog.close();
	}
	async function discover(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (!files.length) return;
		controller?.abort();
		controller = new AbortController();
		const current = controller;
		busy = 'Discovering local files…';
		issues = [];
		try {
			const result = await discoverFiles(files, current.signal);
			if (current.signal.aborted) return;
			candidates = result.candidates;
			issues = result.issues;
		} catch (error) {
			if (!current.signal.aborted)
				issues = [
					{
						severity: 'error',
						message: error instanceof Error ? error.message : 'Discovery failed.'
					}
				];
		} finally {
			if (controller === current) busy = '';
		}
	}
	async function load(candidate: Candidate) {
		if (!candidate.image || !candidate.bval || busy) return;
		if (!validDate(candidate.metadata.date) || candidate.metadata.technique !== 'IVIM') return;
		const metadata = { ...candidate.metadata };
		controller = new AbortController();
		const current = controller;
		busy = `Validating ${candidate.name}…`;
		try {
			const loaded = await loadLocal(
				candidate.image,
				candidate.bval,
				candidate.bvec,
				SESSION_LIMIT - usedBytes,
				current.signal
			);
			if (current.signal.aborted) return;
			candidate.issues = loaded.issues;
			await onadd({ ...loaded, id: candidate.id, metadata });
		} catch (error) {
			if (!current.signal.aborted)
				candidate.issues =
					error instanceof ImportError
						? error.issues
						: [
								{
									severity: 'error',
									message: error instanceof Error ? error.message : 'Import failed.'
								}
							];
		} finally {
			if (controller === current) busy = '';
		}
	}
</script>

<button
	class="button button-outline h-8 px-2 text-xs"
	aria-label={triggerLabel}
	onclick={() => dialog.showModal()}
	><span class="max-[899px]:hidden">{triggerLabel}</span><span class="min-[900px]:hidden"
		>{triggerLabel === 'Scans / Import' ? 'Scans' : triggerLabel}</span
	></button
>
<dialog
	bind:this={dialog}
	onclose={() => controller?.abort()}
	class="m-auto max-h-[calc(100dvh-16px)] w-[min(1000px,calc(100vw-16px))] overflow-auto rounded-xl border bg-card p-0 text-foreground backdrop:bg-black/65"
	aria-labelledby={titleId}
>
	<div class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card p-3">
		<h2 id={titleId} class="font-semibold">Import local data</h2>
		<button class="button button-outline" onclick={close}>Close library</button>
	</div>
	<div class="space-y-6 p-4 sm:p-5">
		<div class="space-y-1">
			<h3 class="text-sm font-semibold">1. Select data from this device</h3>
			<p class="text-sm text-muted-foreground">
				Choose a NIfTI image (.nii/.nii.gz) and its sidecars, or browse a BIDS or DICOM folder.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label
				class="relative flex min-h-32 flex-col items-start justify-between gap-3 rounded-lg border bg-background p-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-foreground/40 hover:bg-accent/40 has-[:disabled]:opacity-50"
			>
				<span class="flex items-start gap-3">
					<FilesIcon class="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="flex flex-col gap-1"
						><span class="text-sm font-semibold">Image and sidecars</span><span
							class="text-xs text-muted-foreground"
							>Select one or more NIfTI, b-value or metadata files</span
						></span
					>
				</span>
				<span class="button button-outline border">Browse files</span>
				<input
					class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
					type="file"
					aria-label="Browse image and sidecar files"
					multiple
					accept=".nii,.gz,.bval,.bvec,.json,.dcm,.ima,.tsv"
					disabled={!!busy}
					onchange={discover}
				/>
			</label>
			<label
				class="relative flex min-h-32 flex-col items-start justify-between gap-3 rounded-lg border bg-background p-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-foreground/40 hover:bg-accent/40 has-[:disabled]:opacity-50"
			>
				<span class="flex items-start gap-3">
					<FolderOpenIcon class="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="flex flex-col gap-1"
						><span class="text-sm font-semibold">Local folder</span><span
							class="text-xs text-muted-foreground"
							>Discover acquisitions in a BIDS or DICOM folder</span
						></span
					>
				</span>
				<span class="button button-outline border">Browse folder</span>
				<input
					class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
					type="file"
					aria-label="Browse local folder"
					multiple
					webkitdirectory
					disabled={!!busy}
					onchange={discover}
				/>
			</label>
		</div>
		<div
			class="rounded-lg border bg-secondary/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground"
		>
			<p>
				Files stay in this browser on this device after import. Analysis sends samples only to your
				loopback REST API, never a remote analysis service.
			</p>
			<p class="mt-1">
				{Math.round(usedBytes / 1024 / 1024)} / 768 MiB session image memory · 512 MiB maximum decoded
				image
			</p>
		</div>
		{#if busy}<div class="flex items-center gap-2" role="status">
				<span class="text-sm">{busy}</span><button
					class="button button-outline"
					onclick={() => controller?.abort()}>Cancel import</button
				>
			</div>{/if}
		<ScanValidation {issues} />
		{#if candidates.length}<h3 class="border-t pt-5 text-sm font-semibold">
				2. Review discovered acquisitions
			</h3>{/if}
		{#each candidates as candidate (candidate.id)}
			<section class="space-y-5 rounded-xl border bg-background p-4 sm:p-5">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h4 class="text-sm font-semibold">{candidate.name}</h4>
					<span class="badge">{candidate.kind.toUpperCase()} · {candidate.fileCount} files</span>
				</div>
				<p class="-mt-3 text-xs break-all text-muted-foreground">{candidate.path}</p>
				<div class="space-y-1">
					<h5 class="text-xs font-semibold text-muted-foreground">Acquisition details</h5>
					<ScanMetadataForm
						value={candidate.metadata}
						onchange={(value) => (candidate.metadata = value)}
					/>
				</div>
				<p class="text-xs text-muted-foreground">
					Set a shared frame only when registration or acquisition geometry confirms it; matching
					subject names are not enough.
				</p>
				{#if !validDate(candidate.metadata.date)}<p class="text-xs text-destructive">
						Use a valid ISO date or timestamp, or leave the date unknown.
					</p>{/if}
				<details class="text-xs">
					<summary
						class="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring"
						>Source metadata</summary
					>
					<dl class="mt-2 grid gap-1 sm:grid-cols-2">
						{#each Object.entries(candidate.details) as [key, value] (key)}<div>
								<dt class="font-medium">{key}</dt>
								<dd class="break-all text-muted-foreground">{value || 'Not supplied'}</dd>
							</div>{/each}
					</dl>
				</details>
				{#if candidate.kind === 'nifti'}
					<div class="grid gap-3 border-t pt-4 sm:grid-cols-2">
						<label
							class="relative flex min-w-0 flex-col items-start gap-2 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring has-[:disabled]:opacity-50"
						>
							<span class="text-sm font-medium"
								>b-values <span class="text-muted-foreground">· Required</span></span
							>
							<span class="button button-outline border">Choose b-values file</span>
							<span class="max-w-full truncate text-xs text-muted-foreground"
								>{candidate.bval?.name ?? 'No file selected'}</span
							>
							<input
								class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
								type="file"
								aria-label="Choose b-values file for {candidate.name}"
								accept=".bval,.txt"
								disabled={!!busy}
								onchange={(e) => (candidate.bval = e.currentTarget.files?.[0])}
							/>
						</label>
						<label
							class="relative flex min-w-0 flex-col items-start gap-2 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring has-[:disabled]:opacity-50"
						>
							<span class="text-sm font-medium"
								>b-vectors <span class="text-muted-foreground">· Optional</span></span
							>
							<span class="button button-outline border">Choose b-vectors file</span>
							<span class="max-w-full truncate text-xs text-muted-foreground"
								>{candidate.bvec?.name ?? 'No file selected'}</span
							>
							<input
								class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
								type="file"
								aria-label="Choose b-vectors file for {candidate.name}"
								accept=".bvec,.txt"
								disabled={!!busy}
								onchange={(e) => (candidate.bvec = e.currentTarget.files?.[0])}
							/>
						</label>
					</div>
					{#if candidate.metadata.technique !== 'IVIM'}<p class="text-xs text-muted-foreground">
							Catalogued as {candidate.metadata.technique}. The implemented image workflow is IVIM
							with diffusion b-values.
						</p>{/if}
					<button
						class="button button-primary disabled:opacity-50"
						disabled={!!busy ||
							!candidate.bval ||
							!validDate(candidate.metadata.date) ||
							candidate.metadata.technique !== 'IVIM' ||
							scans.some((s) => s.id === candidate.id) ||
							candidate.issues.some((i) => i.message.includes('JSON sidecar'))}
						onclick={() => load(candidate)}
						>{scans.some((s) => s.id === candidate.id)
							? 'Loaded into library'
							: 'Validate and load'}</button
					>
				{/if}
				<ScanValidation issues={candidate.issues} />
			</section>
		{/each}
		<h3 class="text-sm font-semibold">Loaded scans ({scans.length})</h3>
		{#each scans as scan (scan.id)}
			<section class="space-y-3 rounded-lg border p-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h4 class="text-sm font-semibold">{scan.dataset.name}</h4>
					<span class="badge"
						>{scan.dataset.dimensions[3]} volumes · {scan.dataset.dimensions[2]} slices</span
					>
				</div>
				<ScanMetadataForm
					value={scan.metadata}
					onchange={(value) => {
						if (validDate(value.date)) onmetadata(scan.id, value);
						else
							issues = [
								{
									severity: 'error',
									message: 'Acquisition date was not saved: enter a valid ISO date or timestamp.'
								}
							];
					}}
				/>
				<ScanValidation issues={scan.issues} />
				<div class="flex gap-2">
					<button
						class="button button-outline"
						disabled={scan.id === activeId || scan.metadata.technique !== 'IVIM'}
						onclick={() => {
							onselect(scan.id);
							close();
						}}>Open scan</button
					><button
						class="button button-ghost"
						disabled={scans.length < 2 || scan.id === activeId || !!busy}
						onclick={() => onremove(scan.id)}>Remove from session</button
					>
				</div>
			</section>
		{/each}
	</div>
</dialog>
