import { windowPixel, type Dataset, type VoxelVolume } from './ivim';
import type { Scan, ScanMetadata } from './imports/scan';
import type { Workspace } from './workspace';
import type { Roi } from './roi';
import type { FitResult } from './analysis';

export type StoredScanSummary = {
	id: string;
	name: string;
	metadata: ScanMetadata;
	dimensions: Dataset['dimensions'];
	bytes: number;
	sha256: string;
	savedAt: string;
	openedAt: string;
	thumbnail: Blob | null;
};
export type SavedRois = { rois: Roi[]; selected: string };
export function validateSavedRois(value: SavedRois, dataset: Dataset): SavedRois {
	const count = dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1);
	if (
		!value ||
		!Array.isArray(value.rois) ||
		value.rois.length > 32 ||
		typeof value.selected !== 'string' ||
		new Set(value.rois.map((r) => r.id)).size !== value.rois.length ||
		value.rois.some(
			(r) =>
				typeof r.id !== 'string' ||
				typeof r.name !== 'string' ||
				r.name.length > 256 ||
				!/^#[0-9a-f]{6}$/i.test(r.color) ||
				!Number.isInteger(r.label) ||
				r.label < 1 ||
				r.label > 65535 ||
				!Array.isArray(r.indices) ||
				r.indices.length > 2_000_000 ||
				r.indices.some((i) => !Number.isInteger(i) || i < 0 || i >= count)
		) ||
		(value.selected && !value.rois.some((r) => r.id === value.selected))
	)
		throw new Error('Saved ROI data does not match this dataset.');
	return value;
}
export function validSavedResult(result: FitResult, dataset: Dataset): boolean {
	const count = dataset.dimensions.slice(0, 3).reduce((a, b) => a * b, 1);
	return (
		!!result &&
		typeof result.id === 'string' &&
		result.report?.dataset?.sha256 === dataset.sha256 &&
		result.report.dataset.dimensions.every((n, i) => n === dataset.dimensions[i]) &&
		['S0', 'D', 'D*', 'f', 'RMSE', 'R2', 'AdjustedR2', 'Valid', 'Status'].every(
			(name) => result.maps?.[name] instanceof Float32Array && result.maps[name].length === count
		)
	);
}
const NAME = 'osipy-local-library';
const STORES = ['datasets', 'catalog', 'views', 'rois', 'results'] as const;
type Store = (typeof STORES)[number];
let connection: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
	if (!connection)
		connection = new Promise((resolve, reject) => {
			if (typeof indexedDB === 'undefined') {
				reject(new Error('This browser does not support local dataset storage.'));
				return;
			}
			const request = indexedDB.open(NAME, 1);
			request.onupgradeneeded = () => {
				for (const store of STORES) request.result.createObjectStore(store);
			};
			request.onerror = () => {
				connection = undefined;
				reject(request.error);
			};
			request.onblocked = () => {
				connection = undefined;
				reject(new Error('Close other OSIPY tabs to open local storage.'));
			};
			request.onsuccess = () => {
				const db = request.result;
				db.onversionchange = () => {
					db.close();
					connection = undefined;
				};
				resolve(db);
			};
		});
	return connection;
}
const requestValue = <T>(request: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
function completed(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = transaction.onabort = () =>
			reject(transaction.error ?? new Error('Local storage transaction failed.'));
	});
}
export function storageError(error: unknown): string {
	return error instanceof DOMException && error.name === 'QuotaExceededError'
		? 'Not enough browser storage. Export a backup and remove an unused dataset, then try again.'
		: error instanceof Error
			? error.message
			: 'Local storage is unavailable. Allow site storage in your browser.';
}
export function validateStoredScan(value: unknown): Scan {
	const scan = value as Scan;
	const d = scan?.dataset;
	const voxel = (v: unknown): v is VoxelVolume =>
		v instanceof Int8Array ||
		v instanceof Uint8Array ||
		v instanceof Int16Array ||
		v instanceof Uint16Array ||
		v instanceof Int32Array ||
		v instanceof Uint32Array ||
		v instanceof Float32Array ||
		v instanceof Float64Array;
	if (
		!scan ||
		typeof scan.id !== 'string' ||
		!d ||
		typeof d.name !== 'string' ||
		!Array.isArray(d.dimensions) ||
		d.dimensions.length !== 4 ||
		!d.dimensions.every((n) => Number.isSafeInteger(n) && n > 0) ||
		!Array.isArray(scan.volumes) ||
		scan.volumes.length !== d.dimensions[3] ||
		!scan.volumes.every(
			(v) => voxel(v) && v.length === d.dimensions[0] * d.dimensions[1] * d.dimensions[2]
		) ||
		scan.volumes.reduce((n, v) => n + v.byteLength, 0) !== d.byteLength ||
		!Number.isFinite(d.slope) ||
		d.slope === 0 ||
		!Number.isFinite(d.intercept) ||
		!Array.isArray(d.bValues) ||
		d.bValues.length !== d.dimensions[3] ||
		!d.bValues.every((v) => Number.isFinite(v) && v >= 0) ||
		!Array.isArray(d.affine) ||
		d.affine.length !== 4 ||
		d.affine.some(
			(r) => !Array.isArray(r) || r.length !== 4 || r.some((v) => !Number.isFinite(v))
		) ||
		!scan.metadata ||
		typeof scan.metadata.subject !== 'string' ||
		typeof scan.metadata.study !== 'string'
	)
		throw new Error('The saved dataset is incomplete or invalid. Reimport the original file.');
	return scan;
}
async function thumbnail(scan: Scan): Promise<Blob | null> {
	const d = scan.dataset,
		[nx, ny, nz] = d.dimensions;
	const scale = 160 / Math.max(nx * d.spacing[0], ny * d.spacing[1]);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(nx * d.spacing[0] * scale));
	canvas.height = Math.max(1, Math.round(ny * d.spacing[1] * scale));
	const context = canvas.getContext('2d');
	if (!context) return null;
	const image = context.createImageData(canvas.width, canvas.height),
		offset = Math.floor(nz / 2) * nx * ny;
	for (let i = 0; i < canvas.width * canvas.height; i++) {
		const x = Math.min(nx - 1, Math.floor((((i % canvas.width) + 0.5) / canvas.width) * nx)),
			y = Math.min(ny - 1, Math.floor(((Math.floor(i / canvas.width) + 0.5) / canvas.height) * ny));
		const value = windowPixel(
			scan.volumes[0][offset + y * nx + x] * d.slope + d.intercept,
			d.window[0],
			d.window[1]
		);
		image.data.set([value, value, value, 255], i * 4);
	}
	context.putImageData(image, 0, 0);
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
export async function listStoredScans(): Promise<StoredScanSummary[]> {
	const db = await database();
	const values = await requestValue<StoredScanSummary[]>(
		db.transaction('catalog').objectStore('catalog').getAll()
	);
	return values.sort((a, b) => (b.openedAt || b.savedAt).localeCompare(a.openedAt || a.savedAt));
}
export async function saveScan(scan: Scan): Promise<void> {
	validateStoredScan(scan);
	const preview = await thumbnail(scan),
		now = new Date().toISOString();
	const clean: Scan = {
		id: scan.id,
		dataset: JSON.parse(JSON.stringify(scan.dataset)),
		metadata: JSON.parse(JSON.stringify(scan.metadata)),
		issues: JSON.parse(JSON.stringify(scan.issues)),
		volumes: [...scan.volumes]
	};
	const summary: StoredScanSummary = {
		id: scan.id,
		name: scan.dataset.name,
		metadata: clean.metadata,
		dimensions: scan.dataset.dimensions,
		bytes: scan.dataset.byteLength,
		sha256: scan.dataset.sha256,
		savedAt: now,
		openedAt: now,
		thumbnail: preview
	};
	const db = await database();
	const tx = db.transaction(['datasets', 'catalog'], 'readwrite');
	const done = completed(tx);
	try {
		tx.objectStore('datasets').put(clean, scan.id);
		tx.objectStore('catalog').put(summary, scan.id);
	} catch (error) {
		tx.abort();
		await done.catch(() => {});
		throw error;
	}
	await done;
}
export async function getStoredScan(id: string): Promise<Scan> {
	const db = await database();
	const tx = db.transaction(['datasets', 'catalog']);
	const [scan, summary] = await Promise.all([
		requestValue(tx.objectStore('datasets').get(id)),
		requestValue(tx.objectStore('catalog').get(id))
	]);
	if (!scan || !summary)
		throw new Error(
			'This dataset is not saved in this browser. Import it from your device to open it.'
		);
	return validateStoredScan({ ...scan, metadata: summary.metadata });
}
export async function updateStoredMetadata(id: string, metadata: ScanMetadata): Promise<void> {
	const db = await database();
	const tx = db.transaction('catalog', 'readwrite');
	const done = completed(tx);
	const request = tx.objectStore('catalog').get(id);
	request.onsuccess = () => {
		if (request.result)
			tx.objectStore('catalog').put(
				{ ...request.result, metadata: JSON.parse(JSON.stringify(metadata)) },
				id
			);
	};
	await done;
}
export async function deleteStoredScan(id: string): Promise<void> {
	const db = await database();
	const tx = db.transaction([...STORES], 'readwrite');
	const done = completed(tx);
	for (const store of STORES) tx.objectStore(store).delete(id);
	await done;
}
async function read<T>(store: Store, id: string): Promise<T | undefined> {
	const db = await database();
	return requestValue(db.transaction(store).objectStore(store).get(id));
}
async function write(store: Store, id: string, value: unknown): Promise<void> {
	const db = await database();
	const tx = db.transaction(['catalog', store], 'readwrite');
	const done = completed(tx);
	const check = tx.objectStore('catalog').get(id);
	check.onsuccess = () => {
		if (check.result) tx.objectStore(store).put(value, id);
	};
	await done;
}
export const readSavedWorkspace = (id: string) => read<Workspace>('views', id);
export const saveWorkspace = (id: string, value: Workspace) => write('views', id, value);
export const readSavedRois = (id: string) => read<SavedRois>('rois', id);
export const saveRois = (id: string, value: SavedRois) => write('rois', id, value);
export const readSavedResult = (id: string) => read<FitResult>('results', id);
export const saveResult = (id: string, value: FitResult) => write('results', id, value);
