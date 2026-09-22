import { voxelIndex, windowPixel, type Dataset, type VoxelVolume } from './ivim';

export type Point = [number, number, number];
export type Axis = 0 | 1 | 2;
export type Geometry = ReturnType<typeof createGeometry>;
export type Plane = ReturnType<typeof createPlane>;
export const VIEWS = [
	{ axis: 2, name: 'Axial', edges: ['R', 'L', 'A', 'P'] },
	{ axis: 1, name: 'Coronal', edges: ['R', 'L', 'S', 'I'] },
	{ axis: 0, name: 'Sagittal', edges: ['P', 'A', 'S', 'I'] }
] as const;

export function createGeometry(dataset: Dataset) {
	const { affine, dimensions } = dataset;
	const [a, b, c] = affine;
	const det =
		a[0] * (b[1] * c[2] - b[2] * c[1]) -
		a[1] * (b[0] * c[2] - b[2] * c[0]) +
		a[2] * (b[0] * c[1] - b[1] * c[0]);
	if (
		!Number.isFinite(det) ||
		Math.abs(det) < 1e-10 ||
		affine[3].some((n, i) => n !== (i === 3 ? 1 : 0))
	) {
		throw new Error('Spatial viewing requires an invertible NIfTI affine.');
	}
	const inverse = [
		[b[1] * c[2] - b[2] * c[1], a[2] * c[1] - a[1] * c[2], a[1] * b[2] - a[2] * b[1]],
		[b[2] * c[0] - b[0] * c[2], a[0] * c[2] - a[2] * c[0], a[2] * b[0] - a[0] * b[2]],
		[b[0] * c[1] - b[1] * c[0], a[1] * c[0] - a[0] * c[1], a[0] * b[1] - a[1] * b[0]]
	].map((row) => row.map((n) => n / det));
	const bounds = Array.from({ length: 3 }, () => [Infinity, -Infinity]);
	for (const x of [0, dimensions[0] - 1])
		for (const y of [0, dimensions[1] - 1])
			for (const z of [0, dimensions[2] - 1]) {
				toWorld({ affine }, [x, y, z]).forEach((n, i) => {
					bounds[i][0] = Math.min(bounds[i][0], n);
					bounds[i][1] = Math.max(bounds[i][1], n);
				});
			}
	return { affine, inverse, dimensions, bounds, step: Math.min(...dataset.spacing) };
}

export function toWorld(geometry: Pick<Geometry, 'affine'>, voxel: Point): Point {
	return geometry.affine
		.slice(0, 3)
		.map((r) => r[0] * voxel[0] + r[1] * voxel[1] + r[2] * voxel[2] + r[3]) as Point;
}

export function nearestVoxel(geometry: Geometry, world: Point): Point | null {
	const delta = world.map((n, i) => n - geometry.affine[i][3]);
	const voxel = geometry.inverse.map((r) =>
		Math.round(r.reduce((n, v, i) => n + v * delta[i], 0))
	) as Point;
	return voxel.every((n, i) => Number.isFinite(n) && n >= 0 && n < geometry.dimensions[i])
		? (voxel.map((n) => n || 0) as Point)
		: null;
}

export function createPlane(geometry: Geometry, axis: Axis, world: Point) {
	const u: Axis = axis === 0 ? 1 : 0;
	const v: Axis = axis === 2 ? 1 : 2;
	const direction = axis === 0 ? 1 : -1;
	const extent = (i: Axis) =>
		Math.max(geometry.step, geometry.bounds[i][1] - geometry.bounds[i][0]);
	// ponytail: cap display textures at 512²; increase only for higher-resolution datasets. Picking stays native.
	const size = (i: Axis) => Math.min(512, Math.ceil(extent(i) / geometry.step) + 1);
	const width = size(u),
		height = size(v);
	const du = (direction * extent(u)) / (width - 1),
		dv = -extent(v) / (height - 1);
	const origin = [...world] as Point;
	origin[u] = geometry.bounds[u][direction === 1 ? 0 : 1] - du / 2;
	origin[v] = geometry.bounds[v][1] - dv / 2;
	const horizontal = du * width,
		vertical = dv * height;
	return { axis, u, v, origin, horizontal, vertical, width, height };
}

export function planeWorld(plane: Plane, u: number, v: number): Point {
	const world = [...plane.origin] as Point;
	world[plane.u] += u * plane.horizontal;
	world[plane.v] += v * plane.vertical;
	return world;
}

export function reslice(
	volume: VoxelVolume,
	dataset: Dataset,
	geometry: Geometry,
	plane: Plane,
	center: number,
	width: number
) {
	const pixels = new Uint8ClampedArray(plane.width * plane.height * 4);
	for (let y = 0; y < plane.height; y++)
		for (let x = 0; x < plane.width; x++) {
			const voxel = nearestVoxel(
				geometry,
				planeWorld(plane, (x + 0.5) / plane.width, (y + 0.5) / plane.height)
			);
			const offset = (y * plane.width + x) * 4;
			if (!voxel) continue;
			const value = windowPixel(
				volume[voxelIndex(...voxel, dataset.dimensions)] * dataset.slope + dataset.intercept,
				center,
				width
			);
			pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
			pixels[offset + 3] = 255;
		}
	return pixels;
}
