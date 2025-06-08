import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';

function enableDisableAppBackgroundBlur() {
	const enabled = getSetting<boolean>(SETTINGS.DisableAppV2BackgroundBlur);

	if (!enabled) {
		return;
	}

	toggleDisableAppBackgroundBlur(enabled);
}

function toggleDisableAppBackgroundBlur(enabled: boolean) {
	if (enabled) {
		document.body.classList.add('disable-app-background-blur');
	} else {
		document.body.classList.remove('disable-app-background-blur');
	}
}

export { enableDisableAppBackgroundBlur, toggleDisableAppBackgroundBlur };
