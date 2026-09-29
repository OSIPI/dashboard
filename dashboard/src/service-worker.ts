/// <reference lib="webworker" />
import { base } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const prefix = `osipy-app-${base.replaceAll('/', '_')}-`;

worker.addEventListener('install', (event) => {
	event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Remove app-shell caches left by older releases, not saved MRI data in IndexedDB.
			for (const name of await caches.keys())
				if (name.startsWith(prefix)) await caches.delete(name);
			await worker.clients.claim();
		})()
	);
});

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (
		request.method === 'GET' &&
		url.origin === worker.location.origin &&
		(url.pathname === base || url.pathname.startsWith(`${base}/`)) &&
		!url.pathname.startsWith(`${base}/datasets/`)
	) {
		// No cached HTML, JavaScript, CSS or app shell; offline reloads require a network.
		event.respondWith(fetch(request, { cache: 'no-store' }));
	}
});
