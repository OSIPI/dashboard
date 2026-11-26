<script lang="ts">
	import type { Display } from '$lib/workspace';
	import RotateCwIcon from '~icons/lucide/rotate-cw';
	import FlipHorizontalIcon from '~icons/lucide/flip-horizontal';
	import FlipVerticalIcon from '~icons/lucide/flip-vertical';
	import ContrastIcon from '~icons/lucide/contrast';
	let {
		view,
		onchange,
		magnification = $bindable(0)
	}: {
		view: Display;
		onchange: (view: Display) => void;
		magnification?: number;
	} = $props();
</script>

<div
	class="flex flex-wrap items-center gap-0.5 [&_.button]:px-2"
	role="group"
	aria-label="Display transforms and inspection"
>
	<button
		class="button button-ghost"
		aria-label="Rotate display clockwise"
		title="Rotate display clockwise 90°"
		onclick={() =>
			onchange({ ...view, rotation: (((view.rotation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270 })}
		><RotateCwIcon class="size-4" /></button
	>
	<button
		class="button button-ghost"
		aria-label="Flip native horizontal axis"
		title="Flip native horizontal axis"
		aria-pressed={view.flipX ?? false}
		onclick={() => onchange({ ...view, flipX: !view.flipX })}
		><FlipHorizontalIcon class="size-4" /></button
	>
	<button
		class="button button-ghost"
		aria-label="Flip native vertical axis"
		title="Flip native vertical axis"
		aria-pressed={view.flipY ?? false}
		onclick={() => onchange({ ...view, flipY: !view.flipY })}
		><FlipVerticalIcon class="size-4" /></button
	>
	<button
		class="button button-ghost"
		aria-label="Invert grayscale display"
		title="Invert grayscale display, not source intensities or overlay colors"
		aria-pressed={view.invert ?? false}
		onclick={() => onchange({ ...view, invert: !view.invert })}
		><ContrastIcon class="size-4" /></button
	>
	<label class="flex items-center gap-1 text-xs"
		>Lens
		<select
			class="input h-8 w-auto py-1 text-xs max-[899px]:h-11"
			aria-label="Local magnification"
			bind:value={magnification}
		>
			<option value={0}>Off</option><option value={2}>2×</option><option value={4}>4×</option
			><option value={8}>8×</option>
		</select>
	</label>
</div>
