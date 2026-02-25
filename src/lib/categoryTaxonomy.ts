/**
 * Category Taxonomy
 * Two-level hierarchy: parent category → subcategories
 * Dashboard cost rollups are driven by parent category only.
 *
 * NOTE: txn_category='transfer' is NOT an expense and must be excluded from expense totals.
 */

export const COGS_PARENT_CATS = ["cogs", "shipping_cogs", "merchant_fees", "packaging"] as const;
export const ADS_PARENT_CATS = ["advertising_media"] as const;
export const OVERHEAD_PARENT_CATS = [
  "software", "subscriptions", "contractor_payments", "office_expense",
  "rent", "utilities", "insurance", "equipment", "creative_services",
  "seo", "advertising_tools", "education", "taxes", "bank_fees", "interest",
] as const;

export const BUSINESS_CATEGORIES: Record<string, string[]> = {
  cogs: ["manufacturing", "overseas_supplier", "domestic_supplier", "raw_materials", "custom_parts"],
  shipping_cogs: ["freight_international", "freight_domestic", "ltl_shipping", "parcel_shipping"],
  merchant_fees: ["shopify_payments", "stripe", "paypal", "other"],
  packaging: ["boxes", "foam", "tape", "labels", "misc"],
  advertising_media: ["google_ads", "meta_ads", "bing_ads", "other"],
  advertising_tools: ["klaviyo", "email_platform", "sms_platform", "crm", "other"],
  creative_services: ["graphic_design", "video_production", "photography", "other"],
  seo: ["seo_tools", "backlink_services", "content_tools", "other"],
  software: ["shopify_subscription", "app_subscription", "saas_tools", "other"],
  subscriptions: ["online_services", "memberships", "other"],
  contractor_payments: ["freelance_labor", "consulting", "accounting", "other"],
  office_expense: ["supplies", "furniture", "other"],
  rent: ["warehouse", "office_space", "storage_unit"],
  utilities: ["electricity", "internet", "phone", "other"],
  insurance: ["business_liability", "property", "vehicle", "other"],
  equipment: ["tools", "machinery", "computers", "other"],
  travel: ["airfare", "lodging", "fuel", "meals", "mileage"],
  education: ["courses", "conferences", "books", "other"],
  taxes: ["sales_tax", "income_tax", "payroll_tax", "other"],
  bank_fees: ["monthly_fee", "overdraft", "wire_fee", "other"],
  interest: ["credit_card_interest", "loan_interest", "other"],
  other_income: ["cashback_rewards", "rebates", "interest_income", "refunds_received"],
  transfer: ["credit_card_payment", "owner_transfer", "internal_transfer", "loan_repayment", "platform_payout", "owner_contribution"],
  revenue: [],
};

export const PERSONAL_CATEGORIES: Record<string, string[]> = {
  owner_draw: ["personal_spending", "personal_transfer"],
  mortgage: ["home_mortgage", "property_tax"],
  groceries: ["supermarket", "convenience_store"],
  auto: ["fuel", "maintenance", "insurance", "registration"],
  family: ["childcare", "school", "activities", "clothing"],
  personal_misc: ["dining", "entertainment", "shopping", "subscriptions"],
};

/** Get parent categories for a given txn_type */
export function getParentCategories(txnType: string | null): string[] {
  if (txnType === "personal") return Object.keys(PERSONAL_CATEGORIES);
  if (txnType === "business") return Object.keys(BUSINESS_CATEGORIES);
  // If no type selected, show all
  return [...Object.keys(BUSINESS_CATEGORIES), ...Object.keys(PERSONAL_CATEGORIES)];
}

/** Get subcategories for a parent category */
export function getSubcategories(parentCategory: string): string[] {
  return BUSINESS_CATEGORIES[parentCategory] ?? PERSONAL_CATEGORIES[parentCategory] ?? [];
}

/** All parent categories combined */
export function getAllParentCategories(): string[] {
  return [...Object.keys(BUSINESS_CATEGORIES), ...Object.keys(PERSONAL_CATEGORIES)];
}

/** Human-readable label for a category key */
export function categoryLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
