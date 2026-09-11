<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
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
	import {
		autoWindow,
		defaultDisplay,
		replaceActiveVolume,
		type Display,
		type Workspace
	} from '$lib/workspace';
	import {
		BOOKMARK_KEY,
		loadDataset,
		parseBookmarks,
		type Dataset,
		type Bookmark
	} from '$lib/ivim';

	const techniques = {
		DCE: 'Dynamic contrast-enhanced',
		DSC: 'Dynamic susceptibility contrast',
		ASL: 'Arterial spin labeling',
		IVIM: 'Intravoxel incoherent motion'
	};
	const panels = ['Image', 'Controls', 'Series', 'Inspector'] as const;
	let technique = $state<keyof typeof techniques>('IVIM');
	const preferences = persistedPreference(
		'osipy.viewer.layout',
		{ ...DEFAULT_LAYOUT },
		parseLayout
	);
	let paneStorage = $state.raw<{ current: PaneSelection }>();
	let dataset = $state.raw<Dataset>();
	let volumes = $state.raw<Int16Array[]>([]);
	let dataError = $state('');
	let active = $state(0);
	let slice = $state(0);
	let x = $state(0);
	let y = $state(0);
	let display = $state<Display>({ zoom: 1, panX: 0, panY: 0, center: 500, width: 1000 });
	let tiles = $state<Record<string, Display>>({});
	let selected = $state<number[]>([0]);
	let tool = $state<'inspect' | 'pan'>('inspect');
	let scope = $state<'slice' | 'volume'>('slice');
	let search = $state('');
	let range = $state('all');
	let bookmarks = $state<Bookmark[]>([]);
	let compared = $state<string[]>([]);
	let note = $state('');
	let storageMessage = $state('Saved only in this browser.');
	let message = $state('');
	let workspaceWidth = $state(900);
	const activeDisplay = $derived(preferences.current.linked ? display : (tiles[active] ?? display));
	$effect(() => {
		if (paneStorage) paneStorage.current = { active, selected: [...selected] };
	});

	onMount(() => {
		const controller = new AbortController();
		loadDataset(`${base}/datasets/ivim-brain`, controller.signal)
			.then((loaded) => {
				if (controller.signal.aborted) return;
				dataset = loaded.dataset;
				paneStorage = persistedPreference(
					`osipy.viewer.panes.${dataset.sha256}`,
					{ active: 0, selected: [0] },
					(raw) => parsePanes(raw, loaded.dataset)
				);
				active = paneStorage.current.active;
				selected = [...paneStorage.current.selected];
				x = Math.floor(dataset.dimensions[0] / 2);
				y = Math.floor(dataset.dimensions[1] / 2);
				slice = Math.floor(dataset.dimensions[2] / 2);
				display = defaultDisplay(dataset);
				resetView();
				volumes = loaded.volumes;
				try {
					const saved = localStorage.getItem(BOOKMARK_KEY);
					if (saved) bookmarks = parseBookmarks(saved, dataset);
				} catch {
					storageMessage =
						'Saved views unavailable or for another dataset. New views work for this session.';
				}
			})
			.catch((error) => {
				if (!controller.signal.aborted)
					dataError = error instanceof Error ? error.message : 'Dataset could not be loaded';
			});
		return () => controller.abort();
	});
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
			localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
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
	<title>In-Vivo IVIM Viewer | OSIPY Dashboard</title>
	<meta
		name="description"
		content="Explore the public OSIPI in-vivo brain IVIM series and acquired voxel signals. Research viewing only, not for diagnosis."
	/>
</svelte:head>

<Header bind:technique>
	<h1 class="min-w-0 text-sm font-semibold max-[899px]:w-full max-[899px]:text-xs">
		{technique} explorer <span class="text-muted-foreground">/</span>
		<span class="inline-block first-letter:uppercase"
			>{technique === 'IVIM'
				? (dataset?.name.replace(/^OSIPI TF2\.4 /, '') ?? 'Loading dataset')
				: 'Not implemented'}</span
		>
	</h1>
	{#if technique === 'IVIM' && dataset && volumes.length}<div
			class="flex flex-wrap gap-2 text-muted-foreground max-[899px]:gap-1"
		>
			<span class="badge">{dataset.bValues.length} volumes</span><span class="badge"
				>{dataset.dimensions[2]} slices</span
			>
		</div>{/if}
	<span
		class="badge ml-auto whitespace-nowrap text-muted-foreground"
		title="Not for diagnosis. Viewing only; no fitting or uploads.">Research only</span
	>
</Header>
<main
	class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 max-[899px]:gap-1 max-[899px]:p-1"
>
	{#if technique !== 'IVIM'}
		<section class="card m-auto min-h-0 space-y-3 overflow-auto p-6 text-center">
			<span class="text-xs font-semibold tracking-widest text-primary"
				>{technique} / NOT IMPLEMENTED</span
			>
			<h2 class="text-2xl font-semibold">{techniques[technique]}</h2>
			<p class="mx-auto max-w-lg text-sm leading-6 text-muted-foreground">
				No acquisition data, signal model, or analysis workflow is implemented for {technique}. The
				working viewer currently covers acquired IVIM only.
			</p>
			<button class="button button-primary mx-auto mt-3" onclick={() => (technique = 'IVIM')}
				>Explore the IVIM demo</button
			>
		</section>
	{:else if dataError}
		<section class="card m-auto min-h-0 space-y-3 overflow-auto p-6" role="alert">
			<h2 class="font-semibold">Brain dataset unavailable</h2>
			<p>{dataError}</p>
			<p class="text-sm">
				Prepare the static dataset with scripts/prepare_ivim.py before serving or deploying, then
				reload. No mock data is substituted.
			</p>
			<button class="button button-outline" onclick={() => location.reload()}>Reload dataset</button
			>
		</section>
	{:else if !dataset || !volumes.length}<p class="card p-10 text-center" role="status">
			Loading and verifying acquired IVIM volumes...
		</p>
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
				bind:gridLayout={preferences.current.gridLayout}
				bind:tool
				panel={preferences.current.panel}
				onselect={(vx, vy) => {
					x = vx;
					y = vy;
				}}
				ondisplay={setDisplay}
				onreset={resetView}
			>
				{#snippet controls()}<ImageControls
						dataset={dataset!}
						{slice}
						{active}
						display={activeDisplay}
						linked={preferences.current.linked}
						bind:navigationOpen={preferences.current.navigationOpen}
						bind:scope
						{tool}
						onslice={(value) => (slice = value)}
						onvolume={selectVolume}
						ondisplay={setDisplay}
						onlink={toggleLink}
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
				aria-label="Signal and saved views"
				tabindex="0"
			>
				<SignalPanel
					{dataset}
					{volumes}
					{active}
					{x}
					{y}
					{slice}
					{bookmarks}
					{compared}
					bind:valuesOpen={preferences.current.signalValuesOpen}
					onerror={(text) => (message = text)}
				/>
				<SavedVoxels
					{dataset}
					{bookmarks}
					bind:compared
					bind:note
					message={storageMessage}
					onsave={saveView}
					onrestore={restore}
					ondelete={deleteView}
				/>
				<WorkspaceFiles
					{dataset}
					getworkspace={workspaceData}
					onapply={applyWorkspace}
					onresetlayout={resetLayout}
					onmessage={(text) => (message = text)}
				/>
				<DatasetDetails {dataset} {active} bind:open={preferences.current.metadataOpen} />
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
