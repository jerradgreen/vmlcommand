/**
 * Smart Matching – multi-signal lead-to-sale suggestion engine.
 *
 * Scoring (0-100):
 *   domain_match (corporate only)   +55
 *   keyword_overlap                 0-25
 *   time_proximity                  0-15
 *   name / company similarity       0-10
 *   Cap at 100
 */

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
      .filter((t) => t.length >= 3)
  );
}

function buildLeadText(lead: any): string {
  return [
    lead.name,
    lead.email,
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
  return [sale.product_name, sale.email, sale.order_id].filter(Boolean).join(" ");
}

// ── Scoring helpers ─────────────────────────────────────
function keywordOverlapScore(saleTokens: Set<string>, leadTokens: Set<string>): { score: number; overlapping: string[] } {
  const overlapping: string[] = [];
  saleTokens.forEach((t) => {
    if (leadTokens.has(t)) overlapping.push(t);
  });
  if (saleTokens.size === 0) return { score: 0, overlapping };
  const ratio = overlapping.length / saleTokens.size;
  return { score: Math.round(ratio * 25), overlapping };
}

function timeProximityScore(leadDate: Date, saleDate: Date): { score: number; daysBefore: number } {
  const daysBefore = Math.round((saleDate.getTime() - leadDate.getTime()) / 86_400_000);
  let score = 0;
  if (daysBefore <= 7) score = 15;
  else if (daysBefore <= 30) score = 10;
  else if (daysBefore <= 90) score = 5;
  return { score, daysBefore };
}

function nameSimilarityScore(sale: any, lead: any): { score: number; reason: string | null } {
  if (!lead.name) return { score: 0, reason: null };
  const leadNameLower = lead.name.toLowerCase();
  const saleText = buildSaleText(sale).toLowerCase();

  // Check if any part of lead name (>=3 chars) appears in sale text
  const parts = leadNameLower.split(/\s+/).filter((p: string) => p.length >= 3);
  const matches = parts.filter((p: string) => saleText.includes(p));
  if (matches.length > 0) {
    return { score: Math.min(10, matches.length * 5), reason: `Name match: ${matches.join(", ")}` };
  }
  return { score: 0, reason: null };
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
  maxResults = 5
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

  // Prioritise same corporate domain
  if (isCorporate && saleDomain) {
    const sameDomain = candidates.filter((l) => emailDomain(l.email) === saleDomain);
    if (sameDomain.length > 0) {
      // Keep domain matches + a few others for diversity
      const others = candidates.filter((l) => emailDomain(l.email) !== saleDomain).slice(0, 50);
      candidates = [...sameDomain, ...others];
    }
  }

  candidates = candidates.slice(0, 200);

  // ── 2. Tokenise sale text once ───────────────────────
  const saleTokens = tokenize(buildSaleText(sale));

  // ── 3. Score each candidate ──────────────────────────
  const scored: SmartSuggestion[] = candidates.map((lead) => {
    const reasons: string[] = [];
    let total = 0;

    // Domain match (corporate only)
    const leadDomain = emailDomain(lead.email);
    if (isCorporate && saleDomain && leadDomain === saleDomain) {
      total += 55;
      reasons.push(`Same domain: ${saleDomain}`);
    }

    // Keyword overlap
    const leadTokens = tokenize(buildLeadText(lead));
    const { score: kwScore, overlapping } = keywordOverlapScore(saleTokens, leadTokens);
    if (kwScore > 0) {
      total += kwScore;
      reasons.push(`Keyword overlap: ${overlapping.join(", ")}`);
    }

    // Time proximity
    const leadDate = new Date(lead.submitted_at!);
    const { score: timeScore, daysBefore } = timeProximityScore(leadDate, saleDate);
    if (timeScore > 0) {
      total += timeScore;
    }
    reasons.push(`Lead ${daysBefore} day${daysBefore === 1 ? "" : "s"} before sale`);

    // Name/company similarity
    const { score: nameScore, reason: nameReason } = nameSimilarityScore(sale, lead);
    if (nameScore > 0 && nameReason) {
      total += nameScore;
      reasons.push(nameReason);
    }

    return { lead, score: Math.min(100, total), reasons };
  });

  return scored
    .filter((s) => s.score > 0)
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
    const { score: kwScore } = keywordOverlapScore(saleTokens, leadTokens);
    const leadDate = new Date(suggestion.lead.submitted_at!);
    const saleDate = new Date(sale.date);
    const daysBefore = Math.round((saleDate.getTime() - leadDate.getTime()) / 86_400_000);
    if (kwScore >= 10 && daysBefore <= 7) return true;
  }
  return false;
}
