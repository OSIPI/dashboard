import { voxelIndex, type Dataset, type VoxelVolume } from './ivim';

export type ViewerTool = 'inspect' | 'pan' | 'rectangle' | 'freehand';
export type PixelPoint = [number, number];
export type Roi = { id: string; label: number; name: string; color: string; indices: number[] };
export type RoiOverlay = { mask: Uint8Array; color: [number, number, number]; opacity: number };
export const ROI_COLORS = ['#ed746b', '#b1c4df', '#d3bd91', '#b3c6ac', '#c7b1ce'];
export const MAX_ROI_VOXELS = 2_000_000;

export function rasterizeRoi(
	points: PixelPoint[],
	slice: number,
	dimensions: number[],
	rectangle: boolean
): number[] {
	if (
		!Number.isInteger(slice) ||
		slice < 0 ||
		slice >= dimensions[2] ||
		points.length < 2 ||
		points.length > 512 ||
		points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
	)
		throw new Error('Invalid ROI stroke.');
	let polygon = points;
	if (rectangle) {
		const a = points[0],
			b = points.at(-1)!;
		polygon = [
			[a[0], a[1]],
			[b[0], a[1]],
			[b[0], b[1]],
			[a[0], b[1]]
		];
	}
	if (polygon.length < 3) return [];
	const minY = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p[1]))));
	const maxY = Math.min(dimensions[1] - 1, Math.ceil(Math.max(...polygon.map((p) => p[1]))));
	const result: number[] = [];
	// Scanline fill is linear in rows/edges plus covered voxels, not edges × every pixel.
	for (let y = minY; y <= maxY; y++) {
		const crossings: number[] = [];
		const py = y + 0.5;
		for (let i = 0; i < polygon.length; i++) {
			const a = polygon[i],
				b = polygon[(i + 1) % polygon.length];
			if (a[1] > py !== b[1] > py)
				crossings.push(a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
		}
		crossings.sort((a, b) => a - b);
		for (let i = 0; i + 1 < crossings.length; i += 2) {
			const start = Math.max(0, Math.ceil(crossings[i] - 0.5)),
				end = Math.min(dimensions[0] - 1, Math.ceil(crossings[i + 1] - 0.5) - 1);
			for (let x = start; x <= end; x++) {
				result.push(voxelIndex(x, y, slice, dimensions));
				if (result.length > MAX_ROI_VOXELS)
					throw new Error('ROI exceeds the two-million-voxel limit.');
			}
		}
	}
	return result;
}
export function editRoi(existing: number[], stroke: number[], erase: boolean): number[] {
	const selected = new Set(stroke);
	const result = erase
		? existing.filter((i) => !selected.has(i))
		: [...new Set([...existing, ...stroke])].sort((a, b) => a - b);
	if (result.length > MAX_ROI_VOXELS) throw new Error('ROI exceeds the two-million-voxel limit.');
	return result;
}
export function roiOverlay(
	roi: Roi | undefined,
	dataset: Dataset,
	opacity: number
): RoiOverlay | undefined {
	if (!roi || !roi.indices.length) return;
	const mask = new Uint8Array(dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1));
	for (const i of roi.indices) mask[i] = 1;
	return {
		mask,
		color: [1, 3, 5].map((i) => parseInt(roi.color.slice(i, i + 2), 16)) as [
			number,
			number,
			number
		],
		opacity
	};
}
export function sameGeometry(a: Dataset, b: Dataset): boolean {
	return (
		a.dimensions.slice(0, 3).every((n, i) => n === b.dimensions[i]) &&
		a.affine.every((row, i) => row.every((v, j) => Math.abs(v - b.affine[i][j]) <= 1e-4))
	);
}
export function maskRois(mask: VoxelVolume, maskDataset: Dataset, target: Dataset): Roi[] {
	if (target.dimensions.slice(0, 3).reduce((a, b) => a * b, 1) > 5_000_000)
		throw new Error('ROI masks support grids up to five million spatial voxels.');
	if (maskDataset.dimensions[3] !== 1 || !sameGeometry(maskDataset, target))
		throw new Error(
			'Mask dimensions/affine must match the active dataset. Register/resample the mask before import.'
		);
	const labels = new Map<number, number[]>();
	for (let i = 0; i < mask.length; i++) {
		const value = mask[i] * maskDataset.slope + maskDataset.intercept;
		if (!Number.isInteger(value) || value < 0 || value > 65535)
			throw new Error('Masks require integer labels from 0 to 65535.');
		if (!value) continue;
		if (!labels.has(value)) {
			if (labels.size >= 32) throw new Error('At most 32 ROI labels can be imported.');
			labels.set(value, []);
		}
		const indices = labels.get(value)!;
		indices.push(i);
		if (indices.length > MAX_ROI_VOXELS)
			throw new Error('A mask label exceeds the ROI voxel limit.');
	}
	return [...labels].map(([label, indices], i) => ({
		id: crypto.randomUUID(),
		label,
		name: `Label ${label}`,
		color: ROI_COLORS[i % ROI_COLORS.length],
		indices
	}));
}
export function roiStatistics(indices: number[], value: (i: number) => number) {
	const values = indices
		.map(value)
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	let mean = 0,
		m2 = 0;
	values.forEach((v, i) => {
		const delta = v - mean;
		mean += delta / (i + 1);
		m2 += delta * (v - mean);
	});
	const n = values.length;
	return {
		selected: indices.length,
		count: n,
		mean: n ? mean : null,
		median: n ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2 : null,
		sd: n ? Math.sqrt(m2 / n) : null,
		min: n ? values[0] : null,
		max: n ? values[n - 1] : null
	};
}
