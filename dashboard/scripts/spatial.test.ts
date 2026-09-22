import { expect, test } from 'bun:test';
import {
	createGeometry,
	toWorld,
	nearestVoxel,
	createPlane,
	planeWorld,
	reslice
} from '../src/lib/spatial';
import type { Dataset } from '../src/lib/ivim';

const dataset = {
	dimensions: [3, 4, 2, 2],
	spacing: [2, 3, 4],
	slope: 2,
	intercept: -5,
	affine: [
		[-2, 0, 0, 10],
		[0, 3, 0, -6],
		[0, 0, 4, 20],
		[0, 0, 0, 1]
	]
} as Dataset;

test('RAS geometry round-trips reflected, oblique and sheared acquired voxel coordinates', () => {
	for (const affine of [
		dataset.affine,
		[
			[-2, 0.5, 0, 10],
			[0, 2, -2, -6],
			[0, 2, 2, 20],
			[0, 0, 0, 1]
		]
	]) {
		const geometry = createGeometry({ ...dataset, affine });
		for (let z = 0; z < 2; z++)
			for (let y = 0; y < 4; y++)
				for (let x = 0; x < 3; x++) {
					const voxel: [number, number, number] = [x, y, z];
					expect(nearestVoxel(geometry, toWorld(geometry, voxel))).toEqual(voxel);
				}
		expect(nearestVoxel(geometry, [1000, 0, 0])).toBeNull();
		expect(nearestVoxel(geometry, [NaN, 0, 0])).toBeNull();
	}
	expect(() =>
		createGeometry({
			...dataset,
			affine: [
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[0, 0, 0, 1]
			]
		})
	).toThrow();
});

test('canonical planes share the selected physical point and sample original scaled acquisitions', () => {
	const geometry = createGeometry(dataset);
	const selected = toWorld(geometry, [1, 2, 1]);
	const volume = Int16Array.from({ length: 24 }, (_, i) => i);
	const original = volume.slice();
	for (const axis of [0, 1, 2] as const) {
		const plane = createPlane(geometry, axis, selected);
		expect(planeWorld(plane, 0.5, 0.5)[axis]).toBe(selected[axis]);
		const pixels = reslice(volume, dataset, geometry, plane, 20, 50);
		for (let j = 0; j < plane.height; j++)
			for (let i = 0; i < plane.width; i++) {
				const voxel = nearestVoxel(
					geometry,
					planeWorld(plane, (i + 0.5) / plane.width, (j + 0.5) / plane.height)
				);
				const offset = (j * plane.width + i) * 4;
				if (voxel) {
					const raw = volume[(voxel[2] * 4 + voxel[1]) * 3 + voxel[0]];
					expect(pixels[offset]).toBe(
						Math.round(Math.max(0, Math.min(1, (raw * 2 - 5 + 5) / 50)) * 255)
					);
					expect(pixels[offset + 3]).toBe(255);
				}
			}
	}
	expect(volume).toEqual(original);
	expect(geometry.bounds).toEqual([
		[6, 10],
		[-6, 3],
		[20, 24]
	]);
});

test('radiological axial corners respect left/right and anterior/posterior, with distinct acquisitions', () => {
	const geometry = createGeometry(dataset);
	const plane = createPlane(geometry, 2, [8, 0, 24]);
	const first = Int16Array.from({ length: 24 }, (_, i) => i);
	const second = Int16Array.from(first, (n) => n + 10);
	const pixels = reslice(first, dataset, geometry, plane, 20, 50);
	const other = reslice(second, dataset, geometry, plane, 20, 50);
	// Top-left is R/A: native (0,3,1), index 21. Bottom-right is L/P: (2,0,1), index 14.
	expect(Array.from(pixels.slice(0, 4))).toEqual([214, 214, 214, 255]);
	expect(Array.from(pixels.slice(-4))).toEqual([143, 143, 143, 255]);
	expect(other[0]).toBe(255);
	expect(first[21]).toBe(21);
});
