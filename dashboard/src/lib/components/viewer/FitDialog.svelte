<script lang="ts">
	import type { AnalysisClient } from '$lib/analysis-client.svelte';
	import type { FitConfig } from '$lib/analysis';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import XIcon from '~icons/lucide/x';

	let {
		client,
		dataset,
		volumes,
		x,
		y,
		slice,
		roiIndices = [],
		method,
		open = $bindable(false),
		onrun
	}: {
		client: AnalysisClient;
		dataset: Dataset;
		volumes: VoxelVolume[];
		x: number;
		y: number;
		slice: number;
		roiIndices?: number[];
		method: string;
		open: boolean;
		onrun: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	const titleId = $props.id();
	let config = $state<FitConfig>();
	let scope = $state<'voxel' | 'roi' | 'dataset'>('voxel');
	const running = $derived(client.runs.some((job) => job.state === 'running'));
	const ready = $derived(dataset.bValues.includes(0) && new Set(dataset.bValues).size >= 4);
	const model = $derived(client.catalog?.models.find((item) => item.id === method));
	$effect(() => {
		if (client.catalog && model && (!config || config.model !== method))
			config = { ...$state.snapshot(client.catalog.defaults), model: method };
	});
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
	function close() {
		dialog.close();
		open = false;
	}
	function run(event: SubmitEvent) {
		event.preventDefault();
		if (
			!config ||
			!model ||
			!ready ||
			client.busy ||
			running ||
			(scope === 'roi' && !roiIndices.length)
		)
			return;
		void client.start(
			dataset,
			volumes,
			$state.snapshot(config),
			scope,
			scope === 'voxel' ? [voxelIndex(x, y, slice, dataset.dimensions)] : roiIndices
		);
		close();
		onrun();
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	class="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-1rem))] max-w-none overflow-y-auto rounded-xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/70"
	onclose={() => (open = false)}
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
>
	<div class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card px-5 py-4">
		<div>
			<h2 id={titleId} class="text-lg font-semibold">Configure IVIM fit</h2>
			<p class="mt-1 text-sm text-muted-foreground">{model?.label ?? 'OSIPY fitting method'}</p>
		</div>
		<button
			class="button button-ghost button-icon shrink-0"
			type="button"
			aria-label="Close fitting settings"
			onclick={close}><XIcon class="size-4" /></button
		>
	</div>
	{#if model && config && client.catalog}
		<form class="space-y-5 p-5" onsubmit={run}>
			<p class="text-sm text-muted-foreground">
				OSIPY {client.catalog.osipyVersion} · {model.initialization}
			</p>
			<fieldset class="grid gap-4 sm:grid-cols-2" disabled={client.busy || running}>
				<legend class="mb-3 font-semibold">Fitting settings</legend>
				<label class="block text-sm"
					>Iterations<input
						class="input mt-1 w-full"
						type="number"
						min="2"
						max="2000"
						step="1"
						bind:value={config.iterations}
					/></label
				>
				<label class="block text-sm"
					>Tolerance<input
						class="input mt-1 w-full"
						type="number"
						min="0.000000000001"
						max="0.1"
						step="any"
						bind:value={config.tolerance}
					/></label
				>
				<label class="block text-sm"
					>Initial-guess b threshold<input
						class="input mt-1 w-full"
						type="number"
						min="0"
						step="any"
						bind:value={config.threshold}
					/></label
				>
				<label class="block text-sm"
					>Minimum baseline (a.u.)<input
						class="input mt-1 w-full"
						type="number"
						min="0"
						step="any"
						bind:value={config.minimumBaseline}
					/></label
				>
				<label class="block text-sm"
					>Minimum R²<input
						class="input mt-1 w-full"
						type="number"
						min="-100"
						max="1"
						step="any"
						bind:value={config.minimumR2}
					/></label
				>
				<label class="block text-sm"
					>Maximum RMSE (optional)<input
						class="input mt-1 w-full"
						type="number"
						min="0"
						step="any"
						value={config.maximumRmse ?? ''}
						onchange={(event) =>
							(config!.maximumRmse =
								event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber)}
					/></label
				>
			</fieldset>
			<details class="rounded-md border p-3 text-sm">
				<summary class="cursor-pointer font-medium">Bounds and initialization</summary>
				<p class="my-3 text-muted-foreground">
					Blank initial values use data-dependent estimates. Blank bounds use OSIPY defaults; S₀ has
					no default upper bound.
				</p>
				{#each model.parameters as parameter (parameter.name)}
					<fieldset class="mb-3 rounded-md border p-3" disabled={client.busy || running}>
						<legend class="px-1 font-medium">{parameter.name} · {parameter.unit}</legend>
						<div class="grid grid-cols-3 gap-2">
							{#each [0, 1] as edge (edge)}
								<label class="min-w-0"
									>{edge === 0 ? 'Lower' : 'Upper'}<input
										class="input mt-1 w-full"
										type="number"
										step="any"
										placeholder={parameter.bounds[edge] === null
											? 'Unbounded'
											: String(parameter.bounds[edge])}
										value={config.bounds[parameter.name]?.[edge] ?? ''}
										onchange={(event) => {
											const bounds = config!.bounds[parameter.name] ?? [null, null];
											bounds[edge] =
												event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber;
											config!.bounds[parameter.name] = bounds;
										}}
									/></label
								>
							{/each}
							<label class="min-w-0"
								>Initial<input
									class="input mt-1 w-full"
									type="number"
									step="any"
									placeholder="Auto"
									value={config.initial[parameter.name] ?? ''}
									onchange={(event) =>
										(config!.initial[parameter.name] =
											event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber)}
								/></label
							>
						</div>
					</fieldset>
				{/each}
			</details>
			<div class="border-t pt-4">
				<label class="block text-sm font-medium"
					>Fit scope<select class="input mt-1 w-full" bind:value={scope}
						><option value="voxel">Selected voxel</option><option
							value="roi"
							disabled={!roiIndices.length}>ROI · voxelwise ({roiIndices.length})</option
						><option value="dataset">Whole dataset</option></select
					></label
				>
				{#if !ready}<p class="mt-2 text-sm text-destructive">
						Fitting needs b=0 and at least four distinct b-values.
					</p>{/if}
			</div>
			<div class="flex flex-wrap justify-end gap-2 border-t pt-4">
				<button class="button button-outline" type="button" onclick={close}>Cancel</button>
				<button
					class="button button-primary"
					type="submit"
					disabled={client.busy || running || !ready || (scope === 'roi' && !roiIndices.length)}
					>Run fitting</button
				>
			</div>
		</form>
	{/if}
</dialog>
