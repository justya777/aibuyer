# DSA Compliance Setup for EU Targeting

## ⚠️ Required for Targeting EU Countries

When targeting EU countries (including Romania), Facebook requires Digital Services Act (DSA) compliance fields.

## 🔧 Quick Fix

Add these lines to your `.env` file in the `mcp-servers/facebook-mcp/` folder:

```env
# DSA Compliance (required for EU targeting)
FB_DSA_BENEFICIARY="Your Company Name"
FB_DSA_PAYOR="Your Company Name"
```

## 📋 What These Fields Mean

- **FB_DSA_BENEFICIARY**: The entity that benefits from the ad (usually your company)
- **FB_DSA_PAYOR**: The entity that pays for the ad (usually your company) 

For most small businesses and advertisers, both can be set to your company name.

## 🌍 EU Countries That Require DSA Compliance

Romania (RO), Germany (DE), France (FR), Italy (IT), Spain (ES), Netherlands (NL), Belgium (BE), Austria (AT), Poland (PL), Sweden (SE), Denmark (DK), Finland (FI), Norway (NO), Czech Republic (CZ), Hungary (HU), Portugal (PT), Greece (GR), Ireland (IE), Latvia (LV), Lithuania (LT), Estonia (EE), Slovenia (SI), Slovakia (SK), Croatia (HR), Bulgaria (BG), Malta (MT), Luxembourg (LU), Cyprus (CY)

## 🚀 After Adding Variables

1. Save your `.env` file
2. Restart your MCP server: `npm run dev`
3. Try creating the adset again

The adset creation will now work for EU targeting!
