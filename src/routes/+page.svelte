<script lang="ts">
	import ArrowRightIcon from '~icons/lucide/arrow-right';
	import BarChartIcon from '~icons/lucide/bar-chart-3';
	import CheckIcon from '~icons/lucide/check';
	import DatabaseIcon from '~icons/lucide/database';
	import FileCodeIcon from '~icons/lucide/file-code-2';
	import FolderOpenIcon from '~icons/lucide/folder-open';
	import PlayIcon from '~icons/lucide/play';
	import ShieldCheckIcon from '~icons/lucide/shield-check';
	import TerminalIcon from '~icons/lucide/terminal';
	import UploadIcon from '~icons/lucide/upload-cloud';

	const runCommand = 'osipy config.yaml /path/to/data --output results/';
	const modalities = ['DCE', 'DSC', 'ASL', 'IVIM'];
	const importTypes = ['DICOM', 'NIfTI', 'BIDS'];
	const steps = [
		{
			title: 'Import data',
			subtitle: 'Select source imaging data',
			detail: 'Load a DICOM folder, NIfTI file, or BIDS dataset from your local workspace.'
		},
		{
			title: 'Configure',
			subtitle: 'Set modality and parameters',
			detail: 'Choose the analysis modality and review the generated YAML configuration.'
		},
		{
			title: 'Run analysis',
			subtitle: 'Execute the local workflow',
			detail: `Review the command before running it locally: ${runCommand}`
		},
		{
			title: 'Review results',
			subtitle: 'Inspect maps and validation',
			detail: 'Preview NIfTI parameter maps, quality masks, run metadata, and validation warnings.'
		}
	];

	let activeStep = $state(0);
	const active = $derived(steps[activeStep]);
</script>

<svelte:head>
	<title>OSIPY Dashboard</title>
	<meta
		name="description"
		content="Local OSIPY dashboard for reproducible perfusion MRI workflows."
	/>
</svelte:head>

<main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
	<div class="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<div class="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
				<span>Workspace</span><span>/</span><span class="text-foreground">New analysis</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">New perfusion analysis</h1>
			<p class="mt-1.5 text-sm text-muted-foreground">
				Prepare and review a reproducible OSIPY workflow.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="badge border-warning/30 bg-warning/10 text-warning-foreground"
				>Interface preview</span
			>
			<button class="button button-primary" type="button">
				<PlayIcon class="h-4 w-4" /> Run analysis
			</button>
		</div>
	</div>

	<div class="mt-6 grid gap-4 sm:grid-cols-3">
		<div class="card flex items-center gap-4 p-4">
			<div class="rounded-lg bg-accent p-2.5 text-accent-foreground">
				<DatabaseIcon class="h-5 w-5" />
			</div>
			<div>
				<p class="text-xs font-medium text-muted-foreground">Input</p>
				<p class="mt-0.5 text-sm font-semibold">No dataset selected</p>
			</div>
		</div>
		<div class="card flex items-center gap-4 p-4">
			<div class="rounded-lg bg-secondary p-2.5 text-secondary-foreground">
				<FileCodeIcon class="h-5 w-5" />
			</div>
			<div>
				<p class="text-xs font-medium text-muted-foreground">Configuration</p>
				<p class="mt-0.5 text-sm font-semibold">Default parameters</p>
			</div>
		</div>
		<div class="card flex items-center gap-4 p-4">
			<div class="rounded-lg bg-secondary p-2.5 text-secondary-foreground">
				<ShieldCheckIcon class="h-5 w-5" />
			</div>
			<div>
				<p class="text-xs font-medium text-muted-foreground">Environment</p>
				<p class="mt-0.5 text-sm font-semibold">Local execution</p>
			</div>
		</div>
	</div>

	<div class="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
		<aside class="card h-fit p-2" aria-label="Analysis workflow">
			<div class="px-3 pt-3 pb-2">
				<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Workflow</p>
			</div>
			{#each steps as step, index (step.title)}
				<button
					type="button"
					class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted"
					class:bg-accent={activeStep === index}
					onclick={() => (activeStep = index)}
					aria-current={activeStep === index ? 'step' : undefined}
				>
					<span
						class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
						class:border-primary={activeStep >= index}
						class:bg-primary={activeStep > index}
						class:text-primary-foreground={activeStep > index}
						class:text-primary={activeStep === index}
					>
						{#if activeStep > index}<CheckIcon class="h-3.5 w-3.5" />{:else}{index + 1}{/if}
					</span>
					<span class="min-w-0">
						<span class="block text-sm font-medium">{step.title}</span>
						<span class="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.subtitle}</span
						>
					</span>
				</button>
			{/each}
		</aside>

		<section class="card min-w-0 overflow-hidden">
			<div
				class="flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6"
			>
				<div>
					<p class="text-xs font-medium text-primary">STEP {activeStep + 1} OF {steps.length}</p>
					<h2 class="mt-1.5 text-xl font-semibold tracking-tight">{active.title}</h2>
					<p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{active.detail}</p>
				</div>
				<button class="button button-outline" type="button">
					Continue <ArrowRightIcon class="h-4 w-4" />
				</button>
			</div>

			<div class="min-h-[390px] bg-muted/25 p-5 sm:p-6">
				{#if activeStep === 0}
					<div class="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)]">
						<button
							class="group flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
							type="button"
						>
							<span class="rounded-xl border bg-background p-3 shadow-sm group-hover:text-primary"
								><UploadIcon class="h-6 w-6" /></span
							>
							<span class="mt-4 text-sm font-semibold">Choose imaging data</span>
							<span class="mt-1 text-sm text-muted-foreground"
								>Select a file or folder from this device</span
							>
							<span class="button button-outline mt-5"
								><FolderOpenIcon class="h-4 w-4" /> Browse files</span
							>
						</button>
						<div class="card p-5 shadow-none">
							<h3 class="text-sm font-semibold">Supported inputs</h3>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each importTypes as type (type)}<span
										class="badge bg-secondary text-secondary-foreground">{type}</span
									>{/each}
							</div>
							<div class="my-5 border-t"></div>
							<dl class="space-y-4 text-sm">
								<div>
									<dt class="font-medium">DICOM</dt>
									<dd class="mt-1 text-muted-foreground">A complete series directory</dd>
								</div>
								<div>
									<dt class="font-medium">NIfTI</dt>
									<dd class="mt-1 text-muted-foreground"><code>.nii.gz</code> with JSON sidecar</dd>
								</div>
								<div>
									<dt class="font-medium">BIDS</dt>
									<dd class="mt-1 text-muted-foreground">Dataset root directory</dd>
								</div>
							</dl>
						</div>
					</div>
				{:else if activeStep === 1}
					<div class="grid gap-5 md:grid-cols-2">
						<div class="card p-5 shadow-none">
							<h3 class="text-sm font-semibold">Imaging modality</h3>
							<p class="mt-1 text-sm text-muted-foreground">Select the acquisition type.</p>
							<div class="mt-5 grid grid-cols-2 gap-2">
								{#each modalities as modality (modality)}<button
										class="button button-outline"
										class:border-primary={modality === 'DCE'}
										class:bg-accent={modality === 'DCE'}
										type="button">{modality}</button
									>{/each}
							</div>
						</div>
						<div class="card p-5 shadow-none">
							<h3 class="text-sm font-semibold">Generated configuration</h3>
							<div
								class="mt-5 rounded-lg bg-foreground p-4 font-mono text-xs leading-6 text-background"
							>
								<p>model: extended_tofts</p>
								<p>format: auto</p>
								<p>validate: true</p>
							</div>
						</div>
					</div>
				{:else if activeStep === 2}
					<div class="card p-5 shadow-none">
						<div class="flex items-center gap-3">
							<span class="rounded-lg bg-accent p-2 text-accent-foreground"
								><TerminalIcon class="h-5 w-5" /></span
							>
							<div>
								<h3 class="text-sm font-semibold">Command preview</h3>
								<p class="text-xs text-muted-foreground">Ready for local execution</p>
							</div>
						</div>
						<code
							class="mt-5 block overflow-x-auto rounded-lg bg-foreground p-4 text-xs text-background sm:text-sm"
							>{runCommand}</code
						>
						<div class="mt-5 flex justify-end">
							<button class="button button-primary" type="button"
								><PlayIcon class="h-4 w-4" /> Run locally</button
							>
						</div>
					</div>
				{:else}
					<div class="grid gap-4 md:grid-cols-3">
						{#each ['Parameter maps', 'Quality mask', 'Run metadata'] as output (output)}
							<div class="card p-5 shadow-none">
								<BarChartIcon class="h-5 w-5 text-primary" />
								<h3 class="mt-4 text-sm font-semibold">{output}</h3>
								<p class="mt-1 text-sm text-muted-foreground">Preview and export</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>

	<p class="mt-5 text-center text-xs text-muted-foreground">
		This interface is a frontend preview and does not start or manage analysis jobs.
	</p>
</main>
