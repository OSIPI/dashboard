export const PYODIDE_VERSION = '0.27.7';
export const OSIPY_VERSION = '0.1.4';
export const MAX_INPUT_TEXT_LENGTH = 4096;

export const IVIM_MODELS = ['biexponential', 'simplified'] as const;
export const IVIM_METHODS = ['segmented', 'full', 'bayesian'] as const;

export type IvimModel = (typeof IVIM_MODELS)[number];
export type IvimMethod = (typeof IVIM_METHODS)[number];

export type BrowserIvimRequest = {
	model: IvimModel;
	method: IvimMethod;
	bThreshold: number;
	bValues: number[];
	signal: number[];
};

export type BrowserIvimResult = {
	osipyVersion: string;
	pyodideVersion: string;
	pythonVersion: string;
	model: IvimModel;
	method: IvimMethod;
	effectiveBThreshold: number;
	modelCutoff: number | null;
	params: { d: number; f: number; s0: number; dStar?: number };
	rSquared: number | null;
	fitAttempted: boolean;
	passesRestQualityPolicy: boolean;
	fittedCurve: number[];
	computeMs: number;
};

export type BrowserIvimWorkerResponse =
	| { jobId: number; phase: 'ready' }
	| { jobId: number; phase: 'result'; result: BrowserIvimResult }
	| { jobId: number; phase: 'error'; error: string };

export const SYNTHETIC_B_VALUES = [0, 0, 10, 50, 100, 200, 400, 800];
export const SYNTHETIC_SIGNAL = SYNTHETIC_B_VALUES.map(
	(b) => 1000 * ((1 - 0.16) * Math.exp(-b * 0.0011) + 0.16 * Math.exp(-b * 0.018))
);

const finiteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

export function parseNumberArray(text: string, label: string): number[] {
	if (text.length > MAX_INPUT_TEXT_LENGTH)
		throw new Error(`${label} must be at most ${MAX_INPUT_TEXT_LENGTH} characters.`);
	const parts = text
		.trim()
		.split(/[\s,]+/)
		.filter(Boolean);
	if (!parts.length) throw new Error(`${label} is required.`);
	const values = parts.map(Number);
	if (!values.every(finiteNumber)) throw new Error(`${label} must contain only finite numbers.`);
	return values;
}

export function validateBrowserIvimRequest(value: BrowserIvimRequest): BrowserIvimRequest {
	if (!IVIM_MODELS.includes(value.model)) throw new Error('Choose a supported IVIM model.');
	if (!IVIM_METHODS.includes(value.method)) throw new Error('Choose a supported fitting method.');
	if (value.bValues.length !== value.signal.length)
		throw new Error('b-values and signal must contain the same number of samples.');
	if (value.bValues.length < 4 || value.bValues.length > 64)
		throw new Error('Use between 4 and 64 samples. Repeated b-values are retained.');
	if (!value.bValues.every((item) => finiteNumber(item) && item >= 0 && item <= 10_000))
		throw new Error('Each b-value must be finite and between 0 and 10,000 s/mm².');
	if (!value.signal.every((item) => finiteNumber(item) && item > 0 && item <= 1_000_000_000))
		throw new Error('Each signal value must be finite, positive, and at most 1e9.');
	if (!finiteNumber(value.bThreshold) || value.bThreshold < 0 || value.bThreshold > 10_000)
		throw new Error('The b-value threshold must be between 0 and 10,000 s/mm².');
	const thresholdUsed =
		value.method === 'segmented' ||
		value.method === 'bayesian' ||
		(value.model === 'simplified' && value.method !== 'full');
	if (
		thresholdUsed &&
		(!value.bValues.some((item) => item < value.bThreshold) ||
			!value.bValues.some((item) => item >= value.bThreshold))
	)
		throw new Error('The threshold must split the b-values into a low and a high group.');
	return value;
}

export function validateBrowserIvimResult(value: unknown, sampleCount: number): BrowserIvimResult {
	if (!value || typeof value !== 'object') throw new Error('The worker returned no result.');
	const result = value as Partial<BrowserIvimResult>;
	if (result.osipyVersion !== OSIPY_VERSION)
		throw new Error(`Expected OSIPY ${OSIPY_VERSION}, received ${String(result.osipyVersion)}.`);
	if (result.pyodideVersion !== PYODIDE_VERSION)
		throw new Error(
			`Expected Pyodide ${PYODIDE_VERSION}, received ${String(result.pyodideVersion)}.`
		);
	if (
		!IVIM_MODELS.includes(result.model as IvimModel) ||
		!IVIM_METHODS.includes(result.method as IvimMethod)
	)
		throw new Error('The worker returned unsupported fit metadata.');
	if (!result.params || ![result.params.d, result.params.f, result.params.s0].every(finiteNumber))
		throw new Error('The worker returned invalid fitted parameters.');
	if (result.params.dStar !== undefined && !finiteNumber(result.params.dStar))
		throw new Error('The worker returned an invalid D* estimate.');
	if (result.rSquared !== null && !finiteNumber(result.rSquared))
		throw new Error('The worker returned an invalid R² value.');
	if (
		!Array.isArray(result.fittedCurve) ||
		result.fittedCurve.length !== sampleCount ||
		!result.fittedCurve.every(finiteNumber)
	)
		throw new Error('The worker returned an invalid fitted curve.');
	if (!finiteNumber(result.effectiveBThreshold) || !finiteNumber(result.computeMs))
		throw new Error('The worker returned invalid provenance.');
	if (
		typeof result.fitAttempted !== 'boolean' ||
		typeof result.passesRestQualityPolicy !== 'boolean'
	)
		throw new Error('The worker returned invalid quality status.');
	return result as BrowserIvimResult;
}

export function isCurrentBrowserIvimJob(responseJobId: number, activeJobId: number): boolean {
	return Number.isSafeInteger(responseJobId) && responseJobId === activeJobId;
}
