<script lang="ts">
	import type { Dataset } from '$lib/ivim';
	import { minimumWindow, displayStep, type Display } from '$lib/workspace';
	import NumericControl from '../NumericControl.svelte';
	let {
		dataset,
		slice,
		active,
		display,
		scope = $bindable('slice'),
		onslice,
		onvolume,
		ondisplay,
		onauto
	}: {
		dataset: Dataset;
		slice: number;
		active: number;
		display: Display;
		scope: 'slice' | 'volume';
		onslice: (value: number) => void;
		onvolume: (index: number) => void;
		ondisplay: (value: Display) => void;
		onauto: (robust: boolean) => void;
	} = $props();
</script>

<div class="grid gap-3 @min-[640px]:grid-cols-2 @min-[960px]:grid-cols-[1fr_1.15fr_1fr]">
	<fieldset class="min-w-0 space-y-2">
		<legend class="mb-2 text-xs font-semibold">Acquisition</legend>
		<NumericControl
			compact
			label="Slice"
			value={slice + 1}
			min={1}
			max={dataset.dimensions[2]}
			detail="of {dataset.dimensions[2]}"
			onchange={(value) => onslice(value - 1)}
		/>
		<NumericControl
			compact
			label="Volume"
			value={active + 1}
			min={1}
			max={dataset.bValues.length}
			detail="b = {dataset.bValues[active]} s/mm²"
			onchange={(value) => onvolume(value - 1)}
		/>
	</fieldset>
	<fieldset
		class="min-w-0 space-y-2 border-t pt-3 @min-[640px]:border-t-0 @min-[640px]:border-l @min-[640px]:pt-0 @min-[640px]:pl-3"
	>
		<legend class="mb-2 text-xs font-semibold">Display</legend>
		<NumericControl
			compact
			label="Zoom"
			value={display.zoom}
			min={1}
			max={4}
			step={0.1}
			detail="×"
			onchange={(value) => ondisplay({ ...display, zoom: value })}
		/>
		<NumericControl
			compact
			label="Window"
			kind="slider"
			value={display.width}
			min={minimumWindow(dataset)}
			max={2 * (dataset.signalRange[1] - dataset.signalRange[0])}
			step={displayStep(dataset)}
			detail="a.u."
			onchange={(value) => ondisplay({ ...display, width: value })}
		/>
		<NumericControl
			compact
			label="Level"
			kind="slider"
			value={display.center}
			min={dataset.signalRange[0]}
			max={dataset.signalRange[1]}
			step={displayStep(dataset)}
			detail="a.u."
			onchange={(value) => ondisplay({ ...display, center: value })}
		/>
	</fieldset>
	<fieldset
		class="min-w-0 border-t pt-3 @min-[640px]:col-span-2 @min-[960px]:col-span-1 @min-[960px]:border-t-0 @min-[960px]:border-l @min-[960px]:pt-0 @min-[960px]:pl-3"
	>
		<legend class="mb-2 text-xs font-semibold">Windowing</legend>
		<div class="flex flex-wrap items-center gap-2 @min-[960px]:flex-col @min-[960px]:items-stretch">
			<label class="flex items-center gap-2 text-xs"
				>Auto scope <select
					class="input h-8 min-w-0 flex-1 py-1 text-xs max-[899px]:h-11"
					bind:value={scope}
					><option value="slice">Current slice</option><option value="volume">Whole volume</option
					></select
				></label
			>
			<div class="flex flex-wrap gap-1.5">
				<button
					class="button button-outline h-8 px-2 text-xs max-[899px]:h-11"
					onclick={() => onauto(true)}>Auto 2–98%</button
				>
				<button
					class="button button-outline h-8 px-2 text-xs max-[899px]:h-11"
					onclick={() => onauto(false)}>Full range</button
				>
				<button
					class="button button-ghost h-8 px-2 text-xs max-[899px]:h-11"
					onclick={() =>
						ondisplay({ ...display, center: dataset.window[0], width: dataset.window[1] })}
					>Dataset preset</button
				>
			</div>
		</div>
	</fieldset>
</div>
