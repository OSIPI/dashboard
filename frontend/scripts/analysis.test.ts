import { expect, test } from 'bun:test';
import {
	localApiUrl,
	predictIvim,
	overlayColor,
	parseNiftiMap,
	datasetForm,
	voxelCoordinates,
	fitRequest,
	fitJobState,
	compatibleFitResults,
	commonFitParameters,
	fitCurveAtVoxel,
	type FitResult
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

const fit = (id: string, unit = 'mm²/s', sha256 = dataset.sha256): FitResult => ({
	id,
	report: {
		schema: 1,
		dataset: { ...dataset, sha256 },
		model: 'biexponential',
		fitter: 'test',
		osipyVersion: 'test',
		config: { model: 'biexponential', method: 'segmented', bThreshold: 200 },
		scope: 'dataset',
		selectedVoxels: 2,
		validVoxels: 1,
		statusCodes: {},
		statusCounts: {},
		durationSeconds: 1,
		completedAt: '2026-01-01T00:00:00Z',
		maps: [
			{ name: 'D', unit, min: 0.001, max: 0.002 },
			{ name: 'S0', unit: 'a.u.', min: 900, max: 1000 },
			{ name: 'D*', unit, min: 0.01, max: 0.02 },
			{ name: 'f', unit: '', min: 0.1, max: 0.2 }
		],
		errors: [],
		samplePolicy: 'all',
		qualityPolicy: 'test'
	},
	maps: {
		D: new Float32Array([0.001, NaN]),
		S0: new Float32Array([1000, NaN]),
		'D*': new Float32Array([0.02, NaN]),
		f: new Float32Array([0.2, NaN]),
		Valid: new Float32Array([1, 0])
	}
});

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

test('fit comparison requires native geometry, exact parameter semantics, and real voxel estimates', () => {
	const a = fit('a');
	const b = fit('b');
	const wrongDataset = fit('other', 'mm²/s', 'b'.repeat(64));
	const wrongGeometry = fit('wrong-geometry');
	wrongGeometry.report.dataset.affine = wrongGeometry.report.dataset.affine.map((row) => [...row]);
	wrongGeometry.report.dataset.affine[0][3] += 1;
	expect(
		compatibleFitResults([a, wrongDataset, wrongGeometry, b], dataset).map((item) => item.id)
	).toEqual(['a', 'b']);
	expect(commonFitParameters(a, fit('different-unit', 'µm²/ms')).map((item) => item.name)).toEqual([
		'S0',
		'f'
	]);
	expect(commonFitParameters(a, b).find((item) => item.name === 'D')).toEqual({
		name: 'D',
		unit: 'mm²/s',
		minimum: 0.001,
		maximum: 0.002
	});
	expect(fitCurveAtVoxel(a, 0)?.parameters.S0).toBe(1000);
	expect(fitCurveAtVoxel(a, 1)).toBeUndefined();
	a.maps.Valid[0] = 0;
	expect(fitCurveAtVoxel(a, 0)?.valid).toBe(false);
});

test('fit comparison keeps constant common parameters with a finite padded shared scale', () => {
	const a = fit('a');
	const b = fit('b');
	a.report.maps.find((item) => item.name === 'D')!.min = 0.001;
	a.report.maps.find((item) => item.name === 'D')!.max = 0.001;
	b.report.maps.find((item) => item.name === 'D')!.min = 0.001;
	b.report.maps.find((item) => item.name === 'D')!.max = 0.001;
	const parameter = commonFitParameters(a, b).find((item) => item.name === 'D');
	expect(parameter).toBeDefined();
	expect(parameter!.minimum).toBeLessThan(0.001);
	expect(parameter!.maximum).toBeGreaterThan(0.001);
	expect(Number.isFinite(parameter!.minimum) && Number.isFinite(parameter!.maximum)).toBe(true);
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
