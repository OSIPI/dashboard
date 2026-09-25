import { expect, test } from 'bun:test';
import {
	analyze,
	nextVersion,
	prependNotes,
	versionFiles,
	validateRetryContent,
	validateRemoteTags
} from './release';

const commit = (message: string) => ({ hash: 'abcdef123456', message });

test('Conventional Commits use highest bump, including scoped bang and footer', () => {
	for (const [message, bump] of [
		['fix: bug', 1],
		['perf(viewer): faster', 1],
		['feat: feature', 2],
		['refactor(api)!: remove', 3],
		['chore: change\n\nBREAKING CHANGE: incompatible', 3],
		['fix: change\n\nBREAKING-CHANGE: incompatible', 3],
		['docs: explain', 0],
		['not conventional', 0],
		['fix: mention BREAKING CHANGE: inline', 1]
	] as const)
		expect(analyze([commit(message)]).bump).toBe(bump);
	expect(analyze(['feat: a', 'fix: b', 'perf: c'].map(commit)).bump).toBe(2);
	expect(analyze([]).bump).toBe(0);
});

test('stable SemVer increments and resets components, even before 1.0', () => {
	expect(nextVersion('0.2.9', 1)).toBe('0.2.10');
	expect(nextVersion('1.9.9', 2)).toBe('1.10.0');
	expect(nextVersion('0.2.9', 3)).toBe('1.0.0');
	expect(nextVersion('1.2.3', 0)).toBeNull();
	for (const value of ['01.2.3', '1.2', '1.2.3-beta.1'])
		expect(() => nextVersion(value, 1)).toThrow();
});

test('dated categorized notes prepend without losing prior content and reject duplication', () => {
	const old = '# Changelog\n\n## Unreleased\n\nExisting notes.\n';
	const notes = prependNotes(
		old,
		'1.2.3',
		'2026-09-16',
		['fix(ui): bug', 'feat: feature', 'perf: speed', 'docs!: incompatible', 'test: coverage'].map(
			commit
		)
	);
	expect(notes).toStartWith('# Changelog\n\n## 1.2.3 - 2026-09-16\n');
	for (const section of ['Breaking changes', 'Features', 'Fixes', 'Performance', 'Other changes'])
		expect(notes).toContain(`### ${section}`);
	expect(notes).toContain('- ui: bug (abcdef1)');
	expect(notes).toEndWith(old.slice('# Changelog\n\n'.length));
	expect(() => prependNotes(notes, '1.2.3', '2026-09-17', [])).toThrow();
});

test('all authoritative versions update without rewriting unrelated metadata', () => {
	const source = {
		'package.json': '{"version": "0.0.1", "private": true}\n',
		'codemeta.json': '{"softwareVersion": "0.0.1"}\n',
		'CITATION.cff': "cff-version: 1.2.0\nversion: '0.0.1'\n",
		'CHANGELOG.md': '# Changelog\n'
	};
	const updated = versionFiles(source, '1.0.0');
	expect(JSON.parse(updated['package.json']).version).toBe('1.0.0');
	expect(JSON.parse(updated['codemeta.json']).softwareVersion).toBe('1.0.0');
	expect(updated['CITATION.cff']).toBe("cff-version: 1.2.0\nversion: '1.0.0'\n");
	expect(updated['CHANGELOG.md']).toBe(source['CHANGELOG.md']);
	expect(source['package.json']).toContain('0.0.1');
});

test('retry accepts only original or generated content; committed releases require exact output', () => {
	for (const content of ['original', 'generated'])
		expect(() =>
			validateRetryContent('package.json', content, 'original', 'generated', false)
		).not.toThrow();
	expect(() =>
		validateRetryContent('package.json', 'user edits', 'original', 'generated', false)
	).toThrow('refusing overwrite');
	expect(() =>
		validateRetryContent('package.json', 'original', 'original', 'generated', true)
	).toThrow();
	expect(() =>
		validateRetryContent('package.json', 'generated', 'original', 'generated', true)
	).not.toThrow();
});

test('all local and remote release tags must match exactly', () => {
	const refs = new Map([
		['refs/heads/main', 'main'],
		['refs/tags/v1.0.0', 'tag-object'],
		['refs/tags/v1.0.0^{}', 'tag-commit']
	]);
	const local = (ref: string) => refs.get(ref)!;
	expect(() => validateRemoteTags(['v1.0.0'], refs, local)).not.toThrow();
	expect(() => validateRemoteTags(['v1.0.0', 'v1.1.0'], refs, local)).toThrow('missing');
	expect(() => validateRemoteTags(['v1.0.0', 'v1.1.0'], refs, local, 'v1.1.0')).not.toThrow();
	expect(() =>
		validateRemoteTags(
			['v1.0.0'],
			new Map([
				['refs/tags/v1.0.0', 'tag-object'],
				['refs/tags/v2.0.0', 'other']
			]),
			local
		)
	).toThrow('Fetch');
	expect(() =>
		validateRemoteTags(['v1.0.0'], new Map([['refs/tags/v1.0.0', 'different']]), local)
	).toThrow('matching');
});

// All publication effects below are in-memory fakes; no Git writes or GitHub calls.
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertArchive, fileDigest, publishRelease, type State } from './release';
import { assertSampleFreeArchive, assertSampleFreeDirectory } from './assert_sample_free';

function publicationFixture() {
	const directory = mkdtempSync(join(tmpdir(), 'dashboard-release-test-'));
	const path = join(directory, 'osipy-v1.2.3.tar.gz');
	const contents = join(directory, 'contents');
	mkdirSync(contents);
	writeFileSync(join(contents, 'index.html'), 'exact prebuilt bytes');
	execFileSync('tar', ['-czf', path, '-C', contents, '.']);
	const archiveBytes = readFileSync(path);
	const sha256 = fileDigest(path);
	writeFileSync(`${path}.sha256`, `${sha256}  osipy-v1.2.3.tar.gz\n`);
	const state: State = {
		base: 'a'.repeat(40),
		version: '1.2.3',
		before: {},
		after: {
			'CHANGELOG.md':
				'# Changelog\n\n## 1.2.3 - 2026-09-16\n\n### Fixes\n\n- fixed\n\n## 1.2.2 - old\n'
		},
		archive: { path, sha256 },
		commit: 'b'.repeat(40),
		pushed: true
	};
	let remote:
		| {
				id: number;
				tag_name: string;
				name: string;
				body: string;
				draft: boolean;
				prerelease: boolean;
		  }
		| undefined;
	const assets: { id: number; name: string; state: string; bytes: Buffer }[] = [];
	const calls: string[][] = [];
	let interrupt = '';
	const gh = (args: string[], output?: string): Buffer => {
		calls.push(args);
		const json = (value: unknown) => Buffer.from(JSON.stringify(value));
		const value = (key: string) =>
			args.find((arg) => arg.startsWith(`${key}=`))?.slice(key.length + 1);
		const stop = (at: string) => {
			if (interrupt === at) {
				interrupt = '';
				throw new Error('simulated interruption');
			}
		};
		if (args[0] === 'release') {
			assets.push({
				id: assets.length + 1,
				name: args[3].split('/').at(-1)!,
				state: 'uploaded',
				bytes: readFileSync(args[3])
			});
			stop('upload');
			return Buffer.alloc(0);
		}
		if (args[1].includes('/releases/assets/')) {
			writeFileSync(
				output!,
				assets.find((asset) => asset.id === Number(args[1].split('/').at(-1)))!.bytes
			);
			return Buffer.alloc(0);
		}
		if (args[1].endsWith('/assets')) return json([assets]);
		if (args[1].endsWith('/releases') && !args.includes('POST'))
			return json([remote ? [remote] : []]);
		if (args.includes('POST')) {
			remote = {
				id: 7,
				tag_name: value('tag_name')!,
				name: value('name')!,
				body: value('body')!,
				draft: true,
				prerelease: false
			};
			stop('create');
			return json(remote);
		}
		if (!remote) throw Object.assign(new Error('not found'), { stderr: Buffer.from('(HTTP 404)') });
		if (args.includes('PATCH')) {
			if (value('name')) remote.name = value('name')!;
			if (value('body')) remote.body = value('body')!;
			if (value('prerelease')) remote.prerelease = false;
			if (value('draft') === 'false') {
				remote.draft = false;
				stop('publish');
			}
		}
		return json(remote);
	};
	return {
		state,
		gh,
		calls,
		assets,
		directory,
		setInterrupt: (value: string) => {
			interrupt = value;
		},
		remote: () => remote,
		archiveBytes
	};
}

test('publication reconciles crash after create/upload/publish without duplicates or rebuilding', () => {
	for (const step of ['create', 'upload', 'publish', 'checkpoint']) {
		const f = publicationFixture();
		try {
			f.setInterrupt(step);
			let checkpoint = structuredClone(f.state);
			let failedCheckpoint = false;
			const save = () => {
				if (step === 'checkpoint' && !failedCheckpoint && f.state.uploads) {
					failedCheckpoint = true;
					throw new Error('simulated interruption');
				}
				checkpoint = structuredClone(f.state);
			};
			expect(() => publishRelease(f.state, save, f.gh)).toThrow('simulated interruption');
			publishRelease(checkpoint, () => {}, f.gh);
			expect(checkpoint.complete).toBe(true);
			publishRelease(checkpoint, () => {}, f.gh);
			expect(f.calls.filter((args) => args.includes('POST'))).toHaveLength(1);
			expect(f.calls.filter((args) => args[0] === 'release')).toHaveLength(2);
			expect(f.calls.flat()).not.toContain('--clobber');
			expect(f.assets.map((asset) => asset.name)).toEqual([
				'osipy-v1.2.3.tar.gz',
				'osipy-v1.2.3.tar.gz.sha256'
			]);
			expect(f.assets[0].bytes).toEqual(f.archiveBytes);
		} finally {
			rmSync(f.directory, { recursive: true });
		}
	}
});

test('draft metadata can update; published metadata, missing assets and conflicting bytes fail closed', () => {
	const f = publicationFixture();
	try {
		f.setInterrupt('upload');
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow();
		f.remote()!.name = 'old draft';
		publishRelease(f.state, () => {}, f.gh);
		expect(f.remote()!.name).toBe('v1.2.3');
		f.assets[0].bytes = Buffer.from('tampered');
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow('Conflicting asset');
		f.assets[0].bytes = f.archiveBytes;
		f.remote()!.body = 'edited';
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow('metadata differs');
		f.remote()!.body = '## 1.2.3 - 2026-09-16\n\n### Fixes\n\n- fixed';
		f.assets.pop();
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow('missing');
	} finally {
		rmSync(f.directory, { recursive: true });
	}
});

test('publication inputs and archives reject dataset paths and known sample bytes', () => {
	const directory = mkdtempSync(join(tmpdir(), 'dashboard-sample-free-test-'));
	const samples = Buffer.from('synthetic MRI sample fixture');
	const digest = createHash('sha256').update(samples).digest('hex');
	const digests = new Set([digest]);
	try {
		const safe = join(directory, 'safe');
		mkdirSync(safe);
		writeFileSync(join(safe, 'index.html'), 'safe');
		expect(() => assertSampleFreeDirectory(safe, digests)).not.toThrow();

		writeFileSync(join(safe, 'renamed.bin'), samples);
		expect(() => assertSampleFreeDirectory(safe, digests)).toThrow('MRI sample data');
		const renamedArchive = join(directory, 'renamed.tar.gz');
		execFileSync('tar', ['-czf', renamedArchive, '-C', safe, '.']);
		expect(() => assertSampleFreeArchive(renamedArchive, digests)).toThrow('MRI sample data');

		rmSync(safe, { recursive: true });
		mkdirSync(join(safe, 'datasets'), { recursive: true });
		writeFileSync(join(safe, 'datasets', 'manifest.json'), '{}');
		const datasetArchive = join(directory, 'dataset.tar.gz');
		execFileSync('tar', ['-czf', datasetArchive, '-C', safe, '.']);
		expect(() => assertSampleFreeArchive(datasetArchive, digests)).toThrow('MRI sample data');
	} finally {
		rmSync(directory, { recursive: true });
	}
});

test('local artifact corruption and auth/server errors never create releases', () => {
	const f = publicationFixture();
	try {
		for (const status of ['401', '403', '500']) {
			const calls: string[][] = [];
			expect(() =>
				publishRelease(
					f.state,
					() => {},
					(args) => {
						calls.push(args);
						throw Object.assign(new Error(status), { stderr: Buffer.from(`(HTTP ${status})`) });
					}
				)
			).toThrow(status);
			expect(calls).toHaveLength(1);
		}
		writeFileSync(f.state.archive!.path, 'different bytes');
		expect(() => assertArchive(f.state)).toThrow('Frozen archive');
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow('Frozen archive');
		expect(f.calls).toHaveLength(0);
	} finally {
		rmSync(f.directory, { recursive: true });
	}
});

type Workflow = {
	on: Record<string, unknown>;
	permissions: Record<string, string>;
	concurrency: { group: string; 'cancel-in-progress': boolean };
	jobs: Record<
		string,
		{
			if?: string;
			needs?: string;
			permissions?: Record<string, string>;
			steps: {
				name?: string;
				run?: string;
				uses?: string;
				env?: Record<string, string>;
				with?: Record<string, unknown>;
			}[];
		}
	>;
};
const repositoryRoot = new URL('../../', import.meta.url);
const workflowPath = new URL('.github/workflows/', repositoryRoot);
const pages = Bun.YAML.parse(readFileSync(new URL('pages.yml', workflowPath), 'utf8')) as Workflow;
const container = Bun.YAML.parse(
	readFileSync(new URL('container.yml', workflowPath), 'utf8')
) as Workflow;

test('repository root owns release entry points and documents all release effects', () => {
	const makefile = readFileSync(new URL('Makefile', repositoryRoot), 'utf8');
	expect(makefile).toContain('release:');
	expect(makefile).toContain('bun dashboard/scripts/release.ts');
	expect(makefile).toContain('release-dry-run:');
	const agents = readFileSync(new URL('AGENTS.md', repositoryRoot), 'utf8');
	for (const requirement of [
		'clean, current `main`',
		'Conventional Commits',
		'`chore(release): vX.Y.Z`',
		'annotated `vX.Y.Z` tag',
		'Never run `make release` without explicit authorization'
	])
		expect(agents).toContain(requirement);
});

test('Pages builds and deploys the exact pushed main commit with least privilege', () => {
	expect(pages.on).toEqual({ push: { branches: ['main'] }, workflow_dispatch: null });
	expect(pages.permissions).toEqual({ contents: 'read' });
	expect(pages.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': true });
	expect(pages.jobs.build.if).toBe("github.ref == 'refs/heads/main'");
	expect(pages.jobs.build.permissions).toBeUndefined();
	expect(pages.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
	expect(pages.jobs.deploy.needs).toBe('build');
	const steps = pages.jobs.build.steps;
	expect(steps[0].uses).toBe('actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
	expect(steps[0].with).toEqual({ ref: '${{ github.sha }}', 'persist-credentials': false });
	expect(steps[1].uses).toBe('oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6');
	expect(steps[2].run).toBe('bun install --frozen-lockfile');
	expect(steps[3].run).toContain('bun scripts/assert_sample_free.ts static');
	expect(steps[3].run).toContain('bun run build');
	expect(steps[3].run).toContain('bun scripts/assert_sample_free.ts build');
	expect(steps[3].env).toEqual({ APP_SHA: '${{ github.sha }}' });
	expect(steps.at(-1)?.uses).toStartWith('actions/upload-pages-artifact@');
	expect(pages.jobs.deploy.steps[0].uses).toStartWith('actions/deploy-pages@');
	const workflow = JSON.stringify(pages);
	expect(workflow).not.toContain('contents":"write');
	expect(workflow).not.toMatch(/gh release|release create|release upload|tags/);
});

test('container builds only the authenticated companion, never the frontend or datasets', () => {
	const workflow = JSON.stringify(container);
	expect(workflow).not.toContain('prepare_ivim.py');
	expect(workflow).not.toContain('zenodo.org');
	expect(workflow).toContain('releases/latest');
	expect(workflow).toContain('refusing stale latest promotion');
	expect(container.concurrency['cancel-in-progress']).toBe(false);
	const dockerignore = readFileSync(new URL('dashboard/.dockerignore', repositoryRoot), 'utf8');
	expect(dockerignore).toContain('/data\n');
	expect(dockerignore).toContain('/static/datasets\n');
	const dockerfile = readFileSync(new URL('dashboard/Dockerfile', repositoryRoot), 'utf8');
	expect(dockerfile).toContain('COPY companion /app/companion');
	expect(dockerfile).toContain('CMD ["python", "companion/server.py", "--bind", "0.0.0.0"]');
	expect(dockerfile).not.toMatch(/COPY\s+(?:\.|(?:static|build|data|docker)(?:\s|\/))/);
	const compose = readFileSync(new URL('docker-compose.yml', repositoryRoot), 'utf8');
	expect(compose).toContain('127.0.0.1:60016:60016');
});

test('release structure preserves local gates, freezes before commit and atomically pushes before publication', () => {
	const source = readFileSync(new URL('./release.ts', import.meta.url), 'utf8');
	for (const gate of [
		"assertSampleFreeDirectory('static')",
		"['run', 'check']",
		"['test']",
		"['-m', 'unittest', 'discover', '-s', 'companion']",
		"['run', 'build']",
		"assertSampleFreeDirectory('build')",
		'assertSampleFreeArchive(`${path}.tmp`)'
	])
		expect(source).toContain(gate);
	expect(source.indexOf('if (dry)')).toBeLessThan(source.indexOf("'ls-remote'"));
	expect(source).toContain("'--atomic'");
	expect(source).not.toMatch(/--force|--clobber|reset.*--hard/);
	expect(source.indexOf('state.archive = {')).toBeLessThan(source.indexOf("'commit',\n"));
	expect(source.indexOf('state.pushed = true')).toBeLessThan(
		source.indexOf('publishRelease(state, save)')
	);
	expect(source).toContain('state?.complete &&');
	expect(source).toMatch(
		/const lock = resolve\([\s\S]{0,120}git\('rev-parse', '--absolute-git-dir'\)[\s\S]{0,120}'dashboard-release\.lock'/
	);
});

test('dry-run uses only read-only Git calls, leaves files/index/receipts untouched and lists publication', () => {
	const directory = mkdtempSync(join(tmpdir(), 'dashboard-dry-run-test-'));
	const root = new URL('../', import.meta.url).pathname;
	const gitPath = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
	const localGit = (...args: string[]) =>
		execFileSync(gitPath, args, {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
		}).trim();
	const indexPath = localGit('rev-parse', '--git-path', 'index');
	const snapshot = () => ({
		status: localGit('status', '--porcelain', '--untracked-files=all'),
		head: localGit('rev-parse', 'HEAD'),
		index: fileDigest(resolve(root, indexPath)),
		files: ['package.json', 'CITATION.cff', 'codemeta.json', 'CHANGELOG.md'].map((file) =>
			fileDigest(join(root, file))
		),
		gitEntries: readdirSync(resolve(root, localGit('rev-parse', '--git-dir'))).sort()
	});
	try {
		// Reject every Git operation except the exact read-only command families used by preview.
		writeFileSync(
			join(directory, 'git'),
			`#!/bin/sh\ncase "$1" in\nrev-parse|branch|status|tag|log) exec '${gitPath.replaceAll("'", "'\\''")}' "$@" ;;\n*) exit 99 ;;\nesac\n`,
			{ mode: 0o755 }
		);
		const before = snapshot();
		const result = spawnSync(process.execPath, ['scripts/release.ts', '--dry-run'], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, PATH: directory }
		});
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		for (const step of [
			'atomic push main + tag',
			'GitHub Release',
			'checksum',
			'Pages',
			'exact commit'
		])
			expect(result.stdout).toContain(step);
		expect(snapshot()).toEqual(before);
	} finally {
		rmSync(directory, { recursive: true });
	}
});

test('dry-run reads authoritative versions from dashboard in a monorepo', () => {
	const directory = mkdtempSync(join(tmpdir(), 'dashboard-monorepo-release-test-'));
	const script = new URL('./release.ts', import.meta.url).pathname;
	try {
		mkdirSync(join(directory, 'dashboard'));
		writeFileSync(join(directory, 'dashboard/package.json'), '{"version":"0.0.1"}\n');
		writeFileSync(join(directory, 'dashboard/codemeta.json'), '{"softwareVersion":"0.0.1"}\n');
		writeFileSync(
			join(directory, 'dashboard/CITATION.cff'),
			"cff-version: 1.2.0\nversion: '0.0.1'\n"
		);
		writeFileSync(join(directory, 'dashboard/CHANGELOG.md'), '# Changelog\n\n## Unreleased\n');
		execFileSync('git', ['init', '-b', 'main'], { cwd: directory });
		execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: directory });
		execFileSync('git', ['config', 'user.email', 'release@example.invalid'], { cwd: directory });
		execFileSync('git', ['add', '.'], { cwd: directory });
		execFileSync('git', ['commit', '-m', 'chore: baseline'], { cwd: directory });
		execFileSync('git', ['tag', '-a', 'v0.0.1', '-m', 'baseline'], { cwd: directory });
		writeFileSync(join(directory, 'dashboard/feature.txt'), 'feature\n');
		execFileSync('git', ['add', '.'], { cwd: directory });
		execFileSync('git', ['commit', '-m', 'feat: add dashboard feature'], { cwd: directory });
		const result = spawnSync(process.execPath, [script, '--dry-run'], {
			cwd: directory,
			encoding: 'utf8'
		});
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('v0.0.1 → v0.1.0');
		expect(result.stdout).toContain('## 0.1.0 - ');
	} finally {
		rmSync(directory, { recursive: true });
	}
});
