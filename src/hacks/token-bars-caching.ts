import { getSetting, SETTINGS } from "src/settings.ts";
import { wrapFunction } from "src/utils.ts";

type TokenWithCache = Token<any> & { __barsCache: { bar1: PIXI.Sprite; bar2: PIXI.Sprite } };

const textureCache = window.fvttPerfHacks.autoSpritesheetCache;
const superSampleFactor = 3;

let enableTokenBarsCaching = () => {
	const enabled = getSetting(SETTINGS.TokenBarsCaching);
	if (!enabled) {
		return;
	}

	function updateTokenBars(this: TokenWithCache, ...data: any[]) {
		if (!this.__barsCache || !this.bars) {
			return;
		}
		this.__barsCache.bar1.visible = this.bars.visible;
		this.__barsCache.bar2.visible = this.bars.visible;
		if (!this.bars.visible) {
			return;
		}

		const { bar1, bar2 } = this.bars;
		[bar1, bar2].forEach((bar: PIXI.Graphics, idx) => {
			const container = new PIXI.Container();
			const dummySprite = new PIXI.Sprite();
			dummySprite.width = bar.width + 2 * superSampleFactor;
			dummySprite.height = bar.height + 2 * superSampleFactor;
			container.addChild(dummySprite);
			container.addChild(bar);

			const oldPosition = bar.position.clone();
			bar.position.set(superSampleFactor, superSampleFactor);
			container.scale.set(superSampleFactor, superSampleFactor);
			const barName = `bar${idx + 1}` as "bar1" | "bar2";
			const texture = textureCache.addOrUpdateCache(barName, this.document.id, container);
			bar.position.copyFrom(oldPosition);
			const barSprite = this.__barsCache[barName];
			const origBar = (this.bars as any)[barName].position;
			barSprite.position.set(origBar.x - superSampleFactor, origBar.y - superSampleFactor);
			if (texture) {
				barSprite.texture = texture;
			} else {
				barSprite.visible = false;
			}
		});
	}

	function addBarsCache(this: TokenWithCache, ...args: any[]) {
		if (this.__barsCache || !this.bars) {
			return;
		}
		const bar1Sprite = new PIXI.Sprite();
		const bar2Sprite = new PIXI.Sprite();
		[bar1Sprite, bar2Sprite].forEach((barSprite) => {
			barSprite.scale.set(1 / superSampleFactor, 1 / superSampleFactor);
		});

		const barsIdx = this.children.indexOf(this.bars);
		if (barsIdx === -1) {
			return;
		}
		this.removeChild(this.bars);
		this.__barsCache = {
			bar1: bar1Sprite,
			bar2: bar2Sprite,
		};
		this.addChildAt(bar1Sprite, barsIdx);
		this.addChildAt(bar2Sprite, barsIdx);
	}

	wrapFunction(CONFIG.Token.objectClass.prototype, "_refreshState", function (this: TokenWithCache, ...args: any[]) {
		addBarsCache.apply(this, args);
		updateTokenBars.apply(this, args);
	});

	// wrapFunction(CONFIG.Token.objectClass.prototype, "_draw", function (this: TokenWithCache, ...args: any[]) {
	// 	addBarsCache.apply(this, args);
	// 	updateTokenBars.apply(this, args);
	// });

	wrapFunction(CONFIG.Token.objectClass.prototype, "drawBars", function (this: TokenWithCache, ...args: any[]) {
		updateTokenBars.apply(this, args);
	});

	wrapFunction(CONFIG.Token.objectClass.prototype, "_destroy", function (this: TokenWithCache, ...args) {
		textureCache.remove("bar1", this.id);
		textureCache.remove("bar2", this.id);
	});

	// wrapFunction(CONFIG.Token.objectClass.prototype, "_refreshSize", function (this: TokenWithCache, ...args: any[]) {
	// 	const { bar1, bar2 } = this.__barsCache;
	// 	[bar1, bar2].forEach((bar) => {
	// 		bar.anchor.set(0.5, 0);
	// 		bar.position.set(bar.width / 2, 0);
	// 	});
	// });
};
export default enableTokenBarsCaching;

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.foo;
	});
}
