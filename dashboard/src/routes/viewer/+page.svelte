<script lang="ts">
	import ClipboardCheckIcon from '~icons/lucide/clipboard-check';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import { onMount, onDestroy, tick } from 'svelte';
	import { AnalysisClient } from '$lib/analysis-client.svelte';
	import AnalysisPanel from '$lib/components/viewer/AnalysisPanel.svelte';
	import MethodsMenu from '$lib/components/viewer/MethodsMenu.svelte';
	import FitDialog from '$lib/components/viewer/FitDialog.svelte';
	import RoiPanel from '$lib/components/viewer/RoiPanel.svelte';
	import ExportPanel from '$lib/components/viewer/ExportPanel.svelte';
	import { RoiSession } from '$lib/roi-session.svelte';
	import { roiOverlay, type ViewerTool } from '$lib/roi';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import {
		getStoredScan,
		listStoredScans,
		saveScan,
		updateStoredMetadata,
		readSavedWorkspace,
		saveWorkspace,
		readSavedRois,
		saveRois,
		readSavedResult,
		saveResult,
		storageError,
		validateSavedRois,
		validSavedResult,
		type StoredScanSummary
	} from '$lib/local-library';
	import { persistedPreference } from '$lib/persisted-preference.svelte';
	import {
		DEFAULT_LAYOUT,
		parseLayout,
		parsePanes,
		type PaneSelection
	} from '$lib/layout-preferences';
	import Header from '$lib/components/ui/Header.svelte';
	import SeriesBrowser from '$lib/components/viewer/SeriesBrowser.svelte';
	import ViewerPanel from '$lib/components/viewer/ViewerPanel.svelte';
	import ImageControls from '$lib/components/viewer/ImageControls.svelte';
	import SignalPanel from '$lib/components/viewer/SignalPanel.svelte';
	import SavedVoxels from '$lib/components/viewer/SavedVoxels.svelte';
	import WorkspaceFiles from '$lib/components/viewer/WorkspaceFiles.svelte';
	import DatasetDetails from '$lib/components/viewer/DatasetDetails.svelte';
	import PanelDivider from '$lib/components/viewer/PanelDivider.svelte';
	import ScanLibrary from '$lib/components/viewer/ScanLibrary.svelte';
	import ScanTimeline from '$lib/components/viewer/ScanTimeline.svelte';
	import ScanComparison from '$lib/components/viewer/ScanComparison.svelte';
	import ScanValidation from '$lib/components/viewer/ScanValidation.svelte';
	import { SESSION_LIMIT, type Scan, type ScanMetadata } from '$lib/imports/scan';
	import {
		autoWindow,
		defaultDisplay,
		replaceActiveVolume,
		parseWorkspace,
		type Display,
		type Workspace
	} from '$lib/workspace';
	import {
		BOOKMARK_KEY,
		parseBookmarks,
		type Dataset,
		type VoxelVolume,
		type Bookmark
	} from '$lib/ivim';

	const techniques = {
		DCE: 'Dynamic contrast-enhanced',
		DSC: 'Dynamic susceptibility contrast',
		ASL: 'Arterial spin labeling',
		IVIM: 'Intravoxel incoherent motion'
	};
	const panels = ['Image', 'Controls', 'Series', 'Inspector'] as const;
	const inspectorTabs = ['Analyze', 'ROI', 'Saved', 'Data & export'] as const;
	async function selectInspectorTab(tab: (typeof inspectorTabs)[number]) {
		preferences.current.inspectorTab = tab;
		await tick();
		document.getElementById(`inspector-panel-${inspectorTabs.indexOf(tab)}`)?.scrollIntoView({
			block: 'nearest'
		});
	}
	function inspectorTabKeydown(event: KeyboardEvent) {
		const current = inspectorTabs.indexOf(preferences.current.inspectorTab);
		const next =
			event.key === 'ArrowRight'
				? (current + 1) % inspectorTabs.length
				: event.key === 'ArrowLeft'
					? (current + inspectorTabs.length - 1) % inspectorTabs.length
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? inspectorTabs.length - 1
							: -1;
		if (next < 0) return;
		event.preventDefault();
		void selectInspectorTab(inspectorTabs[next]);
		(event.currentTarget as HTMLButtonElement).parentElement
			?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
			[next]?.focus();
	}
	async function showAnalysis() {
		preferences.current.analysisOpen = true;
		await selectInspectorTab('Analyze');
		document.getElementById('ivim-analysis')?.scrollIntoView({ block: 'nearest' });
	}
	let technique = $state<keyof typeof techniques>('IVIM');
	const preferences = persistedPreference(
		'osipy.viewer.layout',
		{ ...DEFAULT_LAYOUT },
		parseLayout
	);
	let paneStorage = $state.raw<{ current: PaneSelection }>();
	let dataset = $state.raw<Dataset>();
	let volumes = $state.raw<VoxelVolume[]>([]);
	let scans = $state.raw<Scan[]>([]);
	let catalog = $state.raw<StoredScanSummary[]>([]);
	let restoring = $state(true);
	let alive = false;
	let loadSequence = 0;
	let currentId = $state('');
	let comparisonId = $state('');
	const currentScan = $derived(scans.find((s) => s.id === currentId));
	const comparisonScan = $derived(
		scans.find(
			(s) =>
				s.id === comparisonId &&
				s.id !== currentId &&
				s.metadata.technique === 'IVIM' &&
				s.metadata.subject === currentScan?.metadata.subject &&
				s.metadata.study === currentScan?.metadata.study
		)
	);
	const scanViews = new SvelteMap<string, Workspace>();
	const bookmarkKey = $derived(
		dataset?.source ? `${BOOKMARK_KEY}.${dataset.sha256}` : BOOKMARK_KEY
	);
	let dataError = $state('');
	let active = $state(0);
	let slice = $state(0);
	let x = $state(0);
	let y = $state(0);
	let display = $state<Display>({ zoom: 1, panX: 0, panY: 0, center: 500, width: 1000 });
	let tiles = $state<Record<string, Display>>({});
	let selected = $state<number[]>([0]);
	let tool = $state<ViewerTool>('inspect');
	const roiSessions = new SvelteMap<string, RoiSession>();
	const roiSession = $derived(roiSessions.get(currentId));
	const regionOverlay = $derived(
		dataset && preferences.current.roiVisible
			? roiOverlay(roiSession?.current, dataset, preferences.current.roiOpacity)
			: undefined
	);
	const roiMean = $derived.by(() => {
		const roi = roiSession?.current;
		if (!dataset || !preferences.current.roiMean || !roi?.indices.length) return undefined;
		return {
			label: `ROI mean · ${roi.name} (${roi.indices.length} voxels)`,
			values: volumes.map((v) => {
				let mean = 0;
				roi.indices.forEach(
					(i, n) => (mean += (v[i] * dataset!.slope + dataset!.intercept - mean) / (n + 1))
				);
				return mean;
			})
		};
	});
	let scope = $state<'slice' | 'volume'>('slice');
	let search = $state('');
	let range = $state('all');
	let bookmarks = $state<Bookmark[]>([]);
	let compared = $state<string[]>([]);
	let note = $state('');
	let storageMessage = $state('Saved only in this browser.');
	let message = $state('');
	let workspaceWidth = $state(900);
	const analysis = new AnalysisClient();
	let fitDialogOpen = $state(false);
	let fitDialogTab = $state<'configure' | 'results'>('configure');
	let fitMethod = $state('biexponential');
	function configureFit(method: string) {
		fitMethod = method;
		fitDialogTab = 'configure';
		fitDialogOpen = true;
	}
	function openAnalysis() {
		fitDialogTab = fitResult ? 'results' : 'configure';
		fitDialogOpen = true;
	}
	analysis.onresult = (result) => {
		for (const item of catalog.filter((s) => s.sha256 === result.report.dataset.sha256))
			void saveResult(item.id, result).catch(
				(e) => (message = `Result not saved locally: ${storageError(e)}`)
			);
	};
	onDestroy(() => {
		alive = false;
		loadSequence++;
		flushWorkspace();
		analysis.dispose();
	});
	const fitResult = $derived(
		analysis.results.find(
			(r) => r.id === analysis.selected && r.report.dataset.sha256 === dataset?.sha256
		)
	);
	const overlay = $derived(
		fitResult &&
			analysis.map !== 'none' &&
			fitResult.maps[analysis.map] &&
			analysis.maximum > analysis.minimum
			? {
					values: fitResult.maps[analysis.map],
					valid: fitResult.maps.Valid,
					minimum: analysis.minimum,
					maximum: analysis.maximum,
					opacity: analysis.opacity,
					showInvalid: analysis.showInvalid || ['Valid', 'Status'].includes(analysis.map)
				}
			: undefined
	);
	const activeDisplay = $derived(preferences.current.linked ? display : (tiles[active] ?? display));
	$effect(() => {
		if (paneStorage) paneStorage.current = { active, selected: [...selected] };
	});
	$effect(() => {
		if (comparisonId && !comparisonScan) comparisonId = '';
	});
	$effect(() => {
		if (restoring || !dataset || !currentId) return;
		const id = currentId,
			workspace = $state.snapshot(workspaceData());
		const timer = setTimeout(
			() =>
				void saveWorkspace(id, workspace).catch(
					(e) => (message = `Dashboard state not saved: ${storageError(e)}`)
				),
			400
		);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		if (restoring || !roiSession || !currentId) return;
		const id = currentId,
			value = $state.snapshot({ rois: roiSession.rois, selected: roiSession.selected });
		void saveRois(id, value).catch((e) => (message = `ROI edits not saved: ${storageError(e)}`));
	});

	onMount(() => {
		alive = true;
		if (__LOCAL_COMPANION_PROXY__) void analysis.connect();
		void listStoredScans()
			.then((items) => {
				if (!alive) return;
				catalog = items;
				const id = page.url.searchParams.get('scan') || items[0]?.id;
				if (id) void loadSaved(id);
				else {
					dataError = 'No dataset is saved yet. Open the library to import data from your device.';
					restoring = false;
				}
			})
			.catch((e) => {
				dataError = storageError(e);
				restoring = false;
			});
	});
	function flushWorkspace() {
		if (dataset && currentId && !restoring) {
			const id = currentId,
				workspace = $state.snapshot(workspaceData());
			scanViews.set(id, workspace);
			void saveWorkspace(id, workspace).catch(() => {});
			if (roiSession)
				void saveRois(
					id,
					$state.snapshot({ rois: roiSession.rois, selected: roiSession.selected })
				).catch(() => {});
		}
	}
	async function loadSaved(id: string, activate = true) {
		const sequence = ++loadSequence;
		flushWorkspace();
		restoring = true;
		dataError = '';
		try {
			let scan = scans.find((s) => s.id === id);
			if (!scan) {
				const bytes = catalog.find((s) => s.id === id)?.bytes ?? 0;
				if (scans.reduce((n, s) => n + s.dataset.byteLength, 0) + bytes > SESSION_LIMIT) {
					scans = scans.filter((s) => s.id === currentId || s.id === comparisonId);
					if (scans.reduce((n, s) => n + s.dataset.byteLength, 0) + bytes > SESSION_LIMIT) {
						if (!activate) throw new Error('These scans exceed the comparison memory limit.');
						paneStorage = undefined;
						dataset = undefined;
						volumes = [];
						scans = [];
						currentId = '';
						comparisonId = '';
					}
				}
				scan = await getStoredScan(id);
			}
			const [savedView, savedRegions, savedFit] = await Promise.all([
				readSavedWorkspace(id),
				readSavedRois(id),
				readSavedResult(id)
			]);
			if (!alive || sequence !== loadSequence) return;
			if (!scans.some((s) => s.id === id)) scans = [...scans, scan];
			if (savedView && !scanViews.has(id)) {
				try {
					scanViews.set(id, parseWorkspace(JSON.stringify(savedView), scan.dataset));
				} catch {
					message = 'Saved layout could not be restored; the image data is available.';
				}
			}
			if (!roiSessions.has(id)) {
				const session = new RoiSession(scan.dataset);
				if (savedRegions) {
					try {
						const valid = validateSavedRois(savedRegions, scan.dataset);
						session.rois = valid.rois;
						session.selected = valid.selected;
					} catch {
						message = 'Saved ROI data could not be restored; the image is available.';
					}
				}
				roiSessions.set(id, session);
			}
			const validFit = savedFit && validSavedResult(savedFit, scan.dataset) ? savedFit : undefined;
			if (validFit && !analysis.results.some((r) => r.id === validFit.id))
				analysis.results = [...analysis.results, validFit];
			if (activate) {
				activateScan(scan);
				if (validFit) analysis.selected = validFit.id;
				let destination = resolve('/viewer');
				destination += `?scan=${encodeURIComponent(id)}`;
				replaceState(destination, page.state);
			}
		} catch (e) {
			if (alive && sequence === loadSequence) dataError = storageError(e);
		} finally {
			if (sequence === loadSequence) restoring = false;
		}
	}
	async function compareWith(id: string) {
		if (!id) {
			comparisonId = '';
			return;
		}
		const primary = currentId;
		await loadSaved(id, false);
		if (currentId === primary && scans.some((s) => s.id === id)) comparisonId = id;
	}
	function activateScan(scan: Scan) {
		if (dataset && currentId && volumes.length) scanViews.set(currentId, workspaceData());
		paneStorage = undefined;
		currentId = scan.id;
		dataset = scan.dataset;
		if (!roiSessions.has(scan.id)) roiSessions.set(scan.id, new RoiSession(dataset));
		volumes = scan.volumes;
		comparisonId = '';
		dataError = '';
		technique = scan.metadata.technique === 'Unassigned' ? 'IVIM' : scan.metadata.technique;
		x = Math.floor(dataset.dimensions[0] / 2);
		y = Math.floor(dataset.dimensions[1] / 2);
		slice = Math.floor(dataset.dimensions[2] / 2);
		display = defaultDisplay(dataset);
		tiles = {};
		compared = [];
		note = '';
		bookmarks = [];
		search = '';
		range = 'all';
		paneStorage = persistedPreference(
			`osipy.viewer.panes.${dataset.sha256}`,
			{ active: 0, selected: [0] },
			(raw) => parsePanes(raw, scan.dataset)
		);
		active = paneStorage.current.active;
		selected = [...paneStorage.current.selected];
		storageMessage = 'Saved only in this browser.';
		try {
			const saved = localStorage.getItem(bookmarkKey);
			if (saved) bookmarks = parseBookmarks(saved, dataset);
		} catch {
			storageMessage = 'Saved views unavailable. New views work for this session.';
		}
		const previous = scanViews.get(scan.id);
		if (previous) applyWorkspace(previous);
		message = '';
	}
	function selectScan(id: string) {
		void loadSaved(id);
	}
	async function addScan(scan: Scan) {
		if (
			scans.reduce((n, s) => n + s.dataset.byteLength, 0) + scan.dataset.byteLength >
			SESSION_LIMIT
		)
			throw new Error('Session memory limit reached. Remove an unused scan before importing.');
		try {
			await saveScan(scan);
			catalog = await listStoredScans();
		} catch (e) {
			throw new Error(storageError(e));
		}
		flushWorkspace();
		scans = [...scans, scan];
		activateScan(scan);
		let destination = resolve('/viewer');
		destination += `?scan=${encodeURIComponent(scan.id)}`;
		replaceState(destination, page.state);
	}
	async function updateMetadata(id: string, metadata: ScanMetadata) {
		try {
			await updateStoredMetadata(id, metadata);
			catalog = await listStoredScans();
		} catch (e) {
			message = storageError(e);
			return;
		}
		scans = scans.map((s) => (s.id === id ? { ...s, metadata } : s));
		if (id === currentId && metadata.technique !== 'Unassigned') technique = metadata.technique;
	}
	function removeScan(id: string) {
		if (id === currentId) return;
		scans = scans.filter((s) => s.id !== id);
		scanViews.delete(id);
	}
	function setDisplay(next: Display, index = active) {
		if (preferences.current.linked) display = next;
		else tiles[index] = next;
	}
	function resetView() {
		if (dataset) setDisplay(defaultDisplay(dataset));
	}
	function toggleLink() {
		if (preferences.current.linked) {
			tiles = Object.fromEntries(dataset!.bValues.map((_, i) => [i, { ...display }]));
			preferences.current.linked = false;
		} else {
			display = { ...activeDisplay };
			preferences.current.linked = true;
		}
	}
	function selectVolume(index: number) {
		if (!preferences.current.linked && !selected.includes(index))
			tiles[index] = { ...activeDisplay };
		selected = replaceActiveVolume(selected, active, index);
		active = index;
	}
	function toggleVolume(index: number) {
		selected = selected.includes(index)
			? selected.filter((i) => i !== index)
			: [...selected, index];
		if (selected.length && !selected.includes(active)) active = selected[0];
	}
	function selectMany(indices: number[]) {
		selected = [...new Set([...selected, ...indices])];
		if (selected.length && !selected.includes(active)) active = selected[0];
	}
	function applyWindow(robust: boolean) {
		if (!dataset) return;
		setDisplay({
			...activeDisplay,
			...autoWindow(volumes[active], dataset, scope === 'slice' ? slice : undefined, robust)
		});
		message = `${robust ? '2–98% percentile' : 'Full-range'} window applied to ${preferences.current.linked ? 'linked views' : 'active volume'} from ${scope === 'slice' ? 'current slice' : 'whole volume'}.`;
	}
	function resetLayout() {
		display = { ...activeDisplay };
		preferences.current = { ...DEFAULT_LAYOUT };
	}
	function workspaceData(): Workspace {
		return {
			version: 1,
			datasetId: dataset!.id,
			sha256: dataset!.sha256,
			x,
			y,
			slice,
			volume: active,
			selected,
			gridLayout: preferences.current.gridLayout,
			linked: preferences.current.linked,
			display,
			tiles,
			bookmarks,
			compared: compared.filter((id) => bookmarks.some((b) => b.id === id)),
			seriesWidth: preferences.current.seriesWidth,
			inspectorWidth: preferences.current.inspectorWidth,
			search,
			range,
			list: preferences.current.seriesLayout === 'list',
			note
		};
	}
	function applyWorkspace(w: Workspace) {
		x = w.x;
		y = w.y;
		slice = w.slice;
		active = w.volume;
		selected = w.selected;
		preferences.current.gridLayout = w.gridLayout;
		preferences.current.linked = w.linked;
		display = w.display;
		tiles = w.tiles;
		compared = w.compared;
		preferences.current.seriesWidth = w.seriesWidth;
		preferences.current.inspectorWidth = w.inspectorWidth;
		search = w.search;
		range = w.range;
		preferences.current.seriesLayout = w.list ? 'list' : 'grid';
		note = w.note;
		persist(w.bookmarks);
		message = 'Workspace restored. ' + storageMessage;
	}
	function persist(next: Bookmark[]) {
		bookmarks = next;
		try {
			localStorage.setItem(bookmarkKey, JSON.stringify(next));
			storageMessage = 'Saved only in this browser.';
		} catch {
			storageMessage = 'Browser storage unavailable. Changes last for this session only.';
		}
	}
	function saveView() {
		if (!dataset) return;
		persist([
			...bookmarks,
			{
				id: crypto.randomUUID(),
				datasetId: dataset.id,
				b: active,
				z: slice,
				x,
				y,
				note: note.trim()
			}
		]);
		note = '';
	}
	function restore(view: Bookmark) {
		selectVolume(view.b);
		slice = view.z;
		x = view.x;
		y = view.y;
		resetView();
		tool = 'inspect';
		preferences.current.panel = 'Image';
	}
	function deleteView(id: string) {
		compared = compared.filter((key) => key !== id);
		persist(bookmarks.filter((b) => b.id !== id));
	}
</script>

<svelte:head>
	<title>IVIM Viewer | OSIPY Dashboard</title>
	<meta
		name="description"
		content="Load local diffusion MRI, inspect acquisition validation, and compare scan timepoints. Research viewing only, not for diagnosis."
	/>
</svelte:head>

<Header bind:technique>
	<h1 class="min-w-0 text-sm font-semibold max-[899px]:w-full max-[899px]:text-xs">
		{technique} explorer <span class="text-muted-foreground">/</span>
		<span
			class="inline-block max-w-full truncate align-bottom first-letter:uppercase"
			title={dataset?.name}
			>{technique === 'IVIM'
				? (dataset?.name.replace(/^OSIPI TF2\.4 /, '') ?? 'Loading dataset')
				: 'Not implemented'}</span
		>
	</h1>
	<ScanLibrary
		{scans}
		activeId={currentId}
		onadd={addScan}
		onselect={selectScan}
		onmetadata={updateMetadata}
		onremove={removeScan}
	/>
	{#if technique === 'IVIM' && dataset && volumes.length}<div
			class="flex flex-wrap gap-2 text-muted-foreground max-[899px]:gap-1"
		>
			<span class="badge">{dataset.bValues.length} volumes</span><span class="badge"
				>{dataset.dimensions[2]} slices</span
			>
		</div>{/if}
	<MethodsMenu
		catalog={analysis.catalog}
		canFit={!!dataset && !!volumes.length && technique === 'IVIM'}
		selectedMethod={technique === 'IVIM' && analysis.catalog ? fitMethod : undefined}
		onselect={configureFit}
	/>
	<span
		class="badge ml-auto whitespace-nowrap text-muted-foreground"
		title="Not for diagnosis. Local viewing and optional OSIPY fitting; no remote image uploads."
		>Research only</span
	>
</Header>
<main
	class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 max-[899px]:gap-1 max-[899px]:p-1"
>
	{#if currentScan && catalog.length > 1}<ScanTimeline
			scans={catalog}
			current={currentScan}
			onselect={selectScan}
			comparison={comparisonId}
			oncomparison={compareWith}
		/>{/if}
	{#if technique !== 'IVIM' || (currentScan && currentScan.metadata.technique !== 'IVIM')}
		<section class="card m-auto min-h-0 space-y-3 overflow-auto p-6 text-center">
			<span class="text-xs font-semibold tracking-widest text-primary"
				>{technique} / NOT IMPLEMENTED</span
			>
			<h2 class="text-2xl font-semibold">
				{currentScan?.metadata.technique === 'Unassigned'
					? 'Assign a technique in the scan library'
					: techniques[technique]}
			</h2>
			<p class="mx-auto max-w-lg text-sm leading-6 text-muted-foreground">
				The scan library can catalogue all four techniques. The implemented image workflow currently
				covers IVIM diffusion data with optional local OSIPY fitting.
			</p>
			<button
				class="button button-primary mx-auto mt-3"
				onclick={() => {
					const scan = scans.find((s) => s.metadata.technique === 'IVIM');
					if (scan) activateScan(scan);
					else technique = 'IVIM';
				}}>Explore the IVIM demo</button
			>
		</section>
	{:else if dataError}
		<section class="card m-auto min-h-0 space-y-3 overflow-auto p-6" role="alert">
			<h2 class="font-semibold">Dataset unavailable</h2>
			<p>{dataError}</p>
			<p class="text-sm">
				Open the dataset library to choose a saved dataset or import new data from your device.
			</p>
			<a class="button button-outline" href={resolve('/')}>Open dataset library</a>
			{#if dataset}<button class="button button-ghost" onclick={() => (dataError = '')}
					>Continue current dataset</button
				>{/if}
		</section>
	{:else if !dataset || !volumes.length}<p class="card p-10 text-center" role="status">
			Opening your locally saved dataset…
		</p>
	{:else if comparisonScan && currentScan}
		{#key `${currentScan.id}:${comparisonScan.id}`}<ScanComparison
				primary={currentScan}
				secondary={comparisonScan}
				point={[x, y, slice]}
				volume={active}
				display={activeDisplay}
				onpoint={(p) => {
					x = p[0];
					y = p[1];
					slice = p[2];
				}}
				onvolume={selectVolume}
				ondisplay={setDisplay}
				onclose={() => (comparisonId = '')}
			/>{/key}
	{:else}
		<nav class="flex shrink-0 min-[900px]:hidden" aria-label="Workspace panels">
			{#each panels as name (name)}<button
					class="button h-11 flex-1 px-2 text-xs {preferences.current.panel === name
						? 'button-primary'
						: 'button-ghost'}"
					aria-pressed={preferences.current.panel === name}
					onclick={() => (preferences.current.panel = name)}>{name}</button
				>{/each}
		</nav>
		<div
			class="workspace grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] min-[900px]:grid-cols-[min(var(--series-width),26%)_8px_minmax(0,1fr)_8px_min(var(--inspector-width),35%)]"
			style:--series-width="{preferences.current.seriesWidth}px"
			style:--inspector-width="{preferences.current.inspectorWidth}px"
			bind:clientWidth={workspaceWidth}
		>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<aside
				class="series-panel card min-h-0 min-w-0 overflow-auto overscroll-contain [scrollbar-width:thin] {preferences
					.current.panel === 'Series'
					? ''
					: 'hidden min-[900px]:block'}"
				aria-label="Series browser"
				tabindex="0"
			>
				<SeriesBrowser
					{dataset}
					{volumes}
					{selected}
					{active}
					bind:search
					bind:range
					bind:layout={preferences.current.seriesLayout}
					onselect={(i) => {
						selectVolume(i);
						preferences.current.panel = 'Image';
					}}
					ontoggle={toggleVolume}
					onselectmany={selectMany}
					onclear={() => (selected = [])}
				/>
			</aside>
			<PanelDivider
				side="series"
				bind:value={preferences.current.seriesWidth}
				other={preferences.current.inspectorWidth}
				{workspaceWidth}
				onreset={resetLayout}
			/>
			<ViewerPanel
				roi={regionOverlay}
				onroi={(points, z, rectangle) => roiSession?.draw(points, z, rectangle)}
				onundo={() => roiSession?.undo()}
				{overlay}
				{dataset}
				{volumes}
				bind:active
				{selected}
				{slice}
				{x}
				{y}
				{display}
				{tiles}
				linked={preferences.current.linked}
				bind:navigationOpen={preferences.current.navigationOpen}
				onlink={toggleLink}
				bind:gridLayout={preferences.current.gridLayout}
				bind:tool
				panel={preferences.current.panel}
				onselect={(vx, vy) => {
					x = vx;
					y = vy;
				}}
				onspatialselect={(vx, vy, vz) => {
					x = vx;
					y = vy;
					slice = vz;
				}}
				ondisplay={setDisplay}
				onreset={resetView}
			>
				{#snippet controls()}<ImageControls
						dataset={dataset!}
						{slice}
						{active}
						display={activeDisplay}
						bind:scope
						onslice={(value) => (slice = value)}
						onvolume={selectVolume}
						ondisplay={setDisplay}
						onauto={applyWindow}
					/>{/snippet}
			</ViewerPanel>
			<PanelDivider
				side="inspector"
				bind:value={preferences.current.inspectorWidth}
				other={preferences.current.seriesWidth}
				{workspaceWidth}
				onreset={resetLayout}
			/>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<aside
				class="inspector-panel min-h-0 min-w-0 space-y-4 overflow-auto overscroll-contain [overflow-wrap:anywhere] [scrollbar-width:thin] max-[899px]:[&_button]:min-h-11 max-[899px]:[&_summary]:min-h-11 {preferences
					.current.panel === 'Inspector'
					? ''
					: 'hidden min-[900px]:block'}"
				aria-label="Inspector"
				tabindex="0"
			>
				<SignalPanel
					{roiMean}
					fit={fitResult}
					{dataset}
					{volumes}
					{active}
					{x}
					{y}
					{slice}
					{bookmarks}
					{compared}
					bind:open={preferences.current.signalOpen}
					bind:valuesOpen={preferences.current.signalValuesOpen}
					onerror={(text) => (message = text)}
					onselect={selectVolume}
					onanalysis={showAnalysis}
				/>
				<div
					class="sticky top-0 z-10 grid grid-cols-4 gap-1 rounded-lg border bg-card p-1"
					role="tablist"
					aria-label="Inspector sections"
				>
					{#each inspectorTabs as tab, index (tab)}
						<button
							type="button"
							role="tab"
							id="inspector-tab-{index}"
							aria-controls="inspector-panel-{index}"
							aria-selected={preferences.current.inspectorTab === tab}
							tabindex={preferences.current.inspectorTab === tab ? 0 : -1}
							class="min-h-9 rounded-md px-1 py-1 text-center text-xs leading-tight font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-selected:bg-muted aria-selected:text-foreground max-[899px]:min-h-11 {preferences
								.current.inspectorTab === tab
								? ''
								: 'text-muted-foreground'}"
							onclick={() => selectInspectorTab(tab)}
							onkeydown={inspectorTabKeydown}>{tab}</button
						>
					{/each}
				</div>
				<div
					role="tabpanel"
					id="inspector-panel-2"
					aria-labelledby="inspector-tab-2"
					class="scroll-mt-16 space-y-4 {preferences.current.inspectorTab === 'Saved'
						? ''
						: 'hidden'}"
				>
					<SavedVoxels
						{dataset}
						{bookmarks}
						bind:compared
						bind:note
						bind:open={preferences.current.savedVoxelsOpen}
						message={storageMessage}
						onsave={saveView}
						onrestore={restore}
						ondelete={deleteView}
					/>
				</div>
				<div
					role="tabpanel"
					id="inspector-panel-0"
					aria-labelledby="inspector-tab-0"
					class="scroll-mt-16 space-y-4 {preferences.current.inspectorTab === 'Analyze'
						? ''
						: 'hidden'}"
				>
					<AnalysisPanel
						client={analysis}
						{dataset}
						result={fitResult}
						selectedMethod={fitMethod}
						bind:openPanel={preferences.current.analysisOpen}
						onopen={openAnalysis}
					/>
				</div>
				<div
					role="tabpanel"
					id="inspector-panel-1"
					aria-labelledby="inspector-tab-1"
					class="scroll-mt-16 space-y-4 {preferences.current.inspectorTab === 'ROI'
						? ''
						: 'hidden'}"
				>
					{#if roiSession}<RoiPanel
							{slice}
							session={roiSession}
							{dataset}
							{volumes}
							{active}
							{tool}
							result={fitResult}
							bind:visible={preferences.current.roiVisible}
							bind:opacity={preferences.current.roiOpacity}
							bind:meanVisible={preferences.current.roiMean}
							bind:open={preferences.current.roiOpen}
							onstart={(value) => {
								tool = value;
								preferences.current.panel = 'Image';
							}}
						/>{/if}
				</div>
				<div
					role="tabpanel"
					id="inspector-panel-3"
					aria-labelledby="inspector-tab-3"
					class="scroll-mt-16 space-y-4 {preferences.current.inspectorTab === 'Data & export'
						? ''
						: 'hidden'}"
				>
					<WorkspaceFiles
						{dataset}
						bind:open={preferences.current.workspaceOpen}
						getworkspace={workspaceData}
						onapply={applyWorkspace}
						onresetlayout={resetLayout}
						onmessage={(text) => (message = text)}
					/>
					<DatasetDetails {dataset} {active} bind:open={preferences.current.metadataOpen} />
					<ExportPanel
						{dataset}
						{volumes}
						rois={roiSession?.rois ?? []}
						{bookmarks}
						point={[x, y, slice]}
						result={fitResult}
						bind:open={preferences.current.exportOpen}
						metadata={currentScan?.metadata}
						getworkspace={workspaceData}
					/>
					{#if currentScan}<section
							class="card space-y-2 p-3 {preferences.current.validationOpen
								? ''
								: '[&>*:not(:first-child)]:hidden'}"
						>
							<h2>
								<button
									type="button"
									class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
									aria-label="{preferences.current.validationOpen
										? 'Collapse'
										: 'Expand'} dataset validation panel"
									aria-expanded={preferences.current.validationOpen}
									onclick={() =>
										(preferences.current.validationOpen = !preferences.current.validationOpen)}
								>
									<ClipboardCheckIcon class="size-4 shrink-0" aria-hidden="true" />Dataset
									validation
									{#if preferences.current.validationOpen}<ChevronDownIcon
											class="ml-auto size-4"
										/>{:else}<ChevronRightIcon class="ml-auto size-4" />{/if}
								</button>
							</h2>
							<ScanValidation issues={currentScan.issues} />
						</section>{/if}
				</div>
			</aside>
		</div>
	{/if}
	{#if message}<div
			class="flex max-h-[90px] shrink-0 items-center gap-2 overflow-auto border bg-card px-2 py-1 text-xs"
			role="status"
		>
			<span>{message}</span><button
				class="button button-ghost"
				aria-label="Dismiss message"
				onclick={() => (message = '')}>×</button
			>
		</div>{/if}
</main>
{#if dataset && volumes.length}
	<FitDialog
		client={analysis}
		result={fitResult}
		{dataset}
		{volumes}
		{x}
		{y}
		{slice}
		roiIndices={roiSession?.current?.indices ?? []}
		method={fitMethod}
		bind:open={fitDialogOpen}
		bind:activeTab={fitDialogTab}
		onrun={() => {
			preferences.current.analysisOpen = true;
			preferences.current.panel = 'Inspector';
			preferences.current.inspectorTab = 'Analyze';
		}}
	/>
{/if}
