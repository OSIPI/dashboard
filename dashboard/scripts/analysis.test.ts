import { expect, test } from 'bun:test';
import { companionUrl, predictIvim, overlayColor, parseFitResult } from '../src/lib/analysis';

test('companion URLs are loopback-only and fitted signal is not an acquisition interpolation', () => {
	expect(companionUrl('http://localhost:60016')).toBe('http://localhost:60016');
	for (const url of [
		'https://example.com',
		'http://localhost:60016/path',
		'http://user@127.0.0.1',
		'http://127.0.0.1?token=x'
	])
		expect(() => companionUrl(url)).toThrow();
	const p = { S0: 1000, D: 0.001, 'D*': 0.02, f: 0.2 };
	expect(predictIvim(0, p)).toBe(1000);
	expect(predictIvim(100, p)).toBeCloseTo(1000 * (0.8 * Math.exp(-0.1) + 0.2 * Math.exp(-2)));
	expect(overlayColor(0, 0, 1)).toEqual([68, 1, 84]);
	expect(overlayColor(1, 0, 1)).toEqual([253, 231, 37]);
	expect(() => parseFitResult('run', new ArrayBuffer(2), 'a'.repeat(64))).toThrow();
});
