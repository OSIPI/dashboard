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

<div
	class="flex h-dvh flex-col overflow-hidden pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
>
	{#if page.route.id !== '/'}<Header />{/if}
	<div
		class="min-h-0 min-w-0 flex-1 overscroll-contain {page.route.id === '/'
			? 'flex flex-col overflow-hidden'
			: 'overflow-auto'}"
	>
		{@render children?.()}
	</div>
</div>
