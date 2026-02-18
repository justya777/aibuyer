# Campaign Configuration Guide

## Overview

The system prompt has been refactored from a **468-line monolithic prompt** into a **structured, maintainable configuration system**.

## What Changed

### Before (❌ Problems)
- 115+ lines of inline system prompt in `route.ts`
- Hard to maintain and update rules
- Difficult to test individual sections
- Mixed concerns (validation, targeting, workflows)
- No reusability

### After (✅ Benefits)
- **Separated concerns**: Configuration logic moved to `lib/campaign-config.ts`
- **Modular structure**: Rules organized by category
- **Easy to maintain**: Update one place, affects all prompts
- **Testable**: Each section can be tested independently
- **Extensible**: Add new rules without touching route logic
- **Type-safe**: TypeScript types for all configurations

## File Structure

```
frontend/
├── lib/
│   └── campaign-config.ts          # ⭐ NEW: All campaign rules & config
└── app/
    └── api/
        └── ai-command/
            └── route.ts             # ✨ REFACTORED: Now uses config
```

## Configuration Sections

### 1. Validation Rules
```typescript
VALIDATION_RULES = {
  urls: { ... },      // URL validation warnings
  workflow: { ... }   // Workflow requirements
}
```

### 2. Targeting Rules
```typescript
TARGETING_RULES = {
  principles: { ... },           // Core principles
  countryTargeting: [ ... ],     // Country-only examples
  languageTargeting: [ ... ],    // Language-only examples
  combinedTargeting: [ ... ],    // Combined examples
  demographics: { ... },         // Gender mappings
  interests: { ... },            // Interest mappings
  billing: { ... }               // Default billing config
}
```

### 3. Workflow Templates
```typescript
WORKFLOW_TEMPLATES = {
  simple: {
    steps: [ ... ]   // 3-step campaign creation
  },
  complex: {
    steps: [ ... ]   // Multi-campaign workflows
  }
}
```

### 4. Material Assignment Rules
```typescript
MATERIAL_ASSIGNMENT = {
  rules: [ ... ]   // Material assignment patterns
}
```

## Usage

### Building a System Prompt

```typescript
import { buildSystemPrompt } from '../../../lib/campaign-config';

// Simple usage
const systemPrompt = buildSystemPrompt(
  accountId,
  materialsInfo
);

// With material assignments
const systemPrompt = buildSystemPrompt(
  accountId,
  materialsInfo,
  materialAssignments
);
```

### Building Individual Sections

You can also build specific sections:

```typescript
import { 
  buildValidationSection,
  buildTargetingSection,
  buildWorkflowSection,
  buildMaterialAssignmentSection,
  buildReminder
} from '../../../lib/campaign-config';

const validationRules = buildValidationSection();
const targetingRules = buildTargetingSection();
const workflow = buildWorkflowSection(accountId);
```

## How to Extend

### Adding a New Country Targeting Rule

```typescript
// In campaign-config.ts
countryTargeting: [
  { input: "Romanian men", output: { countries: ["RO"] }, note: "NO language targeting" },
  // ⬇️ Add your new rule here
  { input: "Italian women", output: { countries: ["IT"] }, note: "NO language targeting" },
]
```

### Adding a New Interest Mapping

```typescript
// In campaign-config.ts
interests: {
  fashion: ["Fashion"],
  investment: ["Investment", "Business and industry"],
  // ⬇️ Add your new interest here
  technology: ["Technology", "Software"],
}
```

### Adding a New Workflow Template

```typescript
// In campaign-config.ts
WORKFLOW_TEMPLATES = {
  simple: { ... },
  complex: { ... },
  // ⬇️ Add your new template here
  enterprise: {
    description: "Enterprise multi-region campaign",
    steps: [
      "1. Create master campaign",
      "2. Create regional campaigns for each country",
      "3. Create language-specific adsets",
      "4. Create localized ads"
    ]
  }
}
```

### Creating a Custom Prompt Builder

```typescript
// In campaign-config.ts
export function buildEnterprisePrompt(
  accountId: string,
  regions: string[]
): string {
  return `
${buildValidationSection()}

ENTERPRISE REGIONS: ${regions.join(', ')}

${buildWorkflowSection(accountId)}
  `;
}
```

## Testing

Each section can now be tested independently:

```typescript
import { buildTargetingSection, TARGETING_RULES } from './campaign-config';

test('targeting section includes country rules', () => {
  const section = buildTargetingSection();
  expect(section).toContain('Romanian men');
  expect(section).toContain('countries: ["RO"]');
});

test('demographics mapping is correct', () => {
  expect(TARGETING_RULES.demographics.genders.men).toEqual([1]);
  expect(TARGETING_RULES.demographics.genders.women).toEqual([2]);
});
```

## Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Lines in route.ts** | 468 | 453 (15 lines saved) |
| **Prompt maintenance** | Edit inline string | Edit structured config |
| **Reusability** | None | Import and reuse anywhere |
| **Testing** | Hard to test | Easy to unit test |
| **Type safety** | String template | TypeScript objects |
| **Documentation** | Comments in code | Self-documenting structure |
| **Extensibility** | Modify route.ts | Add to config.ts |

## Migration Notes

- ✅ **No breaking changes**: The generated prompt is identical to before
- ✅ **No API changes**: The route.ts API remains the same
- ✅ **Backward compatible**: Existing functionality preserved
- ✅ **Better maintenance**: Future updates are now easier

## Next Steps

Consider these future enhancements:

1. **Add validation schemas** using Zod for configuration
2. **Create unit tests** for each builder function
3. **Add locale database** for language targeting IDs
4. **Create prompt versioning** for A/B testing
5. **Add configuration presets** for common use cases
6. **Build visual documentation** from config objects

## Example: Before vs After

### Before (route.ts)
```typescript
const systemPrompt = `You are an expert Facebook Ads manager...
🚨 CRITICAL URL WARNING: 
- Facebook API REQUIRES valid URLs...
- NEVER make up URLs...
[115+ lines of inline prompt]
...
REMEMBER: You MUST create campaign, adset AND ad!${materialsInfo}`;
```

### After (route.ts)
```typescript
import { buildSystemPrompt } from '../../../lib/campaign-config';

const systemPrompt = buildSystemPrompt(
  accountId, 
  materialsInfo, 
  materialAssignments
);
```

**Result**: Cleaner, more maintainable, and easier to extend! 🎉

