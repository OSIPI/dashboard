import { NIFTI1 } from 'nifti-reader-js';
import type { Dataset, VoxelVolume } from './ivim';

export function niftiBytes(
	dataset: Dataset,
	volumes: VoxelVolume[],
	scaled = false
): Uint8Array<ArrayBuffer> {
	const dtype = (
		{
			Int8Array: [256, 8],
			Uint8Array: [2, 8],
			Int16Array: [4, 16],
			Uint16Array: [512, 16],
			Int32Array: [8, 32],
			Uint32Array: [768, 32],
			Float32Array: [16, 32],
			Float64Array: [64, 64]
		} as Record<string, number[]>
	)[volumes[0].constructor.name];
	if (!dtype || new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1)
		throw new Error('Unsupported NIfTI export scalar type or byte order.');
	const header = new NIFTI1();
	header.littleEndian = true;
	header.magic = 'n+1\0';
	header.dims = [
		volumes.length === 1 ? 3 : 4,
		...dataset.dimensions.slice(0, 3),
		volumes.length,
		1,
		1,
		1
	];
	header.pixDims = [1, ...dataset.spacing, 1, 1, 1, 1];
	header.vox_offset = 352;
	header.datatypeCode = dtype[0];
	header.numBitsPerVoxel = dtype[1];
	header.xyzt_units = 2;
	header.sform_code = dataset.xformCode ?? 1;
	header.qform_code = 0;
	header.affine = dataset.affine;
	header.scl_slope = scaled ? 1 : dataset.slope;
	header.scl_inter = scaled ? 0 : dataset.intercept;
	const result = new Uint8Array(352 + volumes.reduce((n, v) => n + v.byteLength, 0));
	result.set(new Uint8Array(header.toArrayBuffer()));
	let offset = 352;
	for (const volume of volumes) {
		result.set(new Uint8Array(volume.buffer, volume.byteOffset, volume.byteLength), offset);
		offset += volume.byteLength;
	}
	return result;
}
