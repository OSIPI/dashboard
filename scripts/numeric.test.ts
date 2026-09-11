import { expect, test } from 'bun:test';
import { boundedNumber } from '../src/lib/numeric';

test('precision edits retain invalid values, clamp bounds and respect discrete steps', () => {
	for (const raw of ['', ' ', 'NaN', 'Infinity', '-Infinity', 'bad']) {
		expect(boundedNumber(raw, 29, 1, 56, 1)).toBe(29);
	}
	expect(boundedNumber('-10', 29, 1, 56, 1)).toBe(1);
	expect(boundedNumber('1e6', 29, 1, 56, 1)).toBe(56);
	expect(boundedNumber('2.7', 1, 1, 85, 1)).toBe(3);
	expect(boundedNumber('1.26', 1, 1, 4, 0.1)).toBe(1.3);
	expect(boundedNumber('1.2000000000000002', 1, 1, 4, 0.1)).toBe(1.2);
	expect(boundedNumber('227622', 500, 0, 227621.08675, 1)).toBe(227621.08675);
});
