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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          color: string | null
          created_at: string
          current_balance: number
          icon: string | null
          id: string
          initial_balance: number
          name: string
          pluggy_account_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          current_balance?: number
          icon?: string | null
          id?: string
          initial_balance?: number
          name: string
          pluggy_account_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          current_balance?: number
          icon?: string | null
          id?: string
          initial_balance?: number
          name?: string
          pluggy_account_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          month: number
          planned_amount: number
          user_id: string
          year: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          month: number
          planned_amount?: number
          user_id: string
          year: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          month?: number
          planned_amount?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_reimbursable: boolean
          name: string
          parent_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_reimbursable?: boolean
          name: string
          parent_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_reimbursable?: boolean
          name?: string
          parent_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_corporate: boolean
          keyword: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_corporate?: boolean
          keyword: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_corporate?: boolean
          keyword?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_invoices: {
        Row: {
          closed_amount: number | null
          closed_at: string | null
          closing_date: string | null
          created_at: string
          credit_card_id: string
          due_date: string | null
          id: string
          month: number
          status: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          closed_amount?: number | null
          closed_at?: string | null
          closing_date?: string | null
          created_at?: string
          credit_card_id: string
          due_date?: string | null
          id?: string
          month: number
          status?: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          closed_amount?: number | null
          closed_at?: string | null
          closing_date?: string | null
          created_at?: string
          credit_card_id?: string
          due_date?: string | null
          id?: string
          month?: number
          status?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          brand: string
          closing_date: number
          color: string | null
          created_at: string
          credit_limit: number
          current_invoice: number
          due_date: number
          id: string
          last_digits: string
          name: string
          pluggy_account_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand: string
          closing_date?: number
          color?: string | null
          created_at?: string
          credit_limit?: number
          current_invoice?: number
          due_date?: number
          id?: string
          last_digits: string
          name: string
          pluggy_account_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string
          closing_date?: number
          color?: string | null
          created_at?: string
          credit_limit?: number
          current_invoice?: number
          due_date?: number
          id?: string
          last_digits?: string
          name?: string
          pluggy_account_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_assets: {
        Row: {
          asset_type: string
          average_price: number
          created_at: string
          current_balance: number | null
          current_price: number
          id: string
          institution_id: string | null
          liquidity: string | null
          maturity_date: string | null
          name: string
          pricing_method: string | null
          quantity: number
          ticker: string
          updated_at: string
          user_id: string
          yield_info: string | null
        }
        Insert: {
          asset_type: string
          average_price?: number
          created_at?: string
          current_balance?: number | null
          current_price?: number
          id?: string
          institution_id?: string | null
          liquidity?: string | null
          maturity_date?: string | null
          name: string
          pricing_method?: string | null
          quantity?: number
          ticker: string
          updated_at?: string
          user_id: string
          yield_info?: string | null
        }
        Update: {
          asset_type?: string
          average_price?: number
          created_at?: string
          current_balance?: number | null
          current_price?: number
          id?: string
          institution_id?: string | null
          liquidity?: string | null
          maturity_date?: string | null
          name?: string
          pricing_method?: string | null
          quantity?: number
          ticker?: string
          updated_at?: string
          user_id?: string
          yield_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_assets_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "investment_institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_institutions: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_transactions: {
        Row: {
          asset_id: string | null
          created_at: string
          date: string
          fees: number
          id: string
          linked_transaction_id: string | null
          notes: string | null
          quantity: number
          realized_profit: number | null
          total_value: number
          type: string
          unit_price: number
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          date?: string
          fees?: number
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          quantity?: number
          realized_profit?: number | null
          total_value?: number
          type: string
          unit_price?: number
          user_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          date?: string
          fees?: number
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          quantity?: number
          realized_profit?: number | null
          total_value?: number
          type?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "investment_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_email: string
          invited_user_id: string | null
          owner_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_email: string
          invited_user_id?: string | null
          owner_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_email?: string
          invited_user_id?: string | null
          owner_id?: string
          status?: string
        }
        Relationships: []
      }
      pluggy_items: {
        Row: {
          account_id: string | null
          connector_logo: string | null
          connector_name: string | null
          created_at: string
          credit_card_id: string | null
          id: string
          last_sync_at: string | null
          pluggy_item_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          connector_logo?: string | null
          connector_name?: string | null
          created_at?: string
          credit_card_id?: string | null
          id?: string
          last_sync_at?: string | null
          pluggy_item_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          connector_logo?: string | null
          connector_name?: string | null
          created_at?: string
          credit_card_id?: string | null
          id?: string
          last_sync_at?: string | null
          pluggy_item_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pluggy_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pluggy_items_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          status: string
          target_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          status?: string
          target_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          status?: string
          target_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          account_id: string | null
          active: boolean
          category_id: string | null
          created_at: string
          credit_card_id: string | null
          day_of_month: number
          description: string
          estimated_amount: number
          id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          day_of_month?: number
          description: string
          estimated_amount?: number
          id?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          day_of_month?: number
          description?: string
          estimated_amount?: number
          id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_access: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          shared_with_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          shared_with_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          shared_with_user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          card_last_digits: string | null
          category_id: string | null
          created_at: string
          credit_card_id: string | null
          date: string
          description: string
          due_date: string | null
          id: string
          imported_at: string | null
          installment_group_id: string | null
          installment_number: number | null
          is_card_payment: boolean | null
          is_corporate_expense: boolean
          is_provisional: boolean
          is_refund: boolean
          is_reimbursable: boolean
          is_reimbursement: boolean
          original_description: string | null
          project_id: string | null
          recurring_rule_id: string | null
          refunded_transaction_id: string | null
          reimbursement_income_id: string | null
          reimbursement_payment_id: string | null
          reimbursement_status: string | null
          split_group_id: string | null
          split_parent_id: string | null
          status: string
          total_installments: number | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          card_last_digits?: string | null
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          date?: string
          description: string
          due_date?: string | null
          id?: string
          imported_at?: string | null
          installment_group_id?: string | null
          installment_number?: number | null
          is_card_payment?: boolean | null
          is_corporate_expense?: boolean
          is_provisional?: boolean
          is_refund?: boolean
          is_reimbursable?: boolean
          is_reimbursement?: boolean
          original_description?: string | null
          project_id?: string | null
          recurring_rule_id?: string | null
          refunded_transaction_id?: string | null
          reimbursement_income_id?: string | null
          reimbursement_payment_id?: string | null
          reimbursement_status?: string | null
          split_group_id?: string | null
          split_parent_id?: string | null
          status?: string
          total_installments?: number | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          card_last_digits?: string | null
          category_id?: string | null
          created_at?: string
          credit_card_id?: string | null
          date?: string
          description?: string
          due_date?: string | null
          id?: string
          imported_at?: string | null
          installment_group_id?: string | null
          installment_number?: number | null
          is_card_payment?: boolean | null
          is_corporate_expense?: boolean
          is_provisional?: boolean
          is_refund?: boolean
          is_reimbursable?: boolean
          is_reimbursement?: boolean
          original_description?: string | null
          project_id?: string | null
          recurring_rule_id?: string | null
          refunded_transaction_id?: string | null
          reimbursement_income_id?: string | null
          reimbursement_payment_id?: string | null
          reimbursement_status?: string | null
          split_group_id?: string | null
          split_parent_id?: string | null
          status?: string
          total_installments?: number | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_split_parent_id_fkey"
            columns: ["split_parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_refunded_transaction_id_fkey"
            columns: ["refunded_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reimbursement_payment_id_fkey"
            columns: ["reimbursement_payment_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      mark_reimbursed: {
        Args: { p_transaction_id: string }
        Returns: string
      }
      settle_reimbursement: {
        Args: {
          p_account_id?: string
          p_date?: string
          p_income_id?: string
          p_transaction_id: string
        }
        Returns: string
      }
      settle_transactions_with_payment: {
        Args: { p_payment_id: string; p_target_ids: string[] }
        Returns: string
      }
      split_transaction: {
        Args: { p_parts: Json; p_transaction_id: string }
        Returns: string
      }
      unmark_reimbursed: {
        Args: { p_transaction_id: string; p_new_status: string }
        Returns: undefined
      }
      unsplit_transaction: {
        Args: { p_transaction_id: string }
        Returns: string
      }
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
