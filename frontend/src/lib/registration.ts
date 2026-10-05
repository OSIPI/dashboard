import type { Dataset } from './ivim';
import { createGeometry, nearestVoxel, toWorld, type Point } from './spatial';

export type Registration = {
	schema: 1;
	sourceHash: string;
	targetHash: string;
	coordinateSystem: 'RAS-mm';
	matrix: number[][];
	sourceFormat: string;
};
export function validateAffine(matrix: unknown): number[][] {
	if (
		!Array.isArray(matrix) ||
		matrix.length !== 4 ||
		matrix.some(
			(r) =>
				!Array.isArray(r) ||
				r.length !== 4 ||
				r.some((v) => typeof v !== 'number' || !Number.isFinite(v))
		)
	)
		throw new Error('Transform must be a finite 4 × 4 affine.');
	createGeometry({ affine: matrix, dimensions: [1, 1, 1, 1], spacing: [1, 1, 1] } as Dataset);
	return matrix;
}
export function invertAffine(matrix: number[][]): number[][] {
	const g = createGeometry({
		affine: validateAffine(matrix),
		dimensions: [1, 1, 1, 1],
		spacing: [1, 1, 1]
	} as Dataset);
	return [
		...g.inverse.map((r) => [...r, -r.reduce((n, v, i) => n + v * matrix[i][3], 0)]),
		[0, 0, 0, 1]
	];
}
export function parseRegistration(text: string, source: Dataset, target: Dataset): Registration {
	if (text.length > 65536) throw new Error('Transform file exceeds 64 KiB.');
	if (text.trim().startsWith('{')) {
		const value = JSON.parse(text) as Registration;
		if (
			value.schema !== 1 ||
			value.sourceHash !== source.sha256 ||
			value.targetHash !== target.sha256 ||
			value.coordinateSystem !== 'RAS-mm'
		)
			throw new Error(
				'Transform dataset identities or coordinate convention do not match this comparison.'
			);
		return {
			schema: 1,
			sourceHash: source.sha256,
			targetHash: target.sha256,
			coordinateSystem: 'RAS-mm',
			matrix: validateAffine(value.matrix),
			sourceFormat: 'JSON primary → comparison RAS-mm'
		};
	}
	const transforms = text.match(/^Transform:\s*(.+)$/gm) ?? [];
	if (
		transforms.length !== 1 ||
		!/^Transform:\s*AffineTransform_(double|float)_3_3\s*$/m.test(text)
	)
		throw new Error(
			'Only one ITK 3D affine transform is supported; composite/nonlinear transforms need external resampling.'
		);
	const numbers = (key: string) =>
		text
			.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]
			.trim()
			.split(/\s+/)
			.map(Number) ?? [];
	const p = numbers('Parameters'),
		c = numbers('FixedParameters');
	if (p.length !== 12 || c.length !== 3 || [...p, ...c].some((v) => !Number.isFinite(v)))
		throw new Error('Invalid ITK affine parameters or center.');
	const flip = [-1, -1, 1];
	const matrix = [
		...Array.from({ length: 3 }, (_, i) => [
			...Array.from({ length: 3 }, (_, j) => flip[i] * p[i * 3 + j] * flip[j]),
			flip[i] * (p[9 + i] + c[i] - c.reduce((n, v, j) => n + p[i * 3 + j] * v, 0))
		]),
		[0, 0, 0, 1]
	];
	return {
		schema: 1,
		sourceHash: source.sha256,
		targetHash: target.sha256,
		coordinateSystem: 'RAS-mm',
		matrix: validateAffine(matrix),
		sourceFormat: 'ITK affine LPS converted to RAS; primary → comparison assumed explicitly'
	};
}
export function mapRegisteredPoint(
	source: Dataset,
	target: Dataset,
	point: Point,
	matrix: number[][]
): Point | null {
	const world = toWorld(createGeometry(source), point);
	const transformed = matrix
		.slice(0, 3)
		.map((row) => row[0] * world[0] + row[1] * world[1] + row[2] * world[2] + row[3]) as Point;
	return nearestVoxel(createGeometry(target), transformed);
}
