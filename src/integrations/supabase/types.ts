export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          account_name: string
          account_type: string
          balance: number
          external_account_id: string
          id: string
          institution: string | null
          source_system: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_type: string
          balance: number
          external_account_id: string
          id?: string
          institution?: string | null
          source_system?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_type?: string
          balance?: number
          external_account_id?: string
          id?: string
          institution?: string | null
          source_system?: string
          updated_at?: string
        }
        Relationships: []
      }
      account_type_overrides: {
        Row: {
          created_at: string
          external_account_id: string
          forced_account_type: string
          id: string
          note: string | null
          source_system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_account_id: string
          forced_account_type: string
          id?: string
          note?: string | null
          source_system?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_account_id?: string
          forced_account_type?: string
          id?: string
          note?: string | null
          source_system?: string
          updated_at?: string
        }
        Relationships: []
      }
      bills: {
        Row: {
          amount: number
          category: string
          date: string
          due_date: string | null
          external_id: string | null
          id: string
          ingested_at: string | null
          notes: string | null
          raw_payload: Json | null
          source_system: string
          status: string
          vendor: string
        }
        Insert: {
          amount: number
          category?: string
          date: string
          due_date?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          notes?: string | null
          raw_payload?: Json | null
          source_system?: string
          status?: string
          vendor: string
        }
        Update: {
          amount?: number
          category?: string
          date?: string
          due_date?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          notes?: string | null
          raw_payload?: Json | null
          source_system?: string
          status?: string
          vendor?: string
        }
        Relationships: []
      }
      cogs_allocations: {
        Row: {
          allocated_amount: number
          allocation_date: string
          financial_transaction_id: string
          id: string
          notes: string | null
          sale_id: string
          vendor_name: string | null
        }
        Insert: {
          allocated_amount: number
          allocation_date?: string
          financial_transaction_id: string
          id?: string
          notes?: string | null
          sale_id: string
          vendor_name?: string | null
        }
        Update: {
          allocated_amount?: number
          allocation_date?: string
          financial_transaction_id?: string
          id?: string
          notes?: string | null
          sale_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cogs_allocations_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      cogs_payments: {
        Row: {
          amount: number
          category: string
          date: string
          due_date: string | null
          external_id: string | null
          id: string
          ingested_at: string | null
          notes: string | null
          order_id: string | null
          raw_payload: Json | null
          sale_id: string | null
          source_system: string
          status: string
          vendor: string
        }
        Insert: {
          amount: number
          category?: string
          date: string
          due_date?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          notes?: string | null
          order_id?: string | null
          raw_payload?: Json | null
          sale_id?: string | null
          source_system?: string
          status?: string
          vendor?: string
        }
        Update: {
          amount?: number
          category?: string
          date?: string
          due_date?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          notes?: string | null
          order_id?: string | null
          raw_payload?: Json | null
          sale_id?: string | null
          source_system?: string
          status?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "cogs_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          date: string
          external_id: string | null
          id: string
          ingested_at: string | null
          notes: string | null
          platform: string
          raw_payload: Json | null
          source_system: string
        }
        Insert: {
          amount: number
          category?: string
          date: string
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          notes?: string | null
          platform: string
          raw_payload?: Json | null
          source_system?: string
        }
        Update: {
          amount?: number
          category?: string
          date?: string
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          notes?: string | null
          platform?: string
          raw_payload?: Json | null
          source_system?: string
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          account_id: string
          account_name: string | null
          balance: number | null
          currency: string | null
          id: string
          ingested_at: string | null
          institution: string | null
          last_update: string | null
          raw_payload: Json | null
          source_system: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          balance?: number | null
          currency?: string | null
          id?: string
          ingested_at?: string | null
          institution?: string | null
          last_update?: string | null
          raw_payload?: Json | null
          source_system?: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          balance?: number | null
          currency?: string | null
          id?: string
          ingested_at?: string | null
          institution?: string | null
          last_update?: string | null
          raw_payload?: Json | null
          source_system?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_name_norm: string | null
          amount: number
          category: string | null
          classified_at: string | null
          description: string | null
          description_norm: string | null
          external_id: string
          id: string
          ingested_at: string | null
          is_locked: boolean
          raw_payload: Json | null
          rule_id_applied: string | null
          source_system: string
          txn_category: string | null
          txn_date: string
          txn_subcategory: string | null
          txn_type: string | null
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          account_name_norm?: string | null
          amount: number
          category?: string | null
          classified_at?: string | null
          description?: string | null
          description_norm?: string | null
          external_id: string
          id?: string
          ingested_at?: string | null
          is_locked?: boolean
          raw_payload?: Json | null
          rule_id_applied?: string | null
          source_system?: string
          txn_category?: string | null
          txn_date: string
          txn_subcategory?: string | null
          txn_type?: string | null
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          account_name_norm?: string | null
          amount?: number
          category?: string | null
          classified_at?: string | null
          description?: string | null
          description_norm?: string | null
          external_id?: string
          id?: string
          ingested_at?: string | null
          is_locked?: boolean
          raw_payload?: Json | null
          rule_id_applied?: string | null
          source_system?: string
          txn_category?: string | null
          txn_date?: string
          txn_subcategory?: string | null
          txn_type?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_rule_id_applied_fkey"
            columns: ["rule_id_applied"]
            isOneToOne: false
            referencedRelation: "transaction_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_logs: {
        Row: {
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          source_system: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          source_system: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          source_system?: string
          status?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          budget_text: string | null
          cognito_entry_number: string
          cognito_form: string
          created_at: string
          email: string | null
          email_domain: string | null
          email_norm: string | null
          external_id: string | null
          id: string
          ingested_at: string | null
          lead_id: string
          match_text: string | null
          match_tokens: string[] | null
          name: string | null
          notes: string | null
          phone: string | null
          phrase: string | null
          raw_payload: Json | null
          sign_style: string | null
          size_text: string | null
          source_system: string
          status: string | null
          strong_tokens: string[] | null
          submitted_at: string | null
        }
        Insert: {
          budget_text?: string | null
          cognito_entry_number: string
          cognito_form: string
          created_at?: string
          email?: string | null
          email_domain?: string | null
          email_norm?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          lead_id: string
          match_text?: string | null
          match_tokens?: string[] | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          phrase?: string | null
          raw_payload?: Json | null
          sign_style?: string | null
          size_text?: string | null
          source_system?: string
          status?: string | null
          strong_tokens?: string[] | null
          submitted_at?: string | null
        }
        Update: {
          budget_text?: string | null
          cognito_entry_number?: string
          cognito_form?: string
          created_at?: string
          email?: string | null
          email_domain?: string | null
          email_norm?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          lead_id?: string
          match_text?: string | null
          match_tokens?: string[] | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          phrase?: string | null
          raw_payload?: Json | null
          sign_style?: string | null
          size_text?: string | null
          source_system?: string
          status?: string | null
          strong_tokens?: string[] | null
          submitted_at?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          date: string | null
          email: string | null
          email_domain: string | null
          email_norm: string | null
          estimated_cogs_pct: number
          external_id: string | null
          id: string
          ingested_at: string | null
          lead_id: string | null
          manufacturing_status: string
          match_confidence: number | null
          match_method: string | null
          match_reason: string | null
          match_text: string | null
          match_tokens: string[] | null
          order_id: string
          order_text: string | null
          product_name: string | null
          raw_payload: Json | null
          revenue: number | null
          sale_type: string
          source_system: string
          strong_tokens: string[] | null
          suggested_lead_id: string | null
          suggested_reasons: string[] | null
          suggested_score: number | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          email?: string | null
          email_domain?: string | null
          email_norm?: string | null
          estimated_cogs_pct?: number
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          lead_id?: string | null
          manufacturing_status?: string
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          match_text?: string | null
          match_tokens?: string[] | null
          order_id: string
          order_text?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          revenue?: number | null
          sale_type?: string
          source_system?: string
          strong_tokens?: string[] | null
          suggested_lead_id?: string | null
          suggested_reasons?: string[] | null
          suggested_score?: number | null
        }
        Update: {
          created_at?: string
          date?: string | null
          email?: string | null
          email_domain?: string | null
          email_norm?: string | null
          estimated_cogs_pct?: number
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          lead_id?: string | null
          manufacturing_status?: string
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          match_text?: string | null
          match_tokens?: string[] | null
          order_id?: string
          order_text?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          revenue?: number | null
          sale_type?: string
          source_system?: string
          strong_tokens?: string[] | null
          suggested_lead_id?: string | null
          suggested_reasons?: string[] | null
          suggested_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_suggested_lead_id_fkey"
            columns: ["suggested_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_capital_loans: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string | null
          payback_cap: number
          repayment_rate: number
          start_order_number_int: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          payback_cap: number
          repayment_rate: number
          start_order_number_int: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          payback_cap?: number
          repayment_rate?: number
          start_order_number_int?: number
        }
        Relationships: []
      }
      transaction_rules: {
        Row: {
          assign_category: string | null
          assign_subcategory: string | null
          assign_txn_type: string | null
          assign_vendor: string | null
          created_at: string
          id: string
          is_active: boolean
          match_field: string
          match_type: string
          match_value: string
          match_value_norm: string | null
          notes: string | null
          priority: number
        }
        Insert: {
          assign_category?: string | null
          assign_subcategory?: string | null
          assign_txn_type?: string | null
          assign_vendor?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          match_field?: string
          match_type: string
          match_value: string
          match_value_norm?: string | null
          notes?: string | null
          priority?: number
        }
        Update: {
          assign_category?: string | null
          assign_subcategory?: string | null
          assign_txn_type?: string | null
          assign_vendor?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          match_field?: string
          match_type?: string
          match_value?: string
          match_value_norm?: string | null
          notes?: string | null
          priority?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_rules_to_unclassified: { Args: { p_limit?: number }; Returns: Json }
      apply_transaction_rules: { Args: { p_txn_id: string }; Returns: Json }
      array_intersect: { Args: { a: string[]; b: string[] }; Returns: string[] }
      array_intersect_stem: {
        Args: { a: string[]; b: string[] }
        Returns: string[]
      }
      backfill_email_matches: { Args: never; Returns: number }
      backfill_smart_matches: {
        Args: { lookback_days?: number; min_gap?: number; min_score?: number }
        Returns: Json
      }
      bulk_generate_suggestions: {
        Args: { lookback_days?: number }
        Returns: Json
      }
      extract_domain: { Args: { email: string }; Returns: string }
      get_accrued_mfg_cogs_rollup: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_attribution_diagnostics: { Args: never; Returns: Json }
      get_cost_rollups: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_marketing_rollup: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      get_match_suggestions: {
        Args: { limit_n?: number; lookback_days?: number; p_sale_id: string }
        Returns: {
          lead_email: string
          lead_id: string
          lead_name: string
          lead_phrase: string
          lead_submitted_at: string
          reasons: string[]
          score: number
        }[]
      }
      get_personal_draw_rollup: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      get_sales_counts: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_shopify_capital_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      is_free_email_domain: { Args: { domain: string }; Returns: boolean }
      match_sale_by_id: { Args: { p_sale_id: string }; Returns: Json }
      normalize_text: { Args: { t: string }; Returns: string }
      remove_stopwords: { Args: { tokens: string[] }; Returns: string[] }
      search_leads: {
        Args: { limit_n?: number; search_term: string }
        Returns: {
          lead_email: string
          lead_id: string
          lead_name: string
          lead_phrase: string
          lead_submitted_at: string
          lead_text_id: string
        }[]
      }
      strong_tokens_fn: { Args: { tokens: string[] }; Returns: string[] }
      tokenize_text: { Args: { t: string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
