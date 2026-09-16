<script lang="ts">
	import { boundedNumber } from '$lib/numeric';
	let {
		label,
		value,
		min,
		max,
		step = 1,
		detail = '',
		compact = false,
		kind = 'wheel',
		onchange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		detail?: string;
		compact?: boolean;
		kind?: 'wheel' | 'slider';
		onchange: (value: number) => void;
	} = $props();
	const decimals = $derived(Math.min(12, Math.max(1, -Math.floor(Math.log10(step)))));
	const filled = $derived(
		max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0
	);
	let drag: { id: number; x: number; value: number } | undefined;
	let range: HTMLInputElement;
	let wheelOffset = $state(0);
	const ticks = Array.from({ length: 15 }, (_, i) => i - 7);
	function startDrag(event: PointerEvent) {
		if (kind !== 'wheel' || event.button !== 0 || max <= min) return;
		event.preventDefault();
		range.focus();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = { id: event.pointerId, x: event.clientX, value };
	}
	function moveDrag(event: PointerEvent) {
		if (!drag || drag.id !== event.pointerId) return;
		wheelOffset = (((event.clientX - drag.x) / 12) * 18) % 18;
		onchange(
			boundedNumber(
				String(drag.value + Math.round((event.clientX - drag.x) / 12) * step),
				value,
				min,
				max,
				step
			)
		);
	}
	function endDrag() {
		drag = undefined;
		wheelOffset = 0;
	}
	function commit(input: HTMLInputElement) {
		const next = boundedNumber(input.value, value, min, max, step);
		input.value = String(next);
		onchange(next);
	}
</script>

<div
	class="numeric-control min-w-0 {compact
		? 'min-[900px]:grid min-[900px]:grid-cols-[5rem_minmax(0,1fr)] min-[900px]:items-center min-[900px]:gap-2'
		: 'space-y-1'}"
>
	<div
		class="flex min-h-6 min-w-0 items-center gap-1.5 text-xs font-semibold {compact
			? 'min-[900px]:flex-wrap min-[900px]:gap-x-1 min-[900px]:gap-y-0 min-[900px]:pt-5'
			: ''}"
	>
		<span>{label}</span><span class="truncate font-normal text-muted-foreground">{detail}</span>
	</div>
	<div
		class="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center gap-x-1 max-[899px]:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]"
	>
		<div class="col-start-2 flex h-5 justify-center max-[899px]:h-11">
			{@render numberInput()}
		</div>
		<button
			class="button button-ghost col-start-1 row-start-2 h-7 w-5 p-0 text-lg font-normal max-[899px]:size-11"
			aria-label="Decrease {label}"
			disabled={value <= min}
			onclick={() => onchange(boundedNumber(String(value - step), value, min, max, step))}>−</button
		>
		<div class="relative col-start-2 row-start-2 min-w-0">
			{#if kind === 'wheel'}
				<button
					type="button"
					tabindex="-1"
					class="absolute inset-0 z-10 w-full cursor-ew-resize touch-pan-y overflow-hidden rounded-full"
					aria-hidden="true"
					onpointerdown={startDrag}
					onpointermove={moveDrag}
					onpointerup={endDrag}
					onpointercancel={endDrag}
					onlostpointercapture={endDrag}
				>
					<svg
						class="absolute top-1/2 left-0 h-6 w-full -translate-y-1/2 fill-[var(--control-ink)]"
						viewBox="-90 -16 180 32"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<g transform="translate({wheelOffset} 0)">
							{#each ticks as tick (tick)}<rect
									x={tick * 18 - 1}
									y="-8"
									width="2"
									height="16"
									rx="1"
								/>{/each}
						</g>
					</svg>
					<span
						class="absolute top-1/2 left-1/2 h-[18px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--control-ink)] ring-2 ring-card"
					></span>
				</button>
			{:else}
				<span
					aria-hidden="true"
					class="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full bg-secondary"
					><span class="block h-full bg-[var(--control-ink)]" style:width="{filled}%"></span></span
				>
			{/if}
			<input
				bind:this={range}
				class="numeric-range relative block h-7 w-full min-w-0 max-[899px]:h-11 {kind === 'wheel'
					? 'pointer-events-none'
					: 'cursor-pointer'}"
				type="range"
				aria-label={label}
				title={kind === 'wheel'
					? 'Drag left or right to adjust. Arrow keys change one step.'
					: undefined}
				{min}
				{max}
				{step}
				{value}
				disabled={max <= min}
				oninput={(event) => commit(event.currentTarget)}
			/>
		</div>
		<button
			class="button button-ghost col-start-3 row-start-2 h-7 w-5 p-0 text-lg font-normal max-[899px]:size-11"
			aria-label="Increase {label}"
			disabled={value >= max}
			onclick={() => onchange(boundedNumber(String(value + step), value, min, max, step))}>+</button
		>
	</div>
</div>

{#snippet numberInput()}
	<input
		class="appearance-[textfield] pointer-events-auto h-5 w-24 max-w-full min-w-0 rounded border-0 bg-transparent p-0 text-center text-xs font-medium tabular-nums focus:ring-0 max-[899px]:h-11 [&::-webkit-inner-spin-button]:appearance-none"
		type="number"
		aria-label="{label} value"
		{min}
		{max}
		{step}
		value={Number(value.toFixed(decimals))}
		onchange={(event) => commit(event.currentTarget)}
		onblur={(event) => (event.currentTarget.value = String(Number(value.toFixed(decimals))))}
		onkeydown={(event) => {
			if (event.key === 'Enter') commit(event.currentTarget);
		}}
	/>
{/snippet}
