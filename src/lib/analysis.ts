import type { Dataset, VoxelVolume } from './ivim';

export type FitConfig = {
	model: string;
	iterations: number;
	tolerance: number;
	threshold: number;
	minimumBaseline: number;
	minimumR2: number;
	maximumRmse: number | null;
	bounds: Record<string, [number | null, number | null]>;
	initial: Record<string, number | null>;
};
export type Catalog = {
	osipyVersion: string;
	models: {
		id: string;
		label: string;
		parameters: { name: string; unit: string; bounds: [number | null, number | null] }[];
		initialization: string;
	}[];
	defaults: FitConfig;
	statusCodes: Record<string, string>;
};
export type FitJob = {
	id: string;
	datasetId: string;
	sourceHash: string;
	state: 'running' | 'completed' | 'cancelled' | 'failed';
	progress: number;
	scope: string;
	config: FitConfig;
	startedAt: string;
	finishedAt?: string;
	error?: string;
	summary?: { validVoxels: number; selectedVoxels: number; durationSeconds: number };
};
export type FitReport = {
	schema: 1;
	dataset: Pick<
		Dataset,
		'dimensions' | 'affine' | 'bValues' | 'sha256' | 'slope' | 'intercept' | 'name'
	> & { payloadSha256: string };
	model: string;
	fitter: string;
	osipyVersion: string;
	config: FitConfig;
	scope: string;
	selectedVoxels: number;
	validVoxels: number;
	statusCodes: Record<string, string>;
	statusCounts: Record<string, number>;
	durationSeconds: number;
	completedAt: string;
	maps: { name: string; unit: string; min: number; max: number }[];
	errors: string[];
	samplePolicy: string;
	qualityPolicy: string;
};
export type FitResult = { id: string; report: FitReport; maps: Record<string, Float32Array> };
export type ImageOverlay = {
	values: Float32Array;
	valid: Float32Array;
	minimum: number;
	maximum: number;
	opacity: number;
	showInvalid: boolean;
};

export function companionUrl(raw: string): string {
	const url = new URL(raw);
	if (
		url.protocol !== 'http:' ||
		!['127.0.0.1', 'localhost'].includes(url.hostname) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/'
	)
		throw new Error('Use an HTTP loopback companion URL, such as http://127.0.0.1:60016.');
	return url.origin;
}
export function datasetEnvelope(dataset: Dataset, volumes: VoxelVolume[]): Blob {
	if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1)
		throw new Error('Binary transport requires a little-endian browser.');
	const dtype = (
		{
			Int8Array: 'int8',
			Uint8Array: 'uint8',
			Int16Array: 'int16',
			Uint16Array: 'uint16',
			Int32Array: 'int32',
			Uint32Array: 'uint32',
			Float32Array: 'float32',
			Float64Array: 'float64'
		} as Record<string, string>
	)[volumes[0].constructor.name];
	if (!dtype) throw new Error('Unsupported scalar source.');
	const header = new TextEncoder().encode(
		JSON.stringify({
			name: dataset.name,
			dimensions: dataset.dimensions,
			affine: dataset.affine,
			bValues: dataset.bValues,
			slope: dataset.slope,
			intercept: dataset.intercept,
			spatialUnit: dataset.spatialUnit,
			sha256: dataset.sha256,
			dtype
		})
	);
	const size = new ArrayBuffer(4);
	new DataView(size).setUint32(0, header.length, true);
	return new Blob(
		[
			size,
			header,
			...volumes.map((v) => new Uint8Array(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength))
		],
		{ type: 'application/octet-stream' }
	);
}
export function parseFitResult(id: string, buffer: ArrayBuffer, expectedHash: string): FitResult {
	if (buffer.byteLength < 4) throw new Error('Missing result header.');
	const size = new DataView(buffer).getUint32(0, true);
	if (size > 1024 * 1024 || 4 + size > buffer.byteLength)
		throw new Error('Invalid result header size.');
	const report = JSON.parse(new TextDecoder().decode(buffer.slice(4, 4 + size))) as FitReport;
	if (
		report.schema !== 1 ||
		report.dataset.sha256 !== expectedHash ||
		!Array.isArray(report.dataset.dimensions) ||
		report.dataset.dimensions.length !== 4 ||
		!report.dataset.dimensions.every((v) => Number.isSafeInteger(v) && v > 0)
	)
		throw new Error('Result dataset identity/geometry mismatch.');
	const count = report.dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1);
	const allowed = ['S0', 'D', 'D*', 'f', 'RMSE', 'R2', 'AdjustedR2', 'Valid', 'Status'];
	if (
		!Array.isArray(report.maps) ||
		report.maps.length !== allowed.length ||
		new Set(report.maps.map((m) => m.name)).size !== allowed.length ||
		report.maps.some(
			(m) =>
				!allowed.includes(m.name) ||
				!Number.isFinite(m.min) ||
				!Number.isFinite(m.max) ||
				m.max <= m.min
		) ||
		4 + size + count * 4 * report.maps.length !== buffer.byteLength
	)
		throw new Error('Invalid result map payload.');
	const maps = Object.fromEntries(
		report.maps.map((m, i) => [
			m.name,
			new Float32Array(buffer.slice(4 + size + i * count * 4, 4 + size + (i + 1) * count * 4))
		])
	);
	return { id, report, maps };
}
export function predictIvim(b: number, p: Record<string, number>): number {
	return p.S0 * ((1 - p.f) * Math.exp(-b * p.D) + p.f * Math.exp(-b * p['D*']));
}
export function overlayColor(
	value: number,
	minimum: number,
	maximum: number
): [number, number, number] {
	const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
	const stops = [
		[68, 1, 84],
		[59, 82, 139],
		[33, 145, 140],
		[94, 201, 98],
		[253, 231, 37]
	];
	const i = Math.min(3, Math.floor(t * 4)),
		f = t * 4 - i;
	return stops[i].map((n, j) => Math.round(n + (stops[i + 1][j] - n) * f)) as [
		number,
		number,
		number
	];
}
