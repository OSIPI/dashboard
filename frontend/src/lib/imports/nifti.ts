import { isNIFTI, readHeader } from 'nifti-reader-js';
import type { Dataset, VoxelVolume } from '$lib/ivim';
import { createGeometry } from '$lib/spatial';
import type { ValidationIssue } from './scan';

export const FILE_LIMIT = 512 * 1024 * 1024;
export class ImportError extends Error {
	constructor(public issues: ValidationIssue[]) {
		super(issues.map((i) => i.message).join(' '));
	}
}
const fail = (message: string): never => {
	throw new ImportError([{ severity: 'error', message }]);
};
export async function readImageFile(file: File): Promise<ArrayBuffer> {
	if (file.size > FILE_LIMIT) fail('Image file exceeds the 512 MiB limit.');
	const prefix = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	if (prefix[0] !== 31 || prefix[1] !== 139) return file.arrayBuffer();
	const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > FILE_LIMIT) {
				await reader.cancel();
				fail('Decompressed image exceeds the 512 MiB limit.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result.buffer;
}
export async function readSidecar(file: File): Promise<string> {
	if (file.size > 1024 * 1024) fail(`Sidecar ${file.name} exceeds the 1 MiB limit.`);
	return file.text();
}

export function parseBValues(text: string, count: number): number[] {
	const tokens = text.trim().split(/\s+/);
	if (!text.trim() || tokens.length !== count)
		fail(`Volume/b-value mismatch: ${count} volumes, ${text.trim() ? tokens.length : 0} b-values.`);
	const values = tokens.map(Number);
	if (values.some((b) => !Number.isFinite(b) || b < 0))
		fail('b-values must be finite, non-negative numbers.');
	return values;
}
export function parseBVectors(text: string | undefined, count: number): number[][] {
	if (text === undefined) return [];
	const rows = text
		.trim()
		.split(/\r?\n/)
		.filter((r) => r.trim())
		.map((r) => r.trim().split(/\s+/).map(Number));
	if (
		rows.length !== 3 ||
		rows.some((r) => r.length !== count || r.some((n) => !Number.isFinite(n)))
	)
		fail(`b-vectors require the FSL 3-row format, with ${count} finite values per row.`);
	return Array.from({ length: count }, (_, i) => rows.map((r) => r[i]));
}

const formats = {
	2: {
		bytes: 1,
		name: 'uint8',
		array: Uint8Array,
		read: (v: DataView, p: number) => v.getUint8(p)
	},
	256: { bytes: 1, name: 'int8', array: Int8Array, read: (v: DataView, p: number) => v.getInt8(p) },
	4: {
		bytes: 2,
		name: 'int16',
		array: Int16Array,
		read: (v: DataView, p: number, le: boolean) => v.getInt16(p, le)
	},
	512: {
		bytes: 2,
		name: 'uint16',
		array: Uint16Array,
		read: (v: DataView, p: number, le: boolean) => v.getUint16(p, le)
	},
	8: {
		bytes: 4,
		name: 'int32',
		array: Int32Array,
		read: (v: DataView, p: number, le: boolean) => v.getInt32(p, le)
	},
	768: {
		bytes: 4,
		name: 'uint32',
		array: Uint32Array,
		read: (v: DataView, p: number, le: boolean) => v.getUint32(p, le)
	},
	16: {
		bytes: 4,
		name: 'float32',
		array: Float32Array,
		read: (v: DataView, p: number, le: boolean) => v.getFloat32(p, le)
	},
	64: {
		bytes: 8,
		name: 'float64',
		array: Float64Array,
		read: (v: DataView, p: number, le: boolean) => v.getFloat64(p, le)
	}
};
const digest = async (buffer: ArrayBuffer) =>
	Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');

export async function decodeNifti(
	buffer: ArrayBuffer,
	bval?: string,
	bvec?: string,
	name = 'Local acquisition',
	availableBytes = FILE_LIMIT
) {
	if (buffer.byteLength > FILE_LIMIT || !isNIFTI(buffer))
		fail('Expected a single-file NIfTI-1 or NIfTI-2 image (.nii or .nii.gz).');
	const h = readHeader(buffer);
	const errors: ValidationIssue[] = [];
	const issues: ValidationIssue[] = [];
	const error = (message: string) => errors.push({ severity: 'error', message });
	if (![3, 4].includes(h.dims[0]))
		error(
			'Only scalar 3D/4D images are supported; higher-dimensional images require explicit preparation.'
		);
	const dimensions = [
		h.dims[1],
		h.dims[2],
		h.dims[3],
		h.dims[0] === 3 ? 1 : h.dims[4]
	] as Dataset['dimensions'];
	if (!dimensions.every((d) => Number.isInteger(d) && d > 0))
		error('Image dimensions must be positive integers.');
	if (dimensions.slice(0, 3).some((d) => d > 4096) || dimensions[3] > 2048)
		error(
			'Interactive viewing supports spatial axes up to 4096 voxels and at most 2048 acquisitions.'
		);
	const format = formats[h.datatypeCode as keyof typeof formats];
	if (!format || h.numBitsPerVoxel !== format.bytes * 8)
		error(
			`Unsupported scalar datatype/bit depth (${h.datatypeCode}/${h.numBitsPerVoxel}). RGB, complex and 64-bit integer data are not supported.`
		);
	const count = dimensions.reduce((a, b) => a * b, 1);
	const bytes = count * (format?.bytes ?? 0);
	if (!Number.isSafeInteger(count) || bytes > Math.min(FILE_LIMIT, availableBytes))
		error(
			'Image exceeds the decoded-data or remaining session memory limit. Remove an unused scan before importing.'
		);
	const minimumOffset = h.magic.startsWith('n+2') ? 544 : 352;
	if (
		!Number.isInteger(h.vox_offset) ||
		h.vox_offset < minimumOffset ||
		h.vox_offset + bytes > buffer.byteLength
	)
		error('Image payload is truncated or has an invalid voxel offset.');
	if (!h.pixDims.slice(1, 4).every((p) => Number.isFinite(p) && p > 0))
		error('Voxel spacing must be finite and positive.');
	const units = ({ 1: 1000, 2: 1, 3: 0.001 } as Record<number, number>)[h.xyzt_units & 7];
	if (!units)
		error(
			'Spatial units must be declared as metres, millimetres or microns. Unknown units cannot be compared safely.'
		);
	if (!(h.sform_code > 0 || h.qform_code > 0))
		error('A valid sform or qform is required to establish image orientation.');
	const slope = h.scl_slope === 0 ? 1 : h.scl_slope;
	const intercept = h.scl_slope === 0 ? 0 : h.scl_inter;
	if (!Number.isFinite(slope) || !Number.isFinite(intercept))
		error('Image scaling must be finite.');
	// Prefer a declared sform (not whichever transform code has the larger integer).
	// nifti-reader-js supplies the quaternion conversion for qform-only images.
	const headerView = new DataView(buffer);
	const nifti2 = minimumOffset === 544;
	const nativeAffine =
		h.sform_code > 0
			? [
					...Array.from({ length: 3 }, (_, row) =>
						Array.from({ length: 4 }, (_, col) =>
							nifti2
								? headerView.getFloat64(400 + (row * 4 + col) * 8, h.littleEndian)
								: headerView.getFloat32(280 + (row * 4 + col) * 4, h.littleEndian)
						)
					),
					[0, 0, 0, 1]
				]
			: h.getQformMat();
	if (h.sform_code > 0 && h.qform_code > 0) {
		const qform = h.getQformMat();
		if (nativeAffine.some((r, i) => r.some((v, j) => Math.abs(v - qform[i][j]) > 1e-5)))
			issues.push({
				severity: 'warning',
				message:
					'sform and qform differ. The declared sform is used; no shared coordinate frame is inferred.'
			});
	}
	const affine = nativeAffine.map((row, i) => row.map((v) => (i < 3 ? v * (units ?? 1) : v)));
	if (
		affine.length !== 4 ||
		affine.some((r) => r.length !== 4 || r.some((v) => !Number.isFinite(v)))
	)
		error('Image affine contains invalid values.');
	if (errors.length) throw new ImportError(errors);
	const spacing = [0, 1, 2].map((i) =>
		Math.hypot(...affine.slice(0, 3).map((r) => r[i]))
	) as Dataset['spacing'];
	try {
		createGeometry({ affine, dimensions, spacing } as Dataset);
	} catch {
		fail('Image affine is singular or not a valid spatial transform.');
	}
	if (spacing.some((s, i) => Math.abs(s - h.pixDims[i + 1] * units) > Math.max(s, 1) * 0.001))
		issues.push({
			severity: 'warning',
			message:
				'Affine spacing differs from pixdim. Physical display uses the affine column lengths.'
		});
	// Standalone viewing has no diffusion metadata; these values are not used for analysis.
	const bValues =
		bval === undefined
			? (Array(dimensions[3]).fill(0) as number[])
			: parseBValues(bval, dimensions[3]);
	const bVectors = parseBVectors(bvec, dimensions[3]);
	if (bval !== undefined && !bValues.includes(0))
		issues.push({
			severity: 'warning',
			message:
				'No b=0 baseline acquisition. Viewing is available; this may limit future fitting methods.'
		});
	if (bval !== undefined && !bVectors.length)
		issues.push({
			severity: 'warning',
			message: 'No b-vectors supplied. Diffusion directions are unknown.'
		});
	else if (bVectors.some((v, i) => bValues[i] > 0 && Math.abs(Math.hypot(...v) - 1) > 0.05))
		issues.push({
			severity: 'warning',
			message:
				'Some nonzero-b diffusion vectors are not unit length; values are preserved without normalization.'
		});
	const data: VoxelVolume = new format.array(count);
	const source = new DataView(buffer);
	let min = Infinity,
		max = -Infinity;
	for (let i = 0; i < count; i++) {
		const value = format.read(source, h.vox_offset + i * format.bytes, h.littleEndian);
		const scaled = value * slope + intercept;
		if (!Number.isFinite(value) || !Number.isFinite(scaled))
			fail(`Non-finite image sample at linear index ${i}. Correct the source data before loading.`);
		data[i] = value;
		min = Math.min(min, scaled);
		max = Math.max(max, scaled);
	}
	if (min === max) {
		issues.push({ severity: 'warning', message: 'All image samples are constant.' });
		max = min + Math.max(1, Math.abs(min) * 0.01);
	}
	if (!Number.isFinite(max - min) || !Number.isFinite(min + (max - min) / 2))
		fail('Scaled image range exceeds supported numeric precision.');
	const permutations = [
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0]
	];
	const orientation = permutations.sort(
		(a, b) =>
			b.reduce((s, row, col) => s + Math.abs(affine[row][col]) / spacing[col], 0) -
			a.reduce((s, row, col) => s + Math.abs(affine[row][col]) / spacing[col], 0)
	)[0];
	const axisCodes = orientation.map(
		(row, col) => ['LR', 'PA', 'IS'][row][affine[row][col] >= 0 ? 1 : 0]
	);
	const sourceHash = await digest(buffer);
	const sha256 = await digest(
		new TextEncoder().encode(JSON.stringify({ sourceHash, bValues, bVectors })).buffer
	);
	const dataset: Dataset = {
		schema: 1,
		id: `local-${sha256}`,
		name,
		dimensions,
		spacing,
		spatialUnit: 'mm',
		affine,
		axisCodes,
		slope,
		intercept,
		bValues,
		bVectors,
		dtype: format.name,
		order: 'x-y-z-volume',
		byteLength: bytes,
		sha256,
		signalRange: [min, max],
		window: [min + (max - min) / 2, max - min],
		source: 'local',
		xformCode: h.sform_code > 0 ? h.sform_code : h.qform_code
	};
	const voxels = dimensions[0] * dimensions[1] * dimensions[2];
	const volumes = bValues.map((_, i) => data.subarray(i * voxels, (i + 1) * voxels));
	issues.push({
		severity: 'info',
		message: `Validated ${dimensions.join(' × ')} dimensions, affine, spacing, scaling and ${count.toLocaleString()} finite samples.${bval === undefined ? ' No diffusion metadata supplied; viewing only.' : ` ${bValues.length} b-values; ${new Set(bValues).size} distinct b-values; repeated acquisitions preserved.`}`
	});
	return { dataset, volumes, issues };
}
