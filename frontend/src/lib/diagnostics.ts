// Diagnostics are an allowlist, not a redactor. Never pass patient metadata,
// filenames, URLs, hashes, input values, exception messages or stacks here.
const events = [
	'session.start',
	'session.stop',
	'session.clear',
	'session.pause',
	'session.resume',
	'session.export',
	'navigation',
	'interaction',
	'runtime.error',
	'resources',
	'operation.start',
	'operation.stage',
	'operation.end',
	'analysis.state',
	'dataset.active'
] as const;
type Event = (typeof events)[number];
const tokens = [
	'click',
	'change',
	'pointerup',
	'wheel',
	'button',
	'a',
	'input',
	'select',
	'textarea',
	'canvas',
	'summary',
	'other',
	'abort',
	'type',
	'range',
	'validation',
	'error',
	'import',
	'discovery',
	'demo',
	'api',
	'browser-fit',
	'bundle',
	'library',
	'success',
	'failed',
	'cancelled',
	'rejected',
	'read',
	'sidecars',
	'decode',
	'ready',
	'upload',
	'submit',
	'poll',
	'maps',
	'voxel',
	'connect',
	'release',
	'cancel',
	'nifti',
	'gzip',
	'dicom',
	'unknown',
	'home',
	'viewer',
	'nifti-page',
	'browser-ivim',
	'about',
	'blog',
	'register',
	'voxel-scope',
	'roi',
	'dataset',
	'pending',
	'running',
	'cancelling',
	'completed',
	'biexponential',
	'simplified',
	'segmented',
	'full',
	'bayesian',
	'local',
	'browser',
	'visible',
	'hidden',
	'scans',
	'theme',
	'diagnostics',
	'download',
	'clear',
	'pause',
	'resume',
	'scan-select',
	'scan-remove',
	'workspace',
	'roi-edit',
	'view',
	'export',
	'quota',
	'security',
	'storage',
	'analysis',
	'series',
	'controls',
	'signal',
	'bookmarks',
	'uint8',
	'int8',
	'int16',
	'uint16',
	'int32',
	'uint32',
	'float32',
	'float64',
	'int16-le',
	'uint8-le',
	'int8-le',
	'uint16-le',
	'int32-le',
	'uint32-le',
	'float32-le',
	'float64-le',
	'size-limit',
	'datatype',
	'geometry',
	'bvalues',
	'bvectors',
	'payload',
	'format',
	'scaling',
	'samples',
	'sidecar'
] as const;
type Token = (typeof tokens)[number];
type Fields = Partial<
	Record<
		| 'operation'
		| 'dataset'
		| 'durationMs'
		| 'bytes'
		| 'availableBytes'
		| 'files'
		| 'candidates'
		| 'niftiCount'
		| 'dicomCount'
		| 'warnings'
		| 'errors'
		| 'volumes'
		| 'x'
		| 'y'
		| 'z'
		| 'hasBval'
		| 'hasBvec'
		| 'status'
		| 'progress'
		| 'selectedVoxels'
		| 'validVoxels'
		| 'heapBytes'
		| 'heapLimitBytes'
		| 'longTasks'
		| 'longTaskMs'
		| 'requests'
		| 'transferredBytes'
		| 'width'
		| 'height'
		| 'ordinal'
		| 'suppressed',
		number | boolean
	>
> & { controlPath?: number[] } & Partial<
		Record<
			| 'kind'
			| 'format'
			| 'dtype'
			| 'stage'
			| 'outcome'
			| 'category'
			| 'route'
			| 'control'
			| 'action'
			| 'engine'
			| 'scope'
			| 'state'
			| 'model'
			| 'method',
			Token
		>
	>;
const numericKeys = new Set(
	'operation dataset durationMs bytes availableBytes files candidates niftiCount dicomCount warnings errors volumes x y z hasBval hasBvec status progress selectedVoxels validVoxels heapBytes heapLimitBytes longTasks longTaskMs requests transferredBytes width height ordinal suppressed'.split(
		' '
	)
);
const tokenKeys = new Set(
	'kind format dtype stage outcome category route control action engine scope state model method'.split(
		' '
	)
);
const safeTokens = new Set<string>(tokens);
type Entry = { sequence: number; elapsedMs: number; event: Event; fields: Fields };
const LIMIT = 5000;
const SESSION_LIMIT = 10;
type Session = {
	session: string;
	startedAt: string;
	updatedAt: number;
	appVersion: string;
	build: string;
	paused: boolean;
	retained: number;
	dropped: number;
};
let database: Promise<IDBDatabase> | undefined;
let pending: Entry[] = [];
let saving: Promise<void> | undefined;
let storageError = false;
let clearing = false;
let persistedSequence = 0;

function diagnosticsDatabase() {
	return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open('osipy-diagnostics', 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore('sessions', { keyPath: 'session' });
			request.result.createObjectStore('events', { keyPath: ['session', 'sequence'] });
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => {
			request.onsuccess = () => request.result.close();
			reject(new Error('Diagnostics storage is blocked.'));
		};
		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => {
				db.close();
				database = undefined;
				storageError = true;
			};
			resolve(db);
		};
	}));
}
function transactionDone(transaction: IDBTransaction) {
	return new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = transaction.onabort = () => reject(transaction.error);
	});
}
function sessionRange(id: string, through = Number.MAX_SAFE_INTEGER) {
	return IDBKeyRange.bound([id, 0], [id, through]);
}
function sessionInfo(): Session {
	return {
		session,
		startedAt,
		updatedAt: Date.now(),
		appVersion: __APP_VERSION__,
		build: __BUILD_SHA__,
		paused,
		retained: Math.min(total, LIMIT),
		dropped: Math.max(0, total - LIMIT)
	};
}
async function flushDiagnostics(): Promise<void> {
	if (saving) return saving;
	if (storageError || !pending.length) return;
	saving = (async () => {
		const db = await diagnosticsDatabase();
		while (pending.length) {
			const batch = pending;
			pending = [];
			const info = sessionInfo();
			const transaction = db.transaction(['sessions', 'events'], 'readwrite');
			const done = transactionDone(transaction);
			const sessions = transaction.objectStore('sessions');
			const events = transaction.objectStore('events');
			sessions.put(info);
			for (const entry of batch) events.put({ ...entry, session: info.session });
			const last = batch[batch.length - 1].sequence;
			if (last > LIMIT) events.delete(sessionRange(info.session, last - LIMIT));
			sessions.getAll().onsuccess = (event) => {
				const others = (event.target as IDBRequest<Session[]>).result
					.filter(validSession)
					.filter((item) => item.session !== info.session)
					.sort((a, b) => b.updatedAt - a.updatedAt);
				for (const old of others.slice(SESSION_LIMIT - 1)) {
					sessions.delete(old.session);
					events.delete(sessionRange(old.session));
				}
			};
			await done;
			persistedSequence = last;
		}
	})()
		.catch(() => {
			storageError = true;
			pending = [];
		})
		.finally(() => {
			saving = undefined;
			if (pending.length && !storageError) return flushDiagnostics();
		});
	return saving;
}

function validSession(value: unknown): value is Session {
	if (!value || typeof value !== 'object') return false;
	const item = value as Session;
	return (
		/^[a-f0-9-]{36}$/.test(item.session) &&
		typeof item.startedAt === 'string' &&
		/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(item.startedAt) &&
		Number.isFinite(item.updatedAt) &&
		typeof item.paused === 'boolean' &&
		typeof item.appVersion === 'string' &&
		/^\d+\.\d+\.\d+[a-zA-Z0-9.+-]{0,100}$/.test(item.appVersion) &&
		typeof item.build === 'string' &&
		/^(?:[a-f0-9]{7,64}|unknown)$/.test(item.build) &&
		Number.isSafeInteger(item.retained) &&
		item.retained >= 0 &&
		item.retained <= LIMIT &&
		Number.isSafeInteger(item.dropped) &&
		item.dropped >= 0
	);
}

export async function savedDiagnosticsSessions(): Promise<Session[]> {
	await flushDiagnostics();
	const db = await diagnosticsDatabase();
	const transaction = db.transaction('sessions');
	const done = transactionDone(transaction);
	const request = transaction.objectStore('sessions').getAll();
	await done;
	return request.result.filter(validSession).sort((a, b) => b.updatedAt - a.updatedAt);
}
let entries: Entry[] = [];
let total = 0;
let sequence = 0;
let operation = 0;
let started = 0;
let session = '';
let startedAt = '';
let active = false;
let paused = false;
const datasets = new WeakMap<object, number>();
let datasetSequence = 0;
export function diagnosticDataset(dataset: object) {
	let id = datasets.get(dataset);
	if (!id) {
		id = ++datasetSequence;
		datasets.set(dataset, id);
	}
	return id;
}

export function diagnosticChoice(value: string): Token {
	return tokens.find((token) => token === value) ?? 'unknown';
}

// Only a fixed category leaves this function, never any validation message text.
export function diagnosticValidation(issues: { message: string }[]): Token {
	const categories: [RegExp, Token][] = [
		[/limit|exceeds|memory/i, 'size-limit'],
		[/datatype|bit depth/i, 'datatype'],
		[/b-value/i, 'bvalues'],
		[/b-vector/i, 'bvectors'],
		[/payload|offset/i, 'payload'],
		[/scal|intercept/i, 'scaling'],
		[/affine|sform|qform|spacing|units|dimensions|3D\/4D|orientation/i, 'geometry'],
		[/samples|non-finite/i, 'samples'],
		[/sidecar/i, 'sidecar'],
		[/NIfTI/i, 'format']
	];
	for (const issue of issues) {
		for (const [pattern, category] of categories) if (pattern.test(issue.message)) return category;
	}
	return 'validation';
}

function cleanFields(fields: Fields): Fields {
	const safe: Record<string, number | boolean | string | number[]> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (
			numericKeys.has(key) &&
			(typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
		)
			safe[key] = value;
		else if (tokenKeys.has(key) && typeof value === 'string' && safeTokens.has(value))
			safe[key] = value;
		else if (
			key === 'controlPath' &&
			Array.isArray(value) &&
			value.length <= 16 &&
			value.every((v) => Number.isSafeInteger(v) && v >= 0 && v < 100000)
		)
			safe[key] = [...value];
	}
	return safe as Fields;
}

export function diagnostic(event: Event, fields: Fields = {}) {
	if (!active || paused || clearing || !events.includes(event)) return;
	const entry = {
		sequence: ++sequence,
		elapsedMs: Math.round(performance.now() - started),
		event,
		fields: cleanFields(fields)
	};
	entries[total % LIMIT] = entry;
	total++;
	if (!storageError) {
		pending.push(entry);
		if (pending.length > LIMIT) pending.shift();
		void flushDiagnostics();
	}
}

export function diagnosticError(error: unknown): Token {
	if (error instanceof DOMException && error.name === 'AbortError') return 'abort';
	if (error instanceof RangeError) return 'range';
	if (error instanceof TypeError) return 'type';
	if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'quota';
	if (error instanceof DOMException && error.name === 'SecurityError') return 'security';
	return 'other';
}

export function diagnosticOperation(kind: Token, fields: Fields = {}) {
	const id = ++operation;
	const time = performance.now();
	let ended = false;
	diagnostic('operation.start', { ...fields, kind, operation: id });
	return {
		id,
		stage(stage: Token, extra: Fields = {}) {
			if (!ended)
				diagnostic('operation.stage', {
					...extra,
					kind,
					operation: id,
					stage,
					durationMs: Math.round(performance.now() - time)
				});
		},
		end(outcome: Token, extra: Fields = {}) {
			if (ended) return;
			ended = true;
			diagnostic('operation.end', {
				...extra,
				kind,
				operation: id,
				outcome,
				durationMs: Math.round(performance.now() - time)
			});
		}
	};
}

export function diagnosticsStatus() {
	return {
		session,
		paused,
		retained: Math.min(total, LIMIT),
		dropped: Math.max(0, total - LIMIT),
		storage: storageError ? 'unavailable' : persistedSequence < sequence ? 'saving' : 'saved'
	};
}
export function pauseDiagnostics(value: boolean) {
	if (value) diagnostic('session.pause');
	paused = value;
	if (!value) diagnostic('session.resume');
}
export async function clearDiagnostics() {
	clearing = true;
	try {
		await flushDiagnostics();
		const db = await diagnosticsDatabase();
		const transaction = db.transaction(['sessions', 'events'], 'readwrite');
		const done = transactionDone(transaction);
		transaction.objectStore('sessions').clear();
		transaction.objectStore('events').clear();
		await done;
		entries = [];
		total = 0;
		pending = [];
		storageError = false;
	} finally {
		clearing = false;
	}
	diagnostic('session.clear');
}
export async function downloadDiagnostics(id = session) {
	if (id === session) diagnostic('session.export');
	await flushDiagnostics();
	let info = sessionInfo();
	let ordered =
		total <= LIMIT
			? entries
			: [...entries.slice(total % LIMIT), ...entries.slice(0, total % LIMIT)];
	if (id !== session) {
		if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session.');
		const db = await diagnosticsDatabase();
		const transaction = db.transaction(['sessions', 'events']);
		const done = transactionDone(transaction);
		const metadata = transaction.objectStore('sessions').get(id);
		const records = transaction.objectStore('events').getAll(sessionRange(id), LIMIT);
		await done;
		if (!validSession(metadata.result)) throw new Error('Saved session unavailable.');
		const item = metadata.result;
		info = {
			session: item.session,
			startedAt: item.startedAt,
			updatedAt: item.updatedAt,
			appVersion: item.appVersion,
			build: item.build,
			paused: item.paused,
			retained: item.retained,
			dropped: item.dropped
		};
		ordered = records.result
			.filter(
				(entry: Entry) =>
					entry &&
					typeof entry === 'object' &&
					events.includes(entry.event) &&
					Number.isSafeInteger(entry.sequence) &&
					entry.sequence > 0 &&
					Number.isFinite(entry.elapsedMs) &&
					entry.elapsedMs >= 0 &&
					entry.fields &&
					typeof entry.fields === 'object'
			)
			.map((entry: Entry) => ({
				sequence: entry.sequence,
				elapsedMs: entry.elapsedMs,
				event: entry.event,
				fields: cleanFields(entry.fields)
			}));
	}
	const header = {
		schema: 'osipy-diagnostics-1',
		...info,
		exportedAt: new Date().toISOString(),
		privacy:
			'No patient data, filenames, paths, URLs, input values, image samples, checksums, error messages or stacks. Stored locally in IndexedDB; no automatic upload.',
		limits: {
			maxEvents: LIMIT,
			maxSessions: SESSION_LIMIT,
			interactionThrottleMs: 500,
			resourceIntervalMs: 15000
		}
	};
	const blob = new Blob(
		[JSON.stringify(header), '\n', ...ordered.map((entry) => JSON.stringify(entry) + '\n')],
		{ type: 'application/x-ndjson' }
	);
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `osipy-diagnostics-${info.session}.jsonl`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function startDiagnostics() {
	if (active) return () => {};
	active = true;
	paused = false;
	started = performance.now();
	startedAt = new Date().toISOString();
	session = crypto.randomUUID();
	entries = [];
	total = 0;
	let suppressed = 0;
	const last = new WeakMap<Element, number>();
	const interact = (event: globalThis.Event) => {
		if (paused) return;
		if (!(event.target instanceof Element)) return;
		const target = event.target.closest(
			'button,a,input,select,textarea,canvas,summary,[role="button"],[role="slider"]'
		);
		if (!target || (event.type === 'pointerup' && target.tagName !== 'CANVAS')) return;
		const now = performance.now();
		if (now - (last.get(target) ?? -Infinity) < 500) {
			suppressed++;
			return;
		}
		last.set(target, now);
		const tag = target.tagName.toLowerCase();
		const action = target.closest('[data-diagnostic]')?.getAttribute('data-diagnostic');
		const controlPath: number[] = [];
		let node: Element | null = target;
		while (node?.parentElement && controlPath.length < 16) {
			controlPath.unshift(Array.from(node.parentElement.children).indexOf(node));
			node = node.parentElement;
		}
		diagnostic('interaction', {
			kind: event.type as Token,
			control: safeTokens.has(tag) ? (tag as Token) : 'other',
			// Ordinal describes UI structure, never labels or patient-controlled attributes.
			ordinal: target.parentElement ? Array.from(target.parentElement.children).indexOf(target) : 0,
			controlPath,
			...(action && safeTokens.has(action) ? { action: action as Token } : {})
		});
	};
	const runtimeError = (event: ErrorEvent) =>
		diagnostic('runtime.error', { category: diagnosticError(event.error) });
	const rejection = (event: PromiseRejectionEvent) =>
		diagnostic('runtime.error', { category: diagnosticError(event.reason) });
	const visibility = () =>
		diagnostic('navigation', { state: document.hidden ? 'hidden' : 'visible' });
	const pagehide = () => {
		diagnostic('session.stop');
		void flushDiagnostics();
	};
	let longTasks = 0,
		longTaskMs = 0,
		requests = 0,
		transferredBytes = 0;
	const observers: PerformanceObserver[] = [];
	for (const type of ['longtask', 'resource']) {
		try {
			if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (paused) continue;
					if (type === 'longtask') {
						longTasks++;
						longTaskMs += entry.duration;
					} else {
						requests++;
						transferredBytes += (entry as PerformanceResourceTiming).transferSize || 0;
					}
				}
			});
			observer.observe({ type });
			observers.push(observer);
		} catch {
			/* Optional browser capability; diagnostics must not break the app. */
		}
	}
	const timer = setInterval(() => {
		const memory = (
			performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
		).memory;
		diagnostic('resources', {
			longTasks,
			longTaskMs: Math.round(longTaskMs),
			requests,
			transferredBytes,
			suppressed,
			...(memory
				? { heapBytes: memory.usedJSHeapSize, heapLimitBytes: memory.jsHeapSizeLimit }
				: {})
		});
		longTasks = longTaskMs = requests = transferredBytes = suppressed = 0;
	}, 15000);
	const types = ['click', 'change', 'pointerup', 'wheel'];
	for (const type of types)
		document.addEventListener(type, interact, { capture: true, passive: true });
	window.addEventListener('error', runtimeError);
	window.addEventListener('unhandledrejection', rejection);
	document.addEventListener('visibilitychange', visibility);
	window.addEventListener('pagehide', pagehide);
	diagnostic('session.start', { width: window.innerWidth, height: window.innerHeight });
	return () => {
		diagnostic('session.stop');
		active = false;
		clearInterval(timer);
		observers.forEach((observer) => observer.disconnect());
		for (const type of types) document.removeEventListener(type, interact, true);
		window.removeEventListener('error', runtimeError);
		window.removeEventListener('unhandledrejection', rejection);
		document.removeEventListener('visibilitychange', visibility);
		window.removeEventListener('pagehide', pagehide);
	};
}

export function diagnosticNavigation(route: string | null) {
	const routes: Record<string, Token> = {
		'/': 'home',
		'/viewer': 'viewer',
		'/nifti': 'nifti-page',
		'/browser-ivim': 'browser-ivim',
		'/about': 'about',
		'/blog': 'blog',
		'/register': 'register'
	};
	diagnostic('navigation', { route: routes[route ?? ''] ?? 'other' });
}
