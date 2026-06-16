<script lang="ts">
	const focusAreas = [
		{
			title: 'Projects',
			description: 'Track OSIPY implementation work across DSC, DCE, ASL, validation, and docs.',
			items: ['Method registry', 'Pipeline examples', 'Reference data']
		},
		{
			title: 'Copy',
			description: 'Shape the public language for contributors, researchers, and clinical imaging teams.',
			items: ['Landing page text', 'Contributor guide', 'Release notes']
		},
		{
			title: 'Ideas',
			description: 'Keep early product and research ideas visible before they become implementation tasks.',
			items: ['Interactive demos', 'Validation reports', 'Educational notebooks']
		}
	];

	const nextSteps = [
		'Connect live project data when the backend is ready.',
		'Decide which OSIPI workflows need first-class dashboard views.',
		'Replace placeholder copy with community-approved messaging.'
	];
</script>

<svelte:head>
	<title>OSIPY Dashboard</title>
	<meta
		name="description"
		content="A simple starting dashboard for OSIPY projects, copy, and ideas."
	/>
</svelte:head>

<main class="container mx-auto max-w-6xl px-4 pb-16 pt-6">
	<section class="hero min-h-[360px] rounded-[2rem] bg-base-200 shadow-sm">
		<div class="hero-content max-w-4xl text-center">
			<div>
				<p class="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-primary">OSIPY</p>
				<h1 class="text-5xl font-black tracking-tight text-base-content md:text-7xl">
					Dashboard for open imaging science
				</h1>
				<p class="mx-auto mt-6 max-w-2xl text-lg leading-8 text-base-content/70">
					A lightweight workspace for organizing OSIPY projects, product copy, and early ideas.
					Authentication and database features are intentionally paused while the dashboard takes shape.
				</p>
				<div class="mt-8 flex flex-wrap justify-center gap-3">
					<a class="btn btn-primary" href="https://github.com/OSIPI/osipi" target="_blank" rel="noreferrer">
						View OSIPI GitHub
					</a>
					<a class="btn btn-outline" href="/about">About OSIPY</a>
				</div>
			</div>
		</div>
	</section>

	<section class="mt-10 grid gap-6 md:grid-cols-3">
		{#each focusAreas as area}
			<article class="card border border-base-300 bg-base-100 shadow-sm">
				<div class="card-body">
					<h2 class="card-title text-2xl">{area.title}</h2>
					<p class="text-base-content/70">{area.description}</p>
					<ul class="mt-4 space-y-2 text-sm text-base-content/80">
						{#each area.items as item}
							<li class="flex items-center gap-2">
								<span class="badge badge-primary badge-xs"></span>
								{item}
							</li>
						{/each}
					</ul>
				</div>
			</article>
		{/each}
	</section>

	<section class="mt-10 rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-sm md:p-8">
		<div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
			<div>
				<p class="text-sm font-semibold uppercase tracking-[0.25em] text-secondary">Simple start</p>
				<h2 class="mt-2 text-3xl font-bold">Next dashboard decisions</h2>
				<p class="mt-3 max-w-2xl text-base-content/70">
					These placeholders keep the template useful without committing to login, persistence, or a database
					model before the OSIPY dashboard scope is clear.
				</p>
			</div>
			<div class="stats stats-vertical bg-base-200 shadow md:stats-horizontal">
				<div class="stat">
					<div class="stat-title">Backend</div>
					<div class="stat-value text-xl">Paused</div>
				</div>
				<div class="stat">
					<div class="stat-title">Runtime</div>
					<div class="stat-value text-xl">Bun</div>
				</div>
			</div>
		</div>

		<ol class="mt-6 grid gap-3 md:grid-cols-3">
			{#each nextSteps as step, index}
				<li class="rounded-2xl bg-base-200 p-4">
					<span class="text-sm font-bold text-primary">0{index + 1}</span>
					<p class="mt-2 text-sm text-base-content/75">{step}</p>
				</li>
			{/each}
		</ol>
	</section>
</main>
