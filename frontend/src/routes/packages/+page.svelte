<script lang="ts">
	import { resolve } from '$app/paths';
	import { collections, contributions } from '$lib/contributions';
	import {
		capabilitySnapshotDate,
		capabilitySource,
		capabilityVersion,
		hasBrowserDemoEvidence,
		osipyCapabilities
	} from '$lib/osipy-capabilities';

	let search = $state('');
	let modality = $state('all');
	const references = contributions.filter((entry) => entry.collection !== 'OSIPY');
	const listed = $derived(
		osipyCapabilities.filter(
			(group) =>
				(modality === 'all' || group.modality === modality) &&
				`${group.modality} ${group.label} ${group.methods.join(' ')}`
					.toLowerCase()
					.includes(search.trim().toLowerCase())
		)
	);
</script>

<svelte:head>
	<title>OSIPY functionality and sources · OSIPY</title>
	<meta
		name="description"
		content="Implemented OSIPY models and methods, browser demo evidence, and the OSIPI code collections as sources and references rather than required integrations."
	/>
</svelte:head>

<main id="catalog" class="mx-auto max-w-7xl space-y-6 px-3 py-6 sm:px-6">
	<header class="max-w-3xl space-y-3">
		<p class="text-xs font-semibold text-selection">OSIPY scientific functionality</p>
		<h1 class="text-3xl font-semibold text-balance">Implemented models and methods</h1>
		<p class="text-sm text-pretty text-muted-foreground">
			OSIPY implements the scientific functions used by the dashboard. The OSIPI code collections
			are sources and references for this work, not a list of packages that need to be integrated.
		</p>
		<p class="text-xs text-muted-foreground">
			Registry snapshot from OSIPY {capabilityVersion}, enumerated in native Python on
			{capabilitySnapshotDate}. This is a versioned list of registered implementations, not a live
			connection to your analysis engine or a complete inventory of every utility function.
		</p>
	</header>

	<section aria-labelledby="availability-heading" class="card space-y-3 p-4">
		<h2 id="availability-heading" class="text-base font-semibold">
			Implementation is not browser verification
		</h2>
		<p class="text-sm text-muted-foreground">
			Recorded browser evidence covers the six combinations of IVIM biexponential/simplified models
			and segmented/full/Bayesian strategies for synthetic single voxel fitting. The viewer also
			exposes browser IVIM fitting, but those demo checks do not establish full volume performance
			or browser support for DCE, DSC or ASL. Other entries below are registered in OSIPY, not
			enabled browser workflows. Aliases may appear as separate registry keys.
		</p>
		<div class="flex flex-wrap gap-3 text-sm">
			<a
				class="inline-flex min-h-11 items-center underline underline-offset-4"
				href={resolve('/browser-ivim')}>Open IVIM demo</a
			>
			<a
				class="inline-flex min-h-11 items-center underline underline-offset-4"
				href={capabilitySource}
				target="_blank"
				rel="noreferrer">OSIPY release source</a
			>
		</div>
	</section>

	<section aria-label="Filter OSIPY functionality" class="flex flex-wrap items-end gap-3">
		<label class="min-w-0 basis-full text-sm sm:flex-1">
			<span class="mb-1 block">Search implemented models and methods</span>
			<input
				class="input min-h-11 w-full"
				type="search"
				bind:value={search}
				placeholder="Tofts, IVIM, calibration…"
			/>
		</label>
		<label class="min-w-0 text-sm">
			<span class="mb-1 block">Technique</span>
			<select class="input min-h-11 w-full" bind:value={modality}>
				<option value="all">All techniques</option>
				{#each ['IVIM', 'DCE', 'DSC', 'ASL', 'Common'] as value (value)}<option {value}
						>{value}</option
					>{/each}
			</select>
		</label>
	</section>

	<p role="status" class="text-xs text-muted-foreground">
		Showing {listed.length} of {osipyCapabilities.length} functionality groups.
	</p>
	<div class="grid gap-3 md:grid-cols-2">
		{#each listed as group (group.registry)}
			<section class="card min-w-0 space-y-3 p-4" aria-label={`${group.modality}: ${group.label}`}>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="text-base font-semibold">{group.label}</h2>
					<span class="badge">{group.modality}</span>
				</div>
				<ul class="space-y-3 text-sm">
					{#each group.methods as method (method)}
						<li class="flex flex-wrap items-center justify-between gap-2">
							<code class="break-all">{method}</code>
							<span class="text-xs text-muted-foreground"
								>{hasBrowserDemoEvidence(group.registry, method)
									? 'IVIM demo verified · single voxel'
									: 'OSIPY implementation · browser not verified'}</span
							>
						</li>
					{/each}
				</ul>
				<a
					class="inline-flex min-h-11 items-center text-xs underline underline-offset-4"
					href={`${capabilitySource}/${group.registry}`}
					target="_blank"
					rel="noreferrer">Registry source</a
				>
			</section>
		{:else}
			<p class="card p-6 text-sm text-muted-foreground">
				No matching functionality. Clear the search or change the technique.
			</p>
		{/each}
	</div>

	<details id="sources" class="card space-y-3 p-4">
		<summary class="cursor-pointer text-base font-semibold"
			>Sources and references: OSIPI code collections</summary
		>
		<p class="mt-3 max-w-3xl text-sm text-muted-foreground">
			These {references.length} historical contribution entries document source material and references.
			They can overlap with functions already implemented in OSIPY. They are not dashboard dependencies,
			promised integrations or a porting backlog. No third party package is installed or executed by
			this list. Contributor language does not determine whether the corresponding scientific method
			can run through OSIPY.
		</p>
		<ul class="grid gap-3 pt-3 md:grid-cols-2">
			{#each references as entry (`${entry.collection}/${entry.path}`)}
				<li class="min-w-0 space-y-1 text-sm">
					<a
						class="break-words underline underline-offset-4"
						href={`https://github.com/${collections[entry.collection].repo}/tree/${collections[entry.collection].sha}/${collections[entry.collection].prefix}${entry.path}`}
						target="_blank"
						rel="noreferrer">{entry.name}</a
					>
					<p class="text-xs text-muted-foreground">
						{entry.collection} · {entry.language} · {entry.kind}
					</p>
					<p class="text-xs text-muted-foreground">{entry.description}</p>
				</li>
			{/each}
		</ul>
	</details>

	<footer class="space-y-2 pb-4 text-xs text-muted-foreground">
		<p>Research software only. Registration is not scientific validation or clinical approval.</p>
		<a
			class="inline-flex min-h-11 items-center underline underline-offset-4"
			href="https://github.com/OSIPI/dashboard/blob/main/docs/contribution-catalog.md"
			target="_blank"
			rel="noreferrer">Scope, registry snapshot and sources</a
		>
		<a
			class="ml-3 inline-flex min-h-11 items-center underline underline-offset-4"
			href={resolve('/')}>Return to the dashboard</a
		>
	</footer>
</main>
