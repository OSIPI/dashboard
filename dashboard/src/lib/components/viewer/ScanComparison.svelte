<script lang="ts">
	import { compareScans, mapPoint, type Scan } from '$lib/imports/scan';
	import { autoWindow, defaultDisplay, type Display } from '$lib/workspace';
	import type { Point } from '$lib/spatial';
	import type { ViewerTool } from '$lib/roi';
	import { persistedPreference } from '$lib/persisted-preference.svelte';
	import {
		parseRegistration,
		mapRegisteredPoint,
		invertAffine,
		type Registration
	} from '$lib/registration';
	import { download } from '$lib/workspace';
	import ViewerPanel from './ViewerPanel.svelte';
	import ImageControls from './ImageControls.svelte';
	let {
		primary,
		secondary,
		point,
		volume,
		display,
		onpoint,
		onvolume,
		ondisplay,
		onclose
	}: {
		primary: Scan;
		secondary: Scan;
		point: Point;
		volume: number;
		display: Display;
		onpoint: (p: Point) => void;
		onvolume: (i: number) => void;
		ondisplay: (d: Display) => void;
		onclose: () => void;
	} = $props();
	let linked = $state(false);
	let registration = $state<Registration>();
	async function loadTransform(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			if (file.size > 65536) throw new Error('Transform file exceeds 64 KiB.');
			registration = parseRegistration(await file.text(), primary.dataset, secondary.dataset);
			linked = false;
			notice =
				'Transform loaded. Confirm its primary-to-comparison direction, then enable linking.';
		} catch (e) {
			notice = e instanceof Error ? e.message : 'Invalid transform';
		}
	}
	let notice = $state('');
	let outOfBounds = $state(false);
	let rightPoint = $state<Point>(
		secondary.dataset.dimensions.slice(0, 3).map((d) => Math.floor(d / 2)) as Point
	);
	let rightVolume = $state(0);
	let rightDisplay = $state(defaultDisplay(secondary.dataset));
	let leftTool = $state<ViewerTool>('inspect'),
		rightTool = $state<ViewerTool>('inspect');
	let leftScope = $state<'slice' | 'volume'>('slice'),
		rightScope = $state<'slice' | 'volume'>('slice');
	let leftHelp = $state(false),
		rightHelp = $state(false);
	const mobile = persistedPreference<'primary' | 'comparison'>(
		'osipy.compare.side',
		'primary',
		(raw) => (raw === '"comparison"' ? 'comparison' : 'primary')
	);
	const mobilePanel = persistedPreference<'Image' | 'Controls'>(
		'osipy.compare.panel',
		'Image',
		(raw) => (raw === '"Controls"' ? 'Controls' : 'Image')
	);
	const canLink = $derived(compareScans(primary, secondary) || !!registration);
	$effect(() => {
		if (linked && !canLink) linked = false;
		if (linked && canLink) {
			const mapped = registration
				? mapRegisteredPoint(primary.dataset, secondary.dataset, point, registration.matrix)
				: mapPoint(primary.dataset, secondary.dataset, point);
			outOfBounds = !mapped;
			if (mapped) rightPoint = mapped;
		} else outOfBounds = false;
	});
	function changeRight(next: Point) {
		if (linked) {
			const mapped = registration
				? mapRegisteredPoint(
						secondary.dataset,
						primary.dataset,
						next,
						invertAffine(registration.matrix)
					)
				: mapPoint(secondary.dataset, primary.dataset, next);
			if (!mapped) {
				notice =
					'This comparison point is outside the primary scan field of view; selection was not changed.';
				return;
			}
			onpoint(mapped);
		}
		rightPoint = next;
		notice = '';
	}
</script>

<section
	class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
	aria-label="Longitudinal comparison"
>
	<div class="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border bg-card p-2 text-xs">
		<label
			class="flex items-center gap-2"
			title="Link nearest native voxels through RAS millimetres using a verified shared frame or the loaded primary-to-comparison affine."
			><input
				type="checkbox"
				aria-label="Link physical position (RAS mm)"
				disabled={!canLink}
				bind:checked={linked}
				onchange={() => (notice = '')}
			/><span class="max-[899px]:hidden">Link physical position (RAS mm)</span><span
				class="min-[900px]:hidden">Link position</span
			></label
		>
		<span class="hidden min-w-0 flex-1 text-muted-foreground min-[900px]:block"
			>{registration
				? 'User-supplied affine: primary RAS mm → comparison RAS mm. Nearest native voxels.'
				: canLink
					? `Shared frame: ${primary.metadata.coordinateFrame}. Nearest native voxels; planes may differ in orientation.`
					: 'Independent navigation. Declare the same verified coordinate frame for this subject/study to enable linking.'}</span
		>
		<button class="button button-outline ml-auto h-8 px-2 text-xs" onclick={onclose}
			>Close comparison</button
		>
	</div>
	<details class="shrink-0 rounded border bg-card px-2 py-1 text-xs">
		<summary class="cursor-pointer"
			>Registration transform {registration ? '· loaded' : '· optional'}</summary
		>
		<div class="max-h-40 space-y-2 overflow-auto py-2">
			<p class="text-muted-foreground">
				Load a verified affine mapping primary physical coordinates to comparison coordinates. JSON
				uses dataset checksums and RAS millimetres; ITK .tfm uses LPS and is converted. No
				registration is computed or inferred.
			</p>
			<input
				aria-label="Load registration transform"
				type="file"
				accept=".json,.tfm,.txt"
				onchange={loadTransform}
			/>{#if registration}<p>{registration.sourceFormat}</p>
				<div class="flex flex-wrap gap-2">
					<button
						class="button button-outline h-8 text-xs"
						onclick={() => {
							registration = {
								...registration!,
								matrix: invertAffine(registration!.matrix),
								sourceFormat: 'User-inverted affine; primary → comparison'
							};
							linked = false;
						}}>Invert matrix direction</button
					><button
						class="button button-outline h-8 text-xs"
						onclick={() =>
							download(
								new Blob([JSON.stringify(registration, null, 2)], { type: 'application/json' }),
								'registration-ras.json'
							)}>Export transform</button
					><button
						class="button button-ghost h-8 text-xs"
						onclick={() => {
							registration = undefined;
							linked = false;
						}}>Clear transform</button
					>
				</div>{/if}
		</div>
	</details>
	{#if notice}<p class="text-xs text-warning-foreground" role="status">{notice}</p>{/if}
	<nav class="flex flex-wrap gap-1 min-[900px]:hidden" aria-label="Comparison panels">
		<button
			class="button button-ghost h-11 min-w-0 flex-1 px-1 text-xs"
			aria-label="Primary scan"
			aria-pressed={mobile.current === 'primary'}
			onclick={() => (mobile.current = 'primary')}>Primary</button
		><button
			class="button button-ghost h-11 min-w-0 flex-1 px-1 text-xs"
			aria-label="Comparison scan"
			aria-pressed={mobile.current === 'comparison'}
			onclick={() => (mobile.current = 'comparison')}>Comparison</button
		>
		<button
			class="button button-outline h-11 min-w-0 flex-1 px-1 text-xs"
			aria-label={mobilePanel.current === 'Image' ? 'Show controls' : 'Show image'}
			onclick={() => (mobilePanel.current = mobilePanel.current === 'Image' ? 'Controls' : 'Image')}
			>{mobilePanel.current === 'Image' ? 'Controls' : 'Image'}</button
		>
	</nav>
	<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 min-[900px]:grid-cols-2">
		<div
			class="min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] gap-2 min-[900px]:grid-rows-[auto_minmax(0,1fr)] {mobile.current ===
			'primary'
				? 'grid'
				: 'hidden min-[900px]:grid'}"
		>
			<h2
				class="hidden truncate text-sm font-semibold min-[900px]:block"
				title={primary.dataset.name}
			>
				Primary · {primary.metadata.session}
				<span class="text-xs font-normal text-muted-foreground"
					>{primary.metadata.date || 'Date unknown'}</span
				>
			</h2>
			<ViewerPanel
				singleScan
				dataset={primary.dataset}
				volumes={primary.volumes}
				active={volume}
				selected={[volume]}
				slice={point[2]}
				x={point[0]}
				y={point[1]}
				{display}
				tiles={{}}
				linked={true}
				gridLayout="auto"
				bind:tool={leftTool}
				panel={mobilePanel.current}
				onselect={(x, y) => onpoint([x, y, point[2]])}
				onspatialselect={(x, y, z) => onpoint([x, y, z])}
				{ondisplay}
				onreset={() => ondisplay(defaultDisplay(primary.dataset))}
			>
				{#snippet controls()}<ImageControls
						showLink={false}
						dataset={primary.dataset}
						slice={point[2]}
						active={volume}
						{display}
						linked={false}
						bind:scope={leftScope}
						bind:navigationOpen={leftHelp}
						tool={leftTool}
						onslice={(z) => onpoint([point[0], point[1], z])}
						{onvolume}
						{ondisplay}
						onlink={() =>
							(notice =
								'Comparison display settings are independent. Use the physical-position link above for navigation.')}
						onauto={(robust) =>
							ondisplay({
								...display,
								...autoWindow(
									primary.volumes[volume],
									primary.dataset,
									leftScope === 'slice' ? point[2] : undefined,
									robust
								)
							})}
					/>{/snippet}
			</ViewerPanel>
		</div>
		<div
			class="min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] gap-2 min-[900px]:grid-rows-[auto_minmax(0,1fr)] {mobile.current ===
			'comparison'
				? 'grid'
				: 'hidden min-[900px]:grid'}"
		>
			<h2
				class="hidden truncate text-sm font-semibold min-[900px]:block"
				title={secondary.dataset.name}
			>
				Comparison · {secondary.metadata.session}
				<span class="text-xs font-normal text-muted-foreground"
					>{secondary.metadata.date || 'Date unknown'}</span
				>
			</h2>
			{#if outOfBounds}<div class="card grid place-items-center p-6 text-sm" role="status">
					The selected primary point is outside the comparison scan's field of view. Select another
					point or unlink navigation.
				</div>
			{:else}
				<ViewerPanel
					singleScan
					dataset={secondary.dataset}
					volumes={secondary.volumes}
					active={rightVolume}
					selected={[rightVolume]}
					slice={rightPoint[2]}
					x={rightPoint[0]}
					y={rightPoint[1]}
					display={rightDisplay}
					tiles={{}}
					linked={true}
					gridLayout="auto"
					bind:tool={rightTool}
					panel={mobilePanel.current}
					onselect={(x, y) => changeRight([x, y, rightPoint[2]])}
					onspatialselect={(x, y, z) => changeRight([x, y, z])}
					ondisplay={(d) => (rightDisplay = d)}
					onreset={() => (rightDisplay = defaultDisplay(secondary.dataset))}
				>
					{#snippet controls()}<ImageControls
							showLink={false}
							dataset={secondary.dataset}
							slice={rightPoint[2]}
							active={rightVolume}
							display={rightDisplay}
							linked={false}
							bind:scope={rightScope}
							bind:navigationOpen={rightHelp}
							tool={rightTool}
							onslice={(z) => changeRight([rightPoint[0], rightPoint[1], z])}
							onvolume={(i) => (rightVolume = i)}
							ondisplay={(d) => (rightDisplay = d)}
							onlink={() =>
								(notice =
									'Comparison display settings are independent. Use the physical-position link above for navigation.')}
							onauto={(robust) =>
								(rightDisplay = {
									...rightDisplay,
									...autoWindow(
										secondary.volumes[rightVolume],
										secondary.dataset,
										rightScope === 'slice' ? rightPoint[2] : undefined,
										robust
									)
								})}
						/>{/snippet}
				</ViewerPanel>
			{/if}
		</div>
	</div>
</section>
