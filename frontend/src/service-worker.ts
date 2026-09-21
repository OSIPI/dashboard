/// <reference lib="webworker" />
import { base, build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const prefix = `osipy-app-${base.replaceAll('/', '_')}-`;
const cacheName = prefix + version;
const shell = `${base}/`;
const assets = [
	...new Set([...build, ...files.filter((path) => !path.startsWith(`${base}/datasets/`))])
];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(cacheName);
			await cache.addAll(assets);
			const response = await fetch(new Request(shell, { cache: 'reload' }));
			if (!response.ok || !response.headers.get('content-type')?.includes('text/html'))
				throw new Error('App shell unavailable for offline caching');
			await cache.put(shell, response);
		})()
	);
});
worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys())
				if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
			await worker.clients.claim();
		})()
	);
});
worker.addEventListener('fetch', (event) => {
	const request = event.request,
		url = new URL(request.url);
	if (
		request.method !== 'GET' ||
		url.origin !== worker.location.origin ||
		request.headers.has('authorization') ||
		url.pathname.startsWith(`${base}/datasets/`)
	)
		return;
	if (
		request.mode === 'navigate' &&
		(url.pathname === base || url.pathname.startsWith(`${base}/`))
	) {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					if (response.ok) return response;
				} catch {
					/* Offline: use the app shell, never a cached patient-specific response. */
				}
				return (await caches.open(cacheName))
					.match(shell)
					.then(
						(response) =>
							response ??
							new Response('Open OSIPY online once to prepare offline access.', { status: 503 })
					);
			})()
		);
	} else if (assets.includes(url.pathname) || url.pathname.startsWith(`${base}/_app/`)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(request);
				if (cached) return cached;
				const response = await fetch(request);
				if (response.ok) {
					const cache = await caches.open(cacheName);
					await cache.put(request, response.clone());
				}
				return response;
			})()
		);
	}
});
