<script lang="ts">
	import { resolve } from '$app/paths';

	const notes = [
		{
			title: 'Dashboard scope',
			content: 'Use this area later for OSIPY updates, design notes, or project write-ups.'
		},
		{
			title: 'No database yet',
			content:
				'The template blog no longer depends on PocketBase while the dashboard model is undecided.'
		}
	];
</script>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-8">
		<div class="mb-6 flex items-center justify-between">
			<div>
				<h1 class="text-4xl font-bold">Notes</h1>
				<p class="mt-2 text-muted-foreground">Static placeholders for future OSIPY updates.</p>
			</div>
			<a href={resolve('/')} class="button button-outline">Dashboard</a>
		</div>
	</div>

	<div class="space-y-6">
		{#each notes as note (note.title)}
			<article class="card p-6">
				<h2 class="text-2xl font-semibold">{note.title}</h2>
				<p class="mt-3 text-muted-foreground">{note.content}</p>
			</article>
		{/each}
	</div>
</div>
