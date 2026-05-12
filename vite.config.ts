/* eslint-env node */
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { type Connect, defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'
import moduleJSON from './module.json' with { type: 'json' }

const packagePath = `modules/${moduleJSON.id}`

const FOUNDRY_PORT = 29999
const FOUNDRY_HOST = process.env.FOUNDRY_HOST ?? 'localhost'

export default defineConfig(({ command: _buildOrServe }) => ({
	root: 'src',
	base: `/${packagePath}/dist`,
	cacheDir: '../.vite-cache',
	publicDir: '../assets',

	resolve: { conditions: ['import', 'browser'], tsconfigPaths: true },

	server: {
		open: '/join',
		port: 30001,
		host: '0.0.0.0',
		proxy: {
			// Serves static files from main Foundry server.
			[`^(/${packagePath}/(assets|lang|packs|styles|templates))`]: `http://${FOUNDRY_HOST}:${FOUNDRY_PORT}`,

			// All other paths besides package ID path are served from main Foundry server.
			[`^(?!/${packagePath}/)`]: `http://${FOUNDRY_HOST}:${FOUNDRY_PORT}`,

			// Enable socket.io from main Foundry server.
			'/socket.io': { target: `ws://${FOUNDRY_HOST}:${FOUNDRY_PORT}`, ws: true },
		},
	},

	build: {
		outDir: '../dist',
		emptyOutDir: true,
		sourcemap: true,
		minify: true,
		target: 'es2024',
		lib: {
			entry: 'index.js',
			formats: ['es'],
			fileName: moduleJSON.id,
		},
	},

	plugins: [
		svelte(),
		glsl({
			importKeywords: ['#include', '//#include'],
		}),
		{
			name: 'change-names',
			configureServer(server) {
				server.middlewares.use((req: Connect.IncomingMessage & { url?: string }, _res, next) => {
					if (req.originalUrl === `/${packagePath}/dist/${moduleJSON.id}.js`) {
						req.url = `/${packagePath}/dist/index.js`
					}
					next()
				})
			},
		},
	],
}))
