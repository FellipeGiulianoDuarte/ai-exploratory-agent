/**
 * AI Exploratory Testing Agent
 * Main entry point
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Export main components for external use
export { PlaywrightBrowserAdapter } from './infrastructure/browser/PlaywrightBrowserAdapter';
export { PageState } from './domain/browser/PageState';
export { InteractiveElement } from './domain/browser/InteractiveElement';
export type { BrowserPort } from './application/ports/BrowserPort';

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('AI Exploratory Testing Agent');
  // eslint-disable-next-line no-console
  console.log('============================');
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('To validate browser setup, run:');
  // eslint-disable-next-line no-console
  console.log('  npm run validate:browser');
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Sprint 1 implementation complete.');
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error('Error:', error);
  process.exit(1);
});
