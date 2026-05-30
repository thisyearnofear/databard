# End-to-End Tests

This directory contains Playwright tests for DataBard.

## Running Tests

### Install Playwright Browsers

```bash
npx playwright install
```

### Run All Tests

```bash
npm run test:e2e
```

### Run Tests with UI

```bash
npm run test:e2e:ui
```

### Run Specific Test File

```bash
npx playwright test tests/demo.spec.ts
```

## Test Structure

- `demo.spec.ts` - Tests for demo mode and onboarding
- `wizard.spec.ts` - Tests for the wizard flow and schema picker
- `api.spec.ts` - Tests for API routes and rate limiting

## Writing Tests

### Basic Test Template

```typescript
import { test, expect } from "@playwright/test";

test("should do something", async ({ page }) => {
  await page.goto("/");
  // Test implementation
});
```

### Test Naming Convention

- Use descriptive test names: `should show error when invalid credentials`
- Group related tests with `test.describe`
- Keep tests focused on a single behavior

### Debugging

Use `page.pause()` to open the Playwright inspector:

```typescript
test("debug test", async ({ page }) => {
  await page.goto("/");
  await page.pause();
});
```

## CI Integration

Tests run automatically in CI on pull requests. See `playwright.config.ts` for configuration.
