#!/usr/bin/env node

/**
 * Test script to verify OpenMetadata sandbox connection
 * Run with: node test-openmetadata.js
 */

const SANDBOX_URL = "https://sandbox.open-metadata.org";

async function testConnection() {
  console.log("🔍 Testing OpenMetadata Sandbox Connection...\n");

  // Test 1: Unauthenticated access
  console.log("Test 1: Trying without authentication...");
  try {
    const res = await fetch(`${SANDBOX_URL}/api/v1/databases?limit=1`);
    console.log(`Status: ${res.status} ${res.statusText}`);
    
    if (res.ok) {
      const data = await res.json();
      console.log("✅ SUCCESS! Sandbox allows unauthenticated access");
      console.log(`Found ${data.data?.length || 0} databases\n`);
      return { needsAuth: false };
    } else if (res.status === 401) {
      console.log("❌ 401 Unauthorized - needs authentication\n");
    } else {
      console.log(`❌ Unexpected status: ${res.status}\n`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
  }

  // Test 2: With empty Bearer token
  console.log("Test 2: Trying with empty Bearer token...");
  try {
    const res = await fetch(`${SANDBOX_URL}/api/v1/databases?limit=1`, {
      headers: { Authorization: "Bearer " },
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    
    if (res.ok) {
      const data = await res.json();
      console.log("✅ SUCCESS! Empty token works");
      console.log(`Found ${data.data?.length || 0} databases\n`);
      return { needsAuth: false, token: "" };
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
  }

  // Test 3: Check if sandbox is even reachable
  console.log("Test 3: Checking if sandbox is reachable...");
  try {
    const res = await fetch(SANDBOX_URL);
    console.log(`Status: ${res.status} ${res.statusText}`);
    if (res.ok) {
      console.log("✅ Sandbox is reachable\n");
    }
  } catch (error) {
    console.log(`❌ Sandbox unreachable: ${error.message}\n`);
  }

  return { needsAuth: true };
}

async function testLocalOpenMetadata() {
  console.log("\n🔍 Testing Local OpenMetadata (if running)...\n");
  
  const LOCAL_URL = "http://localhost:8585";
  
  try {
    const res = await fetch(`${LOCAL_URL}/api/v1/databases?limit=1`);
    console.log(`Status: ${res.status} ${res.statusText}`);
    
    if (res.status === 401) {
      console.log("✅ Local OpenMetadata is running but needs auth");
      console.log("   Login at http://localhost:8585");
      console.log("   Default: admin@openmetadata.org / admin");
      console.log("   Then get JWT from Settings → Bots → ingestion-bot\n");
    } else if (res.ok) {
      console.log("✅ Local OpenMetadata is running and accessible!\n");
    }
  } catch (error) {
    console.log(`❌ Local OpenMetadata not running: ${error.message}`);
    console.log("   Start with: docker run -d -p 8585:8585 openmetadata/server:latest\n");
  }
}

async function main() {
  const result = await testConnection();
  await testLocalOpenMetadata();

  console.log("\n📋 Summary:");
  console.log("─".repeat(50));
  
  if (!result.needsAuth) {
    console.log("✅ OpenMetadata Sandbox works!");
    console.log("\nIn your browser at http://localhost:3000:");
    console.log(`  URL: ${SANDBOX_URL}`);
    console.log(`  Token: (leave empty)`);
  } else {
    console.log("❌ Sandbox requires authentication");
    console.log("\nOptions:");
    console.log("1. Run local OpenMetadata with Docker");
    console.log("2. Use a different OpenMetadata instance");
    console.log("3. Add mock/demo mode to the app");
  }
}

main().catch(console.error);
