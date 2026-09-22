<script lang="ts">
	import BookmarkIcon from '~icons/lucide/bookmark';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import ChevronRightIcon from '~icons/lucide/chevron-right';
	import type { Dataset, Bookmark } from '$lib/ivim';
	let {
		dataset,
		bookmarks,
		compared = $bindable([]),
		note = $bindable(''),
		message,
		open = $bindable(true),
		onsave,
		onrestore,
		ondelete
	}: {
		dataset: Dataset;
		bookmarks: Bookmark[];
		compared: string[];
		note: string;
		message: string;
		open: boolean;
		onsave: () => void;
		onrestore: (b: Bookmark) => void;
		ondelete: (id: string) => void;
	} = $props();
</script>

<section class="card p-3 {open ? '' : '[&>*:not(:first-child)]:hidden'}">
	<h2>
		<button
			type="button"
			class="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[899px]:min-h-11"
			aria-label="{open ? 'Collapse' : 'Expand'} saved voxels panel"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<BookmarkIcon class="size-4 text-primary" />Saved voxels
			<span class="ml-auto text-xs text-muted-foreground">{bookmarks.length}/30</span>
			{#if open}<ChevronDownIcon class="size-4" />{:else}<ChevronRightIcon class="size-4" />{/if}
		</button>
	</h2>
	<label class="mt-3 block text-xs" for="voxel-note">Note for current voxel</label><textarea
		id="voxel-note"
		class="input mt-1 w-full resize-y px-2 py-2 text-xs"
		rows="2"
		maxlength="240"
		placeholder="e.g. Compare low-b signal decay"
		bind:value={note}
	></textarea>
	<button
		class="button button-primary mt-2 w-full"
		disabled={bookmarks.length >= 30}
		onclick={onsave}>Save voxel + note</button
	>
	<p class="mt-2 text-xs text-muted-foreground" role="status">{message}</p>
	<div class="mt-3 space-y-2">
		<p class="text-xs text-muted-foreground">
			Compare up to four saved voxels with the current voxel.
		</p>
		{#each bookmarks as view (view.id)}<div class="rounded-md border p-2">
				<label class="mb-2 flex items-center gap-2 text-xs"
					><input
						type="checkbox"
						checked={compared.includes(view.id)}
						disabled={compared.length >= 4 && !compared.includes(view.id)}
						onchange={() =>
							(compared = compared.includes(view.id)
								? compared.filter((id) => id !== view.id)
								: [...compared, view.id])}
					/>Compare signal ({view.x}, {view.y}, {view.z})</label
				>
				<button class="w-full text-left text-xs hover:text-primary" onclick={() => onrestore(view)}
					><span class="font-semibold"
						>Vol {view.b + 1} · b {dataset.bValues[view.b]} · Slice {view.z + 1} · ({view.x}, {view.y})</span
					><span class="mt-1 block break-words text-muted-foreground"
						>{view.note || 'Saved voxel'}</span
					><span class="mt-1 block text-xs text-primary">Restore selection</span></button
				>
				<button
					class="mt-2 text-xs text-muted-foreground underline hover:text-destructive"
					aria-label="Delete saved voxel {view.note || view.id}"
					onclick={() => ondelete(view.id)}>Delete</button
				>
			</div>{/each}
	</div>
</section>
