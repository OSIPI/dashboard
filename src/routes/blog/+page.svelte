<script lang="ts">
	const notes = [
		{
			title: 'Dashboard scope',
			content: 'Use this area later for OSIPY updates, design notes, or project write-ups.'
		},
		{
			title: 'No database yet',
			content: 'The template blog no longer depends on PocketBase while the dashboard model is undecided.'
		}
	];
</script>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8">
		<div class="mb-6 flex items-center justify-between">
			<div>
				<h1 class="text-4xl font-bold">Notes</h1>
				<p class="mt-2 text-base-content/70">Static placeholders for future OSIPY updates.</p>
			</div>
			<a href="/" class="btn btn-neutral btn-sm">Dashboard</a>
		</div>
	</div>

	<div class="space-y-6">
		{#each notes as note}
			<article class="rounded-lg border border-base-300 bg-base-100 p-6 shadow-sm">
				<h2 class="text-2xl font-semibold text-base-content">{note.title}</h2>
				<p class="mt-3 text-base-content/70">{note.content}</p>
			</article>
		{/each}
	</div>
</div>
