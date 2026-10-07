import { buildBundle, type BundleInput } from './export-bundle';
self.onmessage = async (event: MessageEvent<BundleInput>) => {
	try {
		const bytes = await buildBundle(event.data, (stage) => self.postMessage({ stage }));
		self.postMessage({ bytes }, { transfer: [bytes.buffer] });
	} catch (e) {
		self.postMessage({ error: e instanceof Error ? e.message : 'Bundle export failed.' });
	}
};
