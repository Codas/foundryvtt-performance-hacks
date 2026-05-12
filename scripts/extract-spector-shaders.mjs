/**
 * Extract unique fragment shaders from a spector.js JSON capture.
 *
 * Usage: node ./extract-spector-shaders.mjs <capture.json> [out-dir]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const inputFile = process.argv[2]
const outDir = resolve(process.argv[3] ?? 'extracted-shaders')

if (!inputFile) {
	console.error('Usage: node ./extract-spector-shaders.mjs <capture.json> [out-dir]')
	process.exit(1)
}

const capture = JSON.parse(readFileSync(inputFile, 'utf-8'))
const commands = capture.commands

/** @type {Map<string, { source: string; name: string }>} */
const uniqueShaders = new Map()

for (const cmd of commands) {
	const shaders = cmd?.DrawCall?.shaders
	if (!shaders) {
		continue
	}

	for (const sh of shaders) {
		if (sh.shaderType !== 'FRAGMENT_SHADER' || !sh.source) {
			continue
		}
		const trimmed = sh.source.trim()
		if (!uniqueShaders.has(trimmed)) {
			uniqueShaders.set(trimmed, { source: trimmed, name: sh.name || 'unknown' })
		}
	}
}

console.log(`Found ${uniqueShaders.size} unique fragment shaders`)

// Group by base name to detect collisions
/** @type {Map<string, Array<{ source: string }>>} */
const byName = new Map()
for (const [src, { name }] of uniqueShaders) {
	const list = byName.get(name) || []
	list.push({ source: src })
	byName.set(name, list)
}

mkdirSync(outDir, { recursive: true })

let written = 0
for (const [name, entries] of byName) {
	for (let i = 0; i < entries.length; i++) {
		const suffix = entries.length > 1 ? `-${i + 1}` : ''
		const filename = `${name}${suffix}.frag`
		writeFileSync(resolve(outDir, filename), entries[i].source)
		written++
	}
}

console.log(`Wrote ${written} files to ${outDir}`)
