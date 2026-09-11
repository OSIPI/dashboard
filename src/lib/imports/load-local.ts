import type { Dataset, VoxelVolume } from '$lib/ivim';
import type { ValidationIssue } from './scan';
import { ImportError } from './nifti';

export function loadLocal(
	image: File,
	bval: File,
	bvec: File | undefined,
	availableBytes: number,
	signal?: AbortSignal
): Promise<{ dataset: Dataset; volumes: VoxelVolume[]; issues: ValidationIssue[] }> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./nifti.worker.ts', import.meta.url), { type: 'module' });
		const cleanup = () => {
			worker.terminate();
			signal?.removeEventListener('abort', abort);
		};
		const abort = () => {
			cleanup();
			reject(new DOMException('Import cancelled', 'AbortError'));
		};
		if (signal?.aborted) {
			abort();
			return;
		}
		signal?.addEventListener('abort', abort, { once: true });
		worker.onmessage = (event) => {
			cleanup();
			if (event.data.result) resolve(event.data.result);
			else reject(new ImportError(event.data.issues));
		};
		worker.onerror = () => {
			cleanup();
			reject(new Error('Image worker failed.'));
		};
		worker.postMessage({ image, bval, bvec, availableBytes });
	});
}
