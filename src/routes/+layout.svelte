<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/ui/Header.svelte';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
	{#if page.route.id !== '/'}<Header />{/if}
	<div class="route-surface" class:viewer-route={page.route.id === '/'}>
		{@render children?.()}
	</div>
</div>
