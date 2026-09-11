<script lang="ts">
	import { boundedNumber } from '$lib/numeric';
	let {
		label,
		value,
		min,
		max,
		step = 1,
		detail = '',
		onchange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		detail?: string;
		onchange: (value: number) => void;
	} = $props();
	function commit(input: HTMLInputElement) {
		const next = boundedNumber(input.value, value, min, max, step);
		input.value = String(next);
		onchange(next);
	}
</script>

<div
	class="min-w-0 @min-[460px]:grid @min-[460px]:grid-cols-[110px_minmax(0,1fr)] @min-[460px]:items-center @min-[460px]:gap-3"
>
	<div
		class="mb-1.5 flex justify-between gap-2 text-xs font-semibold @min-[460px]:mb-0 @min-[460px]:flex-col @min-[460px]:gap-0.5"
	>
		<span>{label}</span><span class="font-normal text-muted-foreground">{detail}</span>
	</div>
	<div class="flex items-center gap-3 max-[899px]:flex-wrap">
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
				class="button button-ghost w-8 px-0 text-lg max-[899px]:size-11"
				aria-label="Decrease {label}"
				disabled={value <= min}
				onclick={() => onchange(boundedNumber(String(value - step), value, min, max, step))}
				>-</button
			>
			<input
				class="input appearance-[textfield] w-[100px] p-1.5 text-right text-xs tabular-nums max-[899px]:h-11 max-[899px]:flex-1 [&::-webkit-inner-spin-button]:appearance-none"
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
				class="button button-ghost w-8 px-0 text-lg max-[899px]:size-11"
				aria-label="Increase {label}"
				disabled={value >= max}
				onclick={() => onchange(boundedNumber(String(value + step), value, min, max, step))}
				>+</button
			>
		</div>
	</div>
</div>
