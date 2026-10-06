// Deliberately tiny geometric data for import verification; no patient data or viewing fallback.
export function niftiFixture({
	littleEndian = true,
	float = true,
	translation = 0,
	slope = 2
} = {}): ArrayBuffer {
	const bytes = float ? 4 : 2;
	const buffer = new ArrayBuffer(352 + 36 * bytes);
	const view = new DataView(buffer);
	view.setInt32(0, 348, littleEndian);
	[4, 3, 2, 2, 3, 1, 1, 1].forEach((d, i) => view.setInt16(40 + i * 2, d, littleEndian));
	view.setInt16(70, float ? 16 : 4, littleEndian);
	view.setInt16(72, bytes * 8, littleEndian);
	[1, 2, 3, 4, 1, 1, 1, 1].forEach((d, i) => view.setFloat32(76 + i * 4, d, littleEndian));
	view.setFloat32(108, 352, littleEndian);
	view.setFloat32(112, slope, littleEndian);
	view.setFloat32(116, -3, littleEndian);
	view.setUint8(123, 2);
	view.setInt16(254, 1, littleEndian);
	[
		[2, 0, 0, translation],
		[0, 3, 0, 0],
		[0, 0, 4, 0]
	]
		.flat()
		.forEach((d, i) => view.setFloat32(280 + i * 4, d, littleEndian));
	new Uint8Array(buffer).set([110, 43, 49, 0], 344);
	for (let i = 0; i < 36; i++) {
		if (float) view.setFloat32(352 + i * bytes, i / 10 + 0.125, littleEndian);
		else view.setInt16(352 + i * bytes, i - 10, littleEndian);
	}
	return buffer;
}

export function dicomFixture(series = '1.2.3.4'): Uint8Array {
	const encode = (group: number, element: number, vr: string, value: string) => {
		const text = new TextEncoder().encode(
			value + (value.length % 2 ? (vr === 'UI' ? '\0' : ' ') : '')
		);
		const bytes = new Uint8Array(8 + text.length),
			view = new DataView(bytes.buffer);
		view.setUint16(0, group, true);
		view.setUint16(2, element, true);
		bytes.set(new TextEncoder().encode(vr), 4);
		view.setUint16(6, text.length, true);
		bytes.set(text, 8);
		return bytes;
	};
	const syntax = encode(2, 16, 'UI', '1.2.840.10008.1.2.1');
	const groupLength = new Uint8Array(12),
		lengthView = new DataView(groupLength.buffer);
	lengthView.setUint16(0, 2, true);
	groupLength.set([85, 76], 4);
	lengthView.setUint16(6, 4, true);
	lengthView.setUint32(8, syntax.length, true);
	const tags = [
		groupLength,
		syntax,
		encode(8, 32, 'DA', '20260102'),
		encode(8, 96, 'CS', 'MR'),
		encode(8, 4158, 'LO', 'Diffusion series'),
		encode(16, 32, 'LO', 'TEST-SUBJECT'),
		encode(32, 13, 'UI', '1.2.3'),
		encode(32, 14, 'UI', series),
		encode(32, 82, 'UI', '1.2.3.99')
	];
	const result = new Uint8Array(132 + tags.reduce((n, t) => n + t.length, 0));
	result.set([68, 73, 67, 77], 128);
	let offset = 132;
	for (const tag of tags) {
		result.set(tag, offset);
		offset += tag.length;
	}
	return result;
}
