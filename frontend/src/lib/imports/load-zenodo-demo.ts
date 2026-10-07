import type { Dataset, VoxelVolume } from '$lib/ivim';
import type { ValidationIssue } from './scan';
import { ImportError } from './nifti';
import { downloadZenodoDemo, type DemoProgress } from './zenodo-demo';

export async function loadZenodoDemo(
	availableBytes: number,
	signal?: AbortSignal,
	onProgress: (progress: DemoProgress) => void = () => {}
): Promise<{ dataset: Dataset; volumes: VoxelVolume[]; issues: ValidationIssue[] }> {
	const archive = await downloadZenodoDemo(signal, onProgress);
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./zenodo-demo.worker.ts', import.meta.url), {
			type: 'module'
		});
		const cleanup = () => {
			worker.terminate();
			signal?.removeEventListener('abort', abort);
		};
		const abort = () => {
			cleanup();
			reject(new DOMException('Demo import cancelled', 'AbortError'));
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
			reject(new Error('Demo import worker failed.'));
		};
		onProgress({ phase: 'extract' });
		worker.postMessage({ archive, availableBytes }, { transfer: [archive] });
	});
}
