import { decodeNifti, readImageFile, readSidecar, ImportError } from './nifti';

self.onmessage = async (
	event: MessageEvent<{ image: File; bval: File; bvec?: File; availableBytes: number }>
) => {
	try {
		const { image, bval, bvec, availableBytes } = event.data;
		const result = await decodeNifti(
			await readImageFile(image),
			await readSidecar(bval),
			bvec ? await readSidecar(bvec) : undefined,
			image.name,
			availableBytes
		);
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
