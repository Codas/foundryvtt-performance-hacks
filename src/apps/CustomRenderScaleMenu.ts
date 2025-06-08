import { NAMESPACE } from 'src/constants.ts';
import { configureEffectsResolution } from 'src/hacks/reduceLightingResolution.ts';
import { RENDER_SCALE_DEFAULTS, SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';

const fields = foundry.data.fields;

export class CustomRenderScaleConfig extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.api.ApplicationV2,
) {
	static override DEFAULT_OPTIONS = {
		id: 'render-scale-config',
		tag: 'form',
		window: {
			contentClasses: ['standard-form'],
			title: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.menu.title`,
			icon: 'fa-solid fa-percent',
		},
		position: {
			width: 600,
		},
		form: {
			closeOnSubmit: true,
			handler: CustomRenderScaleConfig.#onSubmit,
		},
		actions: {
			reset: CustomRenderScaleConfig.#onReset,
		},
	};

	static override PARTS = {
		body: {
			template: `modules/${NAMESPACE}/templates/render-resolution-menu.hbs`,
			scrollable: [''],
		},
		footer: {
			template: 'templates/generic/form-footer.hbs',
		},
	};

	static #schema = new fields.SchemaField({
		background: new fields.NumberField({
			required: true,
			min: 25,
			max: 100,
			step: 5,
			initial: RENDER_SCALE_DEFAULTS.background,
		}),
		illumination: new fields.NumberField({
			required: true,
			min: 25,
			max: 100,
			step: 5,
			initial: RENDER_SCALE_DEFAULTS.illumination,
		}),
		coloration: new fields.NumberField({
			required: true,
			min: 25,
			max: 100,
			step: 5,
			initial: RENDER_SCALE_DEFAULTS.coloration,
		}),
		darkness: new fields.NumberField({
			required: true,
			min: 25,
			max: 100,
			step: 5,
			initial: RENDER_SCALE_DEFAULTS.darkness,
		}),
	});

	/**
	 * The data schema for the core.uiConfig setting.
	 * @type {SchemaField}
	 */
	static get schema() {
		return CustomRenderScaleConfig.#schema;
	}

	static #localized = false;

	/** @inheritDoc */
	override async _preFirstRender(_context: any, _options: any) {
		const LocalizationHelper: Localization = FOUNDRY_API.generation >= 13 ? foundry.helpers.Localization : Localization;
		await super._preFirstRender(_context, _options);

		if (!CustomRenderScaleConfig.#localized) {
			LocalizationHelper.localizeDataModel(
				{ schema: CustomRenderScaleConfig.#schema },
				{ prefixes: ['fvtt-perf-optim.settings.custom-render-scale.menu'] },
			);
			CustomRenderScaleConfig.#localized = true;
		}
	}

	#setting: typeof RENDER_SCALE_DEFAULTS | undefined;

	override async _prepareContext(options: any) {
		if (options.isFirstRender) {
			this.#setting = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale) ?? RENDER_SCALE_DEFAULTS;
		}

		return {
			renderScale: this.#setting,
			fields: CustomRenderScaleConfig.#schema.fields,
			buttons: [
				{
					type: 'button',
					label: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.menu.cancel`,
					icon: 'fa-solid fa-arrow-rotate-left',
					action: 'reset',
				},
				{
					type: 'submit',
					label: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.menu.confirm`,
					icon: 'fa-solid fa-check',
					action: 'confirm',
				},
			],
		};
	}

	static async #onSubmit() {
		game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, this.#setting);
		const enabled = getSetting<boolean>(SETTINGS.ReduceLightingResolution);
		configureEffectsResolution(enabled ? this.#setting : null);
	}

	static async #onReset() {
		this.#setting = RENDER_SCALE_DEFAULTS;
	}

	override _onClose(options: any) {
		super._onClose(options);
		if (!options.submitted) {
			const enabled = getSetting<boolean>(SETTINGS.ReduceLightingResolution);
			const renderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
			configureEffectsResolution(enabled ? renderScale : null);
		}
	}

	/* -------------------------------------------- */

	/** @override */
	override _onChangeForm(_formConfig: any, _event: any) {
		const FormDataExtendedConstructor =
			FOUNDRY_API.generation >= 13 ? foundry.applications.ux.FormDataExtended : FormDataExtended;

		const formData = new FormDataExtendedConstructor(this.form);

		this.#setting = foundry.utils.expandObject(formData.object) as typeof RENDER_SCALE_DEFAULTS;
		configureEffectsResolution(this.#setting);
	}
}
