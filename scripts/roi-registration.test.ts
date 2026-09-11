import { expect, test } from 'bun:test';
import { rasterizeRoi, editRoi, maskRois, roiStatistics } from '../src/lib/roi';
import { decodeNifti } from '../src/lib/imports/nifti';
import { niftiBytes } from '../src/lib/nifti-export';
import { parseRegistration, mapRegisteredPoint, invertAffine } from '../src/lib/registration';
import { niftiFixture } from './fixtures/local-scans';

test('ROI rectangle/freehand rasterization, erasing and statistics use native voxel centers', () => {
	expect(
		rasterizeRoi(
			[
				[0, 0],
				[2, 2]
			],
			1,
			[3, 3, 2],
			true
		)
	).toEqual([9, 10, 12, 13]);
	expect(
		rasterizeRoi(
			[
				[0, 0],
				[2, 0],
				[2, 2],
				[0, 2]
			],
			0,
			[3, 3, 2],
			false
		)
	).toEqual([0, 1, 3, 4]);
	expect(editRoi([0, 1, 3, 4], [1, 4], true)).toEqual([0, 3]);
	expect(editRoi([0, 1], [1, 2], false)).toEqual([0, 1, 2]);
	expect(roiStatistics([0, 1, 2, 3], (i) => [1, 2, 3, NaN][i])).toEqual({
		selected: 4,
		count: 3,
		mean: 2,
		median: 2,
		sd: Math.sqrt(2 / 3),
		min: 1,
		max: 3
	});
});

test('mask NIfTI export/import retains labels, dimensions and affine; mismatches are rejected', async () => {
	const { dataset } = await decodeNifti(niftiFixture(), '0 10 10');
	const mask = new Uint16Array(12);
	mask[1] = 5;
	mask[7] = 5;
	mask[10] = 9;
	const decoded = await decodeNifti(niftiBytes(dataset, [mask], true).buffer, '0');
	const rois = maskRois(decoded.volumes[0], decoded.dataset, dataset);
	expect(rois.map((r) => [r.label, r.indices])).toEqual([
		[5, [1, 7]],
		[9, [10]]
	]);
	expect(decoded.dataset.affine).toEqual(dataset.affine);
	const wrong = {
		...dataset,
		affine: dataset.affine.map((r, i) => r.map((v, j) => (i === 0 && j === 3 ? v + 2 : v)))
	};
	expect(() => maskRois(decoded.volumes[0], decoded.dataset, wrong)).toThrow('affine');
	expect(() => maskRois(new Float32Array(12).fill(0.5), decoded.dataset, dataset)).toThrow(
		'integer labels'
	);
});

test('registration honors dataset identity, affine inversion and ITK LPS center conversion', async () => {
	const { dataset } = await decodeNifti(niftiFixture(), '0 10 10');
	const target = { ...dataset, sha256: 'b'.repeat(64) };
	const text =
		'#Insight Transform File V1.0\nTransform: AffineTransform_double_3_3\nParameters: 1 0 0 0 1 0 0 0 1 2 0 0\nFixedParameters: 0 0 0';
	const transform = parseRegistration(text, dataset, target);
	expect(transform.matrix[0][3]).toBe(-2);
	expect(mapRegisteredPoint(dataset, target, [1, 1, 1], transform.matrix)).toEqual([0, 1, 1]);
	expect(mapRegisteredPoint(target, dataset, [0, 1, 1], invertAffine(transform.matrix))).toEqual([
		1, 1, 1
	]);
	expect(() =>
		parseRegistration(JSON.stringify({ ...transform, sourceHash: 'wrong' }), dataset, target)
	).toThrow('identities');
	expect(() =>
		parseRegistration(
			text.replace('AffineTransform_double', 'BSplineTransform_double'),
			dataset,
			target
		)
	).toThrow('Only one');
});
