import type { Dataset, VoxelVolume } from '$lib/ivim';
import type { ValidationIssue } from './scan';
import { ImportError } from './nifti';
import { downloadZenodoDemo, type DemoProgress } from './zenodo-demo';
import { diagnosticDataset, diagnosticError, diagnosticOperation } from '$lib/diagnostics';

export async function loadZenodoDemo(
	availableBytes: number,
	signal?: AbortSignal,
	onProgress: (progress: DemoProgress) => void = () => {}
): Promise<{ dataset: Dataset; volumes: VoxelVolume[]; issues: ValidationIssue[] }> {
	const trace = diagnosticOperation('demo', { availableBytes });
	try {
		const archive = await downloadZenodoDemo(signal, onProgress);
		trace.stage('decode', { bytes: archive.byteLength });
		const result = await new Promise<{
			dataset: Dataset;
			volumes: VoxelVolume[];
			issues: ValidationIssue[];
		}>((resolve, reject) => {
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
			try {
				worker.postMessage({ archive, availableBytes }, { transfer: [archive] });
			} catch (error) {
				cleanup();
				reject(error);
			}
		});
		trace.end('success', {
			dataset: diagnosticDataset(result.dataset),
			bytes: result.dataset.byteLength,
			volumes: result.volumes.length,
			warnings: result.issues.length
		});
		return result;
	} catch (error) {
		trace.end(signal?.aborted ? 'cancelled' : 'failed', { category: diagnosticError(error) });
		throw error;
	}
}
