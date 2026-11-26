import type { Dataset } from './ivim';

/** Display-only orthogonal transforms. Flips are in native axes, followed by clockwise rotation. */
export type DisplayTransform = {
	rotation?: 0 | 90 | 180 | 270;
	flipX?: boolean;
	flipY?: boolean;
	invert?: boolean;
};
export type Point2 = [number, number];

export function nativeToDisplay([x, y]: Point2, view: DisplayTransform): Point2 {
	x = view.flipX ? 1 - x : x;
	y = view.flipY ? 1 - y : y;
	switch (view.rotation ?? 0) {
		case 90:
			return [1 - y, x];
		case 180:
			return [1 - x, 1 - y];
		case 270:
			return [y, 1 - x];
		default:
			return [x, y];
	}
}

export function displayToNative([x, y]: Point2, view: DisplayTransform): Point2 {
	let point: Point2;
	switch (view.rotation ?? 0) {
		case 90:
			point = [y, 1 - x];
			break;
		case 180:
			point = [1 - x, 1 - y];
			break;
		case 270:
			point = [1 - y, x];
			break;
		default:
			point = [x, y];
	}
	return [view.flipX ? 1 - point[0] : point[0], view.flipY ? 1 - point[1] : point[1]];
}

export function displayGeometry(dataset: Dataset, view: DisplayTransform) {
	const aspect =
		(dataset.dimensions[0] * dataset.spacing[0]) / (dataset.dimensions[1] * dataset.spacing[1]);
	const sideways = view.rotation === 90 || view.rotation === 270;
	return {
		aspect: sideways ? 1 / aspect : aspect,
		// Percentages relative to the rotated bounding box. Rotation is in physical screen space.
		width: sideways ? aspect * 100 : 100,
		height: sideways ? 100 / aspect : 100,
		transform: `translate(-50%, -50%) rotate(${view.rotation ?? 0}deg) scale(${view.flipX ? -1 : 1}, ${view.flipY ? -1 : 1})`
	};
}

/** Multi-letter patient directions retain obliquity instead of inventing axial labels. */
export function orientationEdges(dataset: Dataset, view: DisplayTransform) {
	const origin = displayToNative([0.5, 0.5], view);
	return (
		[
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1]
		] as Point2[]
	).map(([dx, dy]) => {
		const p = displayToNative([0.5 + dx, 0.5 + dy], view);
		const vector = dataset.affine
			.slice(0, 3)
			.map((row) => row[0] * (p[0] - origin[0]) + row[1] * (p[1] - origin[1]));
		const length = Math.hypot(...vector);
		return (
			vector
				.map((value, axis) => ({ value, axis }))
				.filter(({ value }) => Math.abs(value) > length * 0.01)
				.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
				.map(({ value, axis }) => (value > 0 ? ['R', 'A', 'S'] : ['L', 'P', 'I'])[axis])
				.join('') || '?'
		);
	});
}

export function sourceWorld(dataset: Dataset, x: number, y: number, z: number) {
	// NIfTI integer indices denote voxel centers; do not add the display's half-pixel offset.
	return dataset.affine.slice(0, 3).map((row) => row[0] * x + row[1] * y + row[2] * z + row[3]);
}
