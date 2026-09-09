export const SIZE = 96;
export const SLICES = 32;
export const B_VALUES = [0, 10, 20, 50, 100, 200, 400, 600, 800] as const;

export type Parameters = { s0: number; f: number; d: number; dStar: number; region: string };

export function signal(b: number, p: Parameters): number {
	return p.s0 * ((1 - p.f) * Math.exp(-b * p.d) + p.f * Math.exp(-b * p.dStar));
}

// A geometric phantom, not an anatomical model. Coordinates and parameters are deterministic.
export function parametersAt(x: number, y: number, z: number): Parameters {
	const nx = (x - 47.5) / 39;
	const ny = (y - 47.5) / 42;
	const nz = (z - 15.5) / 20;
	const r = nx * nx + ny * ny + nz * nz;
	if (r > 1) return { s0: 0, f: 0, d: 0, dStar: 0, region: 'Background' };
	if (((nx + 0.32) / 0.28) ** 2 + ((ny + 0.1) / 0.35) ** 2 + (nz / 0.8) ** 2 < 1)
		return { s0: 1000, f: 0.24, d: 0.0012, dStar: 0.025, region: 'High-fraction insert' };
	if (((nx - 0.34) / 0.23) ** 2 + ((ny - 0.14) / 0.3) ** 2 + (nz / 0.7) ** 2 < 1)
		return { s0: 850, f: 0.06, d: 0.0007, dStar: 0.012, region: 'Low-diffusion insert' };
	if (r > 0.83) return { s0: 650, f: 0.08, d: 0.0016, dStar: 0.018, region: 'Outer shell' };
	return {
		s0: 900 + 45 * Math.cos(nx * 12) * Math.sin(ny * 10) * Math.cos(nz * 3),
		f: 0.14,
		d: 0.001,
		dStar: 0.02,
		region: 'Phantom matrix'
	};
}

export function voxelIndex(x: number, y: number, z: number): number {
	return z * SIZE * SIZE + y * SIZE + x;
}

export function createVolumes(): Float32Array[] {
	const volumes = B_VALUES.map(() => new Float32Array(SIZE * SIZE * SLICES));
	for (let z = 0; z < SLICES; z++) {
		for (let y = 0; y < SIZE; y++) {
			for (let x = 0; x < SIZE; x++) {
				const p = parametersAt(x, y, z);
				const index = voxelIndex(x, y, z);
				B_VALUES.forEach((b, i) => (volumes[i][index] = signal(b, p)));
			}
		}
	}
	return volumes;
}

export function windowPixel(value: number, center: number, width: number): number {
	return Math.round(Math.max(0, Math.min(1, (value - (center - width / 2)) / width)) * 255);
}

export type Bookmark = { id: string; b: number; z: number; x: number; y: number; note: string };
export const BOOKMARK_KEY = 'osipy.synthetic-ivim.bookmarks.v1';

export function parseBookmarks(raw: string): Bookmark[] {
	const value: unknown = JSON.parse(raw);
	if (!Array.isArray(value)) throw new Error('Invalid saved views');
	const ids = new Set<string>();
	return value.slice(0, 30).map((item: unknown) => {
		if (!item || typeof item !== 'object') throw new Error('Invalid saved view');
		const b = item as Bookmark;
		if (
			typeof b.id !== 'string' ||
			b.id.length > 100 ||
			ids.has(b.id) ||
			typeof b.note !== 'string' ||
			b.note.length > 240 ||
			![b.b, b.z, b.x, b.y].every(Number.isInteger) ||
			b.b < 0 ||
			b.b >= B_VALUES.length ||
			b.z < 0 ||
			b.z >= SLICES ||
			b.x < 0 ||
			b.x >= SIZE ||
			b.y < 0 ||
			b.y >= SIZE
		)
			throw new Error('Invalid saved view');
		ids.add(b.id);
		return { id: b.id, b: b.b, z: b.z, x: b.x, y: b.y, note: b.note };
	});
}
