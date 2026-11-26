import { decodeNifti, readImageFile, readSidecar, ImportError } from './nifti';

self.onmessage = async (
	event: MessageEvent<{ image: File; bval?: File; bvec?: File; availableBytes: number }>
) => {
	try {
		const { image, bval, bvec, availableBytes } = event.data;
		self.postMessage({ stage: 'read' });
		const buffer = await readImageFile(image);
		self.postMessage({ stage: 'sidecars', bytes: buffer.byteLength });
		const bvals = bval ? await readSidecar(bval) : undefined;
		const bvecs = bvec ? await readSidecar(bvec) : undefined;
		self.postMessage({ stage: 'decode' });
		const result = await decodeNifti(buffer, bvals, bvecs, image.name, availableBytes);
		self.postMessage({ result }, { transfer: [result.volumes[0].buffer] });
	} catch (error) {
		self.postMessage({
			issues:
				error instanceof ImportError
					? error.issues
					: [
							{
								severity: 'error',
								message: error instanceof Error ? error.message : 'Image import failed.'
							}
						]
		});
	}
};
