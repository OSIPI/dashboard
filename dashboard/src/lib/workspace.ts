import { parseBookmarks, type Bookmark, type Dataset, type VoxelVolume } from './ivim';
import { predictIvim } from './analysis';

export const minimumWindow = (dataset: Dataset) =>
	Math.min(1, 10 ** (Math.floor(Math.log10(dataset.signalRange[1] - dataset.signalRange[0])) - 2));
export const displayStep = (dataset: Dataset) =>
	Math.min(0.1, 10 ** Math.floor(Math.log10(minimumWindow(dataset))));

export type Display = { zoom: number; panX: number; panY: number; center: number; width: number };

export function zoomAtPointer(
	view: Display,
	delta: number,
	offsetX: number,
	offsetY: number
): Display {
	const zoom = Math.max(
		1,
		Math.min(4, view.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002))
	);
	const factor = 1 - zoom / view.zoom;
	return {
		...view,
		zoom,
		panX: Math.max(-10000, Math.min(10000, view.panX + offsetX * factor)),
		panY: Math.max(-10000, Math.min(10000, view.panY + offsetY * factor))
	};
}
export const GRID_LAYOUTS = [
	{ id: 'auto', label: 'Together · automatic', columns: 2, rows: 2, capacity: 0 },
	{ id: 'pair', label: 'Side by side', columns: 2, rows: 1, capacity: 2 },
	{ id: 'four', label: '4 tiles · 2 × 2', columns: 2, rows: 2, capacity: 4 },
	{ id: 'eight', label: '8 tiles · 4 × 2', columns: 4, rows: 2, capacity: 8 }
] as const;
export type GridLayout = (typeof GRID_LAYOUTS)[number]['id'];
export function replaceActiveVolume(selected: number[], active: number, next: number): number[] {
	if (selected.length <= 1) return [next];
	return selected.includes(next) ? selected : selected.map((v) => (v === active ? next : v));
}
export function gridVolumes(selected: number[], active: number, layout: GridLayout): number[] {
	const volumes = selected.length ? selected : [active];
	const capacity = GRID_LAYOUTS.find((g) => g.id === layout)!.capacity;
	if (!capacity) return volumes;
	const start = Math.floor(Math.max(0, volumes.indexOf(active)) / capacity) * capacity;
	return volumes.slice(start, start + capacity);
}
export type Workspace = {
	version: 1;
	datasetId: string;
	sha256: string;
	x: number;
	y: number;
	slice: number;
	volume: number;
	selected: number[];
	gridLayout: GridLayout;
	linked: boolean;
	display: Display;
	tiles: Record<string, Display>;
	bookmarks: Bookmark[];
	compared: string[];
	seriesWidth: number;
	inspectorWidth: number;
	search: string;
	range: string;
	list: boolean;
	note: string;
};

export function defaultDisplay(dataset: Dataset): Display {
	return { zoom: 1, panX: 0, panY: 0, center: dataset.window[0], width: dataset.window[1] };
}

export function parseWorkspace(raw: string, dataset: Dataset): Workspace {
	if (raw.length > 100_000) throw new Error('Workspace is too large (100 KB maximum).');
	const w = JSON.parse(raw) as Workspace;
	const bounded = (v: number, min: number, max: number, integer = false) =>
		Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
	const display = (d: Display) =>
		d &&
		bounded(d.zoom, 1, 4) &&
		bounded(d.panX, -10000, 10000) &&
		bounded(d.panY, -10000, 10000) &&
		bounded(d.center, dataset.signalRange[0], dataset.signalRange[1]) &&
		bounded(d.width, minimumWindow(dataset), 2 * (dataset.signalRange[1] - dataset.signalRange[0]));
	const volume = (v: number) => bounded(v, 0, dataset.dimensions[3] - 1, true);
	if (!w || w.version !== 1 || w.datasetId !== dataset.id || w.sha256 !== dataset.sha256)
		throw new Error('Workspace version or dataset identity/checksum does not match.');
	if (
		!bounded(w.x, 0, dataset.dimensions[0] - 1, true) ||
		!bounded(w.y, 0, dataset.dimensions[1] - 1, true) ||
		!bounded(w.slice, 0, dataset.dimensions[2] - 1, true) ||
		!volume(w.volume) ||
		!Array.isArray(w.selected) ||
		w.selected.length > dataset.dimensions[3] ||
		!w.selected.every(volume) ||
		new Set(w.selected).size !== w.selected.length ||
		(w.selected.length > 0 && !w.selected.includes(w.volume)) ||
		!GRID_LAYOUTS.some((g) => g.id === w.gridLayout) ||
		typeof w.linked !== 'boolean' ||
		typeof w.list !== 'boolean' ||
		!display(w.display) ||
		!w.tiles ||
		typeof w.tiles !== 'object' ||
		Array.isArray(w.tiles) ||
		!Object.entries(w.tiles).every(
			([key, value]) => String(Number(key)) === key && volume(Number(key)) && display(value)
		) ||
		!bounded(w.seriesWidth, 180, 420) ||
		!bounded(w.inspectorWidth, 240, 600) ||
		typeof w.search !== 'string' ||
		w.search.length > 200 ||
		typeof w.range !== 'string' ||
		!['all', 'low', 'high', ...dataset.bValues.map(String)].includes(w.range) ||
		typeof w.note !== 'string' ||
		w.note.length > 240 ||
		!Array.isArray(w.bookmarks) ||
		w.bookmarks.length > 30
	)
		throw new Error('Workspace contains invalid coordinates, selections, or display settings.');
	const bookmarks = parseBookmarks(JSON.stringify(w.bookmarks), dataset);
	if (
		!Array.isArray(w.compared) ||
		w.compared.length > 4 ||
		new Set(w.compared).size !== w.compared.length ||
		!w.compared.every((id) => bookmarks.some((b) => b.id === id))
	)
		throw new Error('Workspace contains an invalid voxel comparison.');
	return { ...w, bookmarks };
}

// Exact histogram quantiles for the int16 source: bounded memory even for a whole volume.
export function autoWindow(
	volume: VoxelVolume,
	dataset: Dataset,
	slice: number | undefined,
	robust: boolean
): Pick<Display, 'center' | 'width'> {
	const size = dataset.dimensions[0] * dataset.dimensions[1];
	const start = slice === undefined ? 0 : slice * size;
	const end = slice === undefined ? volume.length : start + size;
	if (!(volume instanceof Int16Array) || dataset.slope < 0) {
		const values = Float64Array.from(
			volume.subarray(start, end),
			(v) => v * dataset.slope + dataset.intercept
		).sort();
		const low = values[Math.floor((values.length - 1) * (robust ? 0.02 : 0))];
		const high = values[Math.floor((values.length - 1) * (robust ? 0.98 : 1))];
		return { center: (low + high) / 2, width: Math.max(minimumWindow(dataset), high - low) };
	}
	const histogram = new Uint32Array(65536);
	for (let i = start; i < end; i++) histogram[volume[i] + 32768]++;
	const count = end - start;
	const quantile = (fraction: number) => {
		const target = Math.floor((count - 1) * fraction);
		let total = 0;
		for (let i = 0; i < histogram.length; i++) {
			total += histogram[i];
			if (total > target) return (i - 32768) * dataset.slope + dataset.intercept;
		}
		return 0;
	};
	const low = quantile(robust ? 0.02 : 0);
	const high = quantile(robust ? 0.98 : 1);
	return { center: (low + high) / 2, width: Math.max(minimumWindow(dataset), high - low) };
}

export type SignalSeries = { label: string; values: number[] };
export type FittedCurve = { parameters: Record<string, number>; valid: boolean; model: string };
const escape = (value: unknown) =>
	String(value).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
	);

export function chartSvg(
	dataset: Dataset,
	series: SignalSeries[],
	selected: number,
	dark: boolean,
	fit?: FittedCurve,
	compact = false,
	interactive = false,
	xRange?: [number, number]
): string {
	const foreground = dark ? '#ddd' : '#242424';
	const background = dark ? '#171717' : '#fff';
	const muted = dark ? '#a3a3a3' : '#666';
	const colors = dark
		? ['#ed746b', '#b1c4df', '#d3bd91', '#b3c6ac', '#c7b1ce']
		: ['#ad4942', '#365e8b', '#806019', '#46623b', '#785086'];
	const maxB = Math.max(1, ...dataset.bValues);
	const [startB, endB] =
		xRange &&
		Number.isFinite(xRange[0]) &&
		Number.isFinite(xRange[1]) &&
		xRange[0] >= 0 &&
		xRange[0] < xRange[1] &&
		xRange[1] <= maxB
			? xRange
			: [0, maxB];
	const inRange = (b: number) => b >= startB && b <= endB;
	const all = [
		...series.flatMap((s) => s.values.filter((_, i) => inRange(dataset.bValues[i]))),
		...(fit
			? Array.from({ length: 161 }, (_, i) =>
					predictIvim(startB + (i / 160) * (endB - startB), fit.parameters)
				)
			: [])
	];
	const min = Math.min(0, ...all);
	const observedMax = Math.max(0, ...all);
	const max = observedMax > min ? observedMax : min + 1;
	const px = (b: number) => 90 + ((b - startB) / (endB - startB)) * 650;
	const py = (s: number) => 355 - ((s - min) / (max - min)) * 270;
	const labels = [
		...series.map((s, i) => (compact && i === 0 ? 'Measured samples' : s.label)),
		...(fit
			? [
					`${fit.model} fit${compact ? (fit.valid ? '' : ' · flagged') : ` · ${fit.valid ? 'quality checks passed' : 'flagged estimate — inspect quality'}`}`
				]
			: [])
	];
	let legendX = 24;
	let legendRow = 0;
	const legendPositions = labels.map((label, index) => {
		const width = label.length * 7.2 + 32;
		if (!compact && legendX > 24 && legendX + width > 776) {
			legendX = 24;
			legendRow++;
		}
		const position = {
			x: compact ? 24 : legendX,
			y: (compact ? 438 : 454) + (compact ? index : legendRow) * 23
		};
		legendX += width;
		return position;
	});
	const legendRows = compact ? series.length + (fit ? 1 : 0) : legendRow + 1;
	const height = compact
		? 440 + series.length * 23 + (fit ? 23 : 0) - 52
		: 456 + legendRows * 23 + (fit ? 210 : 0);
	let body = `<rect width="800" height="${height}" fill="${background}"/><g font-family="system-ui,sans-serif" font-size="${compact ? 23 : 13}" fill="${foreground}"${compact ? ' transform="translate(0,-52)"' : ''}>${compact ? '' : `<text x="90" y="28" font-size="15" font-weight="600">${escape(dataset.name)}</text><text x="90" y="48" font-size="11" fill="${muted}">${fit ? 'Acquired signals + fitted model · repeats kept separate' : 'Acquired signals · repeats kept separate'}</text>`}<text x="90" y="70" font-size="11" fill="${muted}">Signal (a.u.)</text>`;
	const tickFormat = new Intl.NumberFormat('en', {
		notation: 'compact',
		maximumSignificantDigits: 3
	});
	for (const tick of [min, (min + max) / 2, max])
		body += `<line x1="90" x2="740" y1="${py(tick)}" y2="${py(tick)}" stroke="${foreground}" opacity="0.12"/><text x="80" y="${py(tick) + 4}" text-anchor="end" fill="${muted}">${tickFormat.format(tick)}</text>`;
	for (const tick of [0, 0.25, 0.5, 0.75, 1].map((fraction) => startB + fraction * (endB - startB)))
		body += `<text x="${px(tick)}" y="379" text-anchor="middle" fill="${muted}">${Number(tick.toFixed(2))}</text>`;
	body += `<text x="415" y="402" text-anchor="middle" fill="${muted}">b-value (s/mm²)</text>`;
	if (interactive) {
		const overviewX = 90 + (startB / maxB) * 650;
		const overviewWidth = ((endB - startB) / maxB) * 650;
		body += `<g aria-hidden="true"><rect x="90" y="414" width="650" height="6" rx="3" fill="${foreground}" opacity="0.15"/><rect x="${overviewX}" y="413" width="${overviewWidth}" height="8" rx="4" fill="${colors[0]}" opacity="${startB === 0 && endB === maxB ? '0.4' : '0.85'}"/><path d="M${overviewX},409v16 M${overviewX + overviewWidth},409v16" stroke="${colors[0]}" stroke-width="3" stroke-linecap="round"/></g><rect x="${overviewX}" y="394" width="${overviewWidth}" height="42" fill="transparent" data-chart-range="move" tabindex="0" role="slider" aria-label="Move zoom range" aria-valuemin="0" aria-valuemax="${maxB}" aria-valuenow="${startB}" aria-valuetext="${startB.toFixed(1)} to ${endB.toFixed(1)} s/mm²" style="cursor:grab;touch-action:none"/><rect x="${overviewX - 22}" y="394" width="44" height="42" fill="transparent" data-chart-range="start" tabindex="0" role="slider" aria-label="Start of zoom range" aria-valuemin="0" aria-valuemax="${endB}" aria-valuenow="${startB}" aria-valuetext="${startB.toFixed(1)} s/mm²" style="cursor:ew-resize;touch-action:none"/><rect x="${overviewX + overviewWidth - 22}" y="394" width="44" height="42" fill="transparent" data-chart-range="end" tabindex="0" role="slider" aria-label="End of zoom range" aria-valuemin="${startB}" aria-valuemax="${maxB}" aria-valuenow="${endB}" aria-valuetext="${endB.toFixed(1)} s/mm²" style="cursor:ew-resize;touch-action:none"/><rect x="90" y="85" width="650" height="270" fill="transparent" style="cursor:zoom-in" aria-hidden="true"/>`;
	}
	const pointsStart = body.length;
	let curveHit = '';
	series.forEach((s, si) => {
		const color = colors[si % colors.length];
		s.values.forEach((value, vi) => {
			if (!inRange(dataset.bValues[vi])) return;
			const cx = px(dataset.bValues[vi]);
			const cy = py(value);
			const r = vi === selected ? 6 : 3.5;
			body += `<g fill="${vi === selected ? background : color}" stroke="${color}" stroke-width="${vi === selected ? 2.5 : 1.5}"${interactive ? ` data-chart-point data-series="${si}" data-volume="${vi}" tabindex="0" role="button" aria-label="${escape(`${s.label}, volume ${vi + 1}, b ${dataset.bValues[vi]} s/mm², signal ${value} a.u. Select volume`)}" style="cursor:pointer"` : ''}><title>${escape(s.label)} · volume ${vi + 1} · b=${dataset.bValues[vi]} · ${value} a.u.</title>${si % 2 ? `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}"/>`}${interactive ? `<circle cx="${cx}" cy="${cy}" r="12" fill="transparent" stroke="none"/><circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="${color}" stroke-width="2" class="chart-focus-ring"/>` : ''}</g>`;
		});
		body += `<text x="${legendPositions[si].x}" y="${legendPositions[si].y}" fill="${color}">${si % 2 ? '■' : '●'} ${escape(labels[si])}</text>`;
	});
	if (fit) {
		const color = dark ? '#b1c4df' : '#365e8b';
		const curve = Array.from({ length: 161 }, (_, i) => {
			const b = startB + (i / 160) * (endB - startB);
			return `${px(b)},${py(predictIvim(b, fit.parameters))}`;
		}).join(' ');
		if (interactive)
			curveHit = `<polyline points="${curve}" fill="none" stroke="transparent" stroke-width="18" data-chart-fit tabindex="0" role="group" aria-label="${escape(fit.model)} fitted curve${fit.valid ? '' : ', flagged estimate'}. Hover or use arrow keys to inspect predicted signal" style="cursor:crosshair"/>`;
		body += `<polyline points="${curve}" fill="none" stroke="${color}" stroke-width="3"${fit.valid ? '' : ' stroke-dasharray="6 4"'}${interactive ? ' pointer-events="none"' : ''}/><text x="${legendPositions[series.length].x}" y="${legendPositions[series.length].y}" fill="${color}">— ${escape(labels[series.length])}</text>`;
	}
	if (fit && !compact) {
		const color = dark ? '#b1c4df' : '#365e8b';
		const residuals = series[0].values.map(
			(v, i) => v - predictIvim(dataset.bValues[i], fit.parameters)
		);
		const extent = Math.max(
			1e-12,
			...residuals.filter((_, i) => inRange(dataset.bValues[i])).map(Math.abs)
		);
		const y0 = 526 + legendRows * 23;
		body += `<text x="24" y="${y0 - 24}">Residuals (observed − fitted), a.u.</text><line x1="90" x2="740" y1="${y0 + 45}" y2="${y0 + 45}" stroke="${foreground}" opacity="0.3"/><text x="80" y="${y0 + 50}" text-anchor="end">0</text>`;
		residuals.forEach((v, i) => {
			if (!inRange(dataset.bValues[i])) return;
			body += `<circle cx="${px(dataset.bValues[i])}" cy="${y0 + 45 - (v / extent) * 40}" r="3" fill="${color}"${interactive ? ` data-chart-point data-series="0" data-volume="${i}" data-residual="true" tabindex="0" role="button" aria-label="Volume ${i + 1}, residual ${v} a.u. Select volume" style="cursor:pointer;stroke:transparent;stroke-width:18"` : ''}><title>Volume ${i + 1}: ${v} a.u.</title></circle>`;
		});
		body += `<text x="24" y="${y0 + 108}">Residual scale ±${extent.toPrecision(4)} a.u. · repeated acquisitions retained</text>`;
	}
	const provenance = escape(
		JSON.stringify({
			datasetId: dataset.id,
			sha256: dataset.sha256,
			selectedVolume: selected + 1,
			series: series.map((s) => s.label),
			fit
		})
	);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${height}" width="800" height="${height}" role="${interactive ? 'group' : 'img'}" aria-label="Acquired voxel samples with labelled comparisons"><metadata>${provenance}</metadata>${interactive ? `<style>.chart-focus-ring{opacity:0}g:focus-visible .chart-focus-ring{opacity:1}polyline[data-chart-fit]:focus-visible{stroke:${dark ? '#b1c4df' : '#365e8b'};stroke-opacity:.4}</style>` : ''}${body.slice(0, pointsStart)}${curveHit}${body.slice(pointsStart)}</g></svg>`;
}

export function voxelCsv(
	dataset: Dataset,
	values: number[],
	x: number,
	y: number,
	z: number
): string {
	const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
	return [
		'dataset_id,sha256,x,y,z,volume,b_s_per_mm2,signal_au',
		...values.map((s, i) =>
			[dataset.id, dataset.sha256, x, y, z, i + 1, dataset.bValues[i], s].map(cell).join(',')
		)
	].join('\r\n');
}

export function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
