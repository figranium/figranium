import pkg from '../../package.json';

import fiptchaPackage from 'fiptcha/package.json';
import playwrightPackage from 'playwright/package.json';

export const APP_VERSION = pkg.version || '0.0.0';
export const APP_NAME = pkg.name || 'Figranium';
export const FIPTCHA_VERSION = fiptchaPackage.version || 'unknown';
export const PLAYWRIGHT_VERSION = playwrightPackage.version || 'unknown';
