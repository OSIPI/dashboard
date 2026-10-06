<script lang="ts">
	import { resolve } from '$app/paths';
	import type { StoredScanSummary } from '$lib/local-library';
	let { scan, ondelete }: { scan: StoredScanSummary; ondelete: (scan: StoredScanSummary) => void } =
		$props();
	let preview = $state('');
	$effect(() => {
		const url = scan.thumbnail instanceof Blob ? URL.createObjectURL(scan.thumbnail) : '';
		preview = url;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

<article
	class="group overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-selection/60"
>
	<a
		href={`${resolve('/viewer')}?scan=${encodeURIComponent(scan.id)}`}
		class="block"
		aria-label="Open dashboard: {scan.name}"
	>
		<div class="relative flex h-44 items-center justify-center overflow-hidden border-b bg-black">
			{#if preview}<img
					src={preview}
					alt="Preview of {scan.name}"
					class="size-full object-contain p-4 [image-rendering:pixelated]"
					loading="lazy"
				/>{:else}<span class="text-xs text-white/60">Saved MRI dataset</span>{/if}
			<span
				class="absolute top-3 left-3 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-xs text-white"
				>{scan.metadata.technique}</span
			>
			<span class="absolute right-3 bottom-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white/80"
				>{scan.dimensions[3]} volumes · {scan.dimensions[2]} slices</span
			>
		</div>
		<div class="space-y-2 p-4">
			<h2 class="truncate text-sm font-semibold" title={scan.name}>{scan.name}</h2>
			<p class="truncate text-xs text-muted-foreground">
				{scan.metadata.subject} · {scan.metadata.study}
			</p>
			<p class="truncate text-xs text-muted-foreground">
				{scan.metadata.session} · {scan.metadata.date || 'Acquisition date unknown'}
			</p>
			<span class="inline-flex items-center gap-2 pt-1 text-xs font-medium text-selection"
				>Open dashboard <span aria-hidden="true">→</span></span
			>
		</div>
	</a>
	<div
		class="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground"
	>
		<span>{(scan.bytes / 1024 / 1024).toFixed(1)} MiB · saved on this device</span><button
			class="button button-ghost h-8 px-2 text-xs"
			aria-label="Delete local dataset {scan.name}"
			onclick={() => ondelete(scan)}>Remove</button
		>
	</div>
</article>
