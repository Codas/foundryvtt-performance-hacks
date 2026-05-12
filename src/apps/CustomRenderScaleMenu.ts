import { NAMESPACE } from 'src/constants.ts'
import { redrawLightingEffects } from 'src/hacks/reduceLightingResolution.ts'
import { RENDER_SCALE_DEFAULTS, SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'

const fields = foundry.data.fields

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
	}

	static override PARTS = {
		body: {
			template: `modules/${NAMESPACE}/templates/render-resolution-menu.hbs`,
			scrollable: [''],
		},
		footer: {
			template: 'templates/generic/form-footer.hbs',
		},
	}

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
	})

	static get schema() {
		return CustomRenderScaleConfig.#schema
	}

	static #localized = false

	override async _preFirstRender(_context: any, _options: any) {
		await super._preFirstRender(_context, _options)

		if (!CustomRenderScaleConfig.#localized) {
			foundry.helpers.Localization.localizeDataModel({ schema: CustomRenderScaleConfig.#schema } as any, {
				prefixes: [`${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.menu`],
			})
			CustomRenderScaleConfig.#localized = true
		}
	}

	// The setting value captured when the form was first opened -- used for Reset and cancel.
	#originalSetting: typeof RENDER_SCALE_DEFAULTS = RENDER_SCALE_DEFAULTS

	override async _prepareContext(options: any): Promise<any> {
		if (options.isFirstRender) {
			this.#originalSetting =
				getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale) ?? RENDER_SCALE_DEFAULTS
		}

		return {
			renderScale: getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale) ?? RENDER_SCALE_DEFAULTS,
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
		}
	}

	// Persist the final form values on submit.
	static async #onSubmit(
		this: CustomRenderScaleConfig,
		_event: Event,
		_form: HTMLFormElement,
		formData: { object: Record<string, unknown> },
	) {
		const newScale = foundry.utils.expandObject(formData.object) as typeof RENDER_SCALE_DEFAULTS
		game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, newScale)
	}

	// Reset the form to the values from when it was opened.
	static async #onReset(this: CustomRenderScaleConfig) {
		game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, CustomRenderScaleConfig.#originalSetting)
		CustomRenderScaleConfig.render()
	}

	// On close without submit, restore the original setting and force a redraw so
	// the canvas reverts immediately rather than waiting for the next layer draw.
	override _onClose(options: any) {
		super._onClose(options)
		if (!options.submitted) {
			game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, this.#originalSetting)
			redrawLightingEffects()
		}
	}

	// Write the setting on every change for live canvas preview.
	// The resolution getter in reduceLightingResolution.ts reads from the setting
	// directly, so the next rendered frame picks up the new value automatically.
	override _onChangeForm(_formConfig: any, _event: any) {
		if (!this.form) {
			return
		}
		const formData = new foundry.applications.ux.FormDataExtended(this.form)
		const newScale = foundry.utils.expandObject(formData.object) as typeof RENDER_SCALE_DEFAULTS
		game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, newScale)
	}
}
