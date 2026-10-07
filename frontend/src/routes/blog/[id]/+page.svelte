<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
</script>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<article class="card p-8">
		<header class="mb-6">
			<p class="text-sm font-semibold tracking-[0.25em] text-primary uppercase">Placeholder</p>
			<h1 class="mt-2 text-4xl font-bold">Note {$page.params.id}</h1>
		</header>
		<p class="text-muted-foreground">
			Dynamic notes are disabled until the OSIPY dashboard has a database model. Use the dashboard
			landing page for the current project, copy, and idea placeholders.
		</p>
	</article>

	<div class="mt-8 flex items-center justify-between">
		<a
			href={resolve('/blog')}
			class="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
		>
			Back to notes
		</a>
		<a
			href={resolve('/')}
			class="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
		>
			Home
		</a>
	</div>
</div>
