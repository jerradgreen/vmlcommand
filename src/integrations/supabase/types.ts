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
          external_id: string | null
          id: string
          ingested_at: string | null
          lead_id: string | null
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
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          lead_id?: string | null
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
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          lead_id?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      get_attribution_diagnostics: { Args: never; Returns: Json }
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
