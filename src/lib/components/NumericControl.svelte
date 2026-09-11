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

<div class="precision-control">
	<div class="control-heading"><span>{label}</span><span>{detail}</span></div>
	<div class="control-inputs">
		<input
			type="range"
			aria-label={label}
			{min}
			{max}
			{step}
			{value}
			oninput={(event) => commit(event.currentTarget)}
		/>
		<div class="stepper">
			<button
				class="button button-ghost"
				aria-label="Decrease {label}"
				disabled={value <= min}
				onclick={() => onchange(boundedNumber(String(value - step), value, min, max, step))}
				>-</button
			>
			<input
				class="input"
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
				class="button button-ghost"
				aria-label="Increase {label}"
				disabled={value >= max}
				onclick={() => onchange(boundedNumber(String(value + step), value, min, max, step))}
				>+</button
			>
		</div>
	</div>
</div>

<style>
	.precision-control {
		min-width: 0;
	}
	.control-heading {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		margin-bottom: 6px;
	}
	.control-heading span:last-child {
		color: var(--muted-foreground);
		font-weight: 400;
	}
	.control-inputs {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	input[type='range'] {
		min-width: 0;
		width: 100%;
		flex: 1;
		accent-color: var(--selection);
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.stepper button {
		width: 32px;
		padding: 0;
		font-size: 18px;
	}
	input[type='number'] {
		width: 100px;
		padding: 6px;
		text-align: right;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		appearance: textfield;
	}
	input::-webkit-inner-spin-button {
		appearance: none;
	}
	@container (min-width: 460px) {
		.precision-control {
			display: grid;
			grid-template-columns: 110px minmax(0, 1fr);
			align-items: center;
			gap: 12px;
		}
		.control-heading {
			flex-direction: column;
			gap: 2px;
			margin-bottom: 0;
		}
	}
	@media (max-width: 899px) {
		.control-inputs {
			flex-wrap: wrap;
		}
		input[type='range'] {
			flex-basis: 100%;
			height: 28px;
		}
		.stepper {
			width: 100%;
		}
		.stepper button {
			width: 44px;
			height: 44px;
		}
		input[type='number'] {
			flex: 1;
			height: 44px;
		}
	}
</style>
