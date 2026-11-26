<script lang="ts">
	import { resolve } from '$app/paths';
	import SearchIcon from '~icons/lucide/search';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
	import { IVIM_MODELS, IVIM_METHODS } from '$lib/browser-ivim';
	import { collections, contributions } from '$lib/contributions';
	import { dashboardTools, catalogRoadmap, progressSnapshotDate } from '$lib/catalog-progress';
	import {
		capabilitySnapshotDate,
		capabilitySource,
		capabilityVersion,
		countCatalogMethods,
		methodImplementationUrl,
		methodDescriptions,
		osipyCapabilities
	} from '$lib/osipy-capabilities';

	let search = $state('');
	let modality = $state('all');
	let view = $state<'methods' | 'tools' | 'roadmap'>('methods');
	const references = contributions.filter((entry) => entry.collection !== 'OSIPY');
	const modalities = [
		{
			id: 'IVIM',
			label: 'IVIM',
			description: 'Diffusion and microvascular perfusion',
			dashboard: true
		},
		{
			id: 'DCE',
			label: 'DCE',
			description: 'Contrast uptake and tissue exchange',
			dashboard: false
		},
		{
			id: 'DSC',
			label: 'DSC',
			description: 'Bolus tracking and tissue perfusion',
			dashboard: false
		},
		{
			id: 'ASL',
			label: 'ASL',
			description: 'Blood flow from magnetically labeled blood',
			dashboard: false
		},
		{
			id: 'Common',
			label: 'Shared methods',
			description: 'Fitters and arterial input functions',
			dashboard: false
		}
	];
	const stats = [
		{
			value: countCatalogMethods(osipyCapabilities),
			label: 'Library methods',
			detail: 'Unique IDs · aliases counted once'
		},
		{
			value: IVIM_MODELS.length + IVIM_METHODS.length,
			label: 'Dashboard methods',
			detail: `${IVIM_MODELS.length} IVIM models · ${IVIM_METHODS.length} strategies`
		},
		{
			value: dashboardTools.length,
			label: 'Shared tools',
			detail: 'Import, viewing, ROI & export'
		},
		{
			value: modalities.filter((item) => item.id !== 'Common').length,
			label: 'MRI modalities',
			detail: 'In the OSIPY library'
		},
		{
			value: catalogRoadmap.length,
			label: 'Roadmap items',
			detail: `${catalogRoadmap.filter((item) => item.status === 'In progress').length} in progress · ${catalogRoadmap.filter((item) => item.status === 'Planned').length} planned`
		}
	];
	function toolHref(destination: (typeof dashboardTools)[number]['destination']): string {
		if (destination === 'library') return resolve('/');
		if (destination === 'viewer') return resolve('/viewer');
		return `${resolve('/viewer')}?${new URLSearchParams({ panel: destination })}`;
	}
	function demoHref(registry: string, method: string): string {
		const params = new URLSearchParams();
		params.set(registry === 'ivim/models/registry.py' ? 'model' : 'strategy', method);
		return `${resolve('/browser-ivim')}?${new URLSearchParams(params)}`;
	}
	const listed = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return osipyCapabilities
			.filter((group) => modality === 'all' || group.modality === modality)
			.map((group) => ({
				...group,
				methods: group.methods.filter((method) =>
					`${group.modality} ${group.label} ${method} ${methodDescriptions[method].label} ${methodDescriptions[method].description}`
						.toLowerCase()
						.includes(query)
				)
			}))
			.filter((group) => group.methods.length > 0);
	});
	const sections = $derived(
		modalities
			.map((item) => ({ ...item, groups: listed.filter((group) => group.modality === item.id) }))
			.filter((item) => item.groups.length > 0)
	);
</script>

<svelte:head>
	<title>OSIPY capability catalog · OSIPY</title>
	<meta
		name="description"
		content="Explore OSIPY methods by MRI modality. See what is available in the dashboard and browse models, fitting, processing and calibration methods."
	/>
</svelte:head>

<main id="catalog" class="mx-auto w-full max-w-7xl min-w-0 space-y-6 px-3 py-6 sm:px-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-2">
			<p class="text-xs font-medium text-selection">OSIPY {capabilityVersion}</p>
			<h1 class="text-3xl font-semibold tracking-tight">Capability catalog</h1>
			<p class="text-sm text-muted-foreground">
				Explore methods, use the tools, follow the roadmap.
			</p>
		</div>
		<a class="button button-outline min-h-11 gap-2 text-sm" href={resolve('/viewer')}>
			Open dashboard <ArrowUpRightIcon class="size-4" aria-hidden="true" />
		</a>
	</header>

	<section aria-label="Catalog overview" class="grid grid-cols-2 gap-3 lg:grid-cols-5">
		{#each stats as stat (stat.label)}
			<div class="card min-w-0 p-4 sm:p-5">
				<p class="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{stat.value}</p>
				<p class="mt-2 text-sm font-medium">{stat.label}</p>
				<p class="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
			</div>
		{/each}
	</section>

	<nav class="flex flex-wrap gap-2" aria-label="Catalog sections">
		{#each [{ id: 'methods' as const, label: 'Scientific methods', count: countCatalogMethods(osipyCapabilities) }, { id: 'tools' as const, label: 'Dashboard tools', count: dashboardTools.length }, { id: 'roadmap' as const, label: 'Roadmap', count: catalogRoadmap.length }] as item (item.id)}
			<button
				type="button"
				aria-pressed={view === item.id}
				onclick={() => (view = item.id)}
				class="button min-h-11 gap-2 {view === item.id
					? 'bg-foreground text-background'
					: 'button-outline text-muted-foreground'}"
				>{item.label}<span class="text-xs tabular-nums opacity-70">{item.count}</span></button
			>
		{/each}
	</nav>

	{#if view === 'methods'}
		<section aria-label="Filter catalog" class="space-y-3">
			<div class="relative">
				<SearchIcon
					class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<input
					class="input min-h-11 w-full pl-10"
					type="search"
					aria-label="Search methods"
					bind:value={search}
					placeholder="Search methods, models or what they do…"
				/>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex flex-wrap gap-1" role="group" aria-label="MRI modality">
					{#each [{ id: 'all', label: 'All methods' }, ...modalities] as item (item.id)}
						<button
							type="button"
							aria-pressed={modality === item.id}
							onclick={() => (modality = item.id)}
							class="button min-h-11 gap-2 px-3 text-sm {modality === item.id
								? 'border border-selection/30 bg-selection-surface text-selection'
								: 'button-ghost text-muted-foreground'}"
						>
							{item.label}
							<span class="text-xs tabular-nums opacity-70"
								>{countCatalogMethods(
									osipyCapabilities.filter(
										(group) => item.id === 'all' || group.modality === item.id
									)
								)}</span
							>
						</button>
					{/each}
				</div>
				<p role="status" class="text-xs text-muted-foreground">
					{countCatalogMethods(listed)} methods · {listed.length} groups
				</p>
			</div>
		</section>

		{#each sections as section (section.id)}
			<section class="space-y-3" aria-labelledby={`modality-${section.id}`}>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<h2 id={`modality-${section.id}`} class="text-lg font-semibold">{section.label}</h2>
						<p class="text-xs text-muted-foreground">{section.description}</p>
					</div>
				</div>
				<div class="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
					{#each section.groups as group (group.registry)}
						<section
							class="card min-w-0 overflow-hidden"
							aria-label={`${section.label}: ${group.label}`}
						>
							<div class="flex items-center justify-between gap-3 bg-muted/30 px-4 py-3">
								<h3 class="text-sm font-semibold">{group.label}</h3>
								<span class="text-xs text-muted-foreground tabular-nums"
									>{group.methods.length}</span
								>
							</div>
							<ul class="divide-y">
								{#each group.methods as method (method)}
									<li>
										<details class="group">
											<summary
												class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection [&::-webkit-details-marker]:hidden"
											>
												<span class="min-w-0">{methodDescriptions[method].label}</span>
												<span class="ml-auto flex shrink-0 items-center gap-2">
													<span
														class="badge whitespace-nowrap {section.dashboard
															? 'border-selection/30 bg-selection-surface text-selection'
															: 'text-muted-foreground'}"
														title={section.dashboard
															? 'Available in the dashboard'
															: 'Implemented in OSIPY; not yet exposed as a dashboard workflow'}
														>{section.dashboard ? 'In dashboard' : 'Library only'}</span
													>
													<ChevronDownIcon
														class="size-3.5 shrink-0 text-muted-foreground group-open:rotate-180"
														aria-hidden="true"
													/>
												</span>
											</summary>
											<div class="space-y-3 px-4 pb-4">
												<p class="text-xs leading-relaxed text-muted-foreground">
													{methodDescriptions[method].description}
												</p>
												{#if section.dashboard}
													<div class="flex flex-wrap gap-2">
														<a
															class="button button-outline min-h-11 text-xs"
															href={demoHref(group.registry, method)}>Try browser demo</a
														>
														<a
															class="button button-ghost min-h-11 text-xs"
															href={`${resolve('/viewer')}?panel=Analyze`}>Open scan analysis</a
														>
													</div>
													<p class="text-xs text-muted-foreground">
														Demo uses synthetic signals; scan analysis needs a saved IVIM dataset.
													</p>
												{/if}
												<a
													class="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground underline underline-offset-4"
													href={methodImplementationUrl(group.registry, method)}
													target="_blank"
													rel="noreferrer"
												>
													<code class="break-all">{method}</code>
													<ArrowUpRightIcon class="size-3 shrink-0" aria-hidden="true" /><span
														class="sr-only"
														>Implementation source for {methodDescriptions[method].label}</span
													>
												</a>
											</div>
										</details>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			</section>
		{:else}
			<div class="card space-y-3 p-6 text-center">
				<p class="text-sm font-medium">No matching methods</p>
				<button
					class="button button-outline min-h-11"
					type="button"
					onclick={() => {
						search = '';
						modality = 'all';
					}}>Clear filters</button
				>
			</div>
		{/each}
	{:else if view === 'tools'}
		<section aria-labelledby="tools-heading" class="space-y-3">
			<div class="space-y-1">
				<h2 id="tools-heading" class="text-lg font-semibold">What you can do in the dashboard</h2>
				<p class="text-xs text-muted-foreground">
					Viewing and analysis tools are currently for IVIM data. Import starts in the dataset
					library.
				</p>
			</div>
			<div class="grid items-start gap-3 md:grid-cols-2">
				{#each dashboardTools as tool (tool.id)}
					<article class="card space-y-3 p-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-sm font-semibold">{tool.label}</h3>
							<span class="badge border-selection/30 bg-selection-surface text-selection"
								>In dashboard</span
							>
						</div>
						<p class="text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
						<a
							class="button button-outline min-h-11 gap-2 text-xs"
							href={toolHref(tool.destination)}
							>{tool.action}<ArrowUpRightIcon class="size-3" aria-hidden="true" /></a
						>
					</article>
				{/each}
			</div>
		</section>
	{:else}
		<section aria-labelledby="roadmap-heading" class="space-y-3">
			<div class="space-y-1">
				<h2 id="roadmap-heading" class="text-lg font-semibold">Tracked implementation work</h2>
				<p class="text-xs text-muted-foreground">
					Status snapshot · {progressSnapshotDate}. Open PRs are not available on main; no delivery
					dates implied.
				</p>
			</div>
			<div class="grid items-start gap-3 md:grid-cols-2">
				{#each catalogRoadmap as item (item.id)}
					<article class="card space-y-3 p-4">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<h3 class="text-sm font-semibold">{item.label}</h3>
							<span
								class="badge {item.status === 'In progress'
									? 'border-selection/30 bg-selection-surface text-selection'
									: 'text-muted-foreground'}">{item.status}</span
							>
						</div>
						<p class="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
						<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<span class="badge">{item.modality}</span><span>{item.priority}</span>
						</div>
						<p class="text-xs text-muted-foreground">{item.note}</p>
						<a
							class="inline-flex min-h-11 items-center gap-2 text-xs underline underline-offset-4"
							href={item.url}
							target="_blank"
							rel="noreferrer"
							>{item.tracking}<ArrowUpRightIcon class="size-3" aria-hidden="true" /></a
						>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	<div class="grid items-start gap-3 md:grid-cols-2">
		<details id="sources" class="card p-4">
			<summary
				class="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium"
				>Sources & references <span class="text-xs text-muted-foreground tabular-nums"
					>{references.length} entries</span
				></summary
			>
			<p class="my-3 text-xs text-muted-foreground">
				Historical code collections, not required integrations or planned work.
			</p>
			<ul class="divide-y">
				{#each references as entry (`${entry.collection}/${entry.path}`)}
					<li class="py-3">
						<a
							class="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
							href={`https://github.com/${collections[entry.collection].repo}/tree/${collections[entry.collection].sha}/${collections[entry.collection].prefix}${entry.path}`}
							target="_blank"
							rel="noreferrer"
							>{entry.name}<ArrowUpRightIcon class="size-3 shrink-0" aria-hidden="true" /></a
						>
						<p class="text-xs text-muted-foreground">
							{entry.collection} · {entry.language} · {entry.kind}
						</p>
					</li>
				{/each}
			</ul>
		</details>
		<details class="card p-4">
			<summary class="flex min-h-11 cursor-pointer items-center text-sm font-medium"
				>About this catalog</summary
			>
			<div class="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
				<p>
					OSIPY {capabilityVersion} registry snapshot · {capabilitySnapshotDate}. Method counts use
					distinct IDs, folding the Fritz-Hansen alias and counting repeated shared IDs once. A
					shared method can appear in multiple modality lists; counts are not distinct scientific
					algorithms or complete workflows. The five dashboard method entries are two models plus
					three fit strategies, not five independent pipelines.
				</p>
				<p>
					IVIM is available in the dashboard. DCE, DSC and ASL list Python library functionality
					only. Recorded browser comparisons cover six synthetic single voxel IVIM fits, not full
					volume performance.
				</p>
				<p>
					Registry and roadmap data are curated snapshots, not live engine/GitHub connections.
					Priorities follow the linked backlog; library-only methods are not automatically planned
					work. Research software, not clinical approval.
				</p>
				<a
					class="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
					href="https://github.com/OSIPI/dashboard/blob/main/docs/contribution-catalog.md"
					target="_blank"
					rel="noreferrer">Scope & sources <ArrowUpRightIcon class="size-3" aria-hidden="true" /></a
				>
			</div>
		</details>
	</div>
</main>
