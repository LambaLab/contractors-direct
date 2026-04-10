// Auto-generated Supabase types placeholder.
// Run `npx supabase gen types typescript` against your Supabase project
// to generate the real types, then replace this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      intake_sessions: {
        Row: {
          id: string
          user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          session_id: string
          user_id: string | null
          status: string
          property_type: string | null
          location: string | null
          size_sqft: number | null
          condition: string | null
          style_preference: string | null
          scope: Json
          confidence_score: number
          price_min: number
          price_max: number
          brief: string
          project_overview: string | null
          scope_summaries: Json | null
          project_name: string | null
          name: string | null
          phone: string | null
          email: string | null
          phone_verified_at: string | null
          slug: string | null
          saved_at: string | null
          metadata: Json | null
          admin_notes: string | null
          prd: string | null
          technical_architecture: string | null
          timeline: string | null
          task_breakdown: Json | null
          milestone_plan: Json | null
          email_auth_token: string | null
          email_auth_token_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id?: string | null
          status?: string
          property_type?: string | null
          location?: string | null
          size_sqft?: number | null
          condition?: string | null
          style_preference?: string | null
          scope?: Json
          confidence_score?: number
          price_min?: number
          price_max?: number
          brief?: string
          project_overview?: string | null
          scope_summaries?: Json | null
          project_name?: string | null
          name?: string | null
          phone?: string | null
          email?: string | null
          phone_verified_at?: string | null
          slug?: string | null
          saved_at?: string | null
          metadata?: Json | null
          admin_notes?: string | null
          prd?: string | null
          technical_architecture?: string | null
          timeline?: string | null
          task_breakdown?: Json | null
          milestone_plan?: Json | null
          email_auth_token?: string | null
          email_auth_token_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string | null
          status?: string
          property_type?: string | null
          location?: string | null
          size_sqft?: number | null
          condition?: string | null
          style_preference?: string | null
          scope?: Json
          confidence_score?: number
          price_min?: number
          price_max?: number
          brief?: string
          project_overview?: string | null
          scope_summaries?: Json | null
          project_name?: string | null
          name?: string | null
          phone?: string | null
          email?: string | null
          phone_verified_at?: string | null
          slug?: string | null
          saved_at?: string | null
          metadata?: Json | null
          admin_notes?: string | null
          prd?: string | null
          technical_architecture?: string | null
          timeline?: string | null
          task_breakdown?: Json | null
          milestone_plan?: Json | null
          email_auth_token?: string | null
          email_auth_token_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_emails: {
        Row: {
          id: string
          lead_id: string
          email: string
          verified_at: string
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          email: string
          verified_at?: string
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          email?: string
          verified_at?: string
          is_primary?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          }
        ]
      }
      chat_messages: {
        Row: {
          id: string
          lead_id: string
          role: string
          content: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          role: string
          content: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          role?: string
          content?: string
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      boq_drafts: {
        Row: {
          id: string
          lead_id: string
          version: number
          categories: Json
          grand_total_aed: number
          assumptions: string[]
          exclusions: string[]
          locked: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          version?: number
          categories?: Json
          grand_total_aed?: number
          assumptions?: string[]
          exclusions?: string[]
          locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          version?: number
          categories?: Json
          grand_total_aed?: number
          assumptions?: string[]
          exclusions?: string[]
          locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          id: string
          session_id: string
          user_id: string | null
          status: string
          brief: string | null
          modules: Json
          confidence_score: number
          price_min: number
          price_max: number
          prd: string | null
          email: string | null
          slug: string | null
          metadata: Json | null
          email_auth_token: string | null
          email_auth_token_expires_at: string | null
          saved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id?: string | null
          status?: string
          brief?: string | null
          modules?: Json
          confidence_score?: number
          price_min?: number
          price_max?: number
          prd?: string | null
          email?: string | null
          slug?: string | null
          metadata?: Json | null
          email_auth_token?: string | null
          email_auth_token_expires_at?: string | null
          saved_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string | null
          status?: string
          brief?: string | null
          modules?: Json
          confidence_score?: number
          price_min?: number
          price_max?: number
          prd?: string | null
          email?: string | null
          slug?: string | null
          metadata?: Json | null
          email_auth_token?: string | null
          email_auth_token_expires_at?: string | null
          saved_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          id: string
          email: string
          role: string
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          role?: string
          added_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: string
          added_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      budget_proposals: {
        Row: {
          id: string
          lead_id: string
          proposal_id: string | null
          amount: number
          client_notes: string | null
          internal_notes: string | null
          status: string
          client_response: string | null
          counter_amount: number | null
          counter_notes: string | null
          responded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          proposal_id?: string | null
          amount?: number
          client_notes?: string | null
          internal_notes?: string | null
          status?: string
          client_response?: string | null
          counter_amount?: number | null
          counter_notes?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          proposal_id?: string | null
          amount?: number
          client_notes?: string | null
          internal_notes?: string | null
          status?: string
          client_response?: string | null
          counter_amount?: number | null
          counter_notes?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          id: string
          email: string
          code: string
          lead_id: string
          session_id: string
          expires_at: string
          used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          code: string
          lead_id: string
          session_id: string
          expires_at: string
          used?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          code?: string
          lead_id?: string
          session_id?: string
          expires_at?: string
          used?: boolean
          created_at?: string
        }
        Relationships: []
      }
      lead_slug_history: {
        Row: {
          id: string
          slug: string
          lead_id: string
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          lead_id: string
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          lead_id?: string
          created_at?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          id: string
          lead_id: string
          parent_id: string | null
          title: string
          scope_id: string | null
          description: string | null
          complexity: string | null
          status: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          parent_id?: string | null
          title: string
          scope_id?: string | null
          description?: string | null
          complexity?: string | null
          status?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          parent_id?: string | null
          title?: string
          scope_id?: string | null
          description?: string | null
          complexity?: string | null
          status?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
