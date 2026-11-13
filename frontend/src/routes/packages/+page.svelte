<script lang="ts">
	import { resolve } from '$app/paths';
	import { assessedOn, assessments, collections, contributions, runtime } from '$lib/contributions';

	let search = $state('');
	let collection = $state('all');
	let assessment = $state('all');
	const collectionEntries = contributions.filter((entry) => entry.collection !== 'OSIPY');
	const listed = $derived(
		contributions.filter(
			(entry) =>
				(collection === 'all' || entry.collection === collection) &&
				(assessment === 'all' || entry.assessment === assessment) &&
				`${entry.name} ${entry.description} ${entry.path} ${entry.language} ${entry.notes}`
					.toLowerCase()
					.includes(search.trim().toLowerCase())
		)
	);
</script>

<svelte:head>
	<title>Community code catalog · OSIPY</title>
	<meta
		name="description"
		content="OSIPI code contributions and source-based Pyodide assessments, with pinned source links and explicit browser limitations."
	/>
</svelte:head>

<main id="catalog" class="mx-auto max-w-7xl space-y-6 px-3 py-6 sm:px-6">
	<header class="max-w-3xl space-y-3">
		<p class="text-xs font-semibold text-selection">OSIPI community resources</p>
		<h1 class="text-3xl font-semibold text-balance">Community code catalog</h1>
		<p class="text-sm text-pretty text-muted-foreground">
			Explore contributed tools and their readiness for Python in the browser. This is a catalog,
			not an installer: listing a tool does not make it runnable in the dashboard.
		</p>
		<p class="text-xs text-muted-foreground">
			Assessed {assessedOn} against {runtime}. Source review only, except for the explicitly
			documented OSIPY workflow. No new browser execution claims.
		</p>
	</header>

	<section aria-label="Catalog scope" class="grid gap-3 sm:grid-cols-3">
		<div class="card p-4">
			<p class="text-2xl font-semibold tabular-nums">{collectionEntries.length}</p>
			<p class="text-sm">Collection entries</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Including external references, not a package count
			</p>
		</div>
		<div class="card p-4">
			<p class="text-2xl font-semibold tabular-nums">3</p>
			<p class="text-sm">OSIPI code collections</p>
			<p class="mt-1 text-xs text-muted-foreground">
				DCE/DSC, ASL and IVIM; not a community wide inventory
			</p>
		</div>
		<div class="card p-4">
			<p class="text-2xl font-semibold tabular-nums">1</p>
			<p class="text-sm">Documented browser engine</p>
			<p class="mt-1 text-xs text-muted-foreground">
				OSIPY numeric IVIM only, listed separately below
			</p>
		</div>
	</section>

	<details class="card p-4">
		<summary class="cursor-pointer text-sm font-semibold"
			>How to read compatibility and counts</summary
		>
		<div class="mt-3 space-y-3 text-sm text-muted-foreground">
			<p>
				A candidate uses dependencies available in the pinned runtime but has not been verified.
				Adaptation needed identifies concrete packaging, API or scheduling work. Not compatible as
				supplied means the complete workflow has a known blocker, not that every numeric function is
				impossible to port. Pyodide cannot run MATLAB or ordinary desktop executables.
			</p>
			<p>
				We count one entry per original contribution folder, splitting the three named preclinical
				ASL contributions and including README references. Empty Python initializers do not make a
				MATLAB implementation Python compatible. Bundles can overlap, contain many methods, or refer
				to the same upstream project. The OSIPY engine is not added to the collection count.
			</p>
			<p>
				Before enabling any new tool: confirm licensing, pin its complete dependencies, exercise its
				real browser entry point, compare scientific outputs against the reference implementation,
				and assess memory, cancellation and privacy. This catalog does not execute third party code.
			</p>
			<a
				class="font-medium text-foreground underline underline-offset-4"
				href="https://github.com/OSIPI/dashboard/blob/main/docs/contribution-catalog.md"
				target="_blank"
				rel="noreferrer">Assessment methodology and sources</a
			>
		</div>
	</details>

	<section aria-label="Filter contributions" class="flex flex-wrap items-end gap-3">
		<label class="min-w-0 basis-full text-sm sm:min-w-64 sm:flex-1">
			<span class="mb-1 block">Search tools or dependencies</span>
			<input
				class="input min-h-11 w-full"
				type="search"
				bind:value={search}
				placeholder="Name, institution, MATLAB, FSL…"
			/>
		</label>
		<label class="min-w-0 flex-1 text-sm sm:flex-none">
			<span class="mb-1 block">Collection</span>
			<select class="input min-h-11 w-full" bind:value={collection}>
				<option value="all">All collections</option>
				{#each Object.keys(collections) as key (key)}<option value={key}>{key}</option>{/each}
			</select>
		</label>
		<label class="min-w-0 basis-full text-sm sm:basis-auto">
			<span class="mb-1 block">Pyodide assessment</span>
			<select class="input min-h-11 w-full" bind:value={assessment}>
				<option value="all">All assessments</option>
				{#each Object.entries(assessments) as [key, label] (key)}<option value={key}>{label}</option
					>{/each}
			</select>
		</label>
	</section>

	<p role="status" class="text-xs text-muted-foreground">
		Showing {listed.length} of {contributions.length} entries (including the OSIPY engine).
	</p>
	<!-- The wide table needs a keyboard-focusable horizontal scroll region. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="relative overflow-x-auto rounded-lg border"
		role="region"
		aria-label="Contribution compatibility table"
		tabindex="0"
	>
		<table class="w-full min-w-[960px] text-left text-sm">
			<caption class="sr-only"
				>OSIPI contributions, implementation languages and source based Pyodide assessments</caption
			>
			<thead class="bg-muted text-xs text-muted-foreground">
				<tr>
					<th scope="col" class="p-3 font-medium">Tool / contribution</th>
					<th scope="col" class="p-3 font-medium">What it does</th>
					<th scope="col" class="p-3 font-medium">Collection</th>
					<th scope="col" class="p-3 font-medium">Language</th>
					<th scope="col" class="p-3 font-medium">Pyodide assessment</th>
					<th scope="col" class="p-3 font-medium">Evidence / work required</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each listed as entry (`${entry.collection}/${entry.path}`)}
					<tr class="align-top hover:bg-muted/40">
						<th scope="row" class="w-1/5 p-3 font-medium">
							<a
								href={`https://github.com/${collections[entry.collection].repo}/tree/${collections[entry.collection].sha}/${collections[entry.collection].prefix}${entry.path}`}
								target="_blank"
								rel="noreferrer"
								class="underline decoration-border underline-offset-4 hover:decoration-foreground"
								>{entry.name}</a
							>
							<span class="mt-1 block text-xs font-normal text-muted-foreground">{entry.kind}</span>
							{#if entry.collection === 'OSIPY'}<a
									class="mt-2 inline-flex min-h-11 items-center text-xs underline"
									href={resolve('/browser-ivim')}>Open existing IVIM demo</a
								>{/if}
						</th>
						<td class="w-1/5 p-3 text-xs leading-relaxed">{entry.description}</td>
						<td class="p-3 text-xs">{entry.collection}</td>
						<td class="p-3 text-xs">{entry.language}</td>
						<td class="p-3 text-xs"
							><span class="font-medium">{assessments[entry.assessment]}</span></td
						>
						<td class="max-w-md p-3 text-xs leading-relaxed text-muted-foreground">{entry.notes}</td
						>
					</tr>
				{:else}
					<tr
						><td colspan="6" class="p-6 text-center text-muted-foreground"
							>No matching contributions. Clear the search or change the filters.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	<footer class="space-y-2 pb-4 text-xs text-muted-foreground">
		<p>
			<a
				class="text-foreground underline underline-offset-4"
				href="https://github.com/OSIPI/dashboard/issues/31"
				target="_blank"
				rel="noreferrer">Track MATLAB to Python porting work</a
			>
		</p>
		<p>
			Research software only. An assessment is not scientific validation, clinical approval or a
			promise of integration.
		</p>
		<a
			class="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
			href={resolve('/')}>Return to the dashboard</a
		>
	</footer>
</main>
