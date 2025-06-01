export const FOUNDRY_API = {
	loadTexture: (src: string) => (game.release.generation < 13 ? loadTexture(src) : foundry.canvas.loadTexture(src)),
	getTexture: (src: string) => (game.release.generation < 13 ? getTexture(src) : foundry.canvas.getTexture(src)),
	createSpriteMesh: (texture: PIXI.Texture): SpriteMesh =>
		game.release.generation < 13 ? new SpriteMesh(texture) : new foundry.canvas.containers.SpriteMesh(texture),
	get game() {
		return foundry.game ?? game;
	},
	get generation(): number {
		return game.release.generation;
	},
};
