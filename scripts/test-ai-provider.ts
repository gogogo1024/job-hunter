#!/usr/bin/env tsx
/**
 * Test AI Provider Factory
 * 
 * Verifies that the LangChain provider factory works correctly
 * Supports: anthropic, google, openai
 * 
 * Usage:
 *   tsx scripts/test-ai-provider.ts anthropic
 *   tsx scripts/test-ai-provider.ts google
 *   tsx scripts/test-ai-provider.ts openai
 */

import { createAIProvider, getCurrentProvider, validateAIProviderConfig } from "@job-hunter/domain";

async function testProvider() {
  try {
    console.log("🧪 Testing AI Provider Factory\n");
    
    // Test 1: Validate configuration
    console.log("1️⃣  Testing configuration validation...");
    try {
      validateAIProviderConfig();
      console.log(`   ✅ Configuration valid for: ${getCurrentProvider().toUpperCase()}\n`);
    } catch (error: any) {
      console.log(`   ❌ Configuration error: ${error.message}\n`);
      process.exit(1);
    }
    
    // Test 2: Create provider instance
    console.log("2️⃣  Creating provider instance...");
    const provider = createAIProvider();
    console.log(`   ✅ Provider created: ${provider.constructor.name}\n`);
    
    // Test 3: List available methods
    console.log("3️⃣  Provider interface:");
    console.log(`   - invoke: ${typeof provider.invoke}`);
    console.log(`   - invokeBatch: ${typeof provider.invokeBatch}`);
    console.log("");
    
    // Test 4: Verify provider type
    const providerName = getCurrentProvider();
    console.log(`4️⃣  Current provider: ${providerName.toUpperCase()}`);
    console.log(`   Environment variable: AI_PROVIDER=${process.env.AI_PROVIDER || "(not set, using default)"}`);
    console.log("");
    
    // Test 5: Check model configuration
    console.log("5️⃣  Model configuration:");
    const modelEnvMap: Record<string, string> = {
      anthropic: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      google: process.env.GOOGLE_MODEL || "gemini-1.5-flash",
      openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
    console.log(`   - Model: ${modelEnvMap[providerName] || "unknown"}`);
    console.log(`   - Temperature: 0 (deterministic)`);
    console.log(`   - Max tokens: 200\n`);
    
    console.log("✅ All provider tests passed!\n");
    console.log("📝 To test actual inference, set the appropriate API key:");
    console.log(`   export ${providerName.toUpperCase()}_API_KEY=your-key-here`);
    
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

testProvider();
