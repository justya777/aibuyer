/**
 * Facebook Ads Campaign Configuration
 * Structured rules, targeting mappings, and prompt templates for AI agent
 */

// ============================================================================
// URL PARSING UTILITIES
// ============================================================================

/**
 * Parse a tracking URL into base URL and URL parameters
 * Example input: https://domain.com/hb6YLST7?utm_campaign={{campaign.name}}&pixel=test
 * Returns: { websiteUrl: "https://domain.com/hb6YLST7", urlParameters: "utm_campaign={{campaign.name}}&pixel=test" }
 */
export function parseTrackingUrl(fullUrl: string): { websiteUrl: string; urlParameters: string } {
  if (!fullUrl || typeof fullUrl !== 'string') {
    return { websiteUrl: '', urlParameters: '' };
  }

  // Trim whitespace
  const trimmedUrl = fullUrl.trim();
  
  // Find the query string separator
  const queryIndex = trimmedUrl.indexOf('?');
  
  if (queryIndex === -1) {
    // No query string, entire URL is the website URL
    return { websiteUrl: trimmedUrl, urlParameters: '' };
  }
  
  // Split into base URL and query parameters
  const websiteUrl = trimmedUrl.substring(0, queryIndex);
  const urlParameters = trimmedUrl.substring(queryIndex + 1);
  
  return { websiteUrl, urlParameters };
}

/**
 * Combine website URL and URL parameters back into a full URL
 */
export function combineTrackingUrl(websiteUrl: string, urlParameters: string): string {
  if (!websiteUrl) return '';
  if (!urlParameters) return websiteUrl;
  
  // Ensure no double question marks
  const cleanWebsiteUrl = websiteUrl.replace(/\?$/, '');
  const cleanParams = urlParameters.replace(/^\?/, '');
  
  return `${cleanWebsiteUrl}?${cleanParams}`;
}

/**
 * Check if a URL contains Facebook dynamic macros
 * Macros like {{campaign.name}}, {{ad.id}}, etc.
 */
export function containsFacebookMacros(url: string): boolean {
  if (!url) return false;
  return /\{\{[^}]+\}\}/.test(url);
}

/**
 * List of common Facebook dynamic URL macros
 */
export const FACEBOOK_URL_MACROS = {
  campaign: {
    '{{campaign.id}}': 'Campaign ID',
    '{{campaign.name}}': 'Campaign Name',
  },
  adset: {
    '{{adset.id}}': 'Ad Set ID',
    '{{adset.name}}': 'Ad Set Name',
  },
  ad: {
    '{{ad.id}}': 'Ad ID',
    '{{ad.name}}': 'Ad Name',
  },
  placement: {
    '{{placement}}': 'Placement',
    '{{site_source_name}}': 'Site Source Name',
  },
};

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const VALIDATION_RULES = {
  urls: {
    critical: true,
    message: `🚨 CRITICAL URL WARNING: 
- Facebook API REQUIRES valid URLs for images/videos
- NEVER make up URLs like "https://path/to/file.jpg" or "https://example.com/image.jpg"  
- ONLY use EXACT URLs provided in the materials list below
- Using fake URLs will cause Facebook API error: "(#100) picture should represent a valid URL"
- If no materials specified, omit imageUrl/videoUrl from creative`,
  },

  trackingUrls: {
    critical: false,
    message: `🔗 TRACKING URL HANDLING:
- When user provides a URL with tracking parameters (e.g., https://domain.com/page?utm_campaign={{campaign.name}}&pixel=test)
- The system will AUTOMATICALLY split it into:
  • linkUrl: Base URL (https://domain.com/page)
  • urlParameters: Query string (utm_campaign={{campaign.name}}&pixel=test)
- Facebook dynamic macros ({{campaign.name}}, {{ad.id}}, etc.) will be preserved
- You can pass the full URL as linkUrl - it will be parsed automatically`,
  },

  workflow: {
    critical: true,
    message: `🚨 CRITICAL: For ANY campaign creation request, you MUST execute ALL THREE steps:
1. create_campaign (to create the campaign)  
2. create_adset (to create an adset within that campaign) - Include locales for language targeting if user specifies a language!
3. create_ad (to create an actual ad within the adset)

A campaign without an adset AND ad is incomplete and won't work!`,
  },

  materials: {
    critical: true,
    message: `🎯 MATERIAL USAGE RULES:
- When materials are listed in "Auto-Select Mode", YOU MUST use them in your ads
- NEVER create ads without materials when materials are available in Auto-Select Mode
- Each ad MUST include either imageUrl (for images) or videoUrl (for videos) from the provided materials
- If multiple materials available, distribute them across different ads
- ALWAYS use the complete, exact URL from the materials list`,
  },
};

// ============================================================================
// TARGETING RULES & MAPPINGS
// ============================================================================

export const TARGETING_RULES = {
  principles: {
    nationality: "Nationality/Country = Geographic targeting (use countries parameter)",
    language: "Language = Use locales parameter with language codes (e.g., 'ro' for Romanian, 'en' for English)",
    independence: "⚠️ CRITICAL: Language and Country are INDEPENDENT! 'Romanian language' ALWAYS means locales: ['ro'], regardless of which countries are targeted!",
  },

  // Country targeting examples
  countryTargeting: [
    { input: "Romanian men", output: { countries: ["RO"] }, note: "Country targeting only" },
    { input: "German women", output: { countries: ["DE"] }, note: "Country targeting only" },
    { input: "French people", output: { countries: ["FR"] }, note: "Country targeting only" },
    { input: "Austria and Germany", output: { countries: ["AT", "DE"] }, note: "Multiple countries" },
    { input: "English speakers", output: { locales: ["en"] }, note: "Language only (any country)" },
  ],

  // Language targeting examples - use 2-letter language codes
  // ⚠️ IMPORTANT: Language is based on the LANGUAGE NAME, NOT the country!
  languageTargeting: [
    { input: "Romanian language", output: { locales: ["ro"] }, note: "ro = Romanian - ALWAYS 'ro' regardless of country!" },
    { input: "German language", output: { locales: ["de"] }, note: "de = German" },
    { input: "English language", output: { locales: ["en"] }, note: "en = English" },
    { input: "French language", output: { locales: ["fr"] }, note: "fr = French" },
    { input: "Spanish language", output: { locales: ["es"] }, note: "es = Spanish" },
    { input: "Italian language", output: { locales: ["it"] }, note: "it = Italian" },
  ],

  // Cross-country language targeting examples - language is INDEPENDENT of country!
  crossCountryLanguageExamples: [
    { input: "Romanian language for Germany and Austria", output: { countries: ["DE", "AT"], locales: ["ro"] }, note: "Romanian speakers in DE/AT" },
    { input: "English language in France", output: { countries: ["FR"], locales: ["en"] }, note: "English speakers in France" },
    { input: "Spanish language in USA", output: { countries: ["US"], locales: ["es"] }, note: "Spanish speakers in USA" },
  ],

  // NOTE: Language/locale targeting is NOW ENABLED
  // The system automatically looks up valid Facebook locale IDs via Targeting Search API

  // Quick reference mappings
  demographics: {
    genders: {
      men: [1],
      women: [2],
    },
  },

  interests: {
    fashion: ["Fashion"],
    investment: ["Investment", "Business and industry"],
  },

  billing: {
    default: {
      billingEvent: "IMPRESSIONS",
      bidAmount: 50,
    },
  },
};

// ============================================================================
// WORKFLOW TEMPLATES
// ============================================================================

export const WORKFLOW_TEMPLATES = {
  simple: {
    description: "Single campaign with one adset and ad",
    steps: [
      {
        step: 1,
        tool: "create_campaign",
        description: "ALWAYS call create_campaign first",
        example: (accountId: string) => `create_campaign({
  accountId: "${accountId}",
  name: "Romanian Fashion Leads Campaign", 
  objective: "OUTCOME_LEADS", 
  dailyBudget: 2500,
  status: "ACTIVE"
})`,
      },
      {
        step: 2,
        tool: "create_adset",
        description: "IMMEDIATELY after step 1 succeeds, call create_adset using the campaign ID from step 1",
        warning: "Replace the campaignId parameter with the ACTUAL ID returned from step 1. Do NOT use placeholder text.",
        example: (accountId: string) => `create_adset({
  accountId: "${accountId}",
  campaignId: "ACTUAL_CAMPAIGN_ID_FROM_STEP_1",
  name: "Romanian Women 18-35 Fashion AdSet",
  optimizationGoal: "LEAD_GENERATION",
  billingEvent: "IMPRESSIONS",
  bidAmount: 50,
  status: "ACTIVE",
  targeting: {
    geoLocations: { countries: ["RO"] },
    ageMin: 18, 
    ageMax: 35, 
    genders: [2],
    interests: ["Fashion"],
    locales: ["ro"] // Include if user specifies language (e.g., "Romanian language")
  }
})`,
      },
      {
        step: 3,
        tool: "create_ad",
        description: "IMMEDIATELY after step 2 succeeds, call create_ad using the adset ID from step 2",
        warning: "CRITICAL: If materials are available in Auto-Select Mode, you MUST include imageUrl or videoUrl from the materials list!",
        example: (accountId: string) => `create_ad({
  accountId: "${accountId}",
  adSetId: "ACTUAL_ADSET_ID_FROM_STEP_2",
  name: "Romanian Fashion Lead Ad",
  status: "ACTIVE",
  creative: {
    title: "Discover Fashion Investment Opportunities",
    body: "Join thousands of Romanian women investing in fashion. Start your journey today!",
    linkUrl: "https://example.com/fashion-investment",
    callToAction: "LEARN_MORE",
    imageUrl: "<USE_URL_FROM_MATERIALS_LIST>" // ⚠️ CRITICAL: Use EXACT URL from materials list - NEVER make up URLs! If materials available, you MUST use one!
  }
})`,
      },
    ],
  },

  complex: {
    description: "Multiple campaigns with multiple adsets each",
    example: "create 2 campaigns with 3 adsets each",
    steps: [
      "1. Create campaign 1",
      "2. Create 3 adsets for campaign 1 (each with 1 ad)",
      "3. Create campaign 2",
      "4. Create 3 adsets for campaign 2 (each with 1 ad)",
    ],
  },
};

// ============================================================================
// MATERIAL ASSIGNMENT RULES
// ============================================================================

export const MATERIAL_ASSIGNMENT = {
  rules: [
    {
      pattern: "use [filename] for first campaign",
      action: "Use [filename] URL in all ads for campaign 1",
      example: "use IMG_4941.mp4 for first campaign → Use IMG_4941.mp4 URL in all ads for campaign 1",
    },
    {
      pattern: "for adset [N] use [filename]",
      action: "Use [filename] URL specifically for adset N's ads",
      example: "for adset 1 use IMG_2333.mp4 → Use IMG_2333.mp4 URL specifically for adset 1's ads",
    },
  ],
  note: "Match filenames exactly as provided by user",
};

// ============================================================================
// PROMPT BUILDER FUNCTIONS
// ============================================================================

export function buildValidationSection(): string {
  return `${VALIDATION_RULES.urls.message}

${VALIDATION_RULES.workflow.message}

${VALIDATION_RULES.materials.message}`;
}

export function buildTargetingSection(): string {
  return `⚠️ TARGETING RULES:
- ${TARGETING_RULES.principles.nationality}
- ${TARGETING_RULES.principles.language}
- ${TARGETING_RULES.principles.independence}

🎯 GEOGRAPHIC TARGETING:
${TARGETING_RULES.countryTargeting.map(rule => 
  `- "${rule.input}" = ${JSON.stringify(rule.output)} ${rule.note ? `(${rule.note})` : ''}`
).join('\n')}

🌐 LANGUAGE TARGETING (use 2-letter language codes in locales array):
⚠️ CRITICAL: The language code is based on the LANGUAGE NAME, NOT the target country!
- "Romanian language" ALWAYS = locales: ["ro"] - even if targeting Germany, Austria, or any other country!
- "German language" ALWAYS = locales: ["de"]
- "English language" ALWAYS = locales: ["en"]
${TARGETING_RULES.languageTargeting.map(rule => 
  `- "${rule.input}" = ${JSON.stringify(rule.output)} ${rule.note ? `(${rule.note})` : ''}`
).join('\n')}

🔀 CROSS-COUNTRY LANGUAGE EXAMPLES (language is INDEPENDENT of country!):
${TARGETING_RULES.crossCountryLanguageExamples.map(rule => 
  `- "${rule.input}" = ${JSON.stringify(rule.output)} (${rule.note})`
).join('\n')}

✅ EXAMPLES:
- "Romanian men" = countries: ["RO"] (country only, no language)
- "Romanian men on Romanian language" = countries: ["RO"], locales: ["ro"] (country + language!)
- "Romanian language for Germany and Austria" = countries: ["DE", "AT"], locales: ["ro"] (Romanian speakers in DE/AT!)
- "German speakers" = locales: ["de"] (language only)
- "English speakers in US" = countries: ["US"], locales: ["en"] (country + language)`;
}

export function buildWorkflowSection(accountId: string): string {
  const simple = WORKFLOW_TEMPLATES.simple;
  
  return `MANDATORY WORKFLOW for "Create" commands:
When user says "Create a leads campaign for Romanian men on Romanian language aged 20-45 interested in fashion with $15 daily budget":

IMPORTANT: 
- "Romanian men" = nationality targeting = countries: ["RO"]
- "Romanian language" OR "on Romanian language" = language targeting = locales: ["ro"]
- If BOTH specified, use BOTH: countries: ["RO"], locales: ["ro"]

⚠️ CRITICAL - LANGUAGE IS INDEPENDENT OF COUNTRY:
- "Romanian language for Germany and Austria" = countries: ["DE", "AT"], locales: ["ro"]
- The language code comes from the LANGUAGE NAME ("Romanian" = "ro"), NOT from the target countries!
- NEVER assume language from country - if user says "Romanian language", use locales: ["ro"] regardless of which countries are targeted!

⚠️ CRITICAL - ALWAYS INCLUDE INTERESTS WHEN SPECIFIED:
- If user says "interested in investments" → MUST include interests: ["Investments"] in targeting
- If user says "interested in fashion" → MUST include interests: ["Fashion"] in targeting
- NEVER skip interests when user specifies them!

STEP 1: ${simple.steps[0].description}:
${simple.steps[0].example(accountId)}

STEP 2: ${simple.steps[1].description}:
IMPORTANT: ${simple.steps[1].warning}
IMPORTANT: locales MUST be inside the targeting object, not at the root level!

${simple.steps[1].example(accountId)}

STEP 3: ${simple.steps[2].description}:
IMPORTANT: ${simple.steps[2].warning}

${simple.steps[2].example(accountId)}

🎯 COMPLEX CAMPAIGNS:
For commands like "${WORKFLOW_TEMPLATES.complex.example}":
${WORKFLOW_TEMPLATES.complex.steps.map(step => step).join('\n')}`;
}

export function buildMaterialAssignmentSection(): string {
  return `MATERIAL ASSIGNMENT:
${MATERIAL_ASSIGNMENT.rules.map(rule => `- ${rule.example}`).join('\n')}

TARGETING MAPPING:
- "Romanian men" = countries: ["RO"] (country only)
- "Romanian men on Romanian language" = countries: ["RO"], locales: ["ro"] (country + language!)
- "Romanian language for Germany and Austria" = countries: ["DE", "AT"], locales: ["ro"] (Romanian speakers in DE/AT!)
- "German speakers" = locales: ["de"] (language only)
- "English speakers" = locales: ["en"] (language only)
- Men = genders: ${JSON.stringify(TARGETING_RULES.demographics.genders.men)}, Women = genders: ${JSON.stringify(TARGETING_RULES.demographics.genders.women)} 
- Fashion = interests: ${JSON.stringify(TARGETING_RULES.interests.fashion)}
- Investment/Investments = interests: ${JSON.stringify(TARGETING_RULES.interests.investment)}
- Always use billingEvent: "${TARGETING_RULES.billing.default.billingEvent}" and bidAmount: ${TARGETING_RULES.billing.default.bidAmount}

🌐 LANGUAGE CODES for locales parameter (based on LANGUAGE NAME, not country!):
ro=Romanian, en=English, de=German, fr=French, es=Spanish, it=Italian, pt=Portuguese, pl=Polish
⚠️ CRITICAL: "Romanian language" ALWAYS = locales: ["ro"], even when targeting Germany, Austria, or any other country!`;
}

export function buildReminder(): string {
  return "REMEMBER: You MUST create campaign, adset AND ad for every \"create campaign\" request!";
}

// ============================================================================
// MAIN SYSTEM PROMPT BUILDER
// ============================================================================

export function buildSystemPrompt(
  accountId: string,
  materialsInfo: string,
  materialAssignments?: Record<string, any>
): string {
  const sections = [
    "You are an expert Facebook Ads manager with access to Facebook Marketing API tools.",
    "",
    buildValidationSection(),
    "",
    buildTargetingSection(),
    "",
    buildWorkflowSection(accountId),
    "",
    buildMaterialAssignmentSection(),
    "",
    buildReminder(),
    materialsInfo,
  ];

  // Add material assignments if present
  if (materialAssignments && Object.keys(materialAssignments).length > 0) {
    sections.push(
      "",
      `🎯 SPECIFIC MATERIAL ASSIGNMENTS DETECTED:`,
      ...Object.entries(materialAssignments).map(
        ([key, assignment]: [string, any]) => 
          `- ${key}: Use ${assignment.filename} (${assignment.url})`
      ),
      "",
      "USE THESE EXACT URLs in the creative.imageUrl field for the specified campaigns/adsets!"
    );
  }

  return sections.join('\n');
}

