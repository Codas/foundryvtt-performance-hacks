import { SETTINGS, getSetting } from 'src/settings.ts'
import { wrapFunction, wrapFunctionManual } from 'src/utils.ts'

function getOverdrawTokens(): Set<PrimarySpriteMesh> {
	const primaryQuad: Quadtree<PlaceableObject> = game.canvas.primary.quadtree
	const tokens: TokenPF2e[] = game.canvas.tokens.placeables
	const eraseMeshes = new Set<PrimarySpriteMesh>()

	const getCollisions = (token: TokenPF2e, boundsRect: PIXI.Rectangle) => {
		return primaryQuad.getObjects(boundsRect, {
			collisionTest: (data) => {
				const collidingToken = data.t.object
				if (!(data.t instanceof PrimarySpriteMesh) || !(collidingToken instanceof Token) || data.t.object === token) {
					return false
				}
				return (
					token.document.elevation <= collidingToken.document.elevation
					&& token.document.sort < collidingToken.document.sort
				)
			},
		})
	}

	tokens.forEach((token) => {
		if (!token.visible || !token.renderable || token.isPreview) {
			return
		}
		const auras = Array.from(token.auras).flatMap(([key, aura]) => aura)
		const tb = token.bounds
		const tlb: Rectangle = token.getLocalBounds()
		if (tlb == null) {
			return
		}
		const tokenBoundsRect = new PIXI.Rectangle(tb.x + tlb.x, tb.y + tlb.y, tlb.width, tlb.height)
		if (getCollisions(token, tokenBoundsRect).size === 0) {
			return
		}
		token.children.forEach((interfaceObject) => {
			if (!interfaceObject.visible || !interfaceObject.renderable) {
				return
			}
			const ilb: PIXI.Rectangle = (interfaceObject as any)._localBoundsRect ?? interfaceObject?.getLocalBounds()
			if (
				ilb == null
				|| auras.includes(interfaceObject)
				|| !interfaceObject.visible
				|| !interfaceObject.renderable
				|| interfaceObject === token.voidMesh
			) {
				return
			}
			const boundsRect = new PIXI.Rectangle(
				tb.x + interfaceObject.x + ilb.x,
				tb.y + interfaceObject.y + ilb.y,
				ilb.width,
				ilb.height,
			)
			const collisions = getCollisions(token, boundsRect)
			for (const collision of collisions) {
				eraseMeshes.add(collision as any)
			}
		})
	})
	return eraseMeshes
}

let overrideInterfaceClipping = () => {
	const enabled = getSetting(SETTINGS.OptimizeInterfaceClipping)
	if (!enabled) {
		return
	}

	wrapFunction(CONFIG.Token.objectClass.prototype, '_refreshState', function (this: Token<any>, ...args) {
		if (!this.voidMesh) {
			return
		}
		this.voidMesh.visible = false
		this.voidMesh.render = (renderer) => {
			if (this.voidMesh.visible) {
				(this.mesh as any)?._renderVoid(renderer)
			}
		}
	})
	wrapFunctionManual(TokenLayer.prototype, '_render', function (this: TokenLayer, orig: any, renderer: PIXI.Renderer) {
		const overdrawMeshes = getOverdrawTokens()
		for (const token of this.placeables) {
			if (!token.voidMesh) {
				continue
			}
			if (overdrawMeshes.has(token.mesh)) {
				token.voidMesh.visible = true
			} else {
				token.voidMesh.visible = true
				token.voidMesh.render(renderer)
				token.voidMesh.visible = false
			}
		}
		orig(renderer)
	})
}
export default overrideInterfaceClipping

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		overrideInterfaceClipping = newModule?.foo
	})
}
