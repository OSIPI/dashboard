import { Inflate } from 'fflate';

export const ZENODO_DEMO_URL =
	'https://zenodo.org/api/records/14605039/files/OSIPI_TF24_data_phantoms.zip/content';
export const ZENODO_DEMO_ARCHIVE_BYTES = 245_080_480;
// Derived from the pinned Zenodo archive after its published MD5 was verified.
export const ZENODO_DEMO_ARCHIVE_SHA256 =
	'2a53054d6e6e76335c9fcdae245e6003460db014e88147b6030d9de4dd650b3e';
export const DEMO_MEMBERS = [
	'Data/brain.nii.gz',
	'Data/brain.bval',
	'Data/brain.bvec',
	'Data/brain_readme.txt'
] as const;

export type DemoProgress = {
	phase: 'download' | 'validate' | 'extract';
	received?: number;
	total?: number;
};
export type DemoZipLimits = {
	maximumEntries: number;
	maximumTotalBytes: number;
	maximumMemberBytes: number;
};
export const DEMO_ZIP_LIMITS: DemoZipLimits = {
	maximumEntries: 512,
	maximumTotalBytes: 512 * 1024 * 1024,
	maximumMemberBytes: 128 * 1024 * 1024
};

export class DemoImportError extends Error {}
type ZipEntry = {
	name: string;
	flags: number;
	compression: number;
	crc: number;
	compressedSize: number;
	uncompressedSize: number;
	localOffset: number;
};

const fail = (message: string): never => {
	throw new DemoImportError(message);
};
const digest = async (buffer: ArrayBuffer) =>
	Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
const readName = (bytes: Uint8Array) => {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return fail('ZIP contains a filename that is not valid UTF-8.');
	}
};
const safeName = (name: string) => {
	const parts = name.split('/');
	if (
		!name ||
		name.length > 512 ||
		name.startsWith('/') ||
		name.includes('\\') ||
		name.includes('\0') ||
		parts.some((part, index) =>
			index === parts.length - 1 && !part ? false : !part || part === '.' || part === '..'
		)
	)
		fail('ZIP contains an unsafe entry name.');
};

/** Validates the archive directory before any member is decompressed. */
export function validateDemoZip(
	archive: ArrayBuffer,
	limits: DemoZipLimits = DEMO_ZIP_LIMITS
): Map<string, ZipEntry> {
	const bytes = new Uint8Array(archive);
	if (bytes.byteLength < 22) fail('ZIP archive is truncated.');
	const view = new DataView(archive);
	let end = -1;
	for (
		let offset = bytes.byteLength - 22;
		offset >= Math.max(0, bytes.byteLength - 65_557);
		offset--
	) {
		if (view.getUint32(offset, true) === 0x06054b50) {
			end = offset;
			break;
		}
	}
	if (end < 0 || end + 22 + view.getUint16(end + 20, true) !== bytes.byteLength)
		fail('ZIP archive is truncated or has an invalid directory.');
	if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
		fail('Multi-disk ZIP archives are not supported.');
	const entries = view.getUint16(end + 10, true);
	const directoryBytes = view.getUint32(end + 12, true);
	const directoryOffset = view.getUint32(end + 16, true);
	if (
		entries > limits.maximumEntries ||
		directoryOffset + directoryBytes > end ||
		directoryOffset > end
	)
		fail('ZIP archive exceeds entry limits or has an invalid directory.');
	const result = new Map<string, ZipEntry>();
	let offset = directoryOffset;
	let total = 0;
	for (let index = 0; index < entries; index++) {
		if (
			offset + 46 > directoryOffset + directoryBytes ||
			view.getUint32(offset, true) !== 0x02014b50
		)
			fail('ZIP archive has an invalid entry directory.');
		const flags = view.getUint16(offset + 8, true);
		const compression = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const uncompressedSize = view.getUint32(offset + 24, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const next = offset + 46 + nameLength + extraLength + commentLength;
		if (next > directoryOffset + directoryBytes) fail('ZIP archive has a truncated entry name.');
		const name = readName(bytes.subarray(offset + 46, offset + 46 + nameLength));
		safeName(name);
		if (
			flags & 0x9 ||
			![0, 8].includes(compression) ||
			compressedSize === 0xffffffff ||
			uncompressedSize === 0xffffffff ||
			localOffset === 0xffffffff ||
			localOffset >= directoryOffset
		)
			fail('ZIP contains an unsupported encrypted, streamed, ZIP64, or compressed entry.');
		if (result.has(name)) fail('ZIP contains duplicate entry names.');
		total += uncompressedSize;
		if (!Number.isSafeInteger(total) || total > limits.maximumTotalBytes)
			fail('ZIP entries exceed the safe extraction limit.');
		result.set(name, {
			name,
			flags,
			compression,
			crc: view.getUint32(offset + 16, true),
			compressedSize,
			uncompressedSize,
			localOffset
		});
		offset = next;
	}
	if (offset !== directoryOffset + directoryBytes) fail('ZIP archive directory has trailing data.');
	for (const member of DEMO_MEMBERS) {
		const entry = result.get(member);
		if (!entry) {
			throw new DemoImportError(`ZIP is missing required member ${member}.`);
		}
		if (entry.name.endsWith('/')) fail(`ZIP is missing required member ${member}.`);
		if (entry.uncompressedSize > limits.maximumMemberBytes)
			fail(`ZIP member ${member} exceeds the safe extraction limit.`);
	}
	return result;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
	let value = 0xffffffff;
	for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
	return (value ^ 0xffffffff) >>> 0;
};
const inflateBounded = (input: Uint8Array, maximum: number) => {
	const chunks: Uint8Array[] = [];
	let length = 0;
	const inflate = new Inflate();
	inflate.ondata = (chunk) => {
		length += chunk.byteLength;
		if (length > maximum) fail('ZIP member exceeds the safe extraction limit.');
		chunks.push(chunk);
	};
	inflate.push(input, true);
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
};

/** Extracts exactly the four public demo members, never the rest of the archive. */
export function extractDemoMembers(
	archive: ArrayBuffer,
	limits: DemoZipLimits = DEMO_ZIP_LIMITS
): Record<(typeof DEMO_MEMBERS)[number], Uint8Array> {
	const entries = validateDemoZip(archive, limits);
	const bytes = new Uint8Array(archive);
	const view = new DataView(archive);
	const members = {} as Record<(typeof DEMO_MEMBERS)[number], Uint8Array>;
	for (const name of DEMO_MEMBERS) {
		const entry = entries.get(name)!;
		const header = entry.localOffset;
		if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== 0x04034b50)
			fail(`ZIP member ${name} has an invalid local header.`);
		const flags = view.getUint16(header + 6, true);
		const compression = view.getUint16(header + 8, true);
		const nameLength = view.getUint16(header + 26, true);
		const extraLength = view.getUint16(header + 28, true);
		const dataOffset = header + 30 + nameLength + extraLength;
		if (
			flags !== entry.flags ||
			compression !== entry.compression ||
			readName(bytes.subarray(header + 30, header + 30 + nameLength)) !== name ||
			dataOffset + entry.compressedSize > bytes.byteLength
		)
			fail(`ZIP member ${name} does not match its directory entry.`);
		const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
		const data =
			compression === 0
				? new Uint8Array(compressed)
				: inflateBounded(compressed, Math.min(limits.maximumMemberBytes, entry.uncompressedSize));
		if (data.byteLength !== entry.uncompressedSize || crc32(data) !== entry.crc)
			fail(`ZIP member ${name} is corrupt.`);
		members[name] = data;
	}
	if (members['Data/brain_readme.txt'].byteLength > 64 * 1024)
		fail('Demo readme exceeds the safe limit.');
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(members['Data/brain_readme.txt']);
	} catch {
		fail('Demo readme is not valid UTF-8.');
	}
	return members;
}

export async function readBoundedResponse(
	response: Response,
	expectedBytes: number,
	onProgress: (received: number) => void = () => {}
): Promise<ArrayBuffer> {
	if (!response.ok) fail(`Zenodo demo download failed (HTTP ${response.status}).`);
	const declared = response.headers.get('content-length');
	if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== expectedBytes))
		fail('Zenodo demo download has an unexpected archive size.');
	const reader = response.body?.getReader();
	if (!reader) throw new DemoImportError('Zenodo demo download has no readable response body.');
	const result = new Uint8Array(expectedBytes);
	let received = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (received + value.byteLength > expectedBytes)
				fail('Zenodo demo download exceeds the archive size limit.');
			result.set(value, received);
			received += value.byteLength;
			onProgress(received);
		}
	} finally {
		reader.releaseLock();
	}
	if (received !== expectedBytes) fail('Zenodo demo download was truncated.');
	return result.buffer;
}

export async function downloadZenodoDemo(
	signal?: AbortSignal,
	onProgress: (progress: DemoProgress) => void = () => {},
	fetcher: typeof fetch = fetch
): Promise<ArrayBuffer> {
	onProgress({ phase: 'download', received: 0, total: ZENODO_DEMO_ARCHIVE_BYTES });
	const response = await fetcher(ZENODO_DEMO_URL, {
		mode: 'cors',
		credentials: 'omit',
		referrerPolicy: 'no-referrer',
		redirect: 'follow',
		signal
	});
	const archive = await readBoundedResponse(response, ZENODO_DEMO_ARCHIVE_BYTES, (received) =>
		onProgress({ phase: 'download', received, total: ZENODO_DEMO_ARCHIVE_BYTES })
	);
	onProgress({ phase: 'validate' });
	validateDemoZip(archive);
	if ((await digest(archive)) !== ZENODO_DEMO_ARCHIVE_SHA256)
		fail('Zenodo demo archive checksum did not match the pinned public record.');
	return archive;
}
