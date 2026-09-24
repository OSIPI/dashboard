<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/ui/Header.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { base } from '$app/paths';

	let { children } = $props();
	const appRoute = $derived(
		page.route.id === '/' || page.route.id === '/viewer' || page.route.id === '/nifti'
	);
	onMount(() => {
		if (!dev && window.isSecureContext && 'serviceWorker' in navigator)
			void navigator.serviceWorker
				.register(`${base}/service-worker.js`, { scope: `${base}/` })
				.catch(() => {});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="application-version" content={__APP_VERSION__} />
	<meta name="build-sha" content={__BUILD_SHA__} />
</svelte:head>

<div
	class="flex h-dvh flex-col overflow-hidden pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
>
	{#if !appRoute}<Header />{/if}
	<div
		class="min-h-0 min-w-0 flex-1 overscroll-contain {appRoute
			? 'flex flex-col overflow-hidden'
			: 'overflow-auto'}"
	>
		{@render children?.()}
	</div>
</div>
