<script lang="ts">
	import BookmarkIcon from '~icons/lucide/bookmark';
	import type { Dataset, Bookmark } from '$lib/ivim';
	let {
		dataset,
		bookmarks,
		compared = $bindable([]),
		note = $bindable(''),
		message,
		onsave,
		onrestore,
		ondelete
	}: {
		dataset: Dataset;
		bookmarks: Bookmark[];
		compared: string[];
		note: string;
		message: string;
		onsave: () => void;
		onrestore: (b: Bookmark) => void;
		ondelete: (id: string) => void;
	} = $props();
</script>

<section class="card p-3">
	<h2 class="flex items-center gap-2 text-base font-semibold">
		<BookmarkIcon class="size-4 text-primary" />Saved voxels
		<span class="ml-auto text-xs text-muted-foreground">{bookmarks.length}/30</span>
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
	<p class="mt-2 text-[10px] leading-4 text-muted-foreground" role="status">{message}</p>
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
					><span class="mt-1 block text-[10px] text-primary">Restore selection</span></button
				>
				<button
					class="mt-2 text-[10px] text-muted-foreground underline hover:text-destructive"
					aria-label="Delete saved voxel {view.note || view.id}"
					onclick={() => ondelete(view.id)}>Delete</button
				>
			</div>{/each}
	</div>
</section>
