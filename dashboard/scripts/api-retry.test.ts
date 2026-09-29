import { expect, test } from 'bun:test';
import { retryUntilConnected } from '../src/lib/api-retry';

test('retries at the interval and stops after connecting', async () => {
	let attempts = 0;
	let connected = false;
	const stop = retryUntilConnected(
		() => connected,
		() => true,
		async () => {
			attempts++;
			if (attempts === 2) connected = true;
		},
		10
	);
	try {
		await Bun.sleep(80);
		expect(attempts).toBe(2);
	} finally {
		stop();
	}
});

test('waits for authorization and cancels pending retries on teardown', async () => {
	let allowed = false;
	let attempts = 0;
	const stop = retryUntilConnected(
		() => false,
		() => allowed,
		async () => {
			attempts++;
		},
		10
	);
	try {
		await Bun.sleep(35);
		expect(attempts).toBe(0);
		allowed = true;
		await Bun.sleep(35);
		expect(attempts).toBeGreaterThan(0);
		stop();
		const atStop = attempts;
		await Bun.sleep(35);
		expect(attempts).toBe(atStop);
	} finally {
		stop();
	}
});
