export interface FormColumnMapping {
  entry_number: string[];
  submitted_at: string[];
  name: string[];
  email: string[];
  phone: string[];
  phrase: string[];
  sign_style: string[];
  size_text: string[];
  budget_text: string[];
  status: string[];
  notes: string[];
}

export const FORM_COLUMN_MAPPINGS: Record<string, FormColumnMapping> = {
  general_quote: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name", "Your Name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: ["Phrase", "Text", "Custom Text", "Message", "Your Phrase"],
    sign_style: ["Sign Style", "Style", "sign_style", "Product", "Sign Type"],
    size_text: ["Size", "Dimensions", "size_text", "Sign Size"],
    budget_text: ["Budget", "budget_text", "Budget Range"],
    status: ["Status", "status"],
    notes: ["Notes", "notes", "Additional Notes", "Comments"],
  },
  event_style: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: ["Phrase", "Text", "Custom Text", "Message", "Event Text"],
    sign_style: ["Sign Style", "Style", "sign_style", "Event Type"],
    size_text: ["Size", "Dimensions", "size_text"],
    budget_text: ["Budget", "budget_text", "Budget Range"],
    status: ["Status", "status"],
    notes: ["Notes", "notes", "Additional Notes", "Event Details"],
  },
  wall_hanging: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: ["Phrase", "Text", "Custom Text", "Message"],
    sign_style: ["Sign Style", "Style", "sign_style", "Mount Type"],
    size_text: ["Size", "Dimensions", "size_text", "Wall Size"],
    budget_text: ["Budget", "budget_text"],
    status: ["Status", "status"],
    notes: ["Notes", "notes", "Additional Notes"],
  },
  layered_logo: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name", "Business Name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: ["Phrase", "Text", "Custom Text", "Logo Text"],
    sign_style: ["Sign Style", "Style", "sign_style", "Logo Style"],
    size_text: ["Size", "Dimensions", "size_text"],
    budget_text: ["Budget", "budget_text"],
    status: ["Status", "status"],
    notes: ["Notes", "notes", "Additional Notes"],
  },
  mobile_vendor: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name", "Business Name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: ["Phrase", "Text", "Custom Text", "Business Name Text"],
    sign_style: ["Sign Style", "Style", "sign_style"],
    size_text: ["Size", "Dimensions", "size_text"],
    budget_text: ["Budget", "budget_text"],
    status: ["Status", "status"],
    notes: ["Notes", "notes", "Additional Notes"],
  },
  rental_guide_download: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: [],
    sign_style: [],
    size_text: [],
    budget_text: [],
    status: ["Status", "status"],
    notes: ["Notes", "notes"],
  },
  not_sure: {
    entry_number: ["Entry Number", "entry_number", "EntryNumber", "#"],
    submitted_at: ["Date Submitted", "submitted_at", "Timestamp", "Date"],
    name: ["Name", "Full Name", "name"],
    email: ["Email", "Email Address", "email"],
    phone: ["Phone", "Phone Number", "phone"],
    phrase: ["Phrase", "Text", "Custom Text", "Message"],
    sign_style: ["Sign Style", "Style", "sign_style"],
    size_text: ["Size", "Dimensions", "size_text"],
    budget_text: ["Budget", "budget_text"],
    status: ["Status", "status"],
    notes: ["Notes", "notes", "Additional Notes"],
  },
};

export const COGNITO_FORMS = Object.keys(FORM_COLUMN_MAPPINGS);
