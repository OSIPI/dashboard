<script lang="ts">
	import { orderScans, type Scan } from '$lib/imports/scan';
	let {
		scans,
		current,
		onselect,
		comparison = '',
		oncomparison
	}: {
		scans: Pick<Scan, 'id' | 'metadata'>[];
		current: Pick<Scan, 'id' | 'metadata'>;
		onselect: (id: string) => void;
		comparison: string;
		oncomparison: (id: string) => void;
	} = $props();
	const id = $props.id();
	const available = $derived(scans.filter((s) => s.metadata.technique === 'IVIM'));
	const subjects = $derived([...new Set(available.map((s) => s.metadata.subject))]);
	const studies = $derived([
		...new Set(
			available
				.filter((s) => s.metadata.subject === current.metadata.subject)
				.map((s) => s.metadata.study)
		)
	]);
	const visits = $derived(
		orderScans(
			available.filter(
				(s) =>
					s.metadata.subject === current.metadata.subject &&
					s.metadata.study === current.metadata.study
			)
		)
	);
</script>

{#snippet scopes()}
	<label class="flex min-w-0 items-center gap-1"
		>Subject<select
			class="input max-w-36 min-w-0 py-1 text-xs max-[899px]:h-11"
			value={current.metadata.subject}
			onchange={(e) => {
				const scan = available.find((s) => s.metadata.subject === e.currentTarget.value);
				if (scan) onselect(scan.id);
			}}
			>{#each subjects as subject (subject)}<option>{subject}</option>{/each}</select
		></label
	>
	<label class="flex min-w-0 items-center gap-1"
		>Study<select
			class="input max-w-36 min-w-0 py-1 text-xs max-[899px]:h-11"
			value={current.metadata.study}
			onchange={(e) => {
				const scan = available.find(
					(s) =>
						s.metadata.subject === current.metadata.subject &&
						s.metadata.study === e.currentTarget.value
				);
				if (scan) onselect(scan.id);
			}}
			>{#each studies as study (study)}<option>{study}</option>{/each}</select
		></label
	>
{/snippet}
{#snippet comparisonSelect()}
	<label class="flex min-w-0 items-center gap-1"
		>Compare<select
			class="input max-w-48 min-w-0 py-1 text-xs max-[899px]:h-11"
			value={comparison}
			onchange={(e) => oncomparison(e.currentTarget.value)}
			><option value="">None</option
			>{#each visits.filter((s) => s.id !== current.id) as scan (scan.id)}<option value={scan.id}
					>{scan.metadata.session} · {scan.metadata.date || 'Date unknown'}</option
				>{/each}</select
		></label
	>
{/snippet}
<nav
	class="flex shrink-0 items-center gap-2 rounded-lg border bg-card p-2 text-xs"
	aria-label="Subject and scan timepoints"
>
	<div class="hidden min-w-0 flex-1 flex-wrap items-center gap-2 min-[900px]:flex">
		{@render scopes()}
		<div class="flex min-w-0 flex-1 gap-1 overflow-x-auto">
			{#each visits as scan, i (scan.id)}<button
					class="button button-ghost h-8 px-2 text-xs"
					aria-pressed={scan.id === current.id}
					onclick={() => onselect(scan.id)}
					title={`${scan.metadata.session} · ${scan.metadata.date || 'Date unknown'}`}
					>Scan {i + 1} · {scan.metadata.date || 'Date unknown'}</button
				>{/each}
		</div>
		{@render comparisonSelect()}
	</div>
	<span class="min-w-0 flex-1 truncate min-[900px]:hidden"
		>{current.metadata.subject} · {current.metadata.session}</span
	>
	<button class="button button-outline h-8 px-2 text-xs min-[900px]:hidden" popovertarget={id}
		>Timepoints / compare</button
	>
</nav>
<div
	{id}
	popover="auto"
	class="fixed inset-auto top-20 left-1/2 m-0 max-h-[calc(100dvh-100px)] w-[min(320px,calc(100vw-24px))] -translate-x-1/2 space-y-3 overflow-auto rounded-xl border bg-card p-3 text-xs text-foreground shadow-lg min-[900px]:hidden"
>
	<h2 class="font-semibold">Subject and scan timepoints</h2>
	{@render scopes()}
	<label class="flex min-w-0 items-center gap-1"
		>Timepoint<select
			class="input h-11 min-w-0 flex-1 text-xs"
			value={current.id}
			onchange={(e) => onselect(e.currentTarget.value)}
			>{#each visits as scan, i (scan.id)}<option value={scan.id}
					>Scan {i + 1} · {scan.metadata.session} · {scan.metadata.date || 'Date unknown'}</option
				>{/each}</select
		></label
	>
	{@render comparisonSelect()}
</div>
