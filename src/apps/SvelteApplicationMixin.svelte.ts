import type { Component } from 'svelte'
import { mount, unmount } from 'svelte'

/**
 * Mixin that replaces the Handlebars rendering pipeline with Svelte 5.
 *
 * "Inspired" by the svelte application mixin from the wonderful Mr Vauxs
 * as used in FoundrySummons2 https://github.com/MrVauxs/foundry-summons-2
 */
function SvelteApplicationMixin<TBase extends AbstractConstructorOf<foundry.applications.api.ApplicationV2>>(
	Base: TBase,
) {
	abstract class SvelteApplication extends Base {
		protected abstract readonly root: Component<any>

		/** Deep-reactive state object shared with the mounted Svelte component. */
		protected $state: Record<string, unknown> = $state({})

		#mountedComponent: Record<string, unknown> | null = null

		protected override async _renderHTML(context: any): Promise<any> {
			return context
		}

		protected override _replaceHTML(result: any, content: HTMLElement, options: any): void {
			Object.assign(this.$state, result.data as Record<string, unknown>)
			if (options.isFirstRender) {
				this.#mountedComponent = mount(this.root, {
					target: content,
					props: { state: this.$state },
				}) as Record<string, unknown>
			}
		}

		protected override _onClose(options: any): void {
			super._onClose(options)
			if (this.#mountedComponent !== null) {
				unmount(this.#mountedComponent)
				this.#mountedComponent = null
			}
		}
	}

	return SvelteApplication
}

export { SvelteApplicationMixin }
