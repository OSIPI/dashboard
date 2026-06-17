<script lang="ts">
	const runCommand = 'osipy config.yaml /path/to/data --output results/';
	const bridgeCommand = 'osipy-dashboard serve --port 9090';
	const modalities = ['DCE', 'DSC', 'ASL', 'IVIM'];
	const importTypes = ['DICOM', 'NIfTI', 'BIDS'];
	const steps = [
		{
			title: 'Import',
			subtitle: 'Drop data or choose a local path.',
			detail: 'OSIPY can load DICOM folders, NIfTI files, and BIDS datasets. The dashboard should hand the selected path to the local runner.',
			accent: 'bg-primary'
		},
		{
			title: 'Configure',
			subtitle: 'Choose modality and YAML settings.',
			detail: 'The current Python package runs from a validated YAML config. This screen should expose the important fields without hiding the generated config.',
			accent: 'bg-secondary'
		},
		{
			title: 'Run',
			subtitle: 'Execute the OSIPY CLI locally.',
			detail: `Current command shape: ${runCommand}`,
			accent: 'bg-accent'
		},
		{
			title: 'Review',
			subtitle: 'Inspect maps, metrics, and logs.',
			detail: 'Results are saved as NIfTI parameter maps with run metadata. This screen should preview outputs and surface validation warnings.',
			accent: 'bg-info'
		}
	];

	let activeStep = $state(0);
	const active = $derived(steps[activeStep]);
</script>

<svelte:head>
	<title>OSIPY Dashboard</title>
	<meta
		name="description"
		content="Local OSIPY dashboard for running reproducible perfusion MRI workflows."
	/>
</svelte:head>

<main class="container mx-auto max-w-6xl px-4 pb-16 pt-6">
	<section class="relative overflow-hidden rounded-[2rem] bg-base-200 px-6 py-14 shadow-sm md:px-12 md:py-20">
		<div class="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"></div>
		<div class="absolute -bottom-28 left-8 h-64 w-64 rounded-full bg-secondary/15 blur-3xl"></div>

		<div class="relative grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
			<div>
				<p class="mb-4 text-sm font-semibold uppercase tracking-[0.4em] text-primary">OSIPY</p>
				<h1 class="max-w-3xl text-5xl font-black tracking-tight text-base-content md:text-7xl">
					Run perfusion MRI workflows locally
				</h1>
				<p class="mt-6 max-w-2xl text-lg leading-8 text-base-content/70">
					A local dashboard for reproducible, standardized, community-led perfusion MRI analysis.
				</p>
			</div>

			<div class="rounded-[1.5rem] border border-base-300 bg-base-100/80 p-5 shadow-sm backdrop-blur">
				<div class="mb-4 flex items-center justify-between gap-4">
					<span class="text-sm font-semibold text-base-content/60">Local bridge</span>
					<span class="badge badge-warning">planned</span>
				</div>
				<p class="text-sm leading-6 text-base-content/70">
					The browser cannot run OSIPY directly. A small local bridge should expose the Python runner to this dashboard.
				</p>
				<code class="mt-4 block rounded-xl bg-base-300/70 px-3 py-2 text-xs text-base-content/70">
					{bridgeCommand}
				</code>
				<div class="mt-5 grid grid-cols-4 gap-2">
					{#each modalities as modality}
						<span class="rounded-xl bg-base-200 py-3 text-center text-sm font-black">{modality}</span>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section class="mt-8 rounded-[2rem] border border-base-300 bg-base-100 p-5 shadow-sm md:p-8">
		<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div>
				<p class="text-sm font-semibold uppercase tracking-[0.32em] text-primary">Workflow</p>
				<h2 class="mt-2 text-3xl font-black tracking-tight md:text-4xl">Analysis stages</h2>
			</div>
			<div class="text-sm text-base-content/60">
				Hint: <code class="rounded bg-base-200 px-2 py-1">{runCommand}</code>
			</div>
		</div>

		<div class="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
			<div class="space-y-3">
				{#each steps as step, index}
					<button
						class="group w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
						class:border-primary={activeStep === index}
						class:bg-base-200={activeStep === index}
						class:border-base-300={activeStep !== index}
						onclick={() => (activeStep = index)}
					>
						<div class="flex items-center gap-3">
							<span class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-primary-content {step.accent}">
								{index + 1}
							</span>
							<div>
								<div class="font-black">{step.title}</div>
								<div class="text-sm text-base-content/60">{step.subtitle}</div>
							</div>
						</div>
					</button>
				{/each}
			</div>

			<div class="min-h-[440px] rounded-[1.5rem] border border-base-300 bg-base-200 p-5 md:p-7">
				<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div>
						<p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Step {activeStep + 1}</p>
						<h3 class="mt-2 text-4xl font-black">{active.title}</h3>
						<p class="mt-3 max-w-2xl text-base-content/70">{active.detail}</p>
					</div>
					<button class="btn btn-primary">Continue</button>
				</div>

				{#if activeStep === 0}
					<div class="mt-8 grid gap-5 md:grid-cols-[1fr_0.8fr]">
						<div class="flex min-h-56 flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-base-content/30 bg-base-100 p-8 text-center">
							<h4 class="text-2xl font-black uppercase">Import data</h4>
							<p class="mt-2 text-sm text-base-content/60">Drag a file or folder here</p>
						</div>
						<div class="rounded-[1.5rem] bg-base-100 p-5">
							<p class="font-black">Accepted now</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each importTypes as type}
									<span class="badge badge-outline">{type}</span>
								{/each}
							</div>
							<p class="mt-4 text-sm leading-6 text-base-content/70">
								Examples: a DICOM series directory, a <code>.nii.gz</code> file with JSON sidecar, or a BIDS root with <code>dataset_description.json</code>.
							</p>
						</div>
					</div>
				{:else if activeStep === 1}
					<div class="mt-8 grid gap-4 md:grid-cols-2">
						<div class="rounded-2xl bg-base-100 p-5">
							<p class="text-sm text-base-content/60">Modality</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each modalities as modality}
									<span class="badge badge-lg {modality === 'DCE' ? 'badge-primary' : 'badge-outline'}">{modality}</span>
								{/each}
							</div>
						</div>
						<div class="rounded-2xl bg-base-100 p-5">
							<p class="text-sm text-base-content/60">Config</p>
							<p class="mt-2 font-mono text-sm">model: extended_tofts</p>
							<p class="font-mono text-sm">format: auto</p>
						</div>
					</div>
				{:else if activeStep === 2}
					<div class="mt-8 rounded-[1.5rem] bg-base-100 p-5">
						<div class="mb-3 flex items-center gap-2">
							<span class="loading loading-spinner loading-sm text-primary"></span>
							<span class="font-black">Ready to execute locally</span>
						</div>
						<code class="block rounded-xl bg-base-200 p-3 text-xs md:text-sm">{runCommand}</code>
					</div>
				{:else}
					<div class="mt-8 grid gap-4 md:grid-cols-3">
						{#each ['Parameter maps', 'Quality mask', 'Run metadata'] as output}
							<div class="rounded-2xl bg-base-100 p-5">
								<p class="font-black">{output}</p>
								<p class="mt-2 text-sm text-base-content/60">Preview and export</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>
</main>
