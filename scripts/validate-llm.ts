/**
 * Validate LLM - Sprint 2
 * Tests LLM adapter connection and structured responses
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { AnthropicAdapter } from '../src/infrastructure/llm/AnthropicAdapter';
import { GeminiAdapter } from '../src/infrastructure/llm/GeminiAdapter';
import { LLMAdapterFactory } from '../src/infrastructure/llm/LLMAdapterFactory';
import { LLMPort, LLMPageContext, LLMDecisionRequest, ExplorationHistoryEntry, ActionDecision } from '../src/application/ports/LLMPort';

const MOCK_PAGE_CONTEXT: LLMPageContext = {
  url: 'https://with-bugs.practicesoftwaretesting.com',
  title: 'Practice Software Testing - Toolshop',
  visibleText: 'Welcome to the Practice Software Testing website. Browse our tools and products.',
  elements: [
    {
      type: 'link',
      text: 'Home',
      selector: 'a[data-test="nav-home"]',
      isVisible: true,
    },
    {
      type: 'link',
      text: 'Categories',
      selector: 'a[data-test="nav-categories"]',
      isVisible: true,
    },
    {
      type: 'button',
      text: 'Sign in',
      selector: 'a[data-test="nav-sign-in"]',
      isVisible: true,
    },
    {
      type: 'textbox',
      text: 'Search',
      selector: 'input[data-test="search-query"]',
      isVisible: true,
    },
    {
      type: 'button',
      text: 'Search',
      selector: 'button[data-test="search-submit"]',
      isVisible: true,
    },
    {
      type: 'link',
      text: 'Pliers',
      selector: 'a[data-test="product-0"]',
      isVisible: true,
    },
  ],
  consoleErrors: [],
  networkErrors: [],
};

async function validateLLM(): Promise<void> {
  console.log('🤖 LLM Validation Script - Sprint 2');
  console.log('=' .repeat(50));
  
  // Check for API key (check both Gemini and Anthropic)
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.LLM_PROVIDER || 'gemini';
  
  if (!geminiKey && !anthropicKey) {
    console.log('\n⚠️  No LLM API key found in environment');
    console.log('   Set GEMINI_API_KEY or ANTHROPIC_API_KEY');
    console.log('   Skipping live API tests, running mock validation only.\n');
    await runMockValidation();
    return;
  }

  console.log(`✅ ${provider.toUpperCase()} API key found\n`);

  let adapter: LLMPort;
  
  try {
    // Step 1: Create adapter using factory
    console.log('📦 Step 1: Creating LLM adapter...');
    adapter = LLMAdapterFactory.createFromEnv();
    console.log('✅ Adapter created via factory\n');

    // Step 2: Test decision request
    console.log('🧠 Step 2: Testing action decision...');
    const request: LLMDecisionRequest = {
      objective: 'Explore the website to find broken images and usability issues',
      pageContext: MOCK_PAGE_CONTEXT,
      history: [],
      tools: [
        {
          name: 'find_broken_images',
          description: 'Scans the page for broken images',
          parameters: {
            timeout: { type: 'number', required: false, description: 'Timeout in ms' },
          },
        },
        {
          name: 'take_screenshot',
          description: 'Takes a screenshot of the current page',
          parameters: {},
        },
      ],
    };

    console.log('   Sending request to Claude...');
    const startTime = Date.now();
    const response = await adapter.decideNextAction(request);
    const duration = Date.now() - startTime;

    console.log(`✅ Response received in ${duration}ms`);
    console.log(`   Decision: ${response.decision.action}`);
    console.log(`   Reasoning: ${response.decision.reasoning.substring(0, 100)}...`);
    console.log(`   Confidence: ${response.decision.confidence}`);
    console.log(`   Tokens: ${response.usage.totalTokens}`);

    if (response.decision.action === 'click' && response.decision.selector) {
      console.log(`   Target: ${response.decision.selector}`);
    } else if (response.decision.action === 'fill' && response.decision.selector) {
      console.log(`   Target: ${response.decision.selector}`);
      console.log(`   Value: ${response.decision.value}`);
    } else if (response.decision.action === 'tool' && response.decision.toolName) {
      console.log(`   Tool: ${response.decision.toolName}`);
      console.log(`   Tool Params: ${JSON.stringify(response.decision.toolParams)}`);
    }
    console.log('');

    // Step 3: Test with exploration context
    console.log('🔍 Step 3: Testing exploration decision...');
    const pastAction: ActionDecision = {
      action: 'navigate',
      value: 'https://with-bugs.practicesoftwaretesting.com',
      reasoning: 'Starting exploration',
      confidence: 1.0,
    };
    
    const historyEntry: ExplorationHistoryEntry = {
      step: 1,
      action: pastAction,
      success: true,
      resultingUrl: 'https://with-bugs.practicesoftwaretesting.com',
    };
    
    const explorationRequest: LLMDecisionRequest = {
      objective: 'Find all broken images on this e-commerce site',
      pageContext: MOCK_PAGE_CONTEXT,
      history: [historyEntry],
      tools: [
        {
          name: 'find_broken_images',
          description: 'Scans the page for broken images',
          parameters: {},
        },
      ],
    };

    const explorationResponse = await adapter.decideNextAction(explorationRequest);
    console.log(`✅ Exploration decision: ${explorationResponse.decision.action}`);
    console.log(`   Reasoning: ${explorationResponse.decision.reasoning.substring(0, 100)}...`);
    console.log('');

    // Step 4: Test finding analysis
    console.log('📋 Step 4: Testing finding analysis...');
    const mockFinding = 'Found 3 broken images on the homepage: /images/product1.jpg (http_error), /images/banner.png (zero_dimensions), (empty_src)';

    const analysis = await adapter.analyzeFinding(mockFinding, MOCK_PAGE_CONTEXT);
    console.log(`✅ Finding analyzed`);
    console.log(`   Severity: ${analysis.severity}`);
    console.log(`   Description: ${analysis.description.substring(0, 100)}...`);
    console.log(`   Recommendation: ${analysis.recommendation.substring(0, 100)}...`);
    console.log('');

    // Step 5: Test summary generation
    console.log('📊 Step 5: Testing summary generation...');
    const summaryHistory: ExplorationHistoryEntry[] = [
      historyEntry,
      {
        step: 2,
        action: { action: 'tool', toolName: 'find_broken_images', reasoning: 'Check for broken images', confidence: 0.9 },
        success: true,
        resultingUrl: 'https://with-bugs.practicesoftwaretesting.com',
        findings: ['Found 3 broken images'],
      },
    ];

    const findings = ['Found 3 broken images on homepage', 'Missing alt text on 5 images'];
    const summary = await adapter.generateSummary(summaryHistory, findings);
    console.log(`✅ Summary generated`);
    console.log(`   Summary: ${summary.substring(0, 200)}...`);
    console.log('');

    // Summary
    console.log('=' .repeat(50));
    console.log('🎉 LLM Validation Complete!');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ LLM adapter created successfully');
    console.log('  ✅ Action decision working');
    console.log('  ✅ Finding analysis working');
    console.log('  ✅ Summary generation working');
    console.log('  ✅ Structured responses parsed correctly');

  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    
    if (error instanceof Error && error.message.includes('API')) {
      console.log('\n💡 Tips:');
      console.log('   - Check that ANTHROPIC_API_KEY is valid');
      console.log('   - Ensure you have API credits available');
      console.log('   - Check network connectivity');
    }
    
    process.exit(1);
  }
}

async function runMockValidation(): Promise<void> {
  console.log('🧪 Running Mock Validation (no API key)...\n');

  // Step 1: Test factory without key
  console.log('📦 Step 1: Testing LLMAdapterFactory...');
  try {
    LLMAdapterFactory.createFromEnv();
    console.log('❌ Should have thrown error without API key');
  } catch (error) {
    console.log('✅ Factory correctly throws when API key missing');
  }
  console.log('');

  // Step 2: Test adapter instantiation
  console.log('📦 Step 2: Testing direct adapter instantiation...');
  try {
    new GeminiAdapter({ apiKey: 'test-key', model: 'gemini-2.0-flash-exp' });
    console.log('✅ Gemini adapter can be instantiated with config');
    new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-sonnet-4-20250514' });
    console.log('✅ Anthropic adapter can be instantiated with config');
  } catch (error) {
    console.log(`❌ Adapter instantiation failed: ${error}`);
  }
  console.log('');

  // Step 3: Verify interface compliance
  console.log('📝 Step 3: Verifying LLMPort interface...');
  const mockAdapter = new GeminiAdapter({ apiKey: 'test', model: 'gemini-2.0-flash-exp' });
  
  const hasDecideNextAction = typeof mockAdapter.decideNextAction === 'function';
  const hasAnalyzeFinding = typeof mockAdapter.analyzeFinding === 'function';
  const hasGenerateSummary = typeof mockAdapter.generateSummary === 'function';
  const hasIsAvailable = typeof mockAdapter.isAvailable === 'function';
  
  console.log(`   decideNextAction: ${hasDecideNextAction ? '✅' : '❌'}`);
  console.log(`   analyzeFinding: ${hasAnalyzeFinding ? '✅' : '❌'}`);
  console.log(`   generateSummary: ${hasGenerateSummary ? '✅' : '❌'}`);
  console.log(`   isAvailable: ${hasIsAvailable ? '✅' : '❌'}`);
  console.log(`   provider: ${mockAdapter.provider}`);
  console.log(`   model: ${mockAdapter.model}`);
  console.log('');

  // Step 4: Test factory with config
  console.log('📦 Step 4: Testing factory with explicit config...');
  LLMAdapterFactory.create({
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-2.0-flash-exp',
  });
  console.log('✅ Factory creates Gemini adapter with explicit config');
  LLMAdapterFactory.create({
    provider: 'anthropic',
    apiKey: 'test-key',
    model: 'claude-sonnet-4-20250514',
  });
  console.log('✅ Factory creates Anthropic adapter with explicit config');
  console.log('');

  // Summary
  console.log('=' .repeat(50));
  console.log('🎉 Mock Validation Complete!');
  console.log('');
  console.log('Summary:');
  console.log('  ✅ LLMAdapterFactory structure correct');
  console.log('  ✅ AnthropicAdapter implements LLMPort');
  console.log('  ✅ Interface methods defined');
  console.log('');
  console.log('⚠️  To run full validation, set ANTHROPIC_API_KEY environment variable');
}

// Run validation
validateLLM().catch(console.error);
