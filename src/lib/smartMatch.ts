/**
 * Smart Matching – multi-signal lead-to-sale suggestion engine.
 *
 * Scoring (0-100):
 *   acronym_overlap               +60
 *   strong_token_overlap           +10 each (cap +30)
 *   domain_match (corporate, requires strong overlap) +25
 *   time_proximity                 0-15
 *   Cap at 100
 *
 * Requires at least ONE strong token overlap to surface a suggestion.
 */

// ── Stopwords & junk ────────────────────────────────────
const STOPWORDS = new Set([
  "marquee", "marquees", "letter", "letters", "sign", "signs",
  "light", "lights", "custom", "with", "and", "the", "for",
  "from", "size", "inch", "inches", "feet", "indoor", "outdoor",
  "that", "this", "have", "has", "are", "was", "were", "been",
  "will", "would", "could", "should", "may", "can", "not",
  "but", "all", "any", "each", "every", "some", "our", "your",
  "their", "its", "you", "she", "his", "her", "him", "who",
  "what", "how", "when", "where", "which", "why", "also",
  "just", "about", "more", "very", "much", "only",
]);

const TLD_JUNK = new Set(["com", "net", "org", "edu", "gov", "io", "co"]);

// ── Free-email domains ─────────────────────────────────
const FREE_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "live.com", "msn.com", "comcast.net", "me.com", "inbox.com",
]);

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : null;
}

function isCorporateDomain(domain: string | null): boolean {
  return !!domain && !FREE_DOMAINS.has(domain);
}

// ── Tokenisation ────────────────────────────────────────
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !TLD_JUNK.has(t))
  );
}

/** Extract all-caps acronyms (2+ chars) from product_name */
function extractAcronyms(productName: string | null | undefined): Set<string> {
  if (!productName) return new Set();
  const matches = productName.match(/\b[A-Z]{2,}\b/g);
  return matches ? new Set(matches.map((m) => m.toLowerCase())) : new Set();
}

function isStrongToken(t: string): boolean {
  if (t.length >= 4 && !STOPWORDS.has(t) && !TLD_JUNK.has(t)) return true;
  if (/\d/.test(t)) return true; // contains a digit
  return false;
}

// ── Phrase fallback from raw_payload ────────────────────
const PHRASE_KEYS = [
  "Phrase", "phrase", "What are you looking for", "Message",
  "Notes", "Anything else", "Project description", "Tell us about",
  "Description", "description", "message", "notes",
];

function extractFallbackPhrase(rawPayload: any): string {
  if (!rawPayload || typeof rawPayload !== "object") return "";
  for (const key of PHRASE_KEYS) {
    const val = rawPayload[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
  }
  return "";
}

// ── Text builders ───────────────────────────────────────
function buildLeadText(lead: any): string {
  const fallbackPhrase =
    !lead.phrase ? extractFallbackPhrase(lead.raw_payload) : "";
  return [
    fallbackPhrase, // front-loaded
    lead.name,
    lead.email ? lead.email.split("@")[0] : "", // user part only
    lead.phone,
    lead.phrase,
    lead.sign_style,
    lead.size_text,
    lead.budget_text,
    lead.notes,
    lead.raw_payload ? JSON.stringify(lead.raw_payload) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildSaleText(sale: any): string {
  return [
    sale.product_name,
    sale.email ? sale.email.split("@")[0] : "", // user part only
    sale.order_id,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── Scoring helpers ─────────────────────────────────────
function strongTokenOverlap(
  saleTokens: Set<string>,
  leadTokens: Set<string>,
  acronyms: Set<string>
): { score: number; overlapping: string[]; acronymHit: boolean; hasStrong: boolean } {
  const overlapping: string[] = [];
  let acronymHit = false;

  saleTokens.forEach((t) => {
    if (leadTokens.has(t) && isStrongToken(t)) {
      overlapping.push(t);
      if (acronyms.has(t)) acronymHit = true;
    }
  });
  // Also check acronyms in lead tokens directly
  acronyms.forEach((a) => {
    if (leadTokens.has(a) && !overlapping.includes(a)) {
      overlapping.push(a);
      acronymHit = true;
    }
  });

  if (overlapping.length === 0) {
    return { score: 0, overlapping, acronymHit: false, hasStrong: false };
  }

  let score = 0;
  if (acronymHit) score += 60;
  // additional strong tokens beyond the acronym
  const additionalCount = acronymHit ? overlapping.length - 1 : overlapping.length;
  score += Math.min(30, additionalCount * 10);
  if (!acronymHit) {
    // no acronym, but has strong tokens — base from token count
    score = Math.min(30, overlapping.length * 10);
  }

  return { score, overlapping, acronymHit, hasStrong: true };
}

function timeProximityScore(leadDate: Date, saleDate: Date): { score: number; daysBefore: number } {
  const daysBefore = Math.round((saleDate.getTime() - leadDate.getTime()) / 86_400_000);
  let score = 0;
  if (daysBefore <= 7) score = 15;
  else if (daysBefore <= 30) score = 10;
  else if (daysBefore <= 90) score = 5;
  return { score, daysBefore };
}

// ── Public types ────────────────────────────────────────
export interface SmartSuggestion {
  lead: any;
  score: number;
  reasons: string[];
}

// ── Main function ───────────────────────────────────────
export function getSmartSuggestions(
  sale: any,
  candidateLeads: any[],
  maxResults = 3
): SmartSuggestion[] {
  if (!candidateLeads || candidateLeads.length === 0) return [];

  const saleDate = sale.date ? new Date(sale.date) : null;
  if (!saleDate || isNaN(saleDate.getTime())) return [];

  const saleDomain = emailDomain(sale.email);
  const isCorporate = isCorporateDomain(saleDomain);

  // ── 1. Candidate narrowing: 180 days before sale ─────
  const windowStart = new Date(saleDate);
  windowStart.setDate(windowStart.getDate() - 180);

  let candidates = candidateLeads.filter((l) => {
    if (!l.submitted_at) return false;
    const ld = new Date(l.submitted_at);
    return ld >= windowStart && ld <= saleDate;
  });

  if (isCorporate && saleDomain) {
    const sameDomain = candidates.filter((l) => emailDomain(l.email) === saleDomain);
    if (sameDomain.length > 0) {
      const others = candidates.filter((l) => emailDomain(l.email) !== saleDomain).slice(0, 50);
      candidates = [...sameDomain, ...others];
    }
  }

  candidates = candidates.slice(0, 200);

  // ── 2. Tokenise sale text & extract acronyms ────────
  const saleTokens = tokenize(buildSaleText(sale));
  const acronyms = extractAcronyms(sale.product_name);

  // ── 3. Score each candidate ─────────────────────────
  const scored: SmartSuggestion[] = [];

  for (const lead of candidates) {
    const reasons: string[] = [];
    let total = 0;

    const leadTokens = tokenize(buildLeadText(lead));
    const { score: tokenScore, overlapping, acronymHit, hasStrong } =
      strongTokenOverlap(saleTokens, leadTokens, acronyms);

    // GATE: require at least one strong token overlap
    if (!hasStrong) continue;

    total += tokenScore;
    if (acronymHit) {
      reasons.push(`Acronym match: ${overlapping.filter((t) => acronyms.has(t)).join(", ").toUpperCase()}`);
    }
    if (overlapping.length > 0) {
      reasons.push(`Strong keyword overlap: ${overlapping.join(", ")}`);
    }

    // Domain match — only if also has strong overlap
    const leadDomain = emailDomain(lead.email);
    if (isCorporate && saleDomain && leadDomain === saleDomain) {
      total += 25;
      reasons.push(`Same domain: ${saleDomain}`);
    }

    // Time proximity
    const leadDate = new Date(lead.submitted_at!);
    const { score: timeScore, daysBefore } = timeProximityScore(leadDate, saleDate);
    if (timeScore > 0) total += timeScore;
    reasons.push(`Lead ${daysBefore} day${daysBefore === 1 ? "" : "s"} before sale`);

    const finalScore = Math.min(100, total);
    if (finalScore >= 60) {
      scored.push({ lead, score: finalScore, reasons });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── Auto-apply check ────────────────────────────────────
export function shouldAutoApply(suggestion: SmartSuggestion, sale: any): boolean {
  if (suggestion.score < 95) return false;
  const sameEmail =
    sale.email && suggestion.lead.email &&
    sale.email.trim().toLowerCase() === suggestion.lead.email.trim().toLowerCase();
  if (sameEmail) return true;

  const saleDomain = emailDomain(sale.email);
  const leadDomain = emailDomain(suggestion.lead.email);
  if (isCorporateDomain(saleDomain) && saleDomain === leadDomain) {
    const saleTokens = tokenize(buildSaleText(sale));
    const leadTokens = tokenize(buildLeadText(suggestion.lead));
    const acronyms = extractAcronyms(sale.product_name);
    const { hasStrong } = strongTokenOverlap(saleTokens, leadTokens, acronyms);
    const leadDate = new Date(suggestion.lead.submitted_at!);
    const saleDate = new Date(sale.date);
    const daysBefore = Math.round((saleDate.getTime() - leadDate.getTime()) / 86_400_000);
    if (hasStrong && daysBefore <= 7) return true;
  }
  return false;
}
