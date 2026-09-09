import { expect, test } from 'bun:test';
import {
	loadDataset,
	validateDataset,
	voxelIndex,
	windowPixel,
	parseBookmarks
} from '../src/lib/ivim';

// Tiny non-square test fixture, not a viewing fallback or scientific dataset.
const samples = new Int16Array(Array.from({ length: 24 }, (_, i) => i - 4));
const hash = Array.from(
	new Uint8Array(await crypto.subtle.digest('SHA-256', samples.buffer)),
	(b) => b.toString(16).padStart(2, '0')
).join('');
const fixture = {
	schema: 1,
	id: 'test-dataset',
	name: 'Test only',
	dimensions: [3, 2, 2, 2],
	spacing: [2, 3, 4],
	spatialUnit: 'mm',
	affine: [
		[-2, 0, 0, 0],
		[0, 3, 0, 0],
		[0, 0, 4, 0],
		[0, 0, 0, 1]
	],
	axisCodes: ['L', 'A', 'S'],
	slope: 2.5,
	intercept: -1,
	bValues: [10, 10],
	bVectors: [
		[1, 0, 0],
		[0, 1, 0]
	],
	dtype: 'int16-le',
	order: 'x-y-z-volume',
	byteLength: 48,
	sha256: hash,
	signalRange: [-11, 46.5],
	window: [20, 40]
};
const dataset = validateDataset(fixture);

test('manifest rejects invalid shape, diffusion, spatial, scaling and binary metadata', () => {
	for (const invalid of [
		null,
		{},
		{ ...fixture, dimensions: [3, 2, 2, 0] },
		{ ...fixture, bValues: [10] },
		{ ...fixture, bValues: [10, -1] },
		{ ...fixture, bVectors: [[1, 0, 0]] },
		{ ...fixture, spacing: [2, 0, 4] },
		{ ...fixture, affine: [[1]] },
		{ ...fixture, slope: NaN },
		{ ...fixture, axisCodes: ['X', 'A', 'S'] },
		{ ...fixture, byteLength: 47 },
		{ ...fixture, sha256: '' },
		{ ...fixture, window: [1, 0] }
	]) {
		expect(() => validateDataset(invalid)).toThrow();
	}
});

test('loader preserves volume order and raw samples; fails on HTTP, truncation and checksum errors', async () => {
	const original = globalThis.fetch;
	let status = 200;
	let payload: ArrayBuffer = samples.buffer.slice(0);
	globalThis.fetch = (async (url: string) =>
		url.endsWith('manifest.json')
			? Response.json(fixture, { status })
			: new Response(payload)) as typeof fetch;
	try {
		const loaded = await loadDataset('/test');
		expect(loaded.volumes).toHaveLength(2);
		expect(loaded.dataset.bValues).toEqual([10, 10]);
		const index = voxelIndex(2, 1, 1, dataset.dimensions);
		expect(index).toBe(11);
		expect(loaded.volumes[1][index]).toBe(19);
		expect(loaded.volumes[1][index] * dataset.slope + dataset.intercept).toBe(46.5);
		status = 404;
		await expect(loadDataset('/test')).rejects.toThrow('unavailable');
		status = 200;
		payload = new ArrayBuffer(2);
		await expect(loadDataset('/test')).rejects.toThrow('size mismatch');
		payload = new ArrayBuffer(48);
		await expect(loadDataset('/test')).rejects.toThrow('checksum mismatch');
	} finally {
		globalThis.fetch = original;
	}
});

test('windowing clips and adjusts contrast without altering samples', () => {
	expect(windowPixel(0, 500, 1000)).toBe(0);
	expect(windowPixel(500, 500, 1000)).toBe(128);
	expect(windowPixel(1200, 500, 1000)).toBe(255);
	expect(windowPixel(250, 500, 500)).toBe(0);
});

test('saved views are bound to dataset identity and all four dynamic dimensions', () => {
	const view = { id: 'one', datasetId: dataset.id, b: 1, z: 1, x: 2, y: 1, note: 'Test' };
	expect(parseBookmarks(JSON.stringify([view]), dataset)).toEqual([view]);
	for (const invalid of [
		{ ...view, datasetId: 'old-phantom' },
		{ ...view, datasetId: undefined },
		{ ...view, b: 2 },
		{ ...view, x: 3 },
		{ ...view, y: 2 },
		{ ...view, z: 2 },
		{ ...view, x: -1 },
		{ ...view, y: 1.5 },
		{ ...view, note: 3 },
		{ ...view, note: 'a'.repeat(241) }
	]) {
		expect(() => parseBookmarks(JSON.stringify([invalid]), dataset)).toThrow();
	}
	expect(() => parseBookmarks('{}', dataset)).toThrow();
	expect(() => parseBookmarks(JSON.stringify([view, view]), dataset)).toThrow();
});
