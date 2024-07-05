import { getSetting, SETTINGS } from "src/settings.ts";
import { wrapFunction } from "src/utils.ts";

type TokenWithCache = Token<any> & { __nameplateCache: PIXI.Sprite; __tooltipCache: PIXI.Sprite };

const textureCache = window.fvttPerfHacks.autoSpritesheetCache;
const superSampleFactor = 2;

let enableNameplateCaching = () => {
	const enabled = getSetting(SETTINGS.NameplateCaching);
	if (!enabled) {
		return;
	}

	function updateNameplate(this: TokenWithCache, ...data: any[]) {
		if (!this.__nameplateCache || !this.nameplate) {
			return;
		}
		this.__nameplateCache.visible = this.nameplate.visible;
		if (!this.nameplate.visible) {
			return;
		}

		let nameplateTexture = textureCache.loadTexture("nameplate", this.nameplate.text);
		if (!nameplateTexture) {
			const prevVisibility = this.nameplate.visible;
			this.nameplate.visible = true;
			this.nameplate.anchor.set(0, 0);
			this.nameplate.position.set(0, 0);
			const container = new PIXI.Container();
			container.scale.set(superSampleFactor, superSampleFactor);
			container.addChild(this.nameplate);
			nameplateTexture = textureCache.addToCache("nameplate", this.nameplate.text, container);
			this.nameplate.visible = prevVisibility;
		}
		if (nameplateTexture) {
			this.__nameplateCache.texture = nameplateTexture;
		}
	}

	function addNameplateCache(this: TokenWithCache, ...args: any[]) {
		if (this.__nameplateCache || !this.nameplate) {
			return;
		}
		const nameplateSprite = new PIXI.Sprite();
		nameplateSprite.anchor.copyFrom(this.nameplate.anchor);
		nameplateSprite.position.copyFrom(this.nameplate.position);
		nameplateSprite.scale.set(1 / superSampleFactor, 1 / superSampleFactor);

		const nameplateIdx = this.children.indexOf(this.nameplate);
		if (nameplateIdx === -1) {
			return;
		}
		this.removeChild(this.nameplate);
		this.__nameplateCache = this.addChildAt(nameplateSprite, nameplateIdx);
	}

	function updateTooltip(this: TokenWithCache, ...data: any[]) {
		if (!this.__tooltipCache || !this.tooltip) {
			return;
		}
		this.__tooltipCache.visible = this.tooltip.visible;
		if (!this.tooltip.visible) {
			return;
		}
		let tooltipTexture = textureCache.loadTexture("tooltip", this.tooltip.text);
		if (!tooltipTexture) {
			const prevVisibility = this.tooltip.visible;
			this.tooltip.visible = true;
			this.tooltip.anchor.set(0, 0);
			this.tooltip.position.set(0, 0);
			const container = new PIXI.Container();
			container.scale.set(2, 2);
			container.addChild(this.tooltip);
			tooltipTexture = textureCache.addToCache("tooltip", this.tooltip.text, container);
			this.tooltip.visible = prevVisibility;
		}
		if (tooltipTexture) {
			this.__tooltipCache.texture = tooltipTexture;
		}
	}

	function addTooltipCache(this: TokenWithCache, ...args: any[]) {
		if (this.__tooltipCache || !this.tooltip) {
			return;
		}
		const tooltipSprite = new PIXI.Sprite();
		tooltipSprite.position.copyFrom(this.tooltip.position);
		tooltipSprite.anchor.copyFrom(this.tooltip.anchor);
		tooltipSprite.scale.set(0.5, 0.5);

		const tooltipIdx = this.children.indexOf(this.tooltip);
		if (tooltipIdx === -1) {
			return;
		}
		this.removeChild(this.tooltip);
		this.__tooltipCache = this.addChildAt(tooltipSprite, tooltipIdx);
	}

	wrapFunction(CONFIG.Token.objectClass.prototype, "_refreshState", function (this: TokenWithCache, ...args: any[]) {
		addNameplateCache.apply(this, args);
		updateNameplate.apply(this, args);
		addTooltipCache.apply(this, args);
		updateTooltip.apply(this, args);
	});

	// wrapFunction(CONFIG.Token.objectClass.prototype, "_draw", function (this: TokenWithCache, ...args: any[]) {
	// 	addNameplateCache.apply(this, args);
	// 	updateNameplate.apply(this, args);
	// 	addTooltipCache.apply(this, args);
	// 	updateTooltip.apply(this, args);
	// });

	wrapFunction(
		CONFIG.Token.objectClass.prototype,
		"_refreshNameplate",
		function (this: TokenWithCache, ...args: any[]) {
			updateNameplate.apply(this, args);
		},
	);
	wrapFunction(CONFIG.Token.objectClass.prototype, "_refreshTooltip", function (this: TokenWithCache, ...args: any[]) {
		updateTooltip.apply(this, args);
	});

	wrapFunction(CONFIG.Token.objectClass.prototype, "_refreshSize", function (this: TokenWithCache, ...args: any[]) {
		this.__nameplateCache.position.copyFrom(this.nameplate.position);
		this.__tooltipCache.position.copyFrom(this.tooltip.position);
	});
};
export default enableNameplateCaching;

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableNameplateCaching = newModule?.foo;
	});
}
