import { expect, test } from 'bun:test';
import { analyze, nextVersion, prependNotes, versionFiles, validateRetryContent } from './release';

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

// All publication effects below are in-memory fakes; no Git writes or GitHub calls.
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertArchive, fileDigest, publishRelease, type State } from './release';

function publicationFixture() {
	const directory = mkdtempSync(join(tmpdir(), 'dashboard-release-test-'));
	const path = join(directory, 'osipy-v1.2.3.tar.gz');
	writeFileSync(path, 'exact prebuilt bytes');
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
		remote: () => remote
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
			expect(f.assets[0].bytes.toString()).toBe('exact prebuilt bytes');
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
		f.assets[0].bytes = Buffer.from('exact prebuilt bytes');
		f.remote()!.body = 'edited';
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow('metadata differs');
		f.remote()!.body = '## 1.2.3 - 2026-09-16\n\n### Fixes\n\n- fixed';
		f.assets.pop();
		expect(() => publishRelease(f.state, () => {}, f.gh)).toThrow('missing');
	} finally {
		rmSync(f.directory, { recursive: true });
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
	jobs: Record<
		string,
		{
			permissions?: Record<string, string>;
			steps: { name?: string; run?: string; uses?: string }[];
		}
	>;
};
const workflowPath = new URL('../.github/workflows/', import.meta.url);
const pages = Bun.YAML.parse(readFileSync(new URL('pages.yml', workflowPath), 'utf8')) as Workflow;

test('Actions never build; Pages only deploys verified tag assets with least privilege', () => {
	for (const name of readdirSync(workflowPath)) {
		const text = readFileSync(new URL(name, workflowPath), 'utf8');
		expect(text).not.toMatch(
			/(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?build|vite build|semantic-release/
		);
	}
	expect(pages.on).toEqual({ push: { tags: ['v*'] } });
	expect(pages.permissions).toEqual({ contents: 'read' });
	expect(pages.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
	const steps = pages.jobs.artifact.steps;
	expect(steps.map((step) => step.uses ?? '').join('\n')).not.toMatch(/checkout|setup-/);
	expect(steps.map((step) => step.run ?? '').join('\n')).not.toMatch(/\binstall\b|\bbuild\b/);
	expect(steps[0].run).toContain('gh release download');
	expect(steps[0].run).toContain('seq 1 120');
	expect(steps[1].run).toContain('hashlib.sha256()');
	expect(steps[1].run).toContain("annotation['object']['sha'] == os.environ['GITHUB_SHA']");
	expect(steps.at(-1)?.uses).toStartWith('actions/upload-pages-artifact@');
	expect(pages.jobs.deploy.steps[0].uses).toStartWith('actions/deploy-pages@');
});

test('actual Pages verifier accepts exact archive; rejects corruption, identity mismatch and unsafe members', () => {
	const script = pages.jobs.artifact.steps[1]
		.run!.split("python3 - <<'PY'\n")[1]
		.replace(/\nPY\s*$/, '\n');
	for (const mode of [
		'valid',
		'corrupt',
		'version',
		'source',
		'basePath',
		'traversal',
		'absolute',
		'symlink',
		'hardlink',
		'fifo',
		'duplicate',
		'tag'
	]) {
		const directory = mkdtempSync(join(tmpdir(), 'dashboard-pages-test-'));
		try {
			execFileSync(
				'python3',
				[
					'-c',
					`
import io, json, tarfile, pathlib, hashlib, sys, os
root = pathlib.Path('incoming'); root.mkdir()
mode = sys.argv[1]
archive = root / 'osipy-v1.2.3.tar.gz'
with tarfile.open(archive, 'w:gz') as bundle:
    files = {'index.html': b'<html>site</html>', 'release.json': json.dumps({'version': 'v9.9.9' if mode == 'version' else 'v1.2.3', 'source': ('c' if mode == 'source' else 'a')*40, 'basePath': '/' if mode == 'basePath' else '/dashboard'}).encode()}
    if mode == 'traversal': files['../escape'] = b'unsafe'
    if mode == 'absolute': files['/escape'] = b'unsafe'
    files['assets/nested/data.bin'] = os.urandom(2 * 1024 * 1024)
    for name, data in files.items():
        member = tarfile.TarInfo(name); member.size = len(data); bundle.addfile(member, io.BytesIO(data))
    if mode in ('symlink', 'hardlink', 'fifo'):
        member = tarfile.TarInfo('link'); member.type = {'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE, 'fifo': tarfile.FIFOTYPE}[mode]; member.linkname = '/etc/passwd'; bundle.addfile(member)
    if mode == 'duplicate': bundle.addfile(tarfile.TarInfo('index.html'))
sha = hashlib.sha256(archive.read_bytes()).hexdigest()
(root / (archive.name + '.sha256')).write_text(sha + '  ' + archive.name + '\\n')
(root / 'tag.json').write_text(json.dumps({'tag': 'v1.2.3', 'object': {'type': 'commit', 'sha': ('c' if mode == 'tag' else 'b')*40}, 'message': 'Release v1.2.3\\n\\nSHA256: ' + sha + '\\nSource: ' + 'a'*40 + '\\n'}))
if mode == 'corrupt': archive.write_bytes(b'corrupt')
`,
					mode
				],
				{ cwd: directory }
			);
			const result = spawnSync('python3', ['-c', script], {
				cwd: directory,
				env: { ...process.env, RELEASE_TAG: 'v1.2.3', GITHUB_SHA: 'b'.repeat(40) }
			});
			if (mode === 'valid') {
				expect(result.stderr.toString()).toBe('');
				expect(result.status).toBe(0);
				expect(readFileSync(join(directory, 'site/index.html'), 'utf8')).toBe('<html>site</html>');
				expect(readFileSync(join(directory, 'site/assets/nested/data.bin')).length).toBe(
					2 * 1024 * 1024
				);
			} else {
				expect(result.status).not.toBe(0);
				expect(result.stderr.toString()).toContain('AssertionError');
				expect(readdirSync(directory)).toEqual(['incoming']);
			}
		} finally {
			rmSync(directory, { recursive: true });
		}
	}
});

test('release structure preserves local gates, freezes before commit and atomically pushes before publication', () => {
	const source = readFileSync(new URL('./release.ts', import.meta.url), 'utf8');
	for (const gate of [
		"['run', 'check']",
		"['test']",
		"['-m', 'unittest', 'discover', '-s', 'companion']",
		"['scripts/prepare_ivim.py', '--verify']",
		"['run', 'build']"
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
			'without install/build'
		])
			expect(result.stdout).toContain(step);
		expect(snapshot()).toEqual(before);
	} finally {
		rmSync(directory, { recursive: true });
	}
});
