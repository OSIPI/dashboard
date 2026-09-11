import { execSync } from 'child_process';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';

const getVersion = (): string => {
	try {
		return execSync('git describe --tags --always').toString().trim();
	} catch {
		return 'dev';
	}
};

export default defineConfig({
	// Discover worker dependencies at startup, rather than reloading a session after its first export.
	optimizeDeps: { include: ['nifti-reader-js', 'dicom-parser', 'fflate'] },
	server: {
		host: '0.0.0.0',
		port: 60010,
		strictPort: true
	},
	preview: {
		host: '0.0.0.0',
		port: 60014,
		strictPort: true
	},
	define: {
		__APP_VERSION__: JSON.stringify(getVersion()),
		__BUILD_DATE__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		Icons({
			compiler: 'svelte',
			autoInstall: true
		})
	]
});
