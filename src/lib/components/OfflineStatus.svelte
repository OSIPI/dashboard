<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	let online = $state(true),
		ready = $state(false);
	onMount(() => {
		let active = true;
		if (!dev && window.isSecureContext && 'serviceWorker' in navigator)
			navigator.serviceWorker.ready
				.then(() => {
					if (active) ready = true;
				})
				.catch(() => {});
		return () => (active = false);
	});
</script>

<svelte:window bind:online />
<span
	class="badge text-muted-foreground"
	title={dev
		? 'The development server runs locally. Production builds cache the app for offline use.'
		: ready
			? 'The app shell is cached. Saved datasets and local imports are available offline.'
			: 'Keep the app open until caching completes to enable offline reloads.'}
	>{!online
		? 'Offline'
		: ready
			? 'Offline ready'
			: dev
				? 'Local development'
				: 'Preparing offline access'}</span
>
