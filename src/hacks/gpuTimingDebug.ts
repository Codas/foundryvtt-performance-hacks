import PerformanceOverlayComponent from 'src/apps/PerformanceOverlay.svelte'
import { SvelteApplicationMixin } from 'src/apps/SvelteApplicationMixin.svelte.ts'
import { lastFrameTokenCount, lastFrameVoidMeshBatchCount } from 'src/hacks/generalizedOooRendering.ts'

/**
 * CPU and GPU profiler for foundry's canvas rendering.
 * Uses EXT_disjoint_timer_query_webgl2 / EXT_disjoint_timer_query to measure GPU time spent
 * in each layer's `render` method.
 * Results are aggregated over a rollinw window and displayed in a custom ApplicationV2 overlay.
 */

// ============================================================================
// #region Types

interface PendingResult {
	label: string
	query: WebGLQuery
}

interface RollingStats {
	label: string
	samples: number[]
	head: number
}

export interface TimingDisplayRow {
	label: string
	gpuMs: string
	cpuMs: string
}

export interface TimingDisplayGroup {
	label: string
	isSingle: boolean
	rows: TimingDisplayRow[]
	subtotalGpuMs: string
	subtotalCpuMs: string
}

export interface OverlayState {
	groups: TimingDisplayGroup[]
	totalGpuMs: string
	totalCpuMs: string
	rollingWindow: number
	tokenCount: number
	voidMeshBatchCount: number
}

// #endregion

// ============================================================================
// #region Rolling average

function createStats(label: string, rollingWindow: number): RollingStats {
	return { label, samples: new Array(rollingWindow).fill(0), head: 0 }
}

function pushSample(stats: RollingStats, microseconds: number) {
	const windowSize = stats.samples.length
	stats.samples[stats.head] = microseconds
	stats.head = (stats.head + 1) % windowSize
}

function average(stats: RollingStats): number {
	return stats.samples.reduce((a, b) => a + b, 0) / stats.samples.length
}

// #endregion

// ============================================================================
// #region Performance overlay window

class PerformanceOverlayWindow extends SvelteApplicationMixin(foundry.applications.api.ApplicationV2) {
	static override DEFAULT_OPTIONS = {
		id: 'performance-overlay',
		window: {
			title: 'Performance Overlay',
			icon: 'fa-solid fa-gauge-high',
		},
		position: {
			width: 420,
		},
	}

	protected override readonly root = PerformanceOverlayComponent

	#onClose: (() => void) | null = null

	setData(
		groups: TimingDisplayGroup[],
		totalGpuMs: string,
		totalCpuMs: string,
		rollingWindow: number,
		tokenCount: number,
		voidMeshBatchCount: number,
	) {
		Object.assign(this.$state, { groups, totalGpuMs, totalCpuMs, rollingWindow, tokenCount, voidMeshBatchCount })
		if (!this.rendered) {
			void this.render(true)
		}
	}

	setOnClose(callback: () => void) {
		this.#onClose = callback
	}

	override _onClose(options: any) {
		super._onClose(options)
		this.#onClose?.()
	}

	override async _prepareContext(_options: any): Promise<any> {
		const s = this.$state as {
			groups?: TimingDisplayGroup[]
			totalGpuMs?: string
			totalCpuMs?: string
			rollingWindow?: number
			tokenCount?: number
			voidMeshBatchCount?: number
		}
		return {
			data: {
				groups: s.groups ?? [],
				totalGpuMs: s.totalGpuMs ?? '0.000',
				totalCpuMs: s.totalCpuMs ?? '0.000',
				rollingWindow: s.rollingWindow ?? 60,
				tokenCount: s.tokenCount ?? 0,
				voidMeshBatchCount: s.voidMeshBatchCount ?? 0,
			},
		}
	}
}

// #endregion

// ============================================================================
// #region Target descriptor

interface TimingSingleTarget {
	label: string
	/** Returns the PIXI container whose render() call should be wrapped. */
	getContainer: () => PIXI.Container | null
}

interface TimingGroupTarget {
	label: string
	children: TimingSingleTarget[]
}

/**
 * Marker target for the PrimaryCanvasGroup batched-runs profiling mode.
 * The profiler installs a parent wrapper on canvas.primary.render and
 * per-child wrappers that detect run boundaries dynamically (since
 * primary.children gets re-sorted every frame). Display labels are
 * generated at render time and surfaced through #groupStats.
 */
interface TimingPrimaryRunsTarget {
	kind: 'primaryRuns'
	getPrimary: () => PIXI.Container | null
}

type TimingTarget = TimingSingleTarget | TimingGroupTarget | TimingPrimaryRunsTarget

function isSingleTarget(t: TimingTarget): t is TimingSingleTarget {
	return 'getContainer' in t
}

function isPrimaryRunsTarget(t: TimingTarget): t is TimingPrimaryRunsTarget {
	return 'kind' in t && t.kind === 'primaryRuns'
}

function getLayerTargets(): TimingTarget[] {
	const ig = canvas.interface as any

	return [
		{
			label: 'PrimaryCanvasGroup',
			getContainer: () => canvas.primary as unknown as PIXI.Container,
		},

		{ label: 'CanvasVisibility', getContainer: () => canvas.visibility },
		{
			label: 'Canvas Effects',
			children: [
				{ label: 'CanvasBackgroundAlterationEffects', getContainer: () => canvas.effects.background },
				{ label: 'CanvasIlluminationEffects', getContainer: () => canvas.effects.illumination },
				{ label: 'CanvasColorationEffects', getContainer: () => canvas.effects.coloration },
				{ label: 'CanvasDarknessEffects', getContainer: () => canvas.effects.darkness },
			],
		},
		{
			label: 'Interface Layer',
			children: [
				{ label: 'GridLayer', getContainer: () => ig.grid },
				{ label: 'RegionLayer', getContainer: () => ig.regions },
				{ label: 'TokenLayer', getContainer: () => ig.tokens },
				{ label: 'TilesLayer', getContainer: () => ig.tiles },
				{ label: 'TemplatesLayer', getContainer: () => ig.templates },
				{ label: 'DrawingsLayer', getContainer: () => ig.drawings },
				{ label: 'WallsLayer', getContainer: () => ig.walls },
				{ label: 'NotesLayer', getContainer: () => ig.notes },
				{ label: 'SoundsLayer', getContainer: () => ig.sounds },
				{ label: 'LightingLayer', getContainer: () => ig.lighting },
				{ label: 'ControlsLayer', getContainer: () => ig.controls },
			],
		},
	]
}

/**
 * Targets for the PrimaryCanvasGroup mode: a single marker target that the
 * profiler resolves into per-child wrappers + a parent wrapper at install
 * time. Run boundaries are detected dynamically each frame because Foundry
 * re-sorts canvas.primary.children every frame.
 */
function getPrimaryChildrenTargets(): TimingTarget[] {
	return [
		{
			kind: 'primaryRuns',
			getPrimary: () => canvas.primary,
		},
	]
}

// #endregion

// ============================================================================
// #region Timer query adapter

/**
 * Provide EXT_disjoint_timer_query_webgl2 (Chrome/standard) and EXT_disjoint_timer_query
 * (Firefox's non-standard alias for WebGL2) as a unified interface
 */
interface TimerQueryAdapter {
	TIME_ELAPSED_EXT: GLenum
	GPU_DISJOINT_EXT: GLenum
	QUERY_RESULT_AVAILABLE: GLenum
	QUERY_RESULT: GLenum
	createQuery(): WebGLQuery | null
	deleteQuery(query: WebGLQuery): void
	beginQuery(target: GLenum, query: WebGLQuery): void
	endQuery(target: GLenum): void
	getQueryParameter(query: WebGLQuery, pname: GLenum): any
}

function getTimerQueryAdapter(gl: WebGL2RenderingContext): TimerQueryAdapter | null {
	// Standard WebGL2s extension (Chrome, Edge, Safari)
	const webgl2Ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
	if (webgl2Ext) {
		return {
			TIME_ELAPSED_EXT: webgl2Ext.TIME_ELAPSED_EXT,
			GPU_DISJOINT_EXT: webgl2Ext.GPU_DISJOINT_EXT,
			QUERY_RESULT_AVAILABLE: gl.QUERY_RESULT_AVAILABLE,
			QUERY_RESULT: gl.QUERY_RESULT,
			createQuery: () => gl.createQuery(),
			deleteQuery: (q) => gl.deleteQuery(q),
			beginQuery: (target, q) => gl.beginQuery(target, q),
			endQuery: (target) => gl.endQuery(target),
			getQueryParameter: (q, pname) => gl.getQueryParameter(q, pname),
		}
	}

	// Firefox uses the WebGL1 extension name even on a WebGL2 context, with extension-object
	// methods instead of gl.* methods.
	const firefoxExt = gl.getExtension('EXT_disjoint_timer_query')
	if (firefoxExt) {
		return {
			TIME_ELAPSED_EXT: firefoxExt.TIME_ELAPSED_EXT,
			GPU_DISJOINT_EXT: firefoxExt.GPU_DISJOINT_EXT,
			QUERY_RESULT_AVAILABLE: firefoxExt.QUERY_RESULT_AVAILABLE_EXT,
			QUERY_RESULT: firefoxExt.QUERY_RESULT_EXT,
			createQuery: () => firefoxExt.createQueryEXT(),
			deleteQuery: (q) => firefoxExt.deleteQueryEXT(q),
			beginQuery: (target, q) => firefoxExt.beginQueryEXT(target, q),
			endQuery: (target) => firefoxExt.endQueryEXT(target),
			getQueryParameter: (q, pname) => firefoxExt.getQueryObjectEXT(q, pname),
		}
	}

	return null
}

// #endregion

// ============================================================================
// #region Core profiler

class GpuProfiler {
	#timerQuery: TimerQueryAdapter | null = null
	#gl: WebGL2RenderingContext | null = null
	#active = false
	#wrappedContainers = new Map<
		PIXI.Container,
		{
			originalRender: (renderer: PIXI.Renderer) => void
			gpuStats: RollingStats
			cpuStats: RollingStats
			queryPool: WebGLQuery[]
		}
	>()

	/**
	 * Stats for span-timed groups, keyed by group label. The same stats entry
	 * is shared by the begin-wrapper (on the first child) and the end-wrapper
	 * (on the last child) of the run.
	 */
	#groupStats = new Map<
		string,
		{
			gpuStats: RollingStats
			cpuStats: RollingStats
			queryPool: WebGLQuery[]
			/** Active query for the in-flight span, set by begin and ended by end. */
			activeQuery: WebGLQuery | null
			/** CPU start timestamp captured before the first child renders. */
			cpuT0: number
		}
	>()

	/**
	 * Original render functions for primary-run-wrapped containers (children
	 * of canvas.primary plus canvas.primary itself), so they can be restored
	 * on stop().
	 */
	#wrappedPrimaryRunContainers = new Map<PIXI.Container, (renderer: PIXI.Renderer) => void>()

	/**
	 * Per-frame state for the dynamic run boundary detector. `framePass` is
	 * true only while canvas.primary.render is on the stack — the parent
	 * wrapper sets it before iterating children and clears it after.
	 *
	 * Re-entrant child renders (e.g. a filter pass that re-renders a sprite
	 * that also lives under primary) see framePass=false and pass through
	 * untimed.
	 */
	#runState = {
		framePass: false,
		currentLabel: null as string | null,
		currentPluginName: null as string | null,
		currentQuery: null as WebGLQuery | null,
		currentCpuT0: 0,
		pluginNameCounts: new Map<string, number>(),
		/** Pool of timer queries reusable across runs in this profiler. */
		queryPool: [] as WebGLQuery[],
		/** Encounter order of run labels for the current frame, for stable display. */
		encounterOrderThisFrame: [] as string[],
		/** Encounter order from the most recently completed frame, used for display. */
		lastFrameEncounterOrder: [] as string[],
	}

	/**
	 * True while any TIME_ELAPSED query is currently active on the GL context.
	 * WebGL only allows one such query at a time globally, and wrapped
	 * containers can be re-entered through unexpected parents (e.g. Ember's
	 * renderAdvancedWithPartialFilterPass renders sprites that also belong
	 * to a span run). When that happens, suppress the inner timing rather
	 * than triggering INVALID_OPERATION.
	 */
	#queryActive = false

	/** Queries issued this frame, waiting to be read back next frame. */
	#pendingResults: PendingResult[] = []

	/** requestAnimationFrame handle for the read-back loop. */
	#rafHandle: number | null = null

	/** Rolling window size default for performance stats, overridden by game settings. */
	#rollingWindow = 60
	#statsWindow: PerformanceOverlayWindow | null = null
	#lastStatsUpdate = 0

	/** Factory that returns the timing targets to instrument. */
	#targetsFactory: () => TimingTarget[]

	constructor(targetsFactory?: () => TimingTarget[]) {
		this.#targetsFactory = targetsFactory ?? getLayerTargets
	}

	start() {
		if (this.#active) {
			console.warn('[PrimePerformance] GPU profiler is already running.')
			return
		}

		const renderer = canvas?.app?.renderer as PIXI.Renderer | undefined
		if (!renderer) {
			console.error('[PrimePerformance] No canvas renderer found. Open a scene first.')
			return
		}

		const gl = renderer.gl as WebGL2RenderingContext
		const timerQuery = getTimerQueryAdapter(gl)
		if (!timerQuery) {
			console.error(
				'[PrimePerformance] Neither EXT_disjoint_timer_query_webgl2 nor EXT_disjoint_timer_query is available in this browser/context.',
			)
			return
		}

		this.#gl = gl
		this.#timerQuery = timerQuery
		this.#rollingWindow = (game.settings.get('core', 'maxFPS') as number) || this.#rollingWindow
		this.#active = true
		this.#queryActive = false

		this.#installWrappers()
		this.#ensureStatsWindow()
		this.#startReadbackLoop()
	}

	stop() {
		if (!this.#active) {
			return
		}
		this.#active = false
		this.#queryActive = false
		this.#removeWrappers()
		this.#stopReadbackLoop()
		this.#pendingResults = []
		this.#closeStatsWindow()
		console.info('[PrimePerformance] GPU profiler stopped.')
	}

	// #region Wrapper install / remove

	#installWrappers() {
		const targets = this.#targetsFactory()
		for (const target of targets) {
			if (isPrimaryRunsTarget(target)) {
				this.#installPrimaryRunsWrappers(target)
				continue
			}

			const singles = isSingleTarget(target) ? [target] : target.children
			for (const single of singles) {
				this.#installSingleWrapper(single)
			}
		}
	}

	#installSingleWrapper(single: TimingSingleTarget) {
		const container = single.getContainer()
		if (!container) {
			console.warn(`[PrimePerformance] Layer not found: ${single.label}`)
			return
		}
		if (this.#wrappedContainers.has(container)) {
			return
		}
		const timerQuery = this.#timerQuery
		if (!timerQuery) {
			return
		}

		const gpuStats = createStats(single.label, this.#rollingWindow)
		const cpuStats = createStats(single.label, this.#rollingWindow)
		const queryPool: WebGLQuery[] = []
		const originalRender = container.render.bind(container)

		container.render = (renderer: PIXI.Renderer) => {
			if (!this.isActive) {
				originalRender(renderer)
				return
			}
			if (this.queryActive) {
				originalRender(renderer)
				return
			}
			const query = queryPool.pop() ?? timerQuery.createQuery()
			if (!query) {
				originalRender(renderer)
				return
			}

			timerQuery.beginQuery(timerQuery.TIME_ELAPSED_EXT, query)
			this.markQueryActive(true)
			const cpuT0 = performance.now()
			originalRender(renderer)
			const cpuMicros = (performance.now() - cpuT0) * 1000
			timerQuery.endQuery(timerQuery.TIME_ELAPSED_EXT)
			this.markQueryActive(false)

			pushSample(cpuStats, cpuMicros)
			this.enqueuePending({ label: single.label, query })
		}

		this.#wrappedContainers.set(container, { originalRender, gpuStats, cpuStats, queryPool })
	}

	/**
	 * Wrap only canvas.primary.render. Inside that wrapper, we re-wrap any
	 * children that aren't yet instrumented before delegating to the original
	 * render. This keeps the child set current across scrolling / scene
	 * changes without requiring a separate mechanism for additions/removals.
	 */
	#installPrimaryRunsWrappers(target: TimingPrimaryRunsTarget) {
		const primary = target.getPrimary()
		if (!primary) {
			console.warn('[PrimePerformance] canvas.primary not found.')
			return
		}
		if (!this.#timerQuery) {
			return
		}

		if (!this.#wrappedPrimaryRunContainers.has(primary)) {
			const originalPrimary = primary.render.bind(primary)
			primary.render = (renderer: PIXI.Renderer) => {
				if (!this.isActive) {
					originalPrimary(renderer)
					return
				}
				// Sync wrappers with current children before Foundry iterates them.
				this.#syncPrimaryChildWrappers(primary)
				this.#beginFrame()
				originalPrimary(renderer)
				this.#endFrame()
			}
			this.#wrappedPrimaryRunContainers.set(primary, originalPrimary)
		}
	}

	/**
	 * Wrap any children of primary that aren't yet instrumented, and restore
	 * wrappers for children that were removed. Called once per frame before
	 * primary.render iterates children.
	 */
	#syncPrimaryChildWrappers(primary: PIXI.Container) {
		const liveChildren = new Set(primary.children as PIXI.Container[])

		// Remove wrappers from children that left primary (excluding primary itself).
		for (const [child, original] of this.#wrappedPrimaryRunContainers) {
			if (child === primary) {
				continue
			}
			if (!liveChildren.has(child)) {
				child.render = original
				this.#wrappedPrimaryRunContainers.delete(child)
			}
		}

		// Add wrappers for children not yet instrumented.
		for (const child of liveChildren) {
			if (this.#wrappedPrimaryRunContainers.has(child)) {
				continue
			}
			const original = child.render.bind(child)
			child.render = (renderer: PIXI.Renderer) => {
				this.#onPrimaryChildRender(child, renderer, original)
			}
			this.#wrappedPrimaryRunContainers.set(child, original)
		}
	}

	#beginFrame() {
		const rs = this.#runState
		rs.framePass = true
		rs.currentLabel = null
		rs.currentPluginName = null
		rs.currentQuery = null
		rs.currentCpuT0 = 0
		rs.pluginNameCounts.clear()
		rs.encounterOrderThisFrame = []
	}

	#endFrame() {
		const rs = this.#runState
		this.#closeCurrentRun()
		rs.framePass = false
		rs.lastFrameEncounterOrder = rs.encounterOrderThisFrame
	}

	/**
	 * Called from each wrapped primary child's render. Decides whether to
	 * close the previous run and open a new one based on pluginName, then
	 * invokes the original render.
	 */
	#onPrimaryChildRender(
		child: PIXI.Container,
		renderer: PIXI.Renderer,
		originalRender: (renderer: PIXI.Renderer) => void,
	) {
		const rs = this.#runState
		// Re-entrant render (e.g. a filter pass that re-renders this child
		// outside canvas.primary.render): pass through untimed.
		if (!rs.framePass || !this.isActive) {
			originalRender(renderer)
			return
		}

		const pluginName = ((child as any).pluginName as string) ?? null

		if (pluginName == null || pluginName !== rs.currentPluginName) {
			this.#closeCurrentRun()
			this.#openRun(child, pluginName)
		}

		originalRender(renderer)
	}

	#openRun(child: PIXI.Container, pluginName: string | null) {
		const rs = this.#runState
		const timerQuery = this.#timerQuery
		if (!timerQuery) {
			return
		}

		let label: string
		if (pluginName === null) {
			label = (child as any).name ?? child.constructor.name
		} else {
			const count = (rs.pluginNameCounts.get(pluginName) ?? 0) + 1
			rs.pluginNameCounts.set(pluginName, count)
			label = count === 1 ? pluginName : `${pluginName} #${count}`
		}

		// Ensure stats entry exists (preserve rolling history across frames).
		let stats = this.#groupStats.get(label)
		if (!stats) {
			stats = {
				gpuStats: createStats(label, this.#rollingWindow),
				cpuStats: createStats(label, this.#rollingWindow),
				queryPool: [],
				activeQuery: null,
				cpuT0: 0,
			}
			this.#groupStats.set(label, stats)
		}

		rs.encounterOrderThisFrame.push(label)

		const query = rs.queryPool.pop() ?? stats.queryPool.pop() ?? timerQuery.createQuery()
		if (!query) {
			rs.currentLabel = label
			rs.currentPluginName = pluginName
			rs.currentQuery = null
			return
		}
		timerQuery.beginQuery(timerQuery.TIME_ELAPSED_EXT, query)
		this.markQueryActive(true)

		rs.currentLabel = label
		rs.currentPluginName = pluginName
		rs.currentQuery = query
		rs.currentCpuT0 = performance.now()
	}

	#closeCurrentRun() {
		const rs = this.#runState
		const timerQuery = this.#timerQuery
		if (!timerQuery || rs.currentLabel === null) {
			return
		}
		const label = rs.currentLabel
		const query = rs.currentQuery
		const cpuMicros = (performance.now() - rs.currentCpuT0) * 1000

		rs.currentLabel = null
		rs.currentPluginName = null
		rs.currentQuery = null

		if (query !== null) {
			timerQuery.endQuery(timerQuery.TIME_ELAPSED_EXT)
			this.markQueryActive(false)
			const stats = this.#groupStats.get(label)
			if (stats) {
				pushSample(stats.cpuStats, cpuMicros)
			}
			this.enqueuePending({ label, query })
		}
	}

	#removeWrappers() {
		for (const [container, { originalRender }] of this.#wrappedContainers) {
			container.render = originalRender
		}
		this.#wrappedContainers.clear()

		for (const [container, originalRender] of this.#wrappedPrimaryRunContainers) {
			container.render = originalRender
		}
		this.#wrappedPrimaryRunContainers.clear()
		this.#groupStats.clear()
		// Reset run state so a subsequent start() begins clean.
		const rs = this.#runState
		rs.framePass = false
		rs.currentLabel = null
		rs.currentPluginName = null
		rs.currentQuery = null
		rs.pluginNameCounts.clear()
		rs.encounterOrderThisFrame = []
		rs.lastFrameEncounterOrder = []
		// Drop any queries still pooled (the GL context may be torn down too).
		for (const q of rs.queryPool) {
			this.#timerQuery?.deleteQuery(q)
		}
		rs.queryPool = []
	}
	// #endregion

	// #region Readback loop

	#startReadbackLoop() {
		const loop = () => {
			if (!this.#active) {
				return
			}
			this.#readPending()
			this.#rafHandle = requestAnimationFrame(loop)
		}
		this.#rafHandle = requestAnimationFrame(loop)
	}

	#stopReadbackLoop() {
		if (this.#rafHandle !== null) {
			cancelAnimationFrame(this.#rafHandle)
			this.#rafHandle = null
		}
	}

	#readPending() {
		const gl = this.#gl
		const timerQuery = this.#timerQuery
		if (!gl || !timerQuery) {
			return
		}
		const stillPending: PendingResult[] = []

		for (const pending of this.#pendingResults) {
			// Check for disjoint event first, discard all results if GPU state changed
			const disjoint = gl.getParameter(timerQuery.GPU_DISJOINT_EXT)
			if (disjoint) {
				// return Query them to pools for reuse
				this.#returnToPool(pending.label, pending.query)
				continue
			}

			let available: boolean
			try {
				available = timerQuery.getQueryParameter(pending.query, timerQuery.QUERY_RESULT_AVAILABLE)
			} catch (e) {
				console.error(
					`[PrimePerformance] getQueryParameter threw on label='${pending.label}' — query was never properly begun. Dropping.`,
					e,
				)
				this.#timerQuery?.deleteQuery(pending.query)
				continue
			}
			if (!available) {
				stillPending.push(pending)
				continue
			}

			const nanoseconds: number = timerQuery.getQueryParameter(pending.query, timerQuery.QUERY_RESULT)
			const microseconds = nanoseconds / 1000

			const entry = this.#findStats(pending.label)
			if (entry) {
				pushSample(entry.gpuStats, microseconds)
			}

			this.#returnToPool(pending.label, pending.query)
		}

		this.#pendingResults = stillPending
		this.#updateStatsWindow()
	}

	#returnToPool(label: string, query: WebGLQuery) {
		const groupEntry = this.#groupStats.get(label)
		if (groupEntry) {
			groupEntry.queryPool.push(query)
			return
		}
		for (const [, entry] of this.#wrappedContainers) {
			if (entry.gpuStats.label === label) {
				entry.queryPool.push(query)
				return
			}
		}
		// Container was removed, delete the query
		this.#timerQuery?.deleteQuery(query)
	}

	#findStats(label: string): { gpuStats: RollingStats; cpuStats: RollingStats } | null {
		const groupEntry = this.#groupStats.get(label)
		if (groupEntry) {
			return groupEntry
		}
		for (const [, entry] of this.#wrappedContainers) {
			if (entry.gpuStats.label === label) {
				return entry
			}
		}
		return null
	}
	// #endregion

	// #region Stats window

	#ensureStatsWindow() {
		if (this.#statsWindow) {
			return
		}
		this.#statsWindow = new PerformanceOverlayWindow()
		this.#statsWindow.setOnClose(() => this.stop())
		// Initial render is deferred to the first setData call so the window
		// opens with real data already populated.
	}

	#closeStatsWindow() {
		void this.#statsWindow?.close()
		this.#statsWindow = null
	}

	#getDisplayGroups(): { groups: TimingDisplayGroup[]; totalGpuMs: string; totalCpuMs: string } {
		const targets = this.#targetsFactory()
		const groups: TimingDisplayGroup[] = []
		let totalGpuMs = 0
		let totalCpuMs = 0

		for (const target of targets) {
			// Dynamic primary-runs target: list every encountered run from
			// the most recent frame, in encounter order, each as its own row
			// in a single 'PrimaryCanvasGroup' display group.
			if (isPrimaryRunsTarget(target)) {
				const order = this.#runState.lastFrameEncounterOrder
				const rows: TimingDisplayRow[] = []
				for (const label of order) {
					const stats = this.#groupStats.get(label)
					if (!stats) {
						continue
					}
					const gpuMs = average(stats.gpuStats) / 1000
					const cpuMs = average(stats.cpuStats) / 1000
					totalGpuMs += gpuMs
					totalCpuMs += cpuMs
					rows.push({ label, gpuMs: gpuMs.toFixed(3), cpuMs: cpuMs.toFixed(3) })
				}
				let gpuSum = 0
				let cpuSum = 0
				for (const row of rows) {
					gpuSum += parseFloat(row.gpuMs)
					cpuSum += parseFloat(row.cpuMs)
				}
				groups.push({
					label: 'PrimaryCanvasGroup children',
					isSingle: false,
					rows,
					subtotalGpuMs: gpuSum.toFixed(3),
					subtotalCpuMs: cpuSum.toFixed(3),
				})
				continue
			}

			const isSingle = isSingleTarget(target)
			const singles = isSingle ? [target] : target.children
			const rows: TimingDisplayRow[] = []

			for (const single of singles) {
				const entry = this.#findStats(single.label)
				if (!entry) {
					continue
				}
				const gpuMs = average(entry.gpuStats) / 1000
				const cpuMs = average(entry.cpuStats) / 1000
				totalGpuMs += gpuMs
				totalCpuMs += cpuMs
				rows.push({ label: single.label, gpuMs: gpuMs.toFixed(3), cpuMs: cpuMs.toFixed(3) })
			}

			let gpuSum = 0
			let cpuSum = 0
			for (const row of rows) {
				gpuSum += parseFloat(row.gpuMs)
				cpuSum += parseFloat(row.cpuMs)
			}
			groups.push({
				label: target.label,
				isSingle,
				rows,
				subtotalGpuMs: gpuSum.toFixed(3),
				subtotalCpuMs: cpuSum.toFixed(3),
			})
		}

		return {
			groups,
			totalGpuMs: totalGpuMs.toFixed(3),
			totalCpuMs: totalCpuMs.toFixed(3),
		}
	}

	#updateStatsWindow() {
		if (!this.#statsWindow) {
			return
		}

		// Throttle UI updates to 4/s -- the rolling average smooths sub-frame variance
		// already, and re-rendering the AppV2 every frame is wasted CPU.
		const now = performance.now()
		if (now - this.#lastStatsUpdate < 250) {
			return
		}
		this.#lastStatsUpdate = now

		const { groups, totalGpuMs, totalCpuMs } = this.#getDisplayGroups()
		this.#statsWindow.setData(
			groups,
			totalGpuMs,
			totalCpuMs,
			this.#rollingWindow,
			lastFrameTokenCount,
			lastFrameVoidMeshBatchCount,
		)
	}

	// #region Public helpers

	get isActive() {
		return this.#active
	}

	get queryActive() {
		return this.#queryActive
	}

	markQueryActive(active: boolean) {
		this.#queryActive = active
	}

	enqueuePending(result: PendingResult) {
		this.#pendingResults.push(result)
	}

	getPlainTextSnapshot(): string | null {
		if (!this.#active) {
			return null
		}
		const { groups, totalGpuMs, totalCpuMs } = this.#getDisplayGroups()
		const lines: string[] = ['| Target | GPU ms | CPU ms |', '|---|---|---|']
		for (const group of groups) {
			if (group.isSingle) {
				const row = group.rows[0]
				lines.push(`| **${row.label}** | ${row.gpuMs} | ${row.cpuMs} |`)
			} else {
				lines.push(`| **${group.label}** | ${group.subtotalGpuMs} | ${group.subtotalCpuMs} |`)
				for (const row of group.rows) {
					lines.push(`| &nbsp;&nbsp;${row.label} | ${row.gpuMs} | ${row.cpuMs} |`)
				}
			}
		}
		lines.push(`| **Total** | ${totalGpuMs} | ${totalCpuMs} |`)
		return lines.join('\n')
	}
	// #endregion
}

// #endregion

// ============================================================================
// #region Public API

let profiler: GpuProfiler | null = null

function enablePerformanceOverlay() {
	Hooks.once('canvasReady', () => {
		profiler = new GpuProfiler()
	})
}

function closePerformanceOverlay() {
	profiler?.stop()
	profiler = new GpuProfiler()
	profiler.start()
}

function stopPerformanceOverlay() {
	profiler?.stop()
}

function copyPerformanceData() {
	const text = profiler?.getPlainTextSnapshot()
	if (text == null) {
		ui.notifications?.warn('Performance overlay is not active.')
		return null
	}
	return text
}

function openPrimaryChildrenOverlay() {
	profiler?.stop()
	profiler = new GpuProfiler(getPrimaryChildrenTargets)
	profiler.start()
}

export {
	closePerformanceOverlay,
	copyPerformanceData,
	enablePerformanceOverlay,
	openPrimaryChildrenOverlay,
	stopPerformanceOverlay,
}

// #endregion
