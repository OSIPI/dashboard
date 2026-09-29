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
	import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
	import ScanIcon from '~icons/lucide/scan-line';
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
<main class="min-h-0 flex-1 overflow-auto overscroll-contain">
	{#if error}<p
			class="mx-auto mt-5 max-w-6xl rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
			role="alert"
		>
			{error}
		</p>{/if}
	<div class="px-4 pb-8 sm:px-6">
		{#if loading}<p class="py-12 text-center text-sm text-muted-foreground" role="status">
				Opening local storage…
			</p>
		{:else if !saved.length}
			<div class="mx-auto max-w-6xl pt-10 sm:pt-16 lg:pt-24">
				<div
					class="mb-7 flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
				>
					<span class="h-px w-8 bg-selection"></span> Local data
				</div>
				<div
					class="grid overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[1.45fr_1fr]"
				>
					<div
						class="relative flex min-h-[360px] flex-col justify-between overflow-hidden p-7 sm:p-11 lg:p-14"
					>
						<div class="relative">
							<div
								class="mb-8 flex size-11 items-center justify-center rounded-xl border border-selection/25 bg-selection-surface text-selection"
							>
								<ScanIcon class="size-5" aria-hidden="true" />
							</div>
							<h1
								class="max-w-xl text-[clamp(2.2rem,4vw,3.5rem)] leading-[1.1] font-semibold tracking-[-0.045em]"
							>
								Import an MRI dataset
							</h1>
							<p class="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
								Load NIfTI images with b-values for IVIM viewing. Discover acquisitions in BIDS or
								DICOM folders; DICOM pixel data is not decoded.
							</p>
						</div>
						<div class="relative mt-9 flex flex-wrap items-center gap-4">
							<ScanLibrary
								scans={session}
								activeId=""
								onadd={add}
								onselect={open}
								onmetadata={metadata}
								onremove={(id) => (session = session.filter((s) => s.id !== id))}
								triggerLabel="Import dataset"
								triggerClass="button h-11 rounded-lg bg-foreground px-5 text-background hover:bg-foreground/85"
							/>
							<span class="text-xs text-muted-foreground"
								>NIfTI + b-values · BIDS / DICOM discovery</span
							>
						</div>
					</div>
					<div class="flex flex-col border-t bg-secondary/20 lg:border-t-0 lg:border-l">
						<div class="flex flex-1 flex-col justify-between gap-8 p-7 sm:p-9">
							<div
								class="flex size-10 items-center justify-center rounded-lg border bg-card text-selection"
							>
								<UploadIcon class="size-5" aria-hidden="true" />
							</div>
							<div>
								<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
									Reference dataset
								</p>
								<h2 class="mt-2 text-xl font-semibold tracking-tight">OSIPI TF2.4 in-vivo brain</h2>
								<p class="mt-2 text-sm text-muted-foreground">
									IVIM acquisition · Zenodo download · 245 MB
								</p>
								{#if demoBusy}<div class="mt-5 flex flex-wrap items-center gap-3" role="status">
										<span class="text-xs text-muted-foreground" aria-live="polite"
											>{demoProgress}</span
										><button class="button button-outline h-9" onclick={cancelDemo}>Cancel</button>
									</div>{:else}<button
										class="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground hover:text-selection"
										onclick={demo}
										>Download reference dataset <ArrowUpRightIcon
											class="size-4"
											aria-hidden="true"
										/></button
									>{/if}
							</div>
						</div>
						<a
							href={resolve('/nifti')}
							class="flex min-h-18 items-center justify-between gap-4 border-t px-7 py-4 text-sm font-medium transition-colors hover:bg-accent/40 sm:px-9"
							>Open standalone NIfTI viewer <ArrowUpRightIcon
								class="size-4 text-muted-foreground"
								aria-hidden="true"
							/></a
						>
					</div>
				</div>
				<div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
					<span class="inline-flex items-center gap-2"
						><ShieldIcon class="size-4 text-selection" aria-hidden="true" /> Images remain in this browser;
						no remote upload. Clearing site data removes saved datasets.</span
					>
					{#if !__LOCAL_API_PROXY__}<LocalAnalysisSetup />{/if}
					<span>Research use only. Not for diagnosis.</span>
				</div>
			</div>
		{:else}
			<div class="mx-auto max-w-7xl pt-8 sm:pt-12">
				<div class="mb-7 flex flex-wrap items-end justify-between gap-4">
					<div>
						<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
							Local library
						</p>
						<h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
							Saved datasets <span class="font-normal text-muted-foreground">{saved.length}</span>
						</h1>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<ScanLibrary
							scans={session}
							activeId=""
							onadd={add}
							onselect={open}
							onmetadata={metadata}
							onremove={(id) => (session = session.filter((s) => s.id !== id))}
							triggerLabel="Import dataset"
						/><a class="button button-outline h-8 px-2 text-xs" href={resolve('/nifti')}
							>NIfTI viewer</a
						>{#if !__LOCAL_API_PROXY__}<LocalAnalysisSetup />{/if}
					</div>
				</div>
				<div class="mb-5 flex flex-wrap gap-2">
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
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
				</div>
				<p class="mt-6 text-xs leading-5 text-muted-foreground">
					Saved in this browser. Clearing site data removes local datasets; keep exported backups of
					important work. Research use only.
				</p>
			</div>
		{/if}
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
