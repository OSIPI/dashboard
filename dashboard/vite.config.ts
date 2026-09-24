import { execSync } from 'child_process';
import { request } from 'node:http';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import Icons from 'unplugin-icons/vite';
import { version as manifestVersion } from './package.json';

const getSha = (): string => {
	if (process.env.APP_SHA) return process.env.APP_SHA.slice(0, 12);
	try {
		return execSync('git rev-parse --short=12 HEAD').toString().trim();
	} catch {
		return 'unknown';
	}
};

const getBaseVersion = (): string => {
	try {
		return execSync("git describe --tags --abbrev=0 --match 'v[0-9]*'", {
			stdio: ['ignore', 'pipe', 'ignore']
		})
			.toString()
			.trim()
			.replace(/^v/, '');
	} catch {
		return manifestVersion;
	}
};

const buildSha = getSha();
const appVersion = process.env.APP_VERSION ?? `${getBaseVersion()}-dev+${buildSha}`;

function localCompanionProxy(token: string): Plugin {
	return {
		name: 'local-companion-proxy',
		configureServer(server) {
			server.middlewares.use('/local-companion', (req, res) => {
				const host = req.headers.host;
				const origin = req.headers.origin;
				const path = req.url ?? '';
				const allowed =
					(req.method === 'GET' && /^\/(models|runs(?:\/[a-f0-9-]+(?:\/result)?)?)$/.test(path)) ||
					(req.method === 'POST' && (path === '/runs' || path === '/datasets')) ||
					(req.method === 'DELETE' && /^\/runs\/[a-f0-9-]+$/.test(path));
				if (
					!['localhost:60010', '127.0.0.1:60010'].includes(host ?? '') ||
					(origin && origin !== `http://${host}`) ||
					req.headers['sec-fetch-site'] !== 'same-origin' ||
					!allowed
				) {
					res.writeHead(403).end();
					return;
				}
				const upstream = request(
					{
						hostname: '127.0.0.1',
						port: 60016,
						path,
						method: req.method,
						headers: {
							Authorization: `Bearer ${token}`,
							...(req.headers['content-type']
								? { 'Content-Type': req.headers['content-type'] }
								: {}),
							...(req.headers['content-length']
								? { 'Content-Length': req.headers['content-length'] }
								: {})
						}
					},
					(response) => {
						res.writeHead(response.statusCode ?? 502, {
							'Content-Type': response.headers['content-type'] ?? 'application/octet-stream',
							'Cache-Control': 'no-store'
						});
						response.pipe(res);
					}
				);
				upstream.on('error', () => {
					if (!res.headersSent) res.writeHead(502);
					res.end();
				});
				req.on('aborted', () => upstream.destroy());
				req.pipe(upstream);
			});
		}
	};
}

export default defineConfig(({ command }) => {
	const localToken = command === 'serve' ? process.env.OSIPY_DASHBOARD_TOKEN : undefined;
	return {
		// Discover worker dependencies at startup, rather than reloading a session after its first export.
		optimizeDeps: { include: ['nifti-reader-js', 'dicom-parser', 'fflate'] },
		server: {
			host: localToken ? '127.0.0.1' : '0.0.0.0',
			port: 60010,
			strictPort: true
		},
		preview: {
			host: '0.0.0.0',
			port: 60014,
			strictPort: true
		},
		define: {
			__LOCAL_COMPANION_PROXY__: JSON.stringify(!!localToken),
			__APP_VERSION__: JSON.stringify(appVersion),
			__BUILD_SHA__: JSON.stringify(buildSha),
			__BUILD_DATE__: JSON.stringify(new Date().toISOString())
		},
		plugins: [
			...(localToken ? [localCompanionProxy(localToken)] : []),
			tailwindcss(),
			sveltekit(),
			devtoolsJson(),
			Icons({
				compiler: 'svelte',
				autoInstall: true
			})
		]
	};
});
