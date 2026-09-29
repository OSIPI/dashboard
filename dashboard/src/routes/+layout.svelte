<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/ui/Header.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { dev, version } from '$app/environment';
	import { base } from '$app/paths';

	let { children } = $props();
	let updateAvailable = $state(false);
	const appRoute = $derived(
		page.route.id === '/' || page.route.id === '/viewer' || page.route.id === '/nifti'
	);
	onMount(() => {
		if (dev) return;
		if (window.isSecureContext && 'serviceWorker' in navigator)
			void navigator.serviceWorker
				.register(`${base}/service-worker.js`, {
					scope: `${base}/`,
					updateViaCache: 'none'
				})
				.catch(() => {});
		const checkVersion = async () => {
			try {
				const response = await fetch(`${base}/_app/version.json?check=${Date.now()}`, {
					cache: 'no-store'
				});
				if (response.ok && (await response.json()).version !== version) updateAvailable = true;
			} catch {
				// Offline: leave the current page and unsaved workspace intact.
			}
		};
		void checkVersion();
		window.addEventListener('focus', checkVersion);
		return () => window.removeEventListener('focus', checkVersion);
	});
	function reloadLatest() {
		const url = new URL(window.location.href);
		url.searchParams.set('app-version', String(Date.now()));
		window.location.replace(url.href);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="application-version" content={__APP_VERSION__} />
	<meta name="build-sha" content={__BUILD_SHA__} />
</svelte:head>

<div
	class="flex h-dvh flex-col overflow-hidden pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
>
	{#if updateAvailable}<div
			class="flex shrink-0 items-center justify-center gap-3 border-b bg-card px-3 py-2 text-center text-xs"
			role="status"
		>
			<span>New dashboard version available. Save or export your work before reloading.</span>
			<button
				type="button"
				class="shrink-0 font-semibold text-selection underline"
				onclick={reloadLatest}>Reload</button
			>
		</div>{/if}
	{#if !appRoute}<Header />{/if}
	<div
		class="min-h-0 min-w-0 flex-1 overscroll-contain {appRoute
			? 'flex flex-col overflow-hidden'
			: 'overflow-auto'}"
	>
		{@render children?.()}
	</div>
</div>
