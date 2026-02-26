/**
 * Deterministic targeting constraint parser.
 * Extracts language, gender, age, country, and interest constraints
 * from user prompts to enforce BEFORE AI tool execution.
 */

export interface TargetingConstraints {
  language?: string;
  localeNames?: string[];
  ageMin?: number;
  ageMax?: number;
  countries?: string[];
  gender?: 'all' | 'male' | 'female';
  interests?: string[];
}

const LANGUAGE_PATTERNS: Record<string, { pattern: RegExp }> = {
  romanian: { pattern: /\bromanian\s+language\b|\bin\s+romanian\b|\bon\s+romanian\b/i },
  english: { pattern: /\benglish\s+language\b|\bin\s+english\b|\bon\s+english\b/i },
  german: { pattern: /\bgerman\s+language\b|\bin\s+german\b|\bon\s+german\b/i },
  french: { pattern: /\bfrench\s+language\b|\bin\s+french\b|\bon\s+french\b/i },
  spanish: { pattern: /\bspanish\s+language\b|\bin\s+spanish\b|\bon\s+spanish\b/i },
  italian: { pattern: /\bitalian\s+language\b|\bin\s+italian\b|\bon\s+italian\b/i },
  dutch: { pattern: /\bdutch\s+language\b|\bin\s+dutch\b|\bon\s+dutch\b/i },
  polish: { pattern: /\bpolish\s+language\b|\bin\s+polish\b|\bon\s+polish\b/i },
  portuguese: { pattern: /\bportuguese\s+language\b|\bin\s+portuguese\b|\bon\s+portuguese\b/i },
  greek: { pattern: /\bgreek\s+language\b|\bin\s+greek\b|\bon\s+greek\b/i },
  hungarian: { pattern: /\bhungarian\s+language\b|\bin\s+hungarian\b|\bon\s+hungarian\b/i },
  czech: { pattern: /\bczech\s+language\b|\bin\s+czech\b|\bon\s+czech\b/i },
  turkish: { pattern: /\bturkish\s+language\b|\bin\s+turkish\b|\bon\s+turkish\b/i },
  russian: { pattern: /\brussian\s+language\b|\bin\s+russian\b|\bon\s+russian\b/i },
  arabic: { pattern: /\barabic\s+language\b|\bin\s+arabic\b|\bon\s+arabic\b/i },
  swedish: { pattern: /\bswedish\s+language\b|\bin\s+swedish\b|\bon\s+swedish\b/i },
  danish: { pattern: /\bdanish\s+language\b|\bin\s+danish\b|\bon\s+danish\b/i },
  finnish: { pattern: /\bfinnish\s+language\b|\bin\s+finnish\b|\bon\s+finnish\b/i },
  norwegian: { pattern: /\bnorwegian\s+language\b|\bin\s+norwegian\b|\bon\s+norwegian\b/i },
  bulgarian: { pattern: /\bbulgarian\s+language\b|\bin\s+bulgarian\b|\bon\s+bulgarian\b/i },
  croatian: { pattern: /\bcroatian\s+language\b|\bin\s+croatian\b|\bon\s+croatian\b/i },
  slovak: { pattern: /\bslovak\s+language\b|\bin\s+slovak\b|\bon\s+slovak\b/i },
  slovenian: { pattern: /\bslovenian\s+language\b|\bin\s+slovenian\b|\bon\s+slovenian\b/i },
};

const COUNTRY_PATTERNS: Record<string, { code: string; pattern: RegExp }> = {
  romania: { code: 'RO', pattern: /\bromanians?\b|\bromania\b/i },
  germany: { code: 'DE', pattern: /\bgermans?\b|\bgermany\b/i },
  france: { code: 'FR', pattern: /\bfrench\s+(?:people|users|audience)\b|\bfrance\b/i },
  spain: { code: 'ES', pattern: /\bspaniards?\b|\bspain\b|\bspanish\s+(?:people|users|audience)\b/i },
  italy: { code: 'IT', pattern: /\bitalians?\b|\bitaly\b/i },
  netherlands: { code: 'NL', pattern: /\bdutch\s+(?:people|users|audience)\b|\bnetherlands\b|\bholland\b/i },
  poland: { code: 'PL', pattern: /\bpoles?\b|\bpolish\s+(?:people|users|audience)\b|\bpoland\b/i },
  portugal: { code: 'PT', pattern: /\bportuguese\s+(?:people|users|audience)\b|\bportugal\b/i },
  greece: { code: 'GR', pattern: /\bgreeks?\b|\bgreece\b/i },
  hungary: { code: 'HU', pattern: /\bhungarians?\b|\bhungary\b/i },
  czechia: { code: 'CZ', pattern: /\bczechs?\b|\bczechia\b|\bczech\s+republic\b/i },
  turkey: { code: 'TR', pattern: /\bturks?\b|\bturkish\s+(?:people|users|audience)\b|\bturkey\b/i },
  us: { code: 'US', pattern: /\bamericans?\b|\bunited\s+states\b|\b(?:us|usa)\s+(?:users?|audience|people)\b|\bus\b/i },
  uk: { code: 'GB', pattern: /\bbritish\b|\bunited\s+kingdom\b|\b(?:uk)\s+(?:users?|audience|people)\b|\buk\b/i },
  bulgaria: { code: 'BG', pattern: /\bbulgarians?\b|\bbulgaria\b/i },
  croatia: { code: 'HR', pattern: /\bcroatians?\b|\bcroatia\b/i },
  slovakia: { code: 'SK', pattern: /\bslovaks?\b|\bslovakia\b/i },
  slovenia: { code: 'SI', pattern: /\bslovenians?\b|\bslovenia\b/i },
  sweden: { code: 'SE', pattern: /\bswedes?\b|\bsweden\b|\bswedish\s+(?:people|users|audience)\b/i },
  denmark: { code: 'DK', pattern: /\bdanes?\b|\bdenmark\b|\bdanish\s+(?:people|users|audience)\b/i },
  finland: { code: 'FI', pattern: /\bfinns?\b|\bfinland\b|\bfinnish\s+(?:people|users|audience)\b/i },
  norway: { code: 'NO', pattern: /\bnorwegians?\b|\bnorway\b/i },
  austria: { code: 'AT', pattern: /\baustrians?\b|\baustria\b/i },
  belgium: { code: 'BE', pattern: /\bbelgians?\b|\bbelgium\b/i },
  ireland: { code: 'IE', pattern: /\birish\b|\bireland\b/i },
};

// Gender must only match explicit mentions, never nationality words
const GENDER_MALE_PATTERN = /\b(?:men|males?|male\s+audience)\b/i;
const GENDER_FEMALE_PATTERN = /\b(?:women|females?|female\s+audience)\b/i;

// Age patterns: "aged 25-45", "25 to 45", "age 25-45", "ages 25 to 45", "between 25 and 45"
const AGE_PATTERNS = [
  /\baged?\s+(\d{1,2})\s*[-–to]+\s*(\d{1,2})\b/i,
  /\bages?\s+(\d{1,2})\s*[-–to]+\s*(\d{1,2})\b/i,
  /\bbetween\s+(\d{1,2})\s+and\s+(\d{1,2})\b/i,
  /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?\s*old|y\.?o\.?)\b/i,
];

// Interest patterns: "interested in X", "interests: X, Y"
const INTEREST_PATTERN = /\binterested\s+in\s+([^,]+?)(?:\s+with\b|\s+aged?\b|\s+for\b|\s*$)/i;

export function parseTargetingConstraints(command: string): TargetingConstraints {
  const constraints: TargetingConstraints = {};

  for (const [langName, { pattern }] of Object.entries(LANGUAGE_PATTERNS)) {
    if (pattern.test(command)) {
      constraints.language = langName;
      constraints.localeNames = [langName];
      break;
    }
  }

  // 2. Country detection
  const countries: string[] = [];
  for (const [, { code, pattern }] of Object.entries(COUNTRY_PATTERNS)) {
    if (pattern.test(command) && !countries.includes(code)) {
      countries.push(code);
    }
  }
  if (countries.length > 0) {
    constraints.countries = countries;
  }

  // 3. Gender detection - ONLY explicit mentions
  const hasMale = GENDER_MALE_PATTERN.test(command);
  const hasFemale = GENDER_FEMALE_PATTERN.test(command);
  if (hasMale && hasFemale) {
    constraints.gender = 'all';
  } else if (hasMale) {
    constraints.gender = 'male';
  } else if (hasFemale) {
    constraints.gender = 'female';
  }
  // If neither is mentioned, gender stays undefined (= all genders, no constraint)

  // 4. Age range detection
  for (const pattern of AGE_PATTERNS) {
    const match = command.match(pattern);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);
      if (min >= 13 && min <= 65 && max >= 13 && max <= 65 && min <= max) {
        constraints.ageMin = min;
        constraints.ageMax = max;
      }
      break;
    }
  }

  // 5. Interest detection
  const interestMatch = command.match(INTEREST_PATTERN);
  if (interestMatch) {
    const raw = interestMatch[1].trim();
    const interests = raw
      .split(/\s*(?:,|and)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (interests.length > 0) {
      constraints.interests = interests;
    }
  }

  return constraints;
}

/**
 * Enforce parsed constraints onto AI-generated tool arguments.
 * Returns a list of fixes applied.
 */
export function enforceTargetingConstraints(
  toolArgs: Record<string, any>,
  constraints: TargetingConstraints
): string[] {
  const fixes: string[] = [];
  if (!toolArgs.targeting) toolArgs.targeting = {};
  const targeting = toolArgs.targeting;

  if (constraints.localeNames && constraints.localeNames.length > 0) {
    const currentLocales = targeting.locales;
    const alreadyHasLanguage =
      Array.isArray(currentLocales) &&
      currentLocales.length > 0 &&
      constraints.localeNames.every((name: string) =>
        currentLocales.some((l: unknown) =>
          typeof l === 'string' ? l.toLowerCase() === name.toLowerCase() : false
        )
      );
    if (!alreadyHasLanguage) {
      targeting.locales = constraints.localeNames;
      fixes.push(
        `Enforced ${constraints.language} language targeting (will be resolved by Meta API).`
      );
    }
  }

  // Enforce gender
  if (constraints.gender !== undefined) {
    const genderMap: Record<string, number[]> = {
      male: [1],
      female: [2],
      all: [1, 2],
    };
    const expected = genderMap[constraints.gender];
    const current = targeting.genders;
    const currentSorted = Array.isArray(current) ? [...current].sort() : [];
    const expectedSorted = [...expected].sort();
    if (JSON.stringify(currentSorted) !== JSON.stringify(expectedSorted)) {
      targeting.genders = expected;
      fixes.push(`Enforced gender targeting: ${constraints.gender}.`);
    }
  } else {
    // No explicit gender in prompt -> ensure AI didn't hallucinate a gender restriction
    if (
      Array.isArray(targeting.genders) &&
      targeting.genders.length === 1
    ) {
      delete targeting.genders;
      fixes.push('Removed AI-hallucinated gender restriction (user did not specify gender).');
    }
  }

  // Enforce countries
  if (constraints.countries && constraints.countries.length > 0) {
    if (!targeting.geoLocations) targeting.geoLocations = {};
    const current = targeting.geoLocations.countries;
    if (
      !Array.isArray(current) ||
      !constraints.countries.every((c: string) => current.includes(c))
    ) {
      targeting.geoLocations.countries = constraints.countries;
      fixes.push(`Enforced country targeting: [${constraints.countries.join(', ')}].`);
    }
  }

  // Enforce age range
  if (constraints.ageMin !== undefined) {
    if (targeting.ageMin !== constraints.ageMin) {
      targeting.ageMin = constraints.ageMin;
      fixes.push(`Enforced minimum age: ${constraints.ageMin}.`);
    }
  }
  if (constraints.ageMax !== undefined) {
    if (targeting.ageMax !== constraints.ageMax) {
      targeting.ageMax = constraints.ageMax;
      fixes.push(`Enforced maximum age: ${constraints.ageMax}.`);
    }
  }

  return fixes;
}
