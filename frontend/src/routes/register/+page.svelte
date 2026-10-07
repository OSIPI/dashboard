<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<div class="mx-auto max-w-2xl px-4 py-12">
	<div class="card p-6">
		<h1 class="text-2xl font-semibold tracking-tight">Registration is disabled</h1>
		<p class="mt-3 text-muted-foreground">
			The OSIPY dashboard does not need login or account creation yet. This route is kept as a
			placeholder until authentication becomes part of the product scope.
		</p>
		<div class="mt-6">
			<a class="button button-primary" href={resolve('/')}>Back to dashboard</a>
		</div>
	</div>
</div>
