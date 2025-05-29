import { NAMESPACE } from 'src/constants.ts';
import { SETTINGS, getSetting } from 'src/settings.ts';

const FOUNDRY_API = {
	loadTexture: (src: string) => (game.release.generation < 13 ? loadTexture(src) : foundry.canvas.loadTexture(src)),
	getTexture: (src: string) => (game.release.generation < 13 ? getTexture(src) : foundry.canvas.getTexture(src)),
	createSpriteMesh: (texture: PIXI.Texture): SpriteMesh =>
		game.release.generation < 13 ? new SpriteMesh(texture) : new foundry.canvas.containers.SpriteMesh(texture),
};

const CONTROL_ICON_SRC = {
	background: 'control-icon-bg',
	border: 'control-icon-border',
	corner: 'control-icon-corner',
};

const { resolve: resolveInitializationPromise, promise: initializationPromise } = Promise.withResolvers<void>();
const spritesheetSubstitutions: Record<string, PIXI.Texture> = {};

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
	if (spritesheetSubstitutions[src]) {
		return spritesheetSubstitutions[src];
	}

	return wrapped(src);
}

async function loadTextureWithSubstitution(
	wrapped: (src: string) => PIXI.Texture | PIXI.Spritesheet,
	src: string,
): Promise<PIXI.Texture | PIXI.Spritesheet> {
	// wait for initialization to complete
	if (spritesheetSubstitutions[src]) {
		return spritesheetSubstitutions[src];
	}

	return wrapped(src);
}

async function transcodeAsyncWithMipmaps(
	wrapped: (...args: any[]) => Promise<PIXI.CompressedTextureResource[]>,
	...args: any[]
) {
	const resources = await wrapped(...args);
	if (!Array.isArray(resources) || resources.length <= 1) {
		return resources;
	}

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

function controlIcon_draw(this: ControlIcon, wrapped: (...args: any[]) => void, ...args: any[]) {
	const oldBg = this.bg;
	const offset = -this.rect[0];
	const width = oldBg.width - offset;

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
	backgroundContainer.position.set(-offset, -offset);

	this.removeChild(oldBg);
	this.addChildAt(backgroundContainer, 0);
	this.bg = backgroundContainer;

	this.texture = FOUNDRY_API.getTexture(this.iconSrc);

	return wrapped(...args);
}

function DoorControl__getTexture(this: DoorControl, ...args: any[]) {
	// Determine displayed door state
	const ds = CONST.WALL_DOOR_STATES;
	let s = this.wall.document.ds;
	if (!game.user.isGM && s === ds.LOCKED) s = ds.CLOSED;

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

async function registerBaseSpritesheets() {
	// TODO make adding additional spritesheets possible in settings
	const basePath = `modules/${NAMESPACE}/dist/spritesheets`;
	const baseSpritesheet =
		game.release.generation < 13 ? `${basePath}/base-icons-png-0.json` : `${basePath}/base-icons-ktx2-0.json`;
	const spritesheetUrls = [baseSpritesheet];

	const spritesheets = await Promise.all(spritesheetUrls.map((url) => PIXI.Assets.load(url)));

	for (const spritesheet of spritesheets) {
		if (!(spritesheet instanceof PIXI.Spritesheet)) {
			continue;
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

	resolveInitializationPromise();
}

function registerCoreTextureLoadingOverrides() {
	const isV12 = game.release.generation < 13;

	const controlIconScope = isV12 ? 'ControlIcon' : 'foundry.canvas.containers.ControlIcon';
	libWrapper.register(NAMESPACE, `${controlIconScope}.prototype.draw`, controlIcon_draw, 'WRAPPER');

	const doorControlScope = isV12 ? 'DoorControl' : 'foundry.canvas.containers.DoorControl';
	libWrapper.register(NAMESPACE, `${doorControlScope}.prototype._getTexture`, DoorControl__getTexture, 'OVERRIDE');
}

async function enableSpritesheetSubstitution() {
	const enabled = getSetting(SETTINGS.SpritesheetSubstitution);

	if (!enabled) {
		return;
	}

	// override publically accessible getTexture method
	if (game.release.generation < 13) {
		const originalGetTexture = getTexture;
		getTexture = (src: string) => getTextureWithSubstitution(originalGetTexture, src);
	} else {
		const originalGetTexture = foundry.canvas.getTexture;
		foundry.canvas = Object.freeze({
			...foundry.canvas,
			getTexture: (src: string) => getTextureWithSubstitution(originalGetTexture, src),
		});
	}

	// override publically accessible loadTexture method
	if (game.release.generation < 13) {
		const originalLoadTexture = loadTexture;
		loadTexture = (src: string) => loadTextureWithSubstitution(originalLoadTexture, src);
	} else {
		const originalLoadTexture = foundry.canvas.loadTexture;
		foundry.canvas = Object.freeze({
			...foundry.canvas,
			loadTexture: (src: string) => loadTextureWithSubstitution(originalLoadTexture, src),
		});
	}

	if (game.release.generation >= 13) {
		libWrapper.register(NAMESPACE, 'PixiBasisKTX2.KTX2Parser.transcodeAsync', transcodeAsyncWithMipmaps, 'WRAPPER');
	}

	// register wrapper for texture loader to wait for spritesheet initialization when loading textures
	const textureLoaderScope = game.release.generation < 13 ? 'TextureLoader' : 'foundry.canvas.TextureLoader';
	libWrapper.register(
		NAMESPACE,
		`${textureLoaderScope}.prototype.loadTexture`,
		loadTextureWaitForInitialization,
		'WRAPPER',
	);

	registerCoreTextureLoadingOverrides();

	await registerBaseSpritesheets();
}
export { enableSpritesheetSubstitution, spritesheetSubstitutions };
