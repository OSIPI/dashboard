export type VoxelVolume =
	| Int8Array
	| Uint8Array
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array;
export type Dataset = {
	schema: number;
	id: string;
	name: string;
	dimensions: [number, number, number, number];
	spacing: [number, number, number];
	spatialUnit: string;
	affine: number[][];
	axisCodes: string[];
	slope: number;
	intercept: number;
	bValues: number[];
	bVectors: number[][];
	dtype: string;
	order: string;
	byteLength: number;
	sha256: string;
	signalRange: [number, number];
	window: [number, number];
	source?: 'local' | 'zenodo';
	xformCode?: number;
};

export function validateDataset(value: unknown): Dataset {
	if (!value || typeof value !== 'object') throw new Error('Invalid dataset manifest');
	const d = value as Dataset;
	const numbers = (v: unknown, length: number): v is number[] =>
		Array.isArray(v) && v.length === length && v.every(Number.isFinite);
	if (
		d.schema !== 1 ||
		typeof d.id !== 'string' ||
		!d.id ||
		typeof d.name !== 'string' ||
		!numbers(d.dimensions, 4) ||
		!d.dimensions.every((n) => Number.isInteger(n) && n > 0) ||
		!numbers(d.spacing, 3) ||
		!d.spacing.every((n) => n > 0) ||
		d.spatialUnit !== 'mm' ||
		!Array.isArray(d.affine) ||
		d.affine.length !== 4 ||
		!d.affine.every((r) => numbers(r, 4)) ||
		!Array.isArray(d.axisCodes) ||
		d.axisCodes.length !== 3 ||
		!d.axisCodes.every((c, i) => ['LR', 'AP', 'SI'][i].includes(c) && c.length === 1) ||
		!Number.isFinite(d.slope) ||
		d.slope <= 0 ||
		!Number.isFinite(d.intercept) ||
		!numbers(d.bValues, d.dimensions[3]) ||
		!d.bValues.every((b) => b >= 0) ||
		!Array.isArray(d.bVectors) ||
		d.bVectors.length !== d.dimensions[3] ||
		!d.bVectors.every((r) => numbers(r, 3)) ||
		d.dtype !== 'int16-le' ||
		d.order !== 'x-y-z-volume' ||
		d.byteLength !== d.dimensions.reduce((a, b) => a * b, 2) ||
		d.byteLength > 512 * 1024 * 1024 ||
		typeof d.sha256 !== 'string' ||
		!/^[a-f0-9]{64}$/.test(d.sha256) ||
		!numbers(d.signalRange, 2) ||
		d.signalRange[1] <= d.signalRange[0] ||
		!numbers(d.window, 2) ||
		d.window[1] <= 0
	)
		throw new Error('Invalid or unsupported dataset manifest');
	return d;
}

export async function loadDataset(root: string, signal?: AbortSignal) {
	const manifest = await fetch(`${root}/manifest.json`, { signal });
	if (!manifest.ok) throw new Error(`Dataset manifest unavailable (HTTP ${manifest.status})`);
	const dataset = validateDataset(await manifest.json());
	const response = await fetch(`${root}/signal.i16`, { signal });
	if (!response.ok) throw new Error(`Dataset samples unavailable (HTTP ${response.status})`);
	const buffer = await response.arrayBuffer();
	if (buffer.byteLength !== dataset.byteLength) throw new Error('Dataset sample size mismatch');
	const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');
	if (hash !== dataset.sha256) throw new Error('Dataset sample checksum mismatch');
	const samples = new Int16Array(buffer);
	if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
		const view = new DataView(buffer);
		for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
	}
	const count = dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1);
	const volumes = dataset.bValues.map((_, i) => samples.subarray(i * count, (i + 1) * count));
	return { dataset, volumes };
}

export function voxelIndex(x: number, y: number, z: number, dimensions: number[]): number {
	return (z * dimensions[1] + y) * dimensions[0] + x;
}

export function windowPixel(value: number, center: number, width: number): number {
	return Math.round(Math.max(0, Math.min(1, (value - (center - width / 2)) / width)) * 255);
}

export type Bookmark = {
	id: string;
	datasetId: string;
	b: number;
	z: number;
	x: number;
	y: number;
	note: string;
};
export const BOOKMARK_KEY = 'osipy.ivim.bookmarks.v2';

export function parseBookmarks(raw: string, dataset: Dataset): Bookmark[] {
	const value: unknown = JSON.parse(raw);
	if (!Array.isArray(value)) throw new Error('Invalid saved views');
	const ids = new Set<string>();
	return value.slice(0, 30).map((item: unknown) => {
		if (!item || typeof item !== 'object') throw new Error('Invalid saved view');
		const b = item as Bookmark;
		if (
			b.datasetId !== dataset.id ||
			typeof b.id !== 'string' ||
			!b.id ||
			b.id.length > 100 ||
			ids.has(b.id) ||
			typeof b.note !== 'string' ||
			b.note.length > 240 ||
			![b.x, b.y, b.z, b.b].every(
				(n, i) => Number.isInteger(n) && n >= 0 && n < dataset.dimensions[i]
			)
		)
			throw new Error('Invalid saved view or mismatched dataset');
		ids.add(b.id);
		return { id: b.id, datasetId: b.datasetId, b: b.b, z: b.z, x: b.x, y: b.y, note: b.note };
	});
}
