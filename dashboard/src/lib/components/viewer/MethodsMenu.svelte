<script lang="ts">
	import type { Catalog } from '$lib/analysis';

	let {
		catalog,
		canFit = false,
		selectedMethod,
		selectedStrategy,
		onselect
	}: {
		catalog?: Catalog;
		canFit?: boolean;
		selectedMethod?: string;
		selectedStrategy?: string;
		onselect: (id: string, strategy: string) => void;
	} = $props();

	const names: Record<string, string> = {
		segmented: 'Segmented IVIM',
		full: 'Full IVIM',
		bayesian: 'Bayesian IVIM',
		biexponential: 'Biexponential',
		simplified: 'Simplified IVIM'
	};
	function label(id: string) {
		return names[id] ?? id.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
	}
</script>

<select
	class="input min-h-11 w-full px-3 text-sm disabled:opacity-50"
	aria-label="Signal model and fitting strategy"
	disabled={!canFit || !catalog?.models.length}
	value={catalog && selectedMethod && selectedStrategy
		? `${selectedMethod}:${selectedStrategy}`
		: ''}
	onchange={(event) => {
		const [method, strategy] = event.currentTarget.value.split(':');
		if (method && strategy) onselect(method, strategy);
	}}
>
	{#if !catalog?.models.length}<option value="">Connect local analysis to choose a model</option
		>{/if}
	{#each catalog?.models ?? [] as model (model.id)}
		<optgroup label={label(model.id)}>
			{#each model.fitterStrategies as strategy (strategy)}
				<option value={`${model.id}:${strategy}`}>{label(model.id)} · {label(strategy)}</option>
			{/each}
		</optgroup>
	{/each}
</select>
{#if catalog?.models.length}<p class="mt-2 text-xs text-muted-foreground">
		Choose a strategy to configure it in analysis.
	</p>{/if}
