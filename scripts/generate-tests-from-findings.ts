import * as fs from 'fs/promises';
import * as path from 'path';
import { TestGeneratorService } from '../src/application/services/TestGeneratorService';
import { Finding } from '../src/domain/exploration/Finding';

/**
 * Script to generate Playwright tests from existing findings.
 * Run with: npx ts-node scripts/generate-tests-from-findings.ts
 */
async function main(): Promise<void> {
  const findingsDir = './findings';
  const outputDir = './generated-tests';

  console.log('🧪 Generating Playwright tests from findings...\n');

  // Find all session directories
  const sessionDirs = await fs.readdir(findingsDir);
  const allFindings: Finding[] = [];

  for (const sessionId of sessionDirs) {
    const sessionPath = path.join(findingsDir, sessionId);
    const stat = await fs.stat(sessionPath);
    
    if (!stat.isDirectory()) continue;

    const files = await fs.readdir(sessionPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(sessionPath, file);
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        
        // Reconstruct Finding from JSON
        const finding = Finding.create({
          sessionId: data.sessionId,
          type: data.type,
          severity: data.severity,
          title: data.title,
          description: data.description,
          pageUrl: data.pageUrl,
          pageTitle: data.pageTitle,
          stepNumber: data.stepNumber,
          evidence: data.evidence,
          metadata: data.metadata,
        }, data.id);

        allFindings.push(finding);
      } catch (error) {
        console.warn(`⚠️ Could not read finding: ${filePath}`);
      }
    }
  }

  console.log(`📄 Found ${allFindings.length} findings across ${sessionDirs.length} sessions\n`);

  if (allFindings.length === 0) {
    console.log('No findings to generate tests from.');
    return;
  }

  // Create test generator
  const testGenerator = new TestGeneratorService({
    outputDir,
    baseUrl: 'https://with-bugs.practicesoftwaretesting.com',
  });

  // Generate tests
  const result = await testGenerator.generateTests(allFindings, 'combined');

  console.log(`✅ Tests generated: ${result.filePath}`);
  console.log(`   - ${result.testCount} tests created`);
  console.log(`   - ${result.excludedFindings.length} findings excluded (not suitable for automation)`);

  // Print a summary of what was generated
  if (result.testCount > 0) {
    console.log('\n📋 Test summary:');
    const content = await fs.readFile(result.filePath, 'utf-8');
    const testMatches = content.match(/test\('\[.*?\]/g) || [];
    
    for (const match of testMatches.slice(0, 10)) {
      console.log(`   ${match}`);
    }
    
    if (testMatches.length > 10) {
      console.log(`   ... and ${testMatches.length - 10} more tests`);
    }
  }

  console.log('\n🔍 Run the tests with:');
  console.log('   npx playwright test generated-tests/*.spec.ts');
}

main().catch(console.error);
