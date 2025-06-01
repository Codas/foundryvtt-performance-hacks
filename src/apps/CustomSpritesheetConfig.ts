import { NAMESPACE } from 'src/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';

export class CustomSpritesheetConfig extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.api.ApplicationV2,
) {
	static override DEFAULT_OPTIONS = {
		id: 'spritesheet-config',
		tag: 'form',
		window: {
			contentClasses: ['standard-form'],
			title: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.title`,
			icon: 'fa-solid fa-images',
		},
		position: {
			width: 600,
		},
		form: {
			closeOnSubmit: true,
		},
	};

	static override PARTS = {
		body: {
			template: `modules/${NAMESPACE}/templates/custom-spritesheets-config.hbs`,
			scrollable: [''],
		},
		footer: {
			template: 'templates/generic/form-footer.hbs',
		},
	};

	#initialData: string[] = game.settings.get(NAMESPACE, SETTINGS.CustomSpritesheets) ?? [];

	override async _prepareContext() {
		const spritesheets = game.settings.get(NAMESPACE, SETTINGS.CustomSpritesheets) ?? [];
		return {
			spritesheets,
			buttons: [
				{
					type: 'button',
					label: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.add`,
					icon: 'fa-solid fa-plus',
					action: 'add',
				},
			],
		};
	}

	async #onAddSpritesheet() {
		const fd = new FormDataExtended(this.parts.body);
		const src = fd.get('src') || '';
		if (!src) {
			ui.notifications.warn(
				game.i18n.localize(`${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.warn-no-src`),
			);
			return;
		}

		if (typeof src !== 'string') {
			return;
		}

		if (!src.endsWith('.json')) {
			ui.notifications.warn(
				game.i18n.localize(`${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.warn-no-json`),
			);
			return;
		}

		const result = await this.#testSpritesheet(src);
		if (!result) {
			return;
		}

		const spritesheets = game.settings.get<string[]>(NAMESPACE, SETTINGS.CustomSpritesheets) ?? [];

		if (spritesheets.includes(src)) {
			return;
		}
		spritesheets.push(src);
		await game.settings.set(NAMESPACE, SETTINGS.CustomSpritesheets, spritesheets);

		this.render(true);
	}

	async #testSpritesheet(src: string) {
		try {
			const result = await PIXI.Assets.load(src);
			if (!(result instanceof PIXI.Spritesheet)) {
				ui.notifications.warn(
					game.i18n.localize(`${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.warn-file-invalid-asset`),
				);

				return false;
			}
		} catch (error) {
			ui.notifications.warn(
				game.i18n.localize(`${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.menu.warn-file-not-loaded`),
			);
			console.error('error loading spritesheet', error);

			return false;
		}

		return true;
	}

	async #onDeleteSpritesheet(event: Event) {
		event.preventDefault();
		const btn = event.target?.closest('[data-index]');
		if (!btn) {
			return;
		}

		const { index } = btn.dataset;
		if (index === undefined) {
			return;
		}

		const spritesheets = game.settings.get<string[]>(NAMESPACE, SETTINGS.CustomSpritesheets) ?? [];

		spritesheets.splice(Number(index), 1);
		await game.settings.set(NAMESPACE, SETTINGS.CustomSpritesheets, spritesheets);

		this.render(true);
	}

	override _onClickAction(event: Event, htmlElement: HTMLElement) {
		const action = htmlElement.dataset.action;
		switch (action) {
			case 'add':
				event.preventDefault();
				return this.#onAddSpritesheet();
			case 'delete':
				return this.#onDeleteSpritesheet(event);
		}
	}

	override async close(options = {}) {
		await super.close(options);

		const spritesheets = game.settings.get<string[]>(NAMESPACE, SETTINGS.CustomSpritesheets) ?? [];
		const dataModified = !new Set(this.#initialData).equals(new Set(spritesheets));

		const Config = FOUNDRY_API.generation < 13 ? SettingsConfig : foundry.applications.settings.SettingsConfig;
		if (dataModified) {
			await Config.reloadConfirm({ world: true });
		}

		return this;
	}
}
