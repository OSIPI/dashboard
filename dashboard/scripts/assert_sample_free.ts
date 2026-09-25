import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	closeSync,
	lstatSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readSync,
	rmSync
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const forbiddenSha256 = new Set([
	// Prepared Zenodo 14605039 Data/brain.nii.gz samples.
	'8283e28d967d41eec33f037498a7e39701b3f6b18b5f4893e9824dd2bc1f4380',
	// Original compressed brain image and the complete pinned Zenodo archive.
	'ac5f4fe64c5a0eff772dec4da8a2395dd778943106bc853456fddb85534452b0',
	'2a53054d6e6e76335c9fcdae245e6003460db014e88147b6030d9de4dd650b3e'
]);
const forbiddenNames = new Set(['signal.i16', 'brain.nii.gz', 'OSIPI_TF24_data_phantoms.zip']);

function forbiddenPath(path: string) {
	const parts = path.replaceAll('\\', '/').replace(/^\.\//, '').split('/').filter(Boolean);
	return parts.includes('datasets') || parts.some((part) => forbiddenNames.has(part));
}

function sha256(path: string) {
	const hash = createHash('sha256');
	const fd = openSync(path, 'r');
	try {
		const buffer = Buffer.alloc(1024 * 1024);
		let length = 0;
		while ((length = readSync(fd, buffer, 0, buffer.length, null)))
			hash.update(buffer.subarray(0, length));
		return hash.digest('hex');
	} finally {
		closeSync(fd);
	}
}

export function assertSampleFreeDirectory(root: string, digests = forbiddenSha256) {
	const absolute = resolve(root);
	const visit = (directory: string) => {
		for (const name of readdirSync(directory)) {
			const path = join(directory, name);
			const stat = lstatSync(path);
			const display = relative(absolute, path).split(sep).join('/');
			if (stat.isDirectory()) visit(path);
			else if (!stat.isFile()) throw new Error(`Non-regular publication input: ${display}`);
			else if (forbiddenPath(display) || digests.has(sha256(path)))
				throw new Error(`MRI sample data is forbidden in published artifacts: ${display}`);
		}
	};
	visit(absolute);
}

export function assertSampleFreeArchive(path: string, digests = forbiddenSha256) {
	const directory = mkdtempSync(join(tmpdir(), 'dashboard-archive-scan-'));
	const unpacked = join(directory, 'archive.tar');
	try {
		const output = openSync(unpacked, 'w');
		try {
			execFileSync('gzip', ['-dc', path], { stdio: ['ignore', output, 'pipe'] });
		} finally {
			closeSync(output);
		}
		const fd = openSync(unpacked, 'r');
		const header = Buffer.alloc(512);
		try {
			let offset = 0;
			while (readSync(fd, header, 0, header.length, offset) === header.length) {
				if (header.every((byte) => byte === 0)) break;
				const text = (start: number, length: number) =>
					header
						.subarray(start, start + length)
						.toString()
						.replace(/\0.*$/, '');
				const name = [text(345, 155), text(0, 100)].filter(Boolean).join('/');
				const size = Number.parseInt(text(124, 12).trim() || '0', 8);
				if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid release archive');
				const normalized = name.replace(/^\.\//, '');
				if (normalized.startsWith('/') || normalized.split('/').includes('..'))
					throw new Error(`Unsafe release archive entry: ${name}`);
				if (forbiddenPath(normalized))
					throw new Error(`MRI sample data is forbidden in published artifacts: ${name}`);
				if (text(156, 1) === '' || text(156, 1) === '0') {
					const hash = createHash('sha256');
					const buffer = Buffer.alloc(1024 * 1024);
					let remaining = size;
					let position = offset + 512;
					while (remaining) {
						const length = readSync(fd, buffer, 0, Math.min(buffer.length, remaining), position);
						if (!length) throw new Error('Truncated release archive');
						hash.update(buffer.subarray(0, length));
						position += length;
						remaining -= length;
					}
					if (digests.has(hash.digest('hex')))
						throw new Error(`MRI sample data is forbidden in published artifacts: ${name}`);
				}
				offset += 512 + Math.ceil(size / 512) * 512;
			}
		} finally {
			closeSync(fd);
		}
	} finally {
		rmSync(directory, { recursive: true });
	}
}

if (import.meta.main) {
	try {
		if (process.argv.length < 3)
			throw new Error('Usage: bun scripts/assert_sample_free.ts PATH...');
		for (const path of process.argv.slice(2)) {
			if (basename(path).endsWith('.tar.gz')) assertSampleFreeArchive(path);
			else assertSampleFreeDirectory(path);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
