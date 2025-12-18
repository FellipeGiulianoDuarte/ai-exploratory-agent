/**
 * Browser Validation Script
 * Tests the browser automation setup by navigating to the target URL,
 * capturing a screenshot, and extracting interactive elements.
 */

import * as dotenv from 'dotenv';
import { PlaywrightBrowserAdapter } from '../src/infrastructure/browser/PlaywrightBrowserAdapter';

// Load environment variables
dotenv.config();

const TARGET_URL = process.env.TARGET_URL ?? 'https://with-bugs.practicesoftwaretesting.com';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? './screenshots';
const HEADLESS = process.env.HEADLESS !== 'false';

interface ValidationResult {
  step: string;
  success: boolean;
  message: string;
  duration?: number;
}

async function validateBrowser(): Promise<void> {
  const results: ValidationResult[] = [];
  const browser = new PlaywrightBrowserAdapter({
    headless: HEADLESS,
    screenshotDir: SCREENSHOT_DIR,
    timeout: 30000,
  });

  console.log('\n🔍 Starting Browser Validation...\n');
  console.log(`   Target URL: ${TARGET_URL}`);
  console.log(`   Headless: ${HEADLESS}`);
  console.log(`   Screenshot Dir: ${SCREENSHOT_DIR}\n`);

  try {
    // Step 1: Initialize browser
    console.log('1. Initializing browser...');
    const initStart = Date.now();
    await browser.initialize();
    const initDuration = Date.now() - initStart;
    results.push({
      step: 'Initialize Browser',
      success: true,
      message: 'Browser initialized successfully',
      duration: initDuration,
    });
    console.log(`   ✓ Browser initialized (${initDuration}ms)\n`);

    // Step 2: Navigate to target URL
    console.log(`2. Navigating to ${TARGET_URL}...`);
    const navResult = await browser.navigate(TARGET_URL);
    results.push({
      step: 'Navigate',
      success: navResult.success,
      message: navResult.success
        ? `Navigated to ${TARGET_URL}`
        : `Navigation failed: ${navResult.error}`,
      duration: navResult.duration,
    });

    if (!navResult.success) {
      throw new Error(`Navigation failed: ${navResult.error}`);
    }
    console.log(`   ✓ Navigated to ${TARGET_URL} (${navResult.duration}ms)\n`);

    // Step 3: Capture screenshot
    console.log('3. Capturing screenshot...');
    const screenshotStart = Date.now();
    const screenshotPath = await browser.screenshot({
      path: 'homepage.png',
      fullPage: false,
    });
    const screenshotDuration = Date.now() - screenshotStart;
    results.push({
      step: 'Screenshot',
      success: true,
      message: `Screenshot saved to ${screenshotPath}`,
      duration: screenshotDuration,
    });
    console.log(`   ✓ Screenshot saved to ${screenshotPath} (${screenshotDuration}ms)\n`);

    // Step 4: Extract page state
    console.log('4. Extracting page state...');
    const stateStart = Date.now();
    const pageState = await browser.extractPageState();
    const stateDuration = Date.now() - stateStart;
    results.push({
      step: 'Extract Page State',
      success: true,
      message: `Page state extracted: ${pageState.title}`,
      duration: stateDuration,
    });
    console.log(`   ✓ Page Title: ${pageState.title}`);
    console.log(`   ✓ Current URL: ${pageState.url}`);
    console.log(`   ✓ Page state extracted (${stateDuration}ms)\n`);

    // Step 5: Get interactive elements
    console.log('5. Finding interactive elements...');
    const elementsStart = Date.now();
    const elements = await browser.getInteractiveElements();
    const elementsDuration = Date.now() - elementsStart;
    results.push({
      step: 'Get Interactive Elements',
      success: true,
      message: `Found ${elements.length} interactive elements`,
      duration: elementsDuration,
    });
    console.log(`   ✓ Found ${elements.length} interactive elements (${elementsDuration}ms)\n`);

    // Print element breakdown
    const elementsByType = elements.reduce(
      (acc, el) => {
        acc[el.type] = (acc[el.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log('   Element breakdown:');
    Object.entries(elementsByType).forEach(([type, count]) => {
      console.log(`     - ${type}: ${count}`);
    });
    console.log();

    // Step 6: Verify console/network errors
    console.log('6. Checking for page errors...');
    const consoleErrors = pageState.consoleErrors;
    const networkErrors = pageState.networkErrors;
    results.push({
      step: 'Check Errors',
      success: true,
      message: `Console errors: ${consoleErrors.length}, Network errors: ${networkErrors.length}`,
    });
    console.log(`   ℹ Console errors: ${consoleErrors.length}`);
    console.log(`   ℹ Network errors: ${networkErrors.length}\n`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      step: 'Validation',
      success: false,
      message: `Validation failed: ${errorMessage}`,
    });
    console.error(`\n❌ Validation failed: ${errorMessage}\n`);
  } finally {
    // Close browser
    console.log('7. Closing browser...');
    await browser.close();
    console.log('   ✓ Browser closed\n');
  }

  // Print summary
  printSummary(results);
}

function printSummary(results: ValidationResult[]): void {
  console.log('═'.repeat(60));
  console.log('                    VALIDATION SUMMARY');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  results.forEach(result => {
    const icon = result.success ? '✓' : '✗';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${icon} ${result.step}: ${result.message}${duration}`);
  });

  console.log('─'.repeat(60));
  console.log(`Total: ${results.length} steps | Passed: ${successful.length} | Failed: ${failed.length}`);
  console.log('═'.repeat(60));

  if (failed.length > 0) {
    console.log('\n❌ Validation FAILED\n');
    process.exit(1);
  } else {
    console.log('\n✅ Validation PASSED\n');
    process.exit(0);
  }
}

// Run validation
validateBrowser().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
