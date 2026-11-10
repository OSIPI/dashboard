import { describe, expect, test } from 'bun:test';
import fixture from './fixtures/browser-ivim-native.json';
import {
	OSIPY_VERSION,
	PYODIDE_VERSION,
	MAX_INPUT_TEXT_LENGTH,
	SYNTHETIC_SIGNAL,
	isCurrentBrowserIvimJob,
	parseNumberArray,
	validateBrowserIvimRequest,
	validateBrowserIvimResult,
	type BrowserIvimResult
} from '../src/lib/browser-ivim';

const validRequest = {
	model: 'biexponential' as const,
	method: 'segmented' as const,
	bThreshold: 200,
	bValues: fixture.input.bValues,
	signal: fixture.input.signal
};

const validResult: BrowserIvimResult = {
	...fixture.combinations[0],
	osipyVersion: OSIPY_VERSION,
	pyodideVersion: PYODIDE_VERSION,
	pythonVersion: '3.12.7',
	model: 'biexponential',
	method: 'segmented',
	modelCutoff: null,
	fitAttempted: true,
	passesRestQualityPolicy: true,
	fittedCurve: fixture.input.signal,
	computeMs: 12.5
};

describe('browser IVIM input validation', () => {
	test('retains repeated b-values and parses comma or whitespace separated values', () => {
		expect(parseNumberArray('0, 0 10\n50', 'b-values')).toEqual([0, 0, 10, 50]);
		expect(validateBrowserIvimRequest(validRequest)).toEqual(validRequest);
		expect(SYNTHETIC_SIGNAL).toEqual(fixture.input.signal);
	});

	test('rejects mismatched, non-finite, unbounded, and unsplit inputs', () => {
		expect(() => validateBrowserIvimRequest({ ...validRequest, signal: [1, 2, 3, 4] })).toThrow(
			'same number'
		);
		expect(() => parseNumberArray('0, nope, 10', 'b-values')).toThrow('finite');
		expect(() => parseNumberArray('1'.repeat(MAX_INPUT_TEXT_LENGTH + 1), 'Signal')).toThrow(
			'at most'
		);
		expect(() =>
			validateBrowserIvimRequest({ ...validRequest, signal: validRequest.signal.with(0, 0) })
		).toThrow('positive');
		expect(() => validateBrowserIvimRequest({ ...validRequest, bThreshold: 900 })).toThrow(
			'must split'
		);
	});

	test('full fitting accepts an ignored threshold while other methods require a split', () => {
		expect(
			validateBrowserIvimRequest({ ...validRequest, method: 'full', bThreshold: 900 })
		).toBeTruthy();
	});
});

describe('browser IVIM worker output boundary', () => {
	test('accepts a pinned, finite result and rejects malformed output', () => {
		expect(validateBrowserIvimResult(validResult, fixture.input.signal.length)).toEqual(
			validResult
		);
		expect(() =>
			validateBrowserIvimResult(
				{ ...validResult, osipyVersion: '0.1.5' },
				fixture.input.signal.length
			)
		).toThrow('Expected OSIPY');
		expect(() =>
			validateBrowserIvimResult(
				{ ...validResult, params: { ...validResult.params, d: Number.NaN } },
				fixture.input.signal.length
			)
		).toThrow('invalid fitted parameters');
		expect(() => validateBrowserIvimResult({ ...validResult, fittedCurve: [] }, 8)).toThrow(
			'invalid fitted curve'
		);
	});

	test('drops stale and malformed job identifiers', () => {
		expect(isCurrentBrowserIvimJob(4, 4)).toBe(true);
		expect(isCurrentBrowserIvimJob(3, 4)).toBe(false);
		expect(isCurrentBrowserIvimJob(Number.NaN, Number.NaN)).toBe(false);
	});
});

test('native fixture covers only all six advertised model/strategy combinations', () => {
	expect(fixture.osipyVersion).toBe(OSIPY_VERSION);
	expect(fixture.combinations.map(({ model, method }) => `${model}/${method}`).sort()).toEqual(
		[
			'biexponential/bayesian',
			'biexponential/full',
			'biexponential/segmented',
			'simplified/bayesian',
			'simplified/full',
			'simplified/segmented'
		].sort()
	);
});
