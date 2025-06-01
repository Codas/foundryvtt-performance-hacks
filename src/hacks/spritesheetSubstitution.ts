import type { PrimarySpriteMesh } from 'foundry-pf2e-types/foundry/client/pixi/placeables/primary-canvas-objects';
import { NAMESPACE } from 'src/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';
import { registerWrapperForVersion } from 'src/utils/registerWrapper.ts';

/**
 * For spritesheets to work with dynamic token rings, the texture coords need to be changed slightly.
 * Essentially: They have to be mulitplied by the relative base texture size.
 * For a texture that is 3x2 image tiles, using the texture at the bottom left corner, this would be:
 * vertex shader main code:
 * vOrigTextureCoord = aTextureCoord * vec2(3, 2) - vec2(0, 1)
 *
 * This fixes the color band being displayed relative to the base texture size.
 *
 * Gradient color rings still need to be fixed, as that uses the textureCoord + smoothstep to
 * create a gradient, which again shifts the gradient to be over the whole base texture are
 * as apposed to just the token cutout. Best way to fix this would probably be to pass another
 * vTextureCoordClipped or somthing to the shader, that does the same calculation as for the
 * textureCoord ((aTextureCoord - 0.5) * aTextureScaleCorrection + 0.5), but also applies the
 * correction for the vOrigTextureCoord as above:
 * vTextureCoordClipped = (vOrigTextureCoord - 0.5) * aTextureScaleCorrection + 0.5;
 *
 * then use vTextureCoordClipped in the gradient calculation instead of vTextureCoord
 */

const CONTROL_ICON_SRC = {
	background: 'control-icon-bg',
	border: 'control-icon-border',
	corner: 'control-icon-corner',
};

const { resolve: resolveInitializationPromise, promise: initializationPromise } = Promise.withResolvers<boolean>();
const spritesheetSubstitutions: Record<string, PIXI.Texture> = {};

function getSpritesheetSubstitution(path: string): PIXI.Texture | undefined {
	// If the spritesheet substitution is already loaded, return it
	path = `#${path}`;
	if (spritesheetSubstitutions[path]) {
		return spritesheetSubstitutions[path];
	}

	// If the spritesheet substitution is not loaded, return undefined
	return undefined;
}

async function loadTextureWaitForInitialization(
	wrapped: (src: string) => Promise<PIXI.Texture | PIXI.Spritesheet>,
	src: string,
): Promise<PIXI.Texture | PIXI.Spritesheet> {
	// wait for initialization to complete
	await initializationPromise;

	return wrapped(src);
}

function getTextureWithSubstitution(
	wrapped: (src: string) => PIXI.Texture | PIXI.Spritesheet,
	src: string,
): PIXI.Texture | PIXI.Spritesheet {
	// wait for initialization to complete
	const texture = getSpritesheetSubstitution(src);

	return texture ?? wrapped(src);
}

async function loadTextureWithSubstitution(
	wrapped: (src: string) => PIXI.Texture | PIXI.Spritesheet,
	src: string,
): Promise<PIXI.Texture | PIXI.Spritesheet> {
	// wait for initialization to complete
	const texture = getSpritesheetSubstitution(src);

	return texture ?? wrapped(src);
}

/**
 * Fix mipmap transcoding for KTX2 textures in v13+.
 * This is needed because the default transcoding does not support mipmaps,
 * instead multiple textures are created and registered to the cache
 * for each mipmap level, leading to spritesheet initiazliation code
 * receiving an array of textures each with a single mip level instead
 * of one texture with multiple mip levels.
 */
async function transcodeAsyncWithMipmaps(
	wrapped: (...args: any[]) => Promise<PIXI.CompressedTextureResource[]>,
	...args: any[]
) {
	// Call original implementation to transcode the texture
	// Each resource result is a single mip level texture
	const resources = await wrapped(...args);

	// If it's just one texture, no mip maps are encoded in the texture and we
	// can return the resource as is.
	if (!Array.isArray(resources) || resources.length <= 1) {
		return resources;
	}

	// If there are multiple resources, we need to create a single texture
	// that contains all mip levels. This is done by creating a new
	// PIXI.CompressedTextureResource with the levelBuffers set to the
	// individual mip level buffers.
	resources.splice(
		0,
		resources.length,
		new PIXI.CompressedTextureResource(null, {
			format: resources[0].format,
			width: resources[0].width,
			height: resources[0].height,
			levels: resources.length,
			levelBuffers: resources.map((res, idx) => {
				let levelWidth = res._levelBuffers[0].levelWidth;
				let levelHeight = res._levelBuffers[0].levelHeight;
				if (idx === resources.length - 1) {
					levelWidth = 1;
					levelHeight = 1;
				} else if (idx === resources.length - 2) {
					levelWidth = 2;
					levelHeight = 2;
				}
				return { ...res._levelBuffers[0], levelWidth, levelHeight, levelID: idx };
			}),
		}),
	);
	return resources;
}

function ControlIcon_draw(this: ControlIcon, wrapped: (...args: any[]) => void, ...args: any[]) {
	this.texture ??= FOUNDRY_API.getTexture(this.iconSrc);

	if (!(this.bg instanceof PIXI.Graphics)) {
		return wrapped(...args);
	}

	this.removeChild(this.bg);

	const [offset, _, width] = this.rect;

	const cornerTopLeft = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.corner));
	const borderTop = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.border));

	const cornerTopRight = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.corner));
	const borderRight = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.border));

	const cornerBottomRight = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.corner));
	const borderBottom = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.border));

	const cornerBottomLeft = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.corner));
	const borderLeft = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.border));

	const background = FOUNDRY_API.createSpriteMesh(FOUNDRY_API.getTexture(CONTROL_ICON_SRC.background));
	const cornerSize = 4 * (canvas.dimensions.uiScale ?? 1);
	background.width = width - cornerSize * 2;
	background.height = width - cornerSize * 2;
	background.anchor.set(0.5, 0.5);
	background.position.set(width / 2, width / 2);

	const backgroundContainer = new PIXI.Container();
	const borderLength = width - cornerSize * 2;
	const borders = [
		{
			element: borderTop,
			left: cornerSize,
			top: 0,
			rotation: 0,
		},
		{
			element: borderRight,
			left: width,
			top: cornerSize,
			rotation: Math.PI * 0.5,
		},
		{
			element: borderBottom,
			left: width - cornerSize,
			top: width,
			rotation: Math.PI * 1,
		},
		{
			element: borderLeft,
			left: 0,
			top: width - cornerSize,
			rotation: Math.PI * 1.5,
		},
	];
	borders.forEach(({ element, top, left, rotation }) => {
		element.rotation = rotation;
		element.position.set(left, top);
		element.width = borderLength;
		element.height = cornerSize;
		backgroundContainer.addChild(element);
	});

	const corners = [
		{ element: cornerTopLeft, left: 0, top: 0, rotation: 0 },
		{ element: cornerTopRight, left: 1, top: 0, rotation: Math.PI * 0.5 },
		{ element: cornerBottomRight, left: 1, top: 1, rotation: Math.PI },
		{ element: cornerBottomLeft, left: 0, top: 1, rotation: Math.PI * 1.5 },
	];

	corners.forEach(({ element, top, left, rotation }) => {
		element.rotation = rotation;
		element.position.set(left * width, top * width);
		element.width = cornerSize;
		element.height = cornerSize;
		backgroundContainer.addChild(element);
	});

	backgroundContainer.addChild(background);
	backgroundContainer.position.set(offset, offset);

	this.addChildAt(backgroundContainer, 0);
	this.bg = backgroundContainer;

	return wrapped(...args);
}

function TokenRing_configure(this: any, wrapped: (...args: any[]) => void, mesh: PrimarySpriteMesh | undefined) {
	mesh ??= this.token.mesh;
	wrapped(mesh);

	const src = this.token.document.ring.subject.texture;
	const subjectTexture = getSpritesheetSubstitution(src);
	if (subjectTexture?.valid) {
		mesh.texture = subjectTexture;
	}
}

// Override for AmbientLight refreshControl to correctly set control icon texture
// to the new spritesheet textures. Rest is copied from the original method.
function AmbientLight_refreshControl(this: AmbientLight) {
	const isHidden = this.id && this.document.hidden;
	this.controlIcon.texture = FOUNDRY_API.getTexture(
		this.isVisible ? CONFIG.controlIcons.light : CONFIG.controlIcons.lightOff,
	);
	this.controlIcon.tintColor = isHidden ? 0xff3300 : 0xffffff;
	this.controlIcon.borderColor = isHidden ? 0xff3300 : 0xff5500;
	this.controlIcon.elevation = this.document.elevation;
	this.controlIcon.refresh({ visible: this.layer.active, borderVisible: this.hover || this.layer.highlightObjects });
	this.controlIcon.draw();
}

// Override for AmbientSound refreshControl to correctly set control icon texture
// to the new spritesheet textures. Rest is copied from the original method.
function AmbientSound_refreshControl(this: AmbientLight) {
	const isHidden = this.id && (this.document.hidden || !this.document.path);
	this.controlIcon.tintColor = isHidden ? 0xff3300 : 0xffffff;
	this.controlIcon.borderColor = isHidden ? 0xff3300 : 0xff5500;
	this.controlIcon.texture = FOUNDRY_API.getTexture(
		this.isAudible ? CONFIG.controlIcons.sound : CONFIG.controlIcons.soundOff,
	);
	this.controlIcon.elevation = this.document.elevation;
	this.controlIcon.refresh({ visible: this.layer.active, borderVisible: this.hover || this.layer.highlightObjects });
	this.controlIcon.draw();
}

// Wrapper for ambient light rendering.
// Reorders rendering of ambient lights to first render the aura circles, then
// the control icon to improve render batching
function LightingOrSoundLayer_render(
	this: AmbientLight | AmbientSound,
	wrapped: (...args: any[]) => void,
	...args: any[]
) {
	// disable everything except the objects (ambient light placeables) container
	disableRenderingFor(this.children, (child) => child !== this.objects);

	// render ambient light objects, but do it in two phases: Aura circles (light or sound fields) first, then control icons

	// render aura field circles:
	this.objects.children.forEach((object: AmbientLight | AmbientSound) => {
		disableRenderingFor(object.children, (child) => child !== object.field);
	});
	wrapped(...args);

	// render control icons:
	this.objects.children.forEach((object: AmbientLight | AmbientSound) => {
		restoreRenderableOriginal(object.children);
		disableRenderingFor(object.children, (child) => child === object.field);
	});
	wrapped(...args);

	// restore renderable state for ambient light objects
	this.objects.children.forEach((object: AmbientLight | AmbientSound) => {
		restoreRenderableOriginal(object.children);
	});

	// render everything else except the objects container
	restoreRenderableOriginal(this.children);
	disableRenderingFor(this.children, (child) => child === this.objects);
	wrapped(...args);

	// restore renderable state
	restoreRenderableOriginal(this.children);
}

function restoreRenderableOriginal(children: PIXI.DisplayObject[]) {
	for (const child of children) {
		if (Object.hasOwnProperty.call(child, 'renderableOriginal')) {
			child.renderable = child.renderableOriginal;
			delete child.renderableOriginal;
		}
	}
}

function disableRenderingFor<T extends PIXI.DisplayObject>(children: T[], test: (child: T) => boolean) {
	for (const child of children) {
		if (test(child)) {
			child.renderableOriginal = child.renderable;
			child.renderable = false;
		}
	}
}

// Override the DoorControl _getTexture method to use the new spritesheet textures
// This should be a 1:1 copy except for the texture loading call itself.
function DoorControl__getTexture(this: DoorControl) {
	// Determine displayed door state
	const ds = CONST.WALL_DOOR_STATES;
	let s = this.wall.document.ds;
	if (!FOUNDRY_API.game.user.isGM && s === ds.LOCKED) s = ds.CLOSED;

	// Determine texture path
	const icons = CONFIG.controlIcons;
	let path =
		{
			[ds.LOCKED]: icons.doorLocked,
			[ds.CLOSED]: icons.doorClosed,
			[ds.OPEN]: icons.doorOpen,
		}[s] || icons.doorClosed;
	if (s === ds.CLOSED && this.wall.document.door === CONST.WALL_DOOR_TYPES.SECRET) path = icons.doorSecret;

	// Obtain the icon texture
	return FOUNDRY_API.getTexture(path);
}

async function loadAndRegisterSpritesheets(spritesheetUrls: string[]) {
	const spritesheets: PIXI.Spritesheet[] = await Promise.all(spritesheetUrls.map((url) => PIXI.Assets.load(url)));
	for (const spritesheet of spritesheets) {
		if (!(spritesheet instanceof PIXI.Spritesheet)) {
			continue;
		}

		if (spritesheet.data.meta.alphaMode === 'pma') {
			spritesheet.baseTexture.alphaMode = PIXI.ALPHA_MODES.PMA;
		}

		const allSheets = [spritesheet, ...(spritesheet.linkedSheets ?? [])];
		for (const sheet of allSheets) {
			for (const [name, texture] of Object.entries(sheet.textures)) {
				if (texture instanceof PIXI.Texture) {
					spritesheetSubstitutions[name] = texture;
				}
			}
		}
	}
}

async function loadBaseSpritesheets(): Promise<boolean> {
	const baseSpritesheet = `modules/${NAMESPACE}/dist/spritesheets/base-icons-0.json`;

	// track loading state. Should something go wrong during spritesheet loading, we
	// simply cancel the initialization and log an error
	let loadingSuccessful = true;

	// load the base spritesheets and extract the textures for substitution
	try {
		await loadAndRegisterSpritesheets([baseSpritesheet]);
	} catch (error) {
		ui.notifications.error(
			game.i18n.localize(`${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.warn-init-failed`),
		);
		console.error('Error loading base spritesheets for substitution');
		console.error(error);
		loadingSuccessful = false;
	}

	try {
		const customSpritesheets: string[] = game.settings.get(NAMESPACE, SETTINGS.CustomSpritesheets) ?? [];
		await loadAndRegisterSpritesheets(customSpritesheets);
	} catch (error) {
		ui.notifications.warn(
			game.i18n.localize(`${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.warn-custom-spritesheets-failed`),
		);
		console.error('Error loading custom spritesheets for substitution', error);
		// this will not mark initialization as failed, because the base spritesheets
		// are still loaded and the substitution will work for those
	}

	// Resolve the initialization promise to indicate that spritesheet substitution is ready
	// This is behind a timeout to ensure the setup / wrapper code needed for further
	// spritesheet substitution setup is executed before the promise resolves
	// and loading of textures continues
	setTimeout(() => {
		resolveInitializationPromise(loadingSuccessful);
	}, 0);

	return loadingSuccessful;
}

async function enableSpritesheetSubstitution() {
	const enabled = getSetting(SETTINGS.SpritesheetSubstitution);

	if (!enabled) {
		return;
	}

	// make sure basis transcoder is enabled (it is by default in v13+)
	if (FOUNDRY_API.game.release.generation < 13) {
		CONFIG.Canvas.transcoders.basis = true;
	}

	// register wrapper for texture loader to wait for spritesheet initialization when loading textures
	registerWrapperForVersion(loadTextureWaitForInitialization, 'WRAPPER', {
		v12: 'TextureLoader.prototype.loadTexture',
		v13: 'foundry.canvas.TextureLoader.prototype.loadTexture',
	});

	// fix transcoding of KTX2 textures to support mipmaps (only needed for v13+)
	registerWrapperForVersion(transcodeAsyncWithMipmaps, 'WRAPPER', { v13: 'PixiBasisKTX2.KTX2Parser.transcodeAsync' });

	// load spritesheets for substitution
	const loadingSuccessful = await loadBaseSpritesheets();

	// cancel further setup of spritesheet substitution if loading failed
	if (!loadingSuccessful) {
		return;
	}

	// Override publically accessible getTexture and loadTexture API methods.
	// This takes care of all modules, system and some core code that uses these methods
	// to load textures (async) or get cached textures (sync)
	if (FOUNDRY_API.game.release.generation < 13) {
		const originalLoadTexture = loadTexture;
		loadTexture = (src: string) => loadTextureWithSubstitution(originalLoadTexture, src);

		const originalGetTexture = getTexture;
		getTexture = (src: string) => getTextureWithSubstitution(originalGetTexture, src);
	} else {
		const originalLoadTexture = foundry.canvas.loadTexture;
		foundry.canvas = Object.freeze({
			...foundry.canvas,
			loadTexture: (src: string) => loadTextureWithSubstitution(originalLoadTexture, src),
		});

		const originalGetTexture = foundry.canvas.getTexture;
		foundry.canvas = Object.freeze({
			...foundry.canvas,
			getTexture: (src: string) => getTextureWithSubstitution(originalGetTexture, src),
		});
	}

	// Override the ControlIcon draw method to use the new spritesheet textures and
	// create an optimized texture based background and border for the control icon
	registerWrapperForVersion(ControlIcon_draw, 'WRAPPER', {
		v12: 'ControlIcon.prototype.draw',
		v13: 'foundry.canvas.containers.ControlIcon.prototype.draw',
	});

	// Override the AmbientLight refreshControl because it sets the control icon texture manually
	registerWrapperForVersion(AmbientLight_refreshControl, 'OVERRIDE', {
		v12: 'AmbientLight.prototype.refreshControl',
		v13: 'foundry.canvas.placeables.AmbientLight.prototype.refreshControl',
	});

	// Override the AmbientLight refreshControl because it sets the control icon texture manually
	registerWrapperForVersion(AmbientSound_refreshControl, 'OVERRIDE', {
		v12: 'AmbientSound.prototype.refreshControl',
		v13: 'foundry.canvas.placeables.AmbientSound.prototype.refreshControl',
	});

	// Override the DoorControl _getTexture method to use the new spritesheet textures
	registerWrapperForVersion(DoorControl__getTexture, 'OVERRIDE', {
		v12: 'DoorControl.prototype._getTexture',
		v13: 'foundry.canvas.containers.DoorControl.prototype._getTexture',
	});

	// Override LightingLayer render method to improve render batching for AmbientLight objects
	registerWrapperForVersion(LightingOrSoundLayer_render, 'WRAPPER', {
		v12: 'LightingLayer.prototype.render',
		v13: 'foundry.canvas.layers.LightingLayer.prototype.render',
	});

	// Override SoundsLayer render method to improve render batching for AmbientLight objects
	registerWrapperForVersion(LightingOrSoundLayer_render, 'WRAPPER', {
		v12: 'SoundsLayer.prototype.render',
		v13: 'foundry.canvas.layers.SoundsLayer.prototype.render',
	});

	// Override TokenRing configure method to fix texture loading
	registerWrapperForVersion(TokenRing_configure, 'WRAPPER', {
		v12: 'foundry.canvas.tokens.TokenRing.prototype.configure',
		v13: 'foundry.canvas.placeables.tokens.TokenRing.prototype.configure',
	});
}

export { enableSpritesheetSubstitution };
