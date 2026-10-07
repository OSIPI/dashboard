import { expect, test } from 'bun:test';
import {
	localApiUrl,
	predictIvim,
	overlayColor,
	parseNiftiMap,
	datasetForm,
	voxelCoordinates,
	fitRequest,
	fitJobState
} from '../src/lib/analysis';
import { niftiBytes } from '../src/lib/nifti-export';
import type { Dataset } from '../src/lib/ivim';

const dataset = {
	schema: 1,
	id: 'd',
	name: 'test',
	dimensions: [2, 1, 1, 4],
	spacing: [1, 1, 1],
	spatialUnit: 'mm',
	affine: [
		[1, 0, 0, 4],
		[0, 1, 0, 5],
		[0, 0, 1, 6],
		[0, 0, 0, 1]
	],
	axisCodes: ['R', 'A', 'S'],
	slope: 1,
	intercept: 0,
	bValues: [0, 100, 200, 800],
	bVectors: [],
	dtype: 'float32',
	order: 'x-y-z-volume',
	byteLength: 32,
	sha256: 'a'.repeat(64),
	signalRange: [1, 8],
	window: [4.5, 7],
	xformCode: 1
} satisfies Dataset;

test('local API URLs are loopback-only and fitted signal is not an acquisition interpolation', () => {
	expect(localApiUrl('http://localhost:60016')).toBe('http://localhost:60016');
	for (const url of [
		'https://example.com',
		'http://localhost:60016/path',
		'http://user@127.0.0.1',
		'http://127.0.0.1?token=x'
	])
		expect(() => localApiUrl(url)).toThrow();
	const p = { S0: 1000, D: 0.001, 'D*': 0.02, f: 0.2 };
	expect(predictIvim(0, p)).toBe(1000);
	expect(predictIvim(100, p)).toBeCloseTo(1000 * (0.8 * Math.exp(-0.1) + 0.2 * Math.exp(-2)));
	expect(overlayColor(0, 0, 1)).toEqual([68, 1, 84]);
	expect(overlayColor(1, 0, 1)).toEqual([253, 231, 37]);
});

test('simplified IVIM curve uses its fitted cutoff without inventing D*', () => {
	const p = { S0: 1000, D: 0.001, f: 0.2, bThreshold: 150 };
	expect(predictIvim(0, p)).toBe(1000);
	expect(predictIvim(100, p)).toBeCloseTo(1000 * (0.8 * Math.exp(-0.1) + 0.2));
	expect(predictIvim(200, p)).toBeCloseTo(1000 * 0.8 * Math.exp(-0.2));
	expect(() => predictIvim(100, { ...p, bThreshold: NaN })).toThrow();
});

test('cooperative cancellation stays nonterminal until the API confirms cancellation', () => {
	expect(fitJobState('running')).toBe('running');
	expect(fitJobState('cancelling')).toBe('cancelling');
	expect(fitJobState('cancelled')).toBe('cancelled');
});

test('REST upload uses multipart fields and native NIfTI maps retain voxel order', async () => {
	const volumes = [1, 2, 3, 4].map((n) => new Float32Array([n, n + 0.5]));
	const form = datasetForm(dataset, volumes);
	expect(JSON.parse(String(form.get('b_values')))).toEqual(dataset.bValues);
	expect((form.get('nifti') as File).name).toEndWith('.nii');
	const map = new Float32Array([0.001, 0.002]);
	const bytes = niftiBytes(dataset, [map], true);
	expect(Array.from(parseNiftiMap(bytes.buffer, dataset))).toEqual(Array.from(map));
	const wrong = { ...dataset, affine: dataset.affine.map((row) => [...row]) };
	wrong.affine[0][3] = 99;
	expect(() => parseNiftiMap(bytes.buffer, wrong)).toThrow('orientation');
	expect(voxelCoordinates([0, 1, 2, 3], [2, 1, 2, 4])).toEqual([
		[0, 0, 0],
		[1, 0, 0],
		[0, 0, 1],
		[1, 0, 1]
	]);
	expect(
		fitRequest(
			{
				model: 'simplified',
				method: 'full',
				bThreshold: 150
			},
			'roi',
			[1, 2],
			[2, 1, 2, 4]
		)
	).toEqual({
		model: 'simplified',
		method: 'full',
		b_threshold: 150,
		scope: 'roi',
		voxels: [
			[1, 0, 0],
			[0, 0, 1]
		]
	});
});
