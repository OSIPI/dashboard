<script lang="ts">
	import type { Dataset } from '$lib/ivim';
	import type { Display } from '$lib/workspace';
	import NumericControl from '../NumericControl.svelte';
	let {
		dataset,
		slice,
		active,
		display,
		linked,
		scope = $bindable('slice'),
		navigationOpen = $bindable(false),
		tool,
		onslice,
		onvolume,
		ondisplay,
		onlink,
		onauto
	}: {
		dataset: Dataset;
		slice: number;
		active: number;
		display: Display;
		linked: boolean;
		scope: 'slice' | 'volume';
		navigationOpen: boolean;
		tool: 'inspect' | 'pan';
		onslice: (value: number) => void;
		onvolume: (index: number) => void;
		ondisplay: (value: Display) => void;
		onlink: () => void;
		onauto: (robust: boolean) => void;
	} = $props();
</script>

<fieldset class="space-y-3">
	<legend class="mb-3 text-sm font-semibold">Acquisition</legend>
	<NumericControl
		label="Slice"
		value={slice + 1}
		min={1}
		max={dataset.dimensions[2]}
		detail="of {dataset.dimensions[2]}"
		onchange={(value) => onslice(value - 1)}
	/>
	<NumericControl
		label="Volume"
		value={active + 1}
		min={1}
		max={dataset.bValues.length}
		detail="b = {dataset.bValues[active]} s/mm²"
		onchange={(value) => onvolume(value - 1)}
	/>
</fieldset>
<fieldset class="space-y-3 border-t pt-3">
	<legend class="pr-3 text-sm font-semibold">Display</legend>
	<label class="flex items-center gap-2 text-xs"
		><input type="checkbox" checked={linked} onchange={onlink} />Link zoom, pan, window/level across
		montage</label
	>
	<p class="text-xs text-muted-foreground">
		Slice and voxel are always linked. Controls affect {linked
			? 'all linked views'
			: `volume ${active + 1}`}.
	</p>
	<div class="flex flex-wrap items-center gap-2">
		<label class="text-xs"
			>Auto scope <select class="input text-xs" bind:value={scope}
				><option value="slice">Current slice</option><option value="volume">Whole volume</option
				></select
			></label
		>
		<button class="button button-outline" onclick={() => onauto(true)}>Auto 2–98%</button>
		<button class="button button-outline" onclick={() => onauto(false)}>Full range</button>
		<button
			class="button button-ghost"
			onclick={() => ondisplay({ ...display, center: dataset.window[0], width: dataset.window[1] })}
			>Dataset preset</button
		>
	</div>
	<NumericControl
		label="Zoom"
		value={display.zoom}
		min={1}
		max={4}
		step={0.1}
		detail="×"
		onchange={(value) => ondisplay({ ...display, zoom: value })}
	/>
	<NumericControl
		label="Window"
		value={display.width}
		min={1}
		max={2 * (dataset.signalRange[1] - dataset.signalRange[0])}
		step={0.1}
		detail="a.u."
		onchange={(value) => ondisplay({ ...display, width: value })}
	/>
	<NumericControl
		label="Level"
		value={display.center}
		min={dataset.signalRange[0]}
		max={dataset.signalRange[1]}
		step={0.1}
		detail="a.u."
		onchange={(value) => ondisplay({ ...display, center: value })}
	/>
</fieldset>
<details class="text-xs leading-5 text-muted-foreground" bind:open={navigationOpen}>
	<summary class="cursor-pointer font-medium">Navigation & native orientation</summary>
	<p class="mt-2">
		Hold Space and drag over an image to pan temporarily; release Space to return to the selected
		tool. Scroll over an image to zoom at the pointer (1–4×). Shift+scroll moves through a larger
		multiview grid.
		{tool === 'inspect'
			? 'Click the image to inspect a voxel. Arrow keys move the selection when the image is focused.'
			: 'Drag to pan. Arrow keys pan when the image is focused.'} Reset restores zoom, pan, window and
		level. Coordinates are original NIfTI indices. Oblique native plane, not a resliced anatomical axial
		view. Increasing x / y / z points approximately {dataset.axisCodes.join(' / ')}; x runs right
		and y runs down on screen. No reorientation.
	</p>
</details>
