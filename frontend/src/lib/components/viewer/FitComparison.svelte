<script lang="ts">
	import { onMount } from 'svelte';
	import ViewerTile from '$lib/components/ViewerTile.svelte';
	import type { Dataset, VoxelVolume } from '$lib/ivim';
	import { voxelIndex } from '$lib/ivim';
	import {
		commonFitParameters,
		compatibleFitResults,
		fitCurveAtVoxel,
		type FitResult,
		type ImageOverlay
	} from '$lib/analysis';
	import { chartSvg, type Display } from '$lib/workspace';

	let {
		dataset,
		volumes,
		active,
		slice,
		x,
		y,
		display,
		results,
		fitA = $bindable(''),
		fitB = $bindable(''),
		parameter = $bindable(''),
		onselect,
		ondisplay
	}: {
		dataset: Dataset;
		volumes: VoxelVolume[];
		active: number;
		slice: number;
		x: number;
		y: number;
		display: Display;
		results: FitResult[];
		fitA: string;
		fitB: string;
		parameter: string;
		onselect: (x: number, y: number) => void;
		ondisplay: (display: Display) => void;
	} = $props();

	let dark = $state(true);
	const compatible = $derived(compatibleFitResults(results, dataset));
	const a = $derived(compatible.find((result) => result.id === fitA));
	const b = $derived(compatible.find((result) => result.id === fitB));
	const parameters = $derived(commonFitParameters(a, b));
	const selectedParameter = $derived(parameters.find((item) => item.name === parameter));
	const index = $derived(voxelIndex(x, y, slice, dataset.dimensions));
	const signals = $derived(
		volumes.map((volume) => volume[index] * dataset.slope + dataset.intercept)
	);
	const curves = $derived(
		[a, b].flatMap((result, fitIndex) => {
			const curve = result ? fitCurveAtVoxel(result, index) : undefined;
			return curve ? [{ ...curve, comparison: (fitIndex ? 'B' : 'A') as 'A' | 'B' }] : [];
		})
	);
	const chart = $derived(
		chartSvg(
			dataset,
			[{ label: `Measured (${x}, ${y}, ${slice})`, values: signals }],
			active,
			dark,
			curves.length ? curves : undefined,
			true
		)
	);
	$effect(() => {
		if (compatible.length < 2) return;
		if (!compatible.some((result) => result.id === fitA)) fitA = compatible[0].id;
		if (!compatible.some((result) => result.id === fitB) || fitB === fitA)
			fitB = compatible.find((result) => result.id !== fitA)?.id ?? '';
	});
	$effect(() => {
		if (!parameters.some((item) => item.name === parameter))
			parameter = parameters.find((item) => item.name === 'D')?.name ?? parameters[0]?.name ?? '';
	});

	function label(result: FitResult) {
		return `${result.report.model} · ${result.report.config.method} · ${result.report.scope} · ${result.id.slice(0, 8)}`;
	}
	function coverage(result?: FitResult) {
		if (!result) return '';
		if (result.report.scope === 'dataset') return 'Whole-dataset map';
		if (result.report.scope === 'roi')
			return 'ROI-only map; voxels outside the fitted ROI are unavailable';
		return 'Voxel-only result; no whole-volume parameter map';
	}
	function overlay(result?: FitResult): ImageOverlay | undefined {
		if (!result || !selectedParameter || result.report.scope === 'voxel') return undefined;
		return {
			values: result.maps[selectedParameter.name],
			valid: result.maps.Valid,
			minimum: selectedParameter.minimum,
			maximum: selectedParameter.maximum,
			opacity: 0.65,
			showInvalid: false
		};
	}
	function value(result?: FitResult) {
		const estimate =
			result && selectedParameter ? result.maps[selectedParameter.name]?.[index] : NaN;
		if (!Number.isFinite(estimate)) return 'Unavailable at this voxel';
		if (result?.maps.Valid?.[index] !== 1) return `${estimate.toPrecision(4)} · flagged invalid`;
		return estimate.toPrecision(4);
	}
	function scaleValue(value: number) {
		return value.toLocaleString(undefined, {
			maximumSignificantDigits: 4,
			maximumFractionDigits: 6
		});
	}

	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
		const observer = new MutationObserver(
			() => (dark = document.documentElement.classList.contains('dark'))
		);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});
</script>

<div class="min-h-0 flex-1 overflow-auto bg-[#080808] p-2 text-[#e0e0e0]">
	{#if compatible.length < 2}
		<div class="card mx-auto mt-8 max-w-lg space-y-2 p-5 text-center">
			<h2 class="font-semibold">Two compatible completed fits are required</h2>
			<p class="text-sm text-muted-foreground">
				Complete and keep two fits for this exact dataset to compare native parameter maps and
				fitted voxel curves. Results from another dataset or geometry cannot be compared.
			</p>
		</div>
	{:else}
		<div class="grid min-h-[20rem] grid-cols-1 gap-2 min-[700px]:grid-cols-2">
			{#each [{ key: 'A', result: a }, { key: 'B', result: b }] as item (item.key)}
				<section
					class="flex min-h-[20rem] min-w-0 flex-col overflow-hidden rounded-lg border bg-card"
				>
					<div class="space-y-1 border-b p-2 text-xs">
						<label class="flex items-center gap-2">
							<span class="font-semibold {item.key === 'A' ? 'text-selection' : 'text-sky-400'}"
								>Fit {item.key}</span
							>
							<select
								class="input min-w-0 flex-1 text-xs"
								aria-label="Fit {item.key} result"
								value={item.key === 'A' ? fitA : fitB}
								onchange={(event) =>
									item.key === 'A'
										? (fitA = event.currentTarget.value)
										: (fitB = event.currentTarget.value)}
							>
								{#each results as result (result.id)}
									<option
										value={result.id}
										disabled={!compatible.includes(result) ||
											(item.key === 'A' ? result.id === fitB : result.id === fitA)}
										>{label(result)}{compatible.includes(result)
											? ''
											: ' · incompatible dataset'}</option
									>
								{/each}
							</select>
						</label>
						<p class="text-muted-foreground">{coverage(item.result)}</p>
					</div>
					<div class="min-h-[15rem] flex-1">
						<ViewerTile
							volume={volumes[active]}
							{dataset}
							index={active}
							{slice}
							{x}
							{y}
							tool="inspect"
							temporaryPan={false}
							active={false}
							scrollable={false}
							view={display}
							overlay={overlay(item.result)}
							onactivate={() => undefined}
							{onselect}
							onview={ondisplay}
							onlayout={() => undefined}
						/>
					</div>
					<p class="border-t px-2 py-1.5 text-xs tabular-nums">
						{selectedParameter?.name ?? 'No common parameter'}{selectedParameter?.unit
							? ` (${selectedParameter.unit})`
							: ''}: <span class="font-semibold">{value(item.result)}</span>
					</p>
					{#if selectedParameter}<div
							class="border-t px-2 py-1.5 text-[11px] text-muted-foreground"
						>
							<div class="mb-1 flex justify-between gap-2">
								<span>{item.key === 'A' ? 'Shared scale' : 'Same shared scale'}</span>
								<span>{selectedParameter.unit}</span>
							</div>
							<div
								class="h-2 rounded bg-[linear-gradient(to_right,#440154,#3b528b,#21918c,#5ec962,#fde725)]"
								aria-hidden="true"
							></div>
							<div class="mt-1 flex justify-between tabular-nums">
								<span>{scaleValue(selectedParameter.minimum)}</span>
								<span>{scaleValue(selectedParameter.maximum)}</span>
							</div>
						</div>{/if}
				</section>
			{/each}
		</div>
		<section
			class="mt-2 overflow-hidden rounded-lg border bg-card"
			aria-label="Fit comparison signal"
		>
			<div class="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
				<div>
					<h2 class="text-sm font-semibold">Voxel signal</h2>
					<p class="text-xs text-muted-foreground">
						Measured acquisitions retain repetitions · voxel ({x}, {y}, {slice})
					</p>
				</div>
				<label class="flex items-center gap-2 text-xs">
					Common parameter
					<select class="input text-xs" bind:value={parameter} aria-label="Comparison parameter">
						{#each parameters as item (item.name)}
							<option value={item.name}>{item.name}{item.unit ? ` · ${item.unit}` : ''}</option>
						{/each}
					</select>
				</label>
			</div>
			{#if !parameters.length}
				<p class="p-4 text-sm text-muted-foreground">
					These fits do not expose a parameter with matching name and units.
				</p>
			{:else if curves.length < 2}
				<p class="border-b p-3 text-xs text-muted-foreground">
					{curves.length ? 'One fit' : 'Neither fit'} has a usable fitted curve at this voxel. Missing,
					unselected, or invalid estimates are not synthesized.
				</p>
			{/if}
			<span class="chart-svg block [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">
				<!-- chartSvg escapes labels and emits controlled SVG. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html chart}
			</span>
		</section>
	{/if}
</div>
