<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Header from '$lib/components/ui/Header.svelte';
	import ScanLibrary from '$lib/components/viewer/ScanLibrary.svelte';
	import StoredDatasetCard from '$lib/components/StoredDatasetCard.svelte';
	import OfflineStatus from '$lib/components/OfflineStatus.svelte';
	import LocalAnalysisSetup from '$lib/components/LocalAnalysisSetup.svelte';
	import {
		listStoredScans,
		saveScan,
		deleteStoredScan,
		updateStoredMetadata,
		storageError,
		type StoredScanSummary
	} from '$lib/local-library';
	import { loadZenodoDemo } from '$lib/imports/load-zenodo-demo';
	import { SESSION_LIMIT } from '$lib/imports/scan';
	import type { Scan, ScanMetadata } from '$lib/imports/scan';
	import UploadIcon from '~icons/lucide/upload';
	import ShieldIcon from '~icons/lucide/shield-check';
	let saved = $state.raw<StoredScanSummary[]>([]),
		session = $state.raw<Scan[]>([]);
	let search = $state(''),
		filter = $state('all'),
		loading = $state(true),
		error = $state(''),
		demoBusy = $state(false),
		demoProgress = $state('');
	let demoController: AbortController | undefined;
	let removal = $state<StoredScanSummary>();
	let dialog: HTMLDialogElement;
	const filtered = $derived(
		saved.filter(
			(s) =>
				`${s.name} ${s.metadata.subject} ${s.metadata.study} ${s.metadata.session}`
					.toLowerCase()
					.includes(search.toLowerCase()) &&
				(filter === 'all' || s.metadata.technique === filter)
		)
	);
	async function refresh() {
		try {
			saved = await listStoredScans();
			error = '';
		} catch (e) {
			error = storageError(e);
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void refresh();
	});
	onDestroy(() => demoController?.abort());
	async function add(scan: Scan) {
		try {
			await saveScan(scan);
			session = [...session, scan];
			await refresh();
		} catch (e) {
			error = storageError(e);
			throw new Error(error);
		}
	}
	function open(id: string) {
		let destination = resolve('/viewer');
		destination += `?scan=${encodeURIComponent(id)}`;
		void goto(destination);
	}
	async function metadata(id: string, value: ScanMetadata) {
		try {
			await updateStoredMetadata(id, value);
			session = session.map((s) => (s.id === id ? { ...s, metadata: value } : s));
			await refresh();
		} catch (e) {
			error = storageError(e);
		}
	}
	async function demo() {
		if (saved.some((s) => s.id === 'osipi-demo')) {
			open('osipi-demo');
			return;
		}
		demoController?.abort();
		const controller = new AbortController();
		demoController = controller;
		demoBusy = true;
		demoProgress = 'Starting direct download from Zenodo…';
		error = '';
		try {
			const loaded = await loadZenodoDemo(SESSION_LIMIT, controller.signal, (progress) => {
				if (progress.phase === 'download') {
					const percent = Math.floor(((progress.received ?? 0) / (progress.total ?? 1)) * 100);
					demoProgress = `Downloading demo from Zenodo… ${percent}%`;
				} else if (progress.phase === 'validate') demoProgress = 'Verifying Zenodo archive…';
				else demoProgress = 'Extracting and validating brain acquisition…';
			});
			if (controller.signal.aborted) return;
			await add({
				...loaded,
				id: 'osipi-demo',
				metadata: {
					subject: 'OSIPI reference',
					study: 'TF2.4',
					session: 'In-vivo brain',
					date: '',
					technique: 'IVIM',
					coordinateFrame: ''
				},
				issues: loaded.issues
			});
			open('osipi-demo');
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError'))
				error = `Demo could not be saved. ${storageError(e)} You can still import your own local files.`;
		} finally {
			if (demoController === controller) {
				demoBusy = false;
				demoProgress = '';
				demoController = undefined;
			}
		}
	}
	function cancelDemo() {
		demoController?.abort();
	}
	async function remove() {
		if (!removal) return;
		try {
			await deleteStoredScan(removal.id);
			session = session.filter((s) => s.id !== removal!.id);
			removal = undefined;
			dialog.close();
			await refresh();
		} catch (e) {
			error = storageError(e);
			dialog.close();
		}
	}
</script>

<svelte:head
	><title>Your local datasets | OSIPY</title><meta
		name="description"
		content="Open saved MRI datasets or import new scans. Data stays on your device, with no cloud uploads and offline viewing."
	/></svelte:head
>
<Header
	><span class="text-sm font-semibold">Local dataset library</span><span class="ml-auto"
		><OfflineStatus /></span
	></Header
>
<main class="flex min-h-0 flex-1 flex-col overflow-hidden">
	<section class="shrink-0 border-b px-4 py-5 sm:px-6 sm:py-7">
		<div class="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-5">
			<div class="max-w-2xl">
				<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
					Pick up where you left off
				</h1>
				<p class="mt-2 text-sm leading-6 text-muted-foreground">
					Open a saved dataset or bring in a new scan. Your data stays on this device—nothing is
					uploaded to remote servers.
				</p>
				<div class="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
					<ShieldIcon class="mt-0.5 size-4 shrink-0 text-selection" /><span
						>Import, storage and visualization happen in your browser. Offline access is available
						after the app is cached. Optional fitting runs through your local OSIPY companion.</span
					>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<a class="button button-outline h-8 px-2 text-xs" href={resolve('/nifti')}
					>Standalone NIfTI viewer</a
				>
				{#if !__LOCAL_COMPANION_PROXY__}<LocalAnalysisSetup />{/if}
				<ScanLibrary
					scans={session}
					activeId=""
					onadd={add}
					onselect={open}
					onmetadata={metadata}
					onremove={(id) => (session = session.filter((s) => s.id !== id))}
					triggerLabel="Import data"
				/>{#if demoBusy}<div class="flex items-center gap-2" role="status">
						<div class="min-w-40 text-xs text-muted-foreground" aria-live="polite">
							{demoProgress}
						</div>
						<button class="button button-outline h-8 px-2 text-xs" onclick={cancelDemo}
							>Cancel demo</button
						>
					</div>{:else}<button class="button button-ghost" onclick={demo}
						>Download demo from Zenodo · 245 MB</button
					>{/if}
			</div>
		</div>
	</section>
	<div
		class="mx-auto flex w-full max-w-7xl shrink-0 flex-wrap items-center gap-3 px-4 py-3 sm:px-6"
	>
		<h2 class="mr-auto text-sm font-semibold">
			Saved dashboards <span class="font-normal text-muted-foreground">({saved.length})</span>
		</h2>
		<label class="sr-only" for="library-search">Search saved datasets</label><input
			id="library-search"
			class="input h-9 min-w-0 flex-1 px-3 text-sm sm:max-w-xs"
			type="search"
			placeholder="Search datasets, subjects or studies"
			bind:value={search}
		/><select class="input h-9 text-xs" aria-label="Filter by technique" bind:value={filter}
			><option value="all">All techniques</option
			>{#each ['IVIM', 'DCE', 'DSC', 'ASL', 'Unassigned'] as technique (technique)}<option
					>{technique}</option
				>{/each}</select
		>
	</div>
	{#if error}<p
			class="mx-4 shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:mx-6"
			role="alert"
		>
			{error}
		</p>{/if}
	<div class="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-6 sm:px-6">
		{#if loading}<p class="py-12 text-center text-sm text-muted-foreground" role="status">
				Opening local storage…
			</p>
		{:else if !saved.length}<div
				class="mx-auto mt-6 max-w-2xl rounded-2xl border border-dashed bg-card px-6 py-10 text-center"
			>
				<UploadIcon class="mx-auto size-9 text-muted-foreground" />
				<h2 class="mt-4 text-lg font-semibold">Your first dataset starts here</h2>
				<p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
					Import NIfTI scans with b-values, or discover a BIDS/DICOM folder. Saved image datasets
					will appear here whenever you return to this browser.
				</p>
				<div class="mt-5 flex justify-center">
					<ScanLibrary
						scans={session}
						activeId=""
						onadd={add}
						onselect={open}
						onmetadata={metadata}
						onremove={(id) => (session = session.filter((s) => s.id !== id))}
						triggerLabel="Import your first dataset"
					/>
				</div>
				<p class="mt-3 text-xs leading-5 text-muted-foreground">
					The public demo downloads directly from Zenodo into this browser; OSIPY does not host MRI
					bytes or proxy the download.
				</p>
			</div>
		{:else}<div class="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each filtered as scan (scan.id)}<StoredDatasetCard
						{scan}
						ondelete={(s) => {
							removal = s;
							dialog.showModal();
						}}
					/>{/each}{#if !filtered.length}<p
						class="col-span-full py-10 text-center text-sm text-muted-foreground"
					>
						No datasets match these filters.
					</p>{/if}
			</div>{/if}
		<p class="mx-auto mt-6 max-w-7xl text-xs leading-5 text-muted-foreground">
			Saved in this browser on this device, for this app address. Clearing site data removes local
			datasets. Keep exported backups of important work.
		</p>
	</div>
</main>
<dialog
	bind:this={dialog}
	class="m-auto max-h-[calc(100dvh-24px)] w-[min(460px,calc(100vw-24px))] overflow-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/65"
	aria-labelledby="delete-dataset-title"
>
	<h2 id="delete-dataset-title" class="font-semibold">Remove this local dataset?</h2>
	<p class="my-3 text-sm break-words text-muted-foreground">
		{removal?.name} and its locally saved dashboard state will be removed from this browser. Your original
		files and exported backups are unaffected.
	</p>
	<div class="flex gap-2">
		<button class="button button-primary" onclick={remove}>Remove dataset</button><button
			class="button button-outline"
			onclick={() => dialog.close()}>Keep dataset</button
		>
	</div>
</dialog>
