import type { Dataset, VoxelVolume } from '$lib/ivim';
import type { ValidationIssue } from './scan';
import { ImportError } from './nifti';
import {
	diagnosticDataset,
	diagnosticChoice,
	diagnosticOperation,
	diagnosticValidation
} from '$lib/diagnostics';

export function loadLocal(
	image: File,
	bval: File | undefined,
	bvec: File | undefined,
	availableBytes: number,
	signal?: AbortSignal
): Promise<{ dataset: Dataset; volumes: VoxelVolume[]; issues: ValidationIssue[] }> {
	const trace = diagnosticOperation('import', {
		bytes: image.size,
		availableBytes,
		hasBval: !!bval,
		hasBvec: !!bvec,
		format: 'nifti'
	});
	return new Promise<{ dataset: Dataset; volumes: VoxelVolume[]; issues: ValidationIssue[] }>(
		(resolve, reject) => {
			const worker = new Worker(new URL('./nifti.worker.ts', import.meta.url), { type: 'module' });
			const cleanup = () => {
				worker.terminate();
				signal?.removeEventListener('abort', abort);
			};
			const abort = () => {
				trace.end('cancelled');
				cleanup();
				reject(new DOMException('Import cancelled', 'AbortError'));
			};
			if (signal?.aborted) {
				abort();
				return;
			}
			signal?.addEventListener('abort', abort, { once: true });
			worker.onmessage = (event) => {
				if (event.data.stage) {
					trace.stage(event.data.stage, { bytes: event.data.bytes });
					return;
				}
				cleanup();
				if (event.data.result) {
					const { dataset, issues } = event.data.result;
					trace.end('success', {
						dataset: diagnosticDataset(dataset),
						dtype: diagnosticChoice(dataset.dtype),
						bytes: dataset.byteLength,
						x: dataset.dimensions[0],
						y: dataset.dimensions[1],
						z: dataset.dimensions[2],
						volumes: dataset.dimensions[3],
						warnings: issues.filter((issue: ValidationIssue) => issue.severity === 'warning').length
					});
					resolve(event.data.result);
				} else {
					trace.end('rejected', {
						category: diagnosticValidation(event.data.issues),
						errors: event.data.issues.length
					});
					reject(new ImportError(event.data.issues));
				}
			};
			worker.onerror = () => {
				trace.end('failed', { category: 'error' });
				cleanup();
				reject(new Error('Image worker failed.'));
			};
			try {
				worker.postMessage({ image, bval, bvec, availableBytes });
			} catch (error) {
				cleanup();
				reject(error);
			}
		}
	).catch((error) => {
		trace.end('failed');
		throw error;
	});
}
