import { gunzipSync } from 'fflate';
import { isNIFTI, readHeader } from 'nifti-reader-js';
import type { Dataset, VoxelVolume } from './ivim';
import { niftiBytes } from './nifti-export';

export type FitConfig = {
	model: string;
	method: 'segmented' | 'full' | 'bayesian' | string;
	bThreshold: number;
};
export type Catalog = {
	osipyVersion: string;
	library: {
		technique: 'IVIM' | 'DCE' | 'DSC' | 'ASL';
		groups: { label: string; methods: string[] }[];
	}[];
	models: {
		id: string;
		label: string;
		parameters: { name: string; unit: string; bounds: [number | null, number | null] }[];
		fitterStrategies: string[];
		reference: string;
	}[];
	defaults: FitConfig;
	statusCodes: Record<string, string>;
};
export type FitJob = {
	id: string;
	datasetId: string;
	sourceHash: string;
	state: 'pending' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';
	progress: number;
	scope: string;
	config: FitConfig;
	startedAt: string;
	finishedAt?: string;
	error?: string;
	summary?: { validVoxels: number; selectedVoxels: number; durationSeconds?: number };
	apiSummary?: Record<string, unknown>;
	provenance?: Record<string, unknown>;
};
export function fitJobState(status: string): FitJob['state'] {
	const states: Record<string, FitJob['state']> = {
		pending: 'pending',
		queued: 'pending',
		running: 'running',
		cancelling: 'cancelling',
		succeeded: 'completed',
		completed: 'completed',
		cancelled: 'cancelled',
		canceled: 'cancelled',
		failed: 'failed'
	};
	return states[status] ?? 'failed';
}
export type VoxelFit = {
	voxel: number[];
	b_values: number[];
	signal: number[];
	available: boolean;
	reason: 'not_selected' | 'invalid_estimate' | null;
	params: Record<string, number> | null;
	fitted_curve: number[] | null;
	r_squared: number | null;
};
export type FitReport = {
	schema: 1;
	dataset: Pick<
		Dataset,
		'dimensions' | 'affine' | 'bValues' | 'sha256' | 'slope' | 'intercept' | 'name'
	>;
	model: string;
	fitter: string;
	osipyVersion: string;
	config: FitConfig;
	scope: string;
	selectedVoxels: number;
	validVoxels: number;
	statusCodes: Record<string, string>;
	statusCounts: Record<string, number>;
	durationSeconds: number | null;
	completedAt: string;
	maps: { name: string; unit: string; min: number; max: number }[];
	errors: string[];
	samplePolicy: string;
	qualityPolicy: string;
	provenance?: Record<string, unknown>;
};
export type FitResult = { id: string; report: FitReport; maps: Record<string, Float32Array> };
export type ComparableParameter = { name: string; unit: string; minimum: number; maximum: number };
export type ImageOverlay = {
	values: Float32Array;
	valid: Float32Array;
	minimum: number;
	maximum: number;
	opacity: number;
	showInvalid: boolean;
};

export function compatibleFitResults(results: FitResult[], dataset: Dataset): FitResult[] {
	return results.filter(
		(result) =>
			result.report.dataset.sha256 === dataset.sha256 &&
			result.report.dataset.dimensions.every(
				(value, index) => value === dataset.dimensions[index]
			) &&
			result.report.dataset.affine.every((row, r) =>
				row.every((value, c) => Math.abs(value - dataset.affine[r][c]) <= 1e-6)
			)
	);
}

export function commonFitParameters(a?: FitResult, b?: FitResult): ComparableParameter[] {
	if (!a || !b) return [];
	return a.report.maps.flatMap((left) => {
		if (['Valid', 'Status'].includes(left.name)) return [];
		const right = b.report.maps.find(
			(candidate) => candidate.name === left.name && candidate.unit === left.unit
		);
		if (!right || !a.maps[left.name] || !b.maps[right.name]) return [];
		let minimum = Math.min(left.min, right.min);
		let maximum = Math.max(left.max, right.max);
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [];
		if (maximum <= minimum) {
			const padding = Math.max(Math.abs(minimum) * 0.01, 1e-12);
			minimum -= padding;
			maximum += padding;
		}
		return [{ name: left.name, unit: left.unit, minimum, maximum }];
	});
}

export function fitCurveAtVoxel(result: FitResult, index: number) {
	const parameterNames =
		result.report.model === 'simplified' ? ['S0', 'D', 'f'] : ['S0', 'D', 'D*', 'f'];
	const cutoff = Number(result.report.provenance?.model_cutoff);
	if (
		(result.report.model === 'simplified' && !Number.isFinite(cutoff)) ||
		!parameterNames.every((name) => Number.isFinite(result.maps[name]?.[index]))
	)
		return undefined;
	return {
		parameters: Object.fromEntries([
			...parameterNames.map((name) => [name, result.maps[name][index]]),
			['bThreshold', cutoff]
		]),
		valid: result.maps.Valid?.[index] === 1,
		model: `${result.report.model} · ${result.report.config.method}`
	};
}

export function localApiUrl(raw: string): string {
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
		throw new Error('Use an HTTP loopback API URL, such as http://127.0.0.1:60016.');
	return url.origin;
}
export function datasetForm(dataset: Dataset, volumes: VoxelVolume[]): FormData {
	const form = new FormData();
	form.append('nifti', new Blob([niftiBytes(dataset, volumes)]), `${dataset.name || 'dwi'}.nii`);
	form.append('b_values', JSON.stringify(dataset.bValues));
	return form;
}

export function voxelCoordinates(
	indices: number[],
	dimensions: Dataset['dimensions']
): [number, number, number][] {
	const [nx, ny] = dimensions;
	return indices.map((index) => [
		index % nx,
		Math.floor(index / nx) % ny,
		Math.floor(index / (nx * ny))
	]);
}

export function fitRequest(
	config: FitConfig,
	scope: 'voxel' | 'roi' | 'dataset',
	indices: number[],
	dimensions: Dataset['dimensions']
) {
	return {
		model: config.model,
		method: config.method,
		b_threshold: config.bThreshold,
		scope,
		voxels: scope === 'dataset' ? [] : voxelCoordinates(indices, dimensions)
	};
}

export function parseNiftiMap(raw: ArrayBuffer, dataset: Dataset): Float32Array {
	let bytes = new Uint8Array(raw);
	if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
	const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	if (!isNIFTI(buffer)) throw new Error('API returned an invalid NIfTI map.');
	const header = readHeader(buffer);
	const dimensions = header.dims.slice(1, 4);
	if (header.dims[0] !== 3 || dimensions.some((n, i) => n !== dataset.dimensions[i]))
		throw new Error('Result map geometry does not match the source dataset.');
	if (header.sform_code <= 0)
		throw new Error('Result map does not declare its native orientation.');
	const source = new DataView(buffer);
	const affine = [0, 1, 2].map((r) =>
		[0, 1, 2, 3].map((c) => source.getFloat32(280 + (r * 4 + c) * 4, header.littleEndian))
	);
	if (
		affine.some((row, r) =>
			row.some(
				(value, c) =>
					Math.abs(value - dataset.affine[r][c]) >
					Math.max(1, Math.abs(dataset.affine[r][c])) * 1e-5
			)
		)
	)
		throw new Error('Result map orientation does not match the source dataset.');
	const formats = {
		2: [1, (v: DataView, p: number) => v.getUint8(p)],
		256: [1, (v: DataView, p: number) => v.getInt8(p)],
		4: [2, (v: DataView, p: number, le: boolean) => v.getInt16(p, le)],
		512: [2, (v: DataView, p: number, le: boolean) => v.getUint16(p, le)],
		8: [4, (v: DataView, p: number, le: boolean) => v.getInt32(p, le)],
		768: [4, (v: DataView, p: number, le: boolean) => v.getUint32(p, le)],
		16: [4, (v: DataView, p: number, le: boolean) => v.getFloat32(p, le)],
		64: [8, (v: DataView, p: number, le: boolean) => v.getFloat64(p, le)]
	} as const;
	const format = formats[header.datatypeCode as keyof typeof formats];
	const count = dimensions.reduce((a, b) => a * b, 1);
	if (!format || header.vox_offset + count * format[0] > buffer.byteLength)
		throw new Error('API returned an unsupported or truncated NIfTI map.');
	const result = new Float32Array(count);
	const slope = header.scl_slope || 1,
		intercept = header.scl_slope ? header.scl_inter : 0;
	for (let i = 0; i < count; i++)
		result[i] =
			format[1](source, header.vox_offset + i * format[0], header.littleEndian) * slope + intercept;
	return result;
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
export function predictIvim(b: number, p: Record<string, number>): number {
	if (Number.isFinite(p['D*']))
		return p.S0 * ((1 - p.f) * Math.exp(-b * p.D) + p.f * Math.exp(-b * p['D*']));
	const threshold = p.bThreshold;
	if (!Number.isFinite(threshold))
		throw new Error('Simplified IVIM curve requires the fitted b threshold.');
	return b > threshold
		? p.S0 * (1 - p.f) * Math.exp(-b * p.D)
		: p.S0 * ((1 - p.f) * Math.exp(-b * p.D) + p.f);
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
