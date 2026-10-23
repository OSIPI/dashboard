<script lang="ts">
	import { untrack } from 'svelte';
	import type { Dataset } from '$lib/ivim';
	import NumericControl from '../NumericControl.svelte';
	import PlayIcon from '~icons/lucide/play';
	import PauseIcon from '~icons/lucide/pause';
	import StepBackIcon from '~icons/lucide/step-back';
	import StepForwardIcon from '~icons/lucide/step-forward';
	let {
		dataset,
		context,
		enabled,
		slice,
		active,
		onslice,
		onvolume
	}: {
		dataset: Dataset;
		context: string;
		enabled: boolean;
		slice: number;
		active: number;
		onslice: (index: number) => void;
		onvolume: (index: number) => void;
	} = $props();
	let axis = $state<'slice' | 'acquisition'>('slice');
	let fps = $state(5);
	let playing = $state(false);
	const id = $props.id();
	const count = $derived(dataset.dimensions[axis === 'slice' ? 2 : 3]);
	const frame = $derived(axis === 'slice' ? slice : active);

	function advance(direction: number) {
		const next = (frame + direction + count) % count;
		if (axis === 'slice') onslice(next);
		else onvolume(next);
	}
	function step(direction: number) {
		playing = false;
		advance(direction);
	}
	// Never carry playback across a scan, technique, or hidden viewer transition.
	$effect(() => {
		void dataset;
		void context;
		void enabled;
		playing = false;
	});
	$effect(() => {
		if (!playing || !enabled || count < 2) return;
		const delay = 1000 / fps;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			if (cancelled || document.hidden) return;
			untrack(() => advance(1));
			// Schedule only one next frame; no catch-up bursts after a slow render.
			timer = setTimeout(tick, delay);
		};
		timer = setTimeout(tick, delay);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});
</script>

<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) playing = false;
	}}
/>

<div class="shrink-0 border-b px-2 py-1.5" role="group" aria-label="Cine playback">
	<div
		class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 @min-[640px]:grid-cols-[auto_auto_minmax(0,1fr)]"
	>
		<label class="flex min-w-0 items-center gap-1 text-xs" for={id}>
			<span>Cine axis</span>
			<select
				{id}
				class="input h-8 min-w-0 flex-1 px-1 text-xs max-[899px]:h-11"
				bind:value={axis}
				onchange={() => (playing = false)}
				aria-describedby="{id}-help"
			>
				<option value="slice">Slice</option>
				<option value="acquisition">Acquisition</option>
			</select>
		</label>
		<div class="flex items-center gap-0.5">
			<button
				class="button button-ghost h-8 w-8 p-0 max-[899px]:size-11"
				aria-label="Previous cine frame"
				title="Previous frame (pauses playback; wraps)"
				disabled={count < 2 || !enabled}
				onclick={() => step(-1)}><StepBackIcon class="size-4" /></button
			>
			<button
				class="button button-ghost h-8 w-8 p-0 max-[899px]:size-11"
				aria-label={playing ? 'Pause cine' : 'Play cine'}
				aria-pressed={playing}
				disabled={count < 2 || !enabled}
				onclick={() => (playing = !playing)}
				>{#if playing}<PauseIcon class="size-4" />{:else}<PlayIcon class="size-4" />{/if}</button
			>
			<button
				class="button button-ghost h-8 w-8 p-0 max-[899px]:size-11"
				aria-label="Next cine frame"
				title="Next frame (pauses playback; wraps)"
				disabled={count < 2 || !enabled}
				onclick={() => step(1)}><StepForwardIcon class="size-4" /></button
			>
		</div>
		<div class="col-span-2 min-w-0 @min-[640px]:col-span-1">
			<NumericControl
				compact
				kind="slider"
				label="Cine FPS"
				value={fps}
				min={1}
				max={30}
				onchange={(value) => (fps = value)}
			/>
		</div>
	</div>
	<p id="{id}-help" class="text-[10px] leading-4 text-muted-foreground">
		<span class="font-medium text-foreground tabular-nums"
			>{axis === 'slice' ? 'Slice' : 'Acquisition'} {frame + 1}/{count}</span
		>
		· Loops · {axis === 'slice'
			? 'Shared native slice'
			: 'Original volume order, including repeats'} · Not a time axis
	</p>
</div>
