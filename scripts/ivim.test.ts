import { describe, expect, test } from 'bun:test';
import {
	B_VALUES,
	SIZE,
	SLICES,
	createVolumes,
	parametersAt,
	signal,
	voxelIndex,
	windowPixel,
	parseBookmarks
} from '../src/lib/ivim';

describe('synthetic IVIM data', () => {
	test('signal obeys the biexponential model and limiting cases', () => {
		const p = parametersAt(35, 44, 16);
		expect(p.region).toBe('High-fraction insert');
		expect(signal(0, p)).toBe(p.s0);
		expect(signal(100, p)).toBeCloseTo(1000 * (0.76 * Math.exp(-0.12) + 0.24 * Math.exp(-2.5)), 10);
		expect(signal(100, { ...p, f: 0 })).toBeCloseTo(p.s0 * Math.exp(-100 * p.d), 10);
		expect(signal(100, { ...p, f: 1 })).toBeCloseTo(p.s0 * Math.exp(-100 * p.dStar), 10);
	});
	test('all volumes are finite, nonnegative, monotonically decaying and match voxel ground truth', () => {
		const volumes = createVolumes();
		expect(volumes).toHaveLength(B_VALUES.length);
		for (const volume of volumes) expect(volume.length).toBe(SIZE * SIZE * SLICES);
		for (let i = 0; i < volumes[0].length; i++) {
			let previous = Infinity;
			for (const volume of volumes) {
				if (!Number.isFinite(volume[i]) || volume[i] < 0 || volume[i] > previous)
					throw new Error(`Invalid signal at ${i}`);
				previous = volume[i];
			}
		}
		for (const [x, y, z] of [
			[35, 44, 16],
			[60, 53, 16],
			[48, 48, 0],
			[0, 0, 31],
			[48, 48, 16]
		]) {
			B_VALUES.forEach((b, i) =>
				expect(volumes[i][voxelIndex(x, y, z)]).toBeCloseTo(signal(b, parametersAt(x, y, z)), 3)
			);
		}
		expect(parametersAt(0, 0, 0).s0).toBe(0);
		expect(parametersAt(48, 48, 0).s0).not.toBe(parametersAt(48, 48, 16).s0);
	});
	test('windowing clips and adjusts contrast', () => {
		expect(windowPixel(0, 500, 1000)).toBe(0);
		expect(windowPixel(500, 500, 1000)).toBe(128);
		expect(windowPixel(1200, 500, 1000)).toBe(255);
		expect(windowPixel(250, 500, 500)).toBe(0);
	});
	test('saved views validate browser storage at the boundary', () => {
		const view = { id: 'one', b: 2, z: 16, x: 35, y: 44, note: 'Synthetic insert' };
		expect(parseBookmarks(JSON.stringify([view]))).toEqual([view]);
		for (const invalid of [
			{ ...view, b: 9 },
			{ ...view, x: -1 },
			{ ...view, z: 32 },
			{ ...view, y: 1.5 },
			{ ...view, note: 3 },
			{ ...view, note: 'a'.repeat(241) }
		]) {
			expect(() => parseBookmarks(JSON.stringify([invalid]))).toThrow();
		}
		expect(() => parseBookmarks('{}')).toThrow();
		expect(() => parseBookmarks(JSON.stringify([view, view]))).toThrow();
	});
});
