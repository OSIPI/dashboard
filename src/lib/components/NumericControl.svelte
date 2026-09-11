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
		onchange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		detail?: string;
		compact?: boolean;
		onchange: (value: number) => void;
	} = $props();
	function commit(input: HTMLInputElement) {
		const next = boundedNumber(input.value, value, min, max, step);
		input.value = String(next);
		onchange(next);
	}
</script>

<div
	class="min-w-0 {compact
		? 'min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,2.8fr)] min-[900px]:items-center min-[900px]:gap-2'
		: '@min-[460px]:grid @min-[460px]:grid-cols-[110px_minmax(0,1fr)] @min-[460px]:items-center @min-[460px]:gap-3'}"
>
	<div
		class="mb-1.5 flex gap-2 text-xs font-semibold {compact
			? 'min-[900px]:mb-0 min-[900px]:flex-wrap min-[900px]:gap-x-1 min-[900px]:gap-y-0'
			: 'justify-between @min-[460px]:mb-0 @min-[460px]:flex-col @min-[460px]:gap-0.5'}"
	>
		<span>{label}</span><span class="font-normal text-muted-foreground">{detail}</span>
	</div>
	<div class="flex min-w-0 items-center max-[899px]:flex-wrap {compact ? 'gap-1.5' : 'gap-3'}">
		<input
			class="w-full min-w-0 flex-1 accent-selection max-[899px]:h-7 max-[899px]:basis-full"
			type="range"
			aria-label={label}
			{min}
			{max}
			{step}
			{value}
			oninput={(event) => commit(event.currentTarget)}
		/>
		<div class="flex items-center gap-0.5 max-[899px]:w-full">
			<button
				class="button button-ghost px-0 text-lg max-[899px]:size-11 {compact ? 'h-8 w-6' : 'w-8'}"
				aria-label="Decrease {label}"
				disabled={value <= min}
				onclick={() => onchange(boundedNumber(String(value - step), value, min, max, step))}
				>-</button
			>
			<input
				class="input appearance-[textfield] text-right text-xs tabular-nums max-[899px]:h-11 max-[899px]:flex-1 [&::-webkit-inner-spin-button]:appearance-none {compact
					? 'h-8 w-20 px-1 py-1'
					: 'w-[100px] p-1.5'}"
				type="number"
				aria-label="{label} value"
				{min}
				{max}
				{step}
				value={Number(value.toFixed(1))}
				onchange={(event) => commit(event.currentTarget)}
				onblur={(event) => (event.currentTarget.value = String(Number(value.toFixed(1))))}
				onkeydown={(event) => {
					if (event.key === 'Enter') commit(event.currentTarget);
				}}
			/>
			<button
				class="button button-ghost px-0 text-lg max-[899px]:size-11 {compact ? 'h-8 w-6' : 'w-8'}"
				aria-label="Increase {label}"
				disabled={value >= max}
				onclick={() => onchange(boundedNumber(String(value + step), value, min, max, step))}
				>+</button
			>
		</div>
	</div>
</div>
