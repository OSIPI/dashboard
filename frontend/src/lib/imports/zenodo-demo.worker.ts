import { decodeNifti, ImportError, readImageFile } from './nifti';
import { extractDemoMembers } from './zenodo-demo';

self.onmessage = async (event: MessageEvent<{ archive: ArrayBuffer; availableBytes: number }>) => {
	try {
		const members = extractDemoMembers(event.data.archive);
		const image = members['Data/brain.nii.gz'];
		const imageBuffer = image.buffer.slice(
			image.byteOffset,
			image.byteOffset + image.byteLength
		) as ArrayBuffer;
		const result = await decodeNifti(
			await readImageFile(new File([imageBuffer], 'brain.nii.gz')),
			new TextDecoder('utf-8', { fatal: true }).decode(members['Data/brain.bval']),
			new TextDecoder('utf-8', { fatal: true }).decode(members['Data/brain.bvec']),
			'OSIPI TF2.4 in-vivo brain',
			event.data.availableBytes
		);
		result.dataset.id = `zenodo-14605039-brain-${result.dataset.sha256}`;
		result.dataset.source = 'zenodo';
		result.issues.unshift({
			severity: 'info',
			message:
				'Imported directly from the pinned Zenodo record in this browser. Archive checksum and required members were verified.'
		});
		self.postMessage({ result }, { transfer: [result.volumes[0].buffer] });
	} catch (error) {
		self.postMessage({
			issues:
				error instanceof ImportError
					? error.issues
					: [
							{
								severity: 'error',
								message: error instanceof Error ? error.message : 'Demo import failed.'
							}
						]
		});
	}
};
