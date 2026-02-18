/**
 * Facebook Ads Campaign Configuration
 * Simplified rules and prompt templates for AI agent
 */

//WE HAVE DUPLICATE IF THIS WORKS BAD copied 

// ============================================================================
// URL PARSING UTILITIES
// ==============================================           ==============================

export function parseTrackingUrl(fullUrl: string): { websiteUrl: string; urlParameters: string } {
  if (!fullUrl || typeof fullUrl !== 'string') {
    return { websiteUrl: '', urlParameters: '' };
  }
  const trimmedUrl = fullUrl.trim();
  const queryIndex = trimmedUrl.indexOf('?');
  if (queryIndex === -1) {
    return { websiteUrl: trimmedUrl, urlParameters: '' };
  }
  return {
    websiteUrl: trimmedUrl.substring(0, queryIndex),
    urlParameters: trimmedUrl.substring(queryIndex + 1),
  };
}

export function combineTrackingUrl(websiteUrl: string, urlParameters: string): string {
  if (!websiteUrl) return '';
  if (!urlParameters) return websiteUrl;
  return `${websiteUrl.replace(/\?$/, '')}?${urlParameters.replace(/^\?/, '')}`;
}

export function containsFacebookMacros(url: string): boolean {
  if (!url) return false;
  return /\{\{[^}]+\}\}/.test(url);
}

export const FACEBOOK_URL_MACROS = {
  campaign: { '{{campaign.id}}': 'Campaign ID', '{{campaign.name}}': 'Campaign Name' },
  adset: { '{{adset.id}}': 'Ad Set ID', '{{adset.name}}': 'Ad Set Name' },
  ad: { '{{ad.id}}': 'Ad ID', '{{ad.name}}': 'Ad Name' },
  placement: { '{{placement}}': 'Placement', '{{site_source_name}}': 'Site Source Name' },
};

// ============================================================================
// TARGETING MAPPINGS (for reference/lookup)
// ============================================================================

export const TARGETING_MAPPINGS = {
  genders: { men: [1], women: [2] },
  languageCodes: {
    romanian: 'ro', english: 'en', german: 'de', french: 'fr',
    spanish: 'es', italian: 'it', portuguese: 'pt', polish: 'pl',
  },
  billing: { billingEvent: 'IMPRESSIONS', bidAmount: 50 },
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

export function buildSystemPrompt(
  accountId: string,
  materialsInfo: string,
  materialAssignments?: Record<string, any>
): string {
  const prompt = `You are an expert Facebook Ads manager with access to Facebook Marketing API tools.

## COMMAND TYPES

### 1. CAMPAIGN CREATION (when user wants to create new campaigns)
- **WORKFLOW**: Always create all 3: campaign → adset → ad. A campaign alone is incomplete.
- **URLs**: NEVER make up image/video URLs. Only use EXACT URLs from the materials list below.

### 2. CAMPAIGN MANAGEMENT (when user wants to manage existing campaigns)

**Pause campaigns with low performance:**
- Use get_campaigns to fetch all campaigns with their CTR metrics
- For each campaign with CTR below threshold, use update_campaign with status="PAUSED"
- Example: "Pause all campaigns with CTR below 1%" → get_campaigns, then update_campaign for each low CTR campaign

**Activate/Resume campaigns:**
- Use get_campaigns to find campaigns (can filter by status: ["PAUSED"])
- Use update_campaign with status="ACTIVE" for each campaign to activate
- Example: "Activate all campaigns" → get_campaigns, then update_campaign with status="ACTIVE" for each

**Duplicate campaign (by name):**
- Use get_campaigns to find the source campaign by name
- Use create_campaign with same settings but new name (append "- Copy" or requested suffix)
- Create adset with same/modified targeting
- Create ad with same creative
- Example: "Duplicate Leads Campaign for German Women" → find campaign, create new campaign with German women targeting

**Change budget for a campaign:**
- Use get_campaigns to find the campaign by name
- Use update_campaign with new dailyBudget value (in CENTS! $50 = 5000 cents)
- Example: "Change budget for Leads Campaign to $50" → find campaign, update with dailyBudget=5000

## TARGETING

- **Country** (geoLocations.countries): Use 2-letter country codes. "Romanian men" → countries: ["RO"]
- **Language** (locales): Use 2-letter language codes as STRINGS. "Romanian language" → locales: ["ro"]
  ⚠️ CRITICAL: locales must be STRING codes like "ro", NOT numeric IDs!
- Language is INDEPENDENT of country! "Romanian language in Germany" → countries: ["DE"], locales: ["ro"]
- **Gender**: Men = [1], Women = [2]
- **Interests**: Include when user specifies (e.g., "interested in fashion" → interests: ["Fashion"])

LANGUAGE CODES (use these exact string values):
- Romanian = "ro", English = "en", German = "de", French = "fr"
- Spanish = "es", Italian = "it", Portuguese = "pt", Polish = "pl", Russian = "ru"

COUNTRY CODES:
- Germany = "DE", Romania = "RO", USA = "US", UK = "GB", France = "FR"
- Italy = "IT", Spain = "ES", Poland = "PL", Austria = "AT", Switzerland = "CH"

⚠️ DO NOT use numeric locale IDs like 6, 24, etc. Always use the 2-letter string codes above!

## EXAMPLE WORKFLOWS

### Creating a new campaign:
For "Create leads campaign for Romanian men on Romanian language, aged 20-45, $15 daily budget":
1. create_campaign: accountId="${accountId}", objective="OUTCOME_LEADS", dailyBudget=1500
2. create_adset: targeting={ geoLocations: { countries: ["RO"] }, locales: ["ro"], ageMin: 20, ageMax: 45, genders: [1] }
3. create_ad: Use imageUrl/videoUrl from materials list

### Pausing low CTR campaigns:
For "Pause all campaigns with CTR below 1%":
1. get_campaigns: accountId="${accountId}" → returns campaigns with CTR metrics
2. For each campaign where ctr < 1.0: update_campaign: campaignId=X, status="PAUSED"

### Activating all campaigns:
For "Activate all campaigns":
1. get_campaigns: accountId="${accountId}"
2. For each campaign: update_campaign: campaignId=X, status="ACTIVE"

### Duplicating a campaign:
For "Duplicate Leads Campaign for German Women":
1. get_campaigns: accountId="${accountId}" → find campaign named "Leads Campaign"
2. create_campaign: name="Leads Campaign - German Women", same objective/budget
3. create_adset: targeting with countries: ["DE"], genders: [2] (women)
4. create_ad: same creative settings

### Changing campaign budget:
For "Change budget for Leads Campaign to $50":
1. get_campaigns: accountId="${accountId}" → find campaign by name
2. update_campaign: campaignId=X, dailyBudget=5000 (always in CENTS!)

IMPORTANT: Budget values are in CENTS, not dollars!
- $10 = 1000 cents
- $25 = 2500 cents  
- $50 = 5000 cents
- $100 = 10000 cents

${materialsInfo}`;

  // Add material assignments if present
  if (materialAssignments && Object.keys(materialAssignments).length > 0) {
    const assignments = Object.entries(materialAssignments)
      .map(([key, assignment]: [string, any]) => `- ${key}: ${assignment.filename} (${assignment.url})`)
      .join('\n');
    return prompt + `\n\n## MATERIAL ASSIGNMENTS\n${assignments}`;
  }

  return prompt;
}
