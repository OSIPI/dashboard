<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
</script>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<article class="rounded-lg border border-base-300 bg-base-100 p-8 shadow-sm">
		<header class="mb-6">
			<p class="text-sm font-semibold uppercase tracking-[0.25em] text-primary">Placeholder</p>
			<h1 class="mt-2 text-4xl font-bold text-base-content">Note {$page.params.id}</h1>
		</header>
		<p class="text-base-content/70">
			Dynamic notes are disabled until the OSIPY dashboard has a database model. Use the dashboard
			landing page for the current project, copy, and idea placeholders.
		</p>
	</article>

	<div class="mt-8 flex items-center justify-between">
		<a href="{base}/blog" class="inline-flex items-center text-sm text-base-content/70 hover:text-base-content">
			Back to notes
		</a>
		<a href="{base}/" class="inline-flex items-center text-sm text-base-content/70 hover:text-base-content">
			Home
		</a>
	</div>
</div>
