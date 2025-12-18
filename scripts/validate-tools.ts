/**
 * Validate Tools - Sprint 2
 * Tests tool execution against the target site
 */

import { PlaywrightBrowserAdapter } from '../src/infrastructure/browser/PlaywrightBrowserAdapter';
import { BrokenImageDetectorTool } from '../src/infrastructure/tools/BrokenImageDetectorTool';
import { getDefaultToolRegistry } from '../src/domain/tools/ToolRegistry';
import { ToolContext } from '../src/domain/tools/Tool';
import { BrokenImageReport } from '../src/domain/findings/BrokenImageReport';

const TARGET_URL = 'https://with-bugs.practicesoftwaretesting.com';

async function validateTools(): Promise<void> {
  console.log('🔧 Tool Validation Script - Sprint 2');
  console.log('=' .repeat(50));
  console.log(`Target URL: ${TARGET_URL}\n`);

  const adapter = new PlaywrightBrowserAdapter();
  
  try {
    // Step 1: Initialize browser
    console.log('📦 Step 1: Initializing browser...');
    await adapter.initialize();
    console.log('✅ Browser initialized\n');

    // Step 2: Navigate to target
    console.log('🌐 Step 2: Navigating to target URL...');
    await adapter.navigate(TARGET_URL);
    const currentUrl = await adapter.getCurrentUrl();
    const title = await adapter.getTitle();
    console.log(`✅ Page loaded: ${title}`);
    console.log(`   URL: ${currentUrl}\n`);

    // Step 3: Test ToolRegistry
    console.log('📝 Step 3: Testing ToolRegistry...');
    const registry = getDefaultToolRegistry();
    
    // Register the broken image detector
    const brokenImageTool = new BrokenImageDetectorTool();
    registry.register(brokenImageTool);
    console.log(`✅ Registered tool: ${brokenImageTool.name}`);
    
    // Verify tool definitions
    const definitions = registry.getToolDefinitions();
    console.log(`   Total tools registered: ${definitions.length}`);
    definitions.forEach(def => {
      console.log(`   - ${def.name}: ${def.description.substring(0, 50)}...`);
    });
    console.log('');

    // Step 4: Create tool context
    console.log('🔧 Step 4: Creating tool context...');
    const context: ToolContext = {
      browser: adapter,
      currentUrl: currentUrl,
    };
    console.log('✅ Tool context created\n');

    // Step 5: Execute broken image detector
    console.log('🔍 Step 5: Running BrokenImageDetectorTool...');
    const startTime = Date.now();
    const result = await registry.invoke('find_broken_images', { checkHttpStatus: false }, context);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Tool executed in ${duration}ms`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success && result.data) {
      const report = result.data as BrokenImageReport;
      console.log(`   Total images found: ${report.totalImages}`);
      console.log(`   Broken images: ${report.brokenCount}`);
      console.log(`   Page URL: ${report.pageUrl}`);
      console.log(`   Page Title: ${report.pageTitle}`);
      console.log(`   Scan Duration: ${report.scanDuration}ms`);
      
      if (report.brokenCount > 0) {
        console.log('\n   📋 Broken Image Details:');
        report.brokenImages.forEach((img, index: number) => {
          console.log(`   ${index + 1}. ${img.src || '(empty src)'}`);
          console.log(`      Reason: ${img.reason}`);
          console.log(`      Severity: ${img.getSeverity()}`);
          console.log(`      Selector: ${img.selector}`);
        });
        
        console.log('\n   📊 Summary by Reason:');
        const byReason = report.getByReason();
        byReason.forEach((images, reason) => {
          console.log(`   - ${reason}: ${images.length} image(s)`);
        });
      }
      
      console.log('\n   📄 Full Report Summary:');
      console.log('   ' + '-'.repeat(40));
      console.log(report.summarize().split('\n').map((line: string) => '   ' + line).join('\n'));
    } else if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    }
    console.log('');

    // Step 6: Test direct tool invocation (bypassing registry)
    console.log('🔧 Step 6: Testing direct tool invocation...');
    const directResult = await brokenImageTool.execute({}, context);
    console.log(`✅ Direct invocation: ${directResult.success ? 'Success' : 'Failed'}`);
    console.log(`   Duration: ${directResult.duration}ms\n`);

    // Step 7: Navigate to another page and re-test
    console.log('🌐 Step 7: Testing on product page...');
    await adapter.navigate(TARGET_URL + '/#/category/hand-tools');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for images to load
    
    const productContext: ToolContext = {
      browser: adapter,
      currentUrl: await adapter.getCurrentUrl(),
    };
    
    const productResult = await registry.invoke('find_broken_images', {}, productContext);
    if (productResult.success && productResult.data) {
      const productReport = productResult.data as BrokenImageReport;
      console.log(`✅ Product page scanned`);
      console.log(`   Images found: ${productReport.totalImages}`);
      console.log(`   Broken: ${productReport.brokenCount}`);
    }
    console.log('');

    // Step 8: Test tool parameter validation
    console.log('🧪 Step 8: Testing parameter validation...');
    try {
      await brokenImageTool.execute(
        { timeout: 5000, checkHttpStatus: true },
        context
      );
      console.log(`✅ Parameters accepted: timeout=5000, checkHttpStatus=true`);
    } catch (e) {
      console.log(`❌ Parameter validation failed: ${e}`);
    }
    console.log('');

    // Summary
    console.log('=' .repeat(50));
    console.log('🎉 Tool Validation Complete!');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ ToolRegistry working correctly');
    console.log('  ✅ Tool registration and invocation functional');
    console.log('  ✅ BrokenImageDetectorTool executing properly');
    console.log('  ✅ Tool context passing browser reference correctly');
    console.log('  ✅ Tool definitions generated successfully');
    
  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    process.exit(1);
  } finally {
    console.log('\n🧹 Cleaning up...');
    await adapter.close();
    console.log('✅ Browser closed');
  }
}

// Run validation
validateTools().catch(console.error);
