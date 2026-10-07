<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		IVIM_METHODS,
		IVIM_MODELS,
		MAX_INPUT_TEXT_LENGTH,
		OSIPY_VERSION,
		PYODIDE_VERSION,
		SYNTHETIC_B_VALUES,
		SYNTHETIC_SIGNAL,
		isCurrentBrowserIvimJob,
		parseNumberArray,
		validateBrowserIvimRequest,
		validateBrowserIvimResult,
		type BrowserIvimResult,
		type BrowserIvimWorkerResponse,
		type IvimMethod,
		type IvimModel
	} from '$lib/browser-ivim';

	type RunState = 'idle' | 'loading' | 'fitting' | 'done' | 'error' | 'cancelled';

	let model: IvimModel = $state('biexponential');
	let method: IvimMethod = $state('segmented');
	let bThreshold = $state(200);
	let bValuesText = $state(SYNTHETIC_B_VALUES.join(', '));
	let signalText = $state(SYNTHETIC_SIGNAL.map(String).join(', '));
	let runState = $state<RunState>('idle');
	let error = $state('');
	let result: BrowserIvimResult | undefined = $state();
	let submittedBValues: number[] = $state([]);
	let submittedSignal: number[] = $state([]);
	let worker: Worker | undefined;
	let activeJob = 0;

	const busy = $derived(runState === 'loading' || runState === 'fitting');
	const plot = $derived.by(() => {
		if (!result || !submittedBValues.length) return undefined;
		const width = 720;
		const height = 260;
		const pad = 30;
		const maxB = Math.max(...submittedBValues, 1);
		const maxSignal = Math.max(...submittedSignal, ...result.fittedCurve, 1);
		const point = (b: number, signal: number) => ({
			x: pad + (b / maxB) * (width - pad * 2),
			y: height - pad - (signal / maxSignal) * (height - pad * 2)
		});
		return {
			width,
			height,
			raw: submittedBValues.map((b, index) => point(b, submittedSignal[index])),
			curve: submittedBValues
				.map((b, index) => ({ b, signal: result?.fittedCurve[index] ?? 0, index }))
				.toSorted((a, b) => a.b - b.b || a.index - b.index)
				.map((sample) => point(sample.b, sample.signal))
		};
	});

	function stopWorker() {
		worker?.terminate();
		worker = undefined;
	}

	function cancel() {
		if (!busy) return;
		activeJob += 1;
		stopWorker();
		runState = 'cancelled';
		error = '';
	}

	function runFit() {
		if (busy) return;
		error = '';
		result = undefined;
		try {
			const request = validateBrowserIvimRequest({
				model,
				method,
				bThreshold: Number(bThreshold),
				bValues: parseNumberArray(bValuesText, 'b-values'),
				signal: parseNumberArray(signalText, 'Signal')
			});
			submittedBValues = [...request.bValues];
			submittedSignal = [...request.signal];
			const jobId = ++activeJob;
			worker ??= new Worker(new URL('../browser-ivim.worker.ts', import.meta.url), {
				type: 'module'
			});
			runState = 'loading';
			worker.onmessage = (event: MessageEvent<BrowserIvimWorkerResponse>) => {
				if (!isCurrentBrowserIvimJob(event.data.jobId, activeJob)) return;
				if (event.data.phase === 'ready') {
					runState = 'fitting';
					return;
				}
				if (event.data.phase === 'error') {
					runState = 'error';
					error = event.data.error;
					stopWorker();
					return;
				}
				try {
					result = validateBrowserIvimResult(event.data.result, request.bValues.length);
					runState = 'done';
				} catch (workerError) {
					runState = 'error';
					error =
						workerError instanceof Error ? workerError.message : 'The fit result was invalid.';
					stopWorker();
				}
			};
			worker.onerror = (event) => {
				if (!isCurrentBrowserIvimJob(jobId, activeJob)) return;
				runState = 'error';
				error = event.message || 'The fitting worker stopped unexpectedly.';
				stopWorker();
			};
			worker.postMessage({ jobId, request });
		} catch (validationError) {
			runState = 'error';
			error = validationError instanceof Error ? validationError.message : 'Check the fit inputs.';
		}
	}

	onDestroy(stopWorker);
</script>

<main class="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-5 sm:py-6">
	<section class="card p-4 sm:p-6">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="max-w-3xl">
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<span class="badge border-selection/40 bg-selection-surface text-selection"
						>Browser demo</span
					>
					<span class="badge">Synthetic signal</span>
				</div>
				<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
					IVIM fitting, entirely in your browser
				</h1>
				<p class="mt-2 text-sm text-muted-foreground sm:text-base">
					Runs the published OSIPY {OSIPY_VERSION} Python wheel in a dedicated Pyodide Web Worker. No
					scan or input values are sent to an OSIPY server.
				</p>
			</div>
			<div
				class="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-xs text-muted-foreground sm:text-right"
			>
				<span>Pyodide</span><strong class="text-foreground">{PYODIDE_VERSION}</strong>
				<span>OSIPY</span><strong class="text-foreground">{OSIPY_VERSION}</strong>
			</div>
		</div>
	</section>

	<div class="grid min-h-0 gap-4 lg:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1.2fr)]">
		<section class="card p-4 sm:p-5" aria-labelledby="fit-inputs-heading">
			<h2 id="fit-inputs-heading" class="text-base font-semibold">Fit inputs</h2>
			<p class="mt-1 text-xs text-muted-foreground">
				Preloaded values are a noise-free synthetic biexponential signal (S0 1000, D 0.0011, D*
				0.018 mm²/s, f 0.16), not a patient scan. Repeated b=0 samples are intentional.
			</p>

			<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
				<label class="grid gap-1 text-sm font-medium">
					Model
					<select class="input min-h-11" bind:value={model} disabled={busy}>
						{#each IVIM_MODELS as value (value)}<option {value}>{value}</option>{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-medium">
					Strategy
					<select class="input min-h-11" bind:value={method} disabled={busy}>
						{#each IVIM_METHODS as value (value)}<option {value}>{value}</option>{/each}
					</select>
				</label>
			</div>

			<label class="mt-4 grid gap-1 text-sm font-medium">
				b-value threshold <span class="font-normal text-muted-foreground">(s/mm²)</span>
				<input
					class="input min-h-11"
					type="number"
					min="0"
					max="10000"
					step="1"
					bind:value={bThreshold}
					disabled={busy || method === 'full'}
				/>
			</label>
			{#if method === 'full'}<p class="mt-1 text-xs text-muted-foreground">
					OSIPY full fitting forces the effective threshold to 0.
				</p>{/if}

			<label class="mt-4 grid gap-1 text-sm font-medium">
				b-values <span class="font-normal text-muted-foreground">(comma or space separated)</span>
				<textarea
					class="input min-h-24 resize-y font-mono text-xs"
					bind:value={bValuesText}
					maxlength={MAX_INPUT_TEXT_LENGTH}
					disabled={busy}
				></textarea>
			</label>
			<label class="mt-4 grid gap-1 text-sm font-medium">
				Signal <span class="font-normal text-muted-foreground">(positive arbitrary units)</span>
				<textarea
					class="input min-h-28 resize-y font-mono text-xs"
					bind:value={signalText}
					maxlength={MAX_INPUT_TEXT_LENGTH}
					disabled={busy}
				></textarea>
			</label>

			<div class="mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					class="button button-primary min-h-11"
					onclick={runFit}
					disabled={busy}
				>
					{runState === 'loading'
						? 'Downloading runtime…'
						: runState === 'fitting'
							? 'Fitting…'
							: 'Run OSIPY fit'}
				</button>
				{#if busy}<button type="button" class="button button-outline min-h-11" onclick={cancel}
						>Cancel</button
					>{/if}
			</div>
			{#if runState === 'cancelled'}<p class="mt-3 text-sm" role="status">
					Cancelled. The worker was terminated; the next run downloads a cold runtime again.
				</p>{/if}
			{#if error}<p
					class="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					role="alert"
				>
					{error}
				</p>{/if}
		</section>

		<section class="card min-w-0 p-4 sm:p-5" aria-labelledby="fit-results-heading">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 id="fit-results-heading" class="text-base font-semibold">Fit result</h2>
				{#if result}<span
						class="badge {result.passesRestQualityPolicy
							? 'border-selection/40 bg-selection-surface text-selection'
							: ''}"
					>
						{result.passesRestQualityPolicy
							? 'REST quality policy passed'
							: 'REST quality policy not passed'}
					</span>{/if}
			</div>

			{#if result && plot}
				<div class="mt-4 overflow-hidden rounded-lg border bg-background p-2">
					<svg
						viewBox={`0 0 ${plot.width} ${plot.height}`}
						class="block h-auto w-full"
						role="img"
						aria-label="Synthetic input samples and OSIPY fitted curve"
					>
						<line x1="30" y1="230" x2="690" y2="230" stroke="var(--border)" />
						<line x1="30" y1="30" x2="30" y2="230" stroke="var(--border)" />
						<polyline
							points={plot.curve.map((point) => `${point.x},${point.y}`).join(' ')}
							fill="none"
							stroke="var(--muted-foreground)"
							stroke-width="2"
						/>
						{#each plot.raw as point, index (index)}<circle
								cx={point.x}
								cy={point.y}
								r="4.5"
								fill="var(--selection)"
							/>{/each}
					</svg>
					<div class="flex flex-wrap items-center gap-4 px-2 pb-1 text-xs text-muted-foreground">
						<span
							><span class="mr-1 inline-block size-2 rounded-full bg-selection"></span>Synthetic
							samples</span
						>
						<span
							><span class="mr-1 inline-block h-0.5 w-4 bg-muted-foreground align-middle"
							></span>OSIPY fitted curve</span
						>
					</div>
				</div>

				<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
					<div class="rounded-lg border p-3">
						<div class="text-xs text-muted-foreground">D</div>
						<div class="mt-1 font-mono text-sm">{result.params.d.toPrecision(6)}</div>
						<div class="text-xs text-muted-foreground">mm²/s</div>
					</div>
					{#if result.params.dStar !== undefined}<div class="rounded-lg border p-3">
							<div class="text-xs text-muted-foreground">D*</div>
							<div class="mt-1 font-mono text-sm">{result.params.dStar.toPrecision(6)}</div>
							<div class="text-xs text-muted-foreground">mm²/s</div>
						</div>{/if}
					<div class="rounded-lg border p-3">
						<div class="text-xs text-muted-foreground">f</div>
						<div class="mt-1 font-mono text-sm">{result.params.f.toPrecision(6)}</div>
						<div class="text-xs text-muted-foreground">fraction</div>
					</div>
					<div class="rounded-lg border p-3">
						<div class="text-xs text-muted-foreground">S0</div>
						<div class="mt-1 font-mono text-sm">{result.params.s0.toPrecision(6)}</div>
						<div class="text-xs text-muted-foreground">a.u.</div>
					</div>
					<div class="rounded-lg border p-3">
						<div class="text-xs text-muted-foreground">R²</div>
						<div class="mt-1 font-mono text-sm">
							{result.rSquared === null ? 'unavailable' : result.rSquared.toPrecision(6)}
						</div>
						<div class="text-xs text-muted-foreground">OSIPY output</div>
					</div>
					<div class="rounded-lg border p-3">
						<div class="text-xs text-muted-foreground">Compute time</div>
						<div class="mt-1 font-mono text-sm">{result.computeMs.toFixed(1)} ms</div>
						<div class="text-xs text-muted-foreground">this run</div>
					</div>
				</div>

				<details class="mt-4 rounded-lg border p-3 text-sm">
					<summary class="cursor-pointer font-medium"
						>Runtime provenance and quality meaning</summary
					>
					<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
						<dt class="text-muted-foreground">Python</dt>
						<dd>{result.pythonVersion}</dd>
						<dt class="text-muted-foreground">OSIPY</dt>
						<dd>{result.osipyVersion} · osipy.fit_ivim</dd>
						<dt class="text-muted-foreground">Strategy</dt>
						<dd>{result.method}</dd>
						<dt class="text-muted-foreground">Model</dt>
						<dd>{result.model}</dd>
						<dt class="text-muted-foreground">Effective threshold</dt>
						<dd>{result.effectiveBThreshold} s/mm²</dd>
						<dt class="text-muted-foreground">Convergence</dt>
						<dd>Unavailable from OSIPY 0.1.4 batch fitting</dd>
					</dl>
					<p class="mt-3 text-xs text-muted-foreground">
						“Passed” means OSIPY attempted the fit, parameters are finite and physical, and R² is
						greater than 0.5—the current REST API post-fit policy. It is not a convergence claim.
					</p>
				</details>
			{:else}
				<div
					class="mt-4 grid min-h-64 place-items-center rounded-lg border border-dashed bg-muted/20 p-6 text-center"
				>
					<div class="max-w-sm">
						<p class="font-medium">Ready for a local synthetic fit</p>
						<p class="mt-2 text-sm text-muted-foreground">
							The first run downloads the pinned Python runtime, NumPy, and OSIPY wheel from public
							CDNs. Later runs reuse this worker until cancellation or navigation.
						</p>
					</div>
				</div>
			{/if}
		</section>
	</div>

	<section class="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
		<strong class="text-foreground">Research software demo—not for clinical use.</strong>
		Input stays in this worker, but the pinned runtime files are downloaded from jsDelivr and files.pythonhosted.org.
		This demo does not guarantee offline availability. OSIPY 0.1.4 is installed without its unrelated
		native dcm2niix dependency; this route accepts numeric signals only and performs no DICOM conversion.
	</section>
</main>
