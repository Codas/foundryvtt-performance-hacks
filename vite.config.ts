/* eslint-env node */
import resolve from '@rollup/plugin-node-resolve'; // This resolves NPM modules from node_modules.
import { type Connect, defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import moduleJSON from './module.json' with { type: 'json' };

const packagePath = `modules/${moduleJSON.id}`;

const FOUNDRY_PORT = 29999;

export default defineConfig(({ command: _buildOrServe }) => ({
	root: 'src',
	base: `/${packagePath}/dist`,
	cacheDir: '../.vite-cache',
	publicDir: '../assets',

	esbuild: {
		target: ['es2022'],
	},

	resolve: { conditions: ['import', 'browser'] },

	server: {
		open: '/join',
		port: 30001,
		proxy: {
			// Serves static files from main Foundry server.
			[`^(/${packagePath}/(assets|lang|packs|styles|templates))`]: `http://localhost:${FOUNDRY_PORT}`,

			// All other paths besides package ID path are served from main Foundry server.
			[`^(?!/${packagePath}/)`]: `http://localhost:${FOUNDRY_PORT}`,

			// Enable socket.io from main Foundry server.
			'/socket.io': { target: `ws://localhost:${FOUNDRY_PORT}`, ws: true },
		},
	},

	build: {
		outDir: '../dist',
		emptyOutDir: true,
		sourcemap: true,
		minify: true,
		lib: {
			entry: 'index.js',
			formats: ['es'],
			fileName: moduleJSON.id,
		},
	},

	optimizeDeps: {
		esbuildOptions: {
			target: 'es2022',
		},
	},

	plugins: [
		tsconfigPaths(),
		resolve({
			browser: true,
		}),
		{
			name: 'change-names',
			configureServer(server) {
				server.middlewares.use((req: Connect.IncomingMessage & { url?: string }, res, next) => {
					if (req.originalUrl === `/${packagePath}/dist/${moduleJSON.id}.js`) {
						req.url = `/${packagePath}/dist/index.js`;
					}
					next();
				});
			},
		},
	],
}));
