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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string | null
          address: string | null
          city: string | null
          cover_image: string | null
          created_at: string
          description: string | null
          email_public: string | null
          email_public_visible: boolean
          enable_reservations: boolean
          facebook: string | null
          facebook_public: boolean
          fees: Json | null
          fees_public: boolean
          google_review_url: string | null
          hours_public: boolean
          id: string
          inactive_reason: string | null
          instagram: string | null
          instagram_public: boolean
          name: string
          ordering_enabled: boolean
          payment_methods: string[]
          payment_methods_public: boolean
          phone: string | null
          phone_public: boolean
          plan_override: string | null
          postal_code: string | null
          province: string | null
          qr_bg_color: string | null
          qr_fg_color: string | null
          reservation_notification_emails: string[]
          services: string[]
          services_public: boolean
          slug: string
          status: string
          street_number: string | null
          tenant_id: string
          updated_at: string
          website: string | null
          website_public: boolean
          whatsapp: string | null
          whatsapp_public: boolean
        }
        Insert: {
          activity_type?: string | null
          address?: string | null
          city?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string | null
          email_public?: string | null
          email_public_visible?: boolean
          enable_reservations?: boolean
          facebook?: string | null
          facebook_public?: boolean
          fees?: Json | null
          fees_public?: boolean
          google_review_url?: string | null
          hours_public?: boolean
          id: string
          inactive_reason?: string | null
          instagram?: string | null
          instagram_public?: boolean
          name: string
          ordering_enabled?: boolean
          payment_methods?: string[]
          payment_methods_public?: boolean
          phone?: string | null
          phone_public?: boolean
          plan_override?: string | null
          postal_code?: string | null
          province?: string | null
          qr_bg_color?: string | null
          qr_fg_color?: string | null
          reservation_notification_emails?: string[]
          services?: string[]
          services_public?: boolean
          slug: string
          status?: string
          street_number?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
          website_public?: boolean
          whatsapp?: string | null
          whatsapp_public?: boolean
        }
        Update: {
          activity_type?: string | null
          address?: string | null
          city?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string | null
          email_public?: string | null
          email_public_visible?: boolean
          enable_reservations?: boolean
          facebook?: string | null
          facebook_public?: boolean
          fees?: Json | null
          fees_public?: boolean
          google_review_url?: string | null
          hours_public?: boolean
          id?: string
          inactive_reason?: string | null
          instagram?: string | null
          instagram_public?: boolean
          name?: string
          ordering_enabled?: boolean
          payment_methods?: string[]
          payment_methods_public?: boolean
          phone?: string | null
          phone_public?: boolean
          plan_override?: string | null
          postal_code?: string | null
          province?: string | null
          qr_bg_color?: string | null
          qr_fg_color?: string | null
          reservation_notification_emails?: string[]
          services?: string[]
          services_public?: boolean
          slug?: string
          status?: string
          street_number?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
          website_public?: boolean
          whatsapp?: string | null
          whatsapp_public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "activities_plan_override_fkey"
            columns: ["plan_override"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_addons: {
        Row: {
          activated_at: string
          activity_id: string
          addon_id: string
          created_at: string
          deactivated_at: string | null
          id: string
          stripe_subscription_item_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          activity_id: string
          addon_id: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          stripe_subscription_item_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          activity_id?: string
          addon_id?: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          stripe_subscription_item_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_addons_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_closures: {
        Row: {
          activity_id: string
          closure_date: string
          created_at: string
          end_date: string | null
          id: string
          is_closed: boolean
          label: string | null
          label_hash: string | null
          slots: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          closure_date: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_closed?: boolean
          label?: string | null
          label_hash?: string | null
          slots?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          closure_date?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_closed?: boolean
          label?: string | null
          label_hash?: string | null
          slots?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_closures_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_closures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_group_members: {
        Row: {
          activity_id: string
          created_at: string
          group_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          group_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          group_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_group_members_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "activity_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_group_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_hours: {
        Row: {
          activity_id: string
          closes_at: string | null
          closes_next_day: boolean
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          opens_at: string | null
          slot_index: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          closes_at?: string | null
          closes_next_day?: boolean
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          slot_index?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          closes_at?: string | null
          closes_next_day?: boolean
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          slot_index?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_hours_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_media: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          is_cover: boolean
          sort_order: number
          type: string
          url: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          is_cover?: boolean
          sort_order?: number
          type?: string
          url: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          is_cover?: boolean
          sort_order?: number
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_media_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_product_overrides: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          price_override: number | null
          product_id: string
          updated_at: string
          visible_override: boolean | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          id: string
          price_override?: number | null
          product_id: string
          updated_at?: string
          visible_override?: boolean | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          price_override?: number | null
          product_id?: string
          updated_at?: string
          visible_override?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_product_overrides_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_product_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_slug_aliases: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          slug: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          slug: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_slug_aliases_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      addons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          monthly_price_cents: number | null
          name: string
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          monthly_price_cents?: number | null
          name: string
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price_cents?: number | null
          name?: string
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      allergens: {
        Row: {
          code: string
          id: number
          label: string
          label_en: string
          label_hash: string | null
          label_it: string
          sort_order: number
        }
        Insert: {
          code: string
          id: number
          label: string
          label_en: string
          label_hash?: string | null
          label_it: string
          sort_order?: number
        }
        Update: {
          code?: string
          id?: number
          label?: string
          label_en?: string
          label_hash?: string | null
          label_it?: string
          sort_order?: number
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          activity_id: string
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          screen_width: number | null
          session_id: string | null
          tenant_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          screen_width?: number | null
          session_id?: string | null
          tenant_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          screen_width?: number | null
          session_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          target_user_id: string | null
          tenant_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          target_user_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          level: number
          name: string
          name_hash: string | null
          parent_category_id: string | null
          sort_order: number
          tenant_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          level: number
          name: string
          name_hash?: string | null
          parent_category_id?: string | null
          sort_order?: number
          tenant_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          level?: number
          name?: string
          name_hash?: string | null
          parent_category_id?: string | null
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_category_products: {
        Row: {
          catalog_id: string
          category_id: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
          tenant_id: string
          variant_product_id: string | null
        }
        Insert: {
          catalog_id: string
          category_id: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          tenant_id: string
          variant_product_id?: string | null
        }
        Update: {
          catalog_id?: string
          category_id?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          tenant_id?: string
          variant_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_category_products_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_category_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_category_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_category_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_category_products_variant_product_id_fkey"
            columns: ["variant_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          order_index: number
          product_id: string
          section_id: string
          tenant_id: string
          visible: boolean
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          order_index?: number
          product_id: string
          section_id: string
          tenant_id: string
          visible?: boolean
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          order_index?: number
          product_id?: string
          section_id?: string
          tenant_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "catalog_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sections: {
        Row: {
          base_category_id: string | null
          catalog_id: string
          created_at: string
          id: string
          label: string | null
          order_index: number
          tenant_id: string
        }
        Insert: {
          base_category_id?: string | null
          catalog_id: string
          created_at?: string
          id?: string
          label?: string | null
          order_index?: number
          tenant_id: string
        }
        Update: {
          base_category_id?: string | null
          catalog_id?: string
          created_at?: string
          id?: string
          label?: string | null
          order_index?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_sections_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          catalog_type: string | null
          created_at: string
          description: string | null
          id: string
          kind: string | null
          name: string
          style: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          catalog_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string | null
          name: string
          style?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          catalog_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string | null
          name?: string
          style?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          accepted_at: string
          document_type: string
          document_version: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          document_version: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          document_version?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customer_sessions: {
        Row: {
          activity_id: string
          bill_requested_at: string | null
          created_at: string
          current_table_id: string | null
          customer_name: string | null
          device_id: string
          expires_at: string
          first_seen_at: string
          id: string
          last_activity_at: string
          order_group_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          bill_requested_at?: string | null
          created_at?: string
          current_table_id?: string | null
          customer_name?: string | null
          device_id?: string
          expires_at: string
          first_seen_at?: string
          id?: string
          last_activity_at?: string
          order_group_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          bill_requested_at?: string | null
          created_at?: string
          current_table_id?: string | null
          customer_name?: string | null
          device_id?: string
          expires_at?: string
          first_seen_at?: string
          id?: string
          last_activity_at?: string
          order_group_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sessions_current_table_id_fkey"
            columns: ["current_table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sessions_current_table_id_fkey"
            columns: ["current_table_id"]
            isOneToOne: false
            referencedRelation: "v_tables_with_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sessions_order_group_id_fkey"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_content_products: {
        Row: {
          created_at: string
          featured_content_id: string
          id: string
          note: string | null
          note_hash: string | null
          product_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          featured_content_id: string
          id?: string
          note?: string | null
          note_hash?: string | null
          product_id: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          featured_content_id?: string
          id?: string
          note?: string | null
          note_hash?: string | null
          product_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_content_products_featured_content_id_fkey"
            columns: ["featured_content_id"]
            isOneToOne: false
            referencedRelation: "featured_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_content_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_content_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_contents: {
        Row: {
          bundle_price: number | null
          content_type: string
          created_at: string
          cta_text: string | null
          cta_text_hash: string | null
          cta_url: string | null
          description: string | null
          description_hash: string | null
          id: string
          internal_name: string
          layout_style: string | null
          media_id: string | null
          pricing_mode: string
          show_original_total: boolean
          status: string
          subtitle: string | null
          subtitle_hash: string | null
          tenant_id: string
          title: string
          title_hash: string | null
          updated_at: string
        }
        Insert: {
          bundle_price?: number | null
          content_type?: string
          created_at?: string
          cta_text?: string | null
          cta_text_hash?: string | null
          cta_url?: string | null
          description?: string | null
          description_hash?: string | null
          id?: string
          internal_name: string
          layout_style?: string | null
          media_id?: string | null
          pricing_mode?: string
          show_original_total?: boolean
          status?: string
          subtitle?: string | null
          subtitle_hash?: string | null
          tenant_id: string
          title: string
          title_hash?: string | null
          updated_at?: string
        }
        Update: {
          bundle_price?: number | null
          content_type?: string
          created_at?: string
          cta_text?: string | null
          cta_text_hash?: string | null
          cta_url?: string | null
          description?: string | null
          description_hash?: string | null
          id?: string
          internal_name?: string
          layout_style?: string | null
          media_id?: string | null
          pricing_mode?: string
          show_original_total?: boolean
          status?: string
          subtitle?: string | null
          subtitle_hash?: string | null
          tenant_id?: string
          title?: string
          title_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_contents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          created_at: string
          id: string
          name: string
          name_hash: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_hash?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_hash?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json
          event_type: string
          id: string
          message: string | null
          read_at: string | null
          tenant_id: string | null
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          message?: string | null
          read_at?: string | null
          tenant_id?: string | null
          title?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          message?: string | null
          read_at?: string | null
          tenant_id?: string | null
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_groups: {
        Row: {
          activity_id: string
          closed_at: string | null
          created_at: string
          id: string
          status: string
          table_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          table_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          table_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_groups_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_groups_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_groups_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "v_tables_with_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_notes: string | null
          line_total: number
          options_snapshot: Json
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_notes?: string | null
          line_total: number
          options_snapshot?: Json
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Update: {
          created_at?: string
          id?: string
          item_notes?: string | null
          line_total?: number
          options_snapshot?: Json
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          acknowledged_at: string | null
          activity_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          currency: string
          customer_name_snapshot: string | null
          customer_session_id: string
          delivered_at: string | null
          id: string
          is_rectification: boolean
          notes: string | null
          order_group_id: string | null
          parent_order_id: string | null
          ready_at: string | null
          resolved_schedule_id: string | null
          status: string
          submitted_at: string
          table_id: string
          tenant_id: string
          total_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          acknowledged_at?: string | null
          activity_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          currency?: string
          customer_name_snapshot?: string | null
          customer_session_id: string
          delivered_at?: string | null
          id?: string
          is_rectification?: boolean
          notes?: string | null
          order_group_id?: string | null
          parent_order_id?: string | null
          ready_at?: string | null
          resolved_schedule_id?: string | null
          status: string
          submitted_at?: string
          table_id: string
          tenant_id: string
          total_amount: number
          updated_at?: string
          version?: number
        }
        Update: {
          acknowledged_at?: string | null
          activity_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          currency?: string
          customer_name_snapshot?: string | null
          customer_session_id?: string
          delivered_at?: string | null
          id?: string
          is_rectification?: boolean
          notes?: string | null
          order_group_id?: string | null
          parent_order_id?: string | null
          ready_at?: string | null
          resolved_schedule_id?: string | null
          status?: string
          submitted_at?: string
          table_id?: string
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_order_group_id_fkey"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_resolved_schedule_id_fkey"
            columns: ["resolved_schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "v_tables_with_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          last_sent_at: string | null
          locked_until: string | null
          max_attempts: number
          request_ip: unknown
          send_count: number
          user_agent: string | null
          user_id: string
          window_start_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          last_sent_at?: string | null
          locked_until?: string | null
          max_attempts?: number
          request_ip?: unknown
          send_count?: number
          user_agent?: string | null
          user_id: string
          window_start_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_sent_at?: string | null
          locked_until?: string | null
          max_attempts?: number
          request_ip?: unknown
          send_count?: number
          user_agent?: string | null
          user_id?: string
          window_start_at?: string
        }
        Relationships: []
      }
      otp_send_audit: {
        Row: {
          auth_user_id: string
          caller_origin: string | null
          cooldown_remaining_ms: number | null
          created_at: string
          expected_session_match: boolean | null
          id: string
          jwt_session_id: string | null
          latest_known_session_id_for_user: string | null
          navigation_type: string | null
          outcome: string
          request_ip: string | null
          send_count_in_window: number | null
          session_id_rotated: boolean | null
          triggered_by: string
          user_agent: string | null
        }
        Insert: {
          auth_user_id: string
          caller_origin?: string | null
          cooldown_remaining_ms?: number | null
          created_at?: string
          expected_session_match?: boolean | null
          id?: string
          jwt_session_id?: string | null
          latest_known_session_id_for_user?: string | null
          navigation_type?: string | null
          outcome: string
          request_ip?: string | null
          send_count_in_window?: number | null
          session_id_rotated?: boolean | null
          triggered_by?: string
          user_agent?: string | null
        }
        Update: {
          auth_user_id?: string
          caller_origin?: string | null
          cooldown_remaining_ms?: number | null
          created_at?: string
          expected_session_match?: boolean | null
          id?: string
          jwt_session_id?: string | null
          latest_known_session_id_for_user?: string | null
          navigation_type?: string | null
          outcome?: string
          request_ip?: string | null
          send_count_in_window?: number | null
          session_id_rotated?: boolean | null
          triggered_by?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      otp_user_verifications: {
        Row: {
          expires_at: string
          user_id: string
          verified_at: string
        }
        Insert: {
          expires_at: string
          user_id: string
          verified_at?: string
        }
        Update: {
          expires_at?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          scope: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id: string
          scope: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          scope?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features_json: Json
          is_public: boolean
          max_activities: number | null
          max_catalogs: number | null
          max_products: number | null
          max_self_service_seats: number
          monthly_price_cents: number | null
          name: string | null
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
          volume_discount_percent: number
          volume_discount_threshold: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features_json?: Json
          is_public?: boolean
          max_activities?: number | null
          max_catalogs?: number | null
          max_products?: number | null
          max_self_service_seats?: number
          monthly_price_cents?: number | null
          name?: string | null
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
          volume_discount_percent?: number
          volume_discount_threshold?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features_json?: Json
          is_public?: boolean
          max_activities?: number | null
          max_catalogs?: number | null
          max_products?: number | null
          max_self_service_seats?: number
          monthly_price_cents?: number | null
          name?: string | null
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
          volume_discount_percent?: number
          volume_discount_threshold?: number
        }
        Relationships: []
      }
      product_allergens: {
        Row: {
          allergen_id: number
          created_at: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          allergen_id: number
          created_at?: string
          product_id: string
          tenant_id: string
        }
        Update: {
          allergen_id?: number
          created_at?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_allergens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_allergens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_definitions: {
        Row: {
          applies_to_variants: boolean
          code: string
          created_at: string
          id: string
          inherit_to_variants_by_default: boolean
          is_required: boolean
          label: string
          label_hash: string | null
          options: Json | null
          product_type: string | null
          show_in_public_channels: boolean
          sort_order: number
          tenant_id: string | null
          type: string
          vertical: string | null
        }
        Insert: {
          applies_to_variants?: boolean
          code: string
          created_at?: string
          id?: string
          inherit_to_variants_by_default?: boolean
          is_required?: boolean
          label: string
          label_hash?: string | null
          options?: Json | null
          product_type?: string | null
          show_in_public_channels?: boolean
          sort_order?: number
          tenant_id?: string | null
          type: string
          vertical?: string | null
        }
        Update: {
          applies_to_variants?: boolean
          code?: string
          created_at?: string
          id?: string
          inherit_to_variants_by_default?: boolean
          is_required?: boolean
          label?: string
          label_hash?: string | null
          options?: Json | null
          product_type?: string | null
          show_in_public_channels?: boolean
          sort_order?: number
          tenant_id?: string | null
          type?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_definition_id: string
          created_at: string
          id: string
          product_id: string
          tenant_id: string
          value_boolean: boolean | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
          value_text_hash: string | null
        }
        Insert: {
          attribute_definition_id: string
          created_at?: string
          id?: string
          product_id: string
          tenant_id: string
          value_boolean?: boolean | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
          value_text_hash?: string | null
        }
        Update: {
          attribute_definition_id?: string
          created_at?: string
          id?: string
          product_id?: string
          tenant_id?: string
          value_boolean?: boolean | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
          value_text_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_definition_id_fkey"
            columns: ["attribute_definition_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_availability_overrides: {
        Row: {
          activity_id: string
          auto_reset_at: string | null
          available: boolean
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          id: string
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          auto_reset_at?: string | null
          available?: boolean
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          id?: string
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          auto_reset_at?: string | null
          available?: boolean
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          id?: string
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_availability_overrides_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_availability_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_availability_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_characteristic_assignments: {
        Row: {
          characteristic_id: string
          created_at: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          characteristic_id: string
          created_at?: string
          product_id: string
          tenant_id: string
        }
        Update: {
          characteristic_id?: string
          created_at?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_characteristic_assignments_characteristic_id_fkey"
            columns: ["characteristic_id"]
            isOneToOne: false
            referencedRelation: "product_characteristics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_characteristic_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_characteristic_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_characteristics: {
        Row: {
          category: string
          code: string
          created_at: string
          dietary_claim: boolean
          icon: string
          id: string
          label: string
          label_en: string
          label_hash: string | null
          label_it: string
          mutex_group: string | null
          sort_order: number
          vertical: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          dietary_claim?: boolean
          icon: string
          id?: string
          label: string
          label_en: string
          label_hash?: string | null
          label_it: string
          mutex_group?: string | null
          sort_order?: number
          vertical: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          dietary_claim?: boolean
          icon?: string
          id?: string
          label?: string
          label_en?: string
          label_hash?: string | null
          label_it?: string
          mutex_group?: string | null
          sort_order?: number
          vertical?: string
        }
        Relationships: []
      }
      product_group_items: {
        Row: {
          created_at: string
          group_id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          product_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_group_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_group_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_group_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_group_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_group_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          created_at: string
          ingredient_id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          ingredient_id: string
          product_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          ingredient_id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          created_at: string
          group_kind: string
          id: string
          is_required: boolean
          max_selectable: number | null
          name: string
          name_hash: string | null
          pricing_mode: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          group_kind?: string
          id?: string
          is_required?: boolean
          max_selectable?: number | null
          name: string
          name_hash?: string | null
          pricing_mode?: string
          product_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          group_kind?: string
          id?: string
          is_required?: boolean
          max_selectable?: number | null
          name?: string
          name_hash?: string | null
          pricing_mode?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          absolute_price: number | null
          created_at: string
          id: string
          name: string
          name_hash: string | null
          option_group_id: string
          price_modifier: number | null
          tenant_id: string
        }
        Insert: {
          absolute_price?: number | null
          created_at?: string
          id?: string
          name: string
          name_hash?: string | null
          option_group_id: string
          price_modifier?: number | null
          tenant_id: string
        }
        Update: {
          absolute_price?: number | null
          created_at?: string
          id?: string
          name?: string
          name_hash?: string | null
          option_group_id?: string
          price_modifier?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "product_option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_assignment_values: {
        Row: {
          assignment_id: string
          dimension_value_id: string
        }
        Insert: {
          assignment_id: string
          dimension_value_id: string
        }
        Update: {
          assignment_id?: string
          dimension_value_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_assignment_values_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "product_variant_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_assignment_values_dimension_value_id_fkey"
            columns: ["dimension_value_id"]
            isOneToOne: false
            referencedRelation: "product_variant_dimension_values"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_assignments: {
        Row: {
          combination_key: string
          created_at: string
          id: string
          parent_product_id: string
          tenant_id: string
          variant_product_id: string
        }
        Insert: {
          combination_key: string
          created_at?: string
          id?: string
          parent_product_id: string
          tenant_id: string
          variant_product_id: string
        }
        Update: {
          combination_key?: string
          created_at?: string
          id?: string
          parent_product_id?: string
          tenant_id?: string
          variant_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_assignments_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_assignments_variant_product_id_fkey"
            columns: ["variant_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_dimension_values: {
        Row: {
          created_at: string
          dimension_id: string
          id: string
          label: string
          label_hash: string | null
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          dimension_id: string
          id?: string
          label: string
          label_hash?: string | null
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          dimension_id?: string
          id?: string
          label?: string
          label_hash?: string | null
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_dimension_values_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "product_variant_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_dimension_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_dimensions: {
        Row: {
          created_at: string
          id: string
          name: string
          name_hash: string | null
          product_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_hash?: string | null
          product_id: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_hash?: string | null
          product_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_dimensions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_dimensions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number | null
          created_at: string
          description: string | null
          description_hash: string | null
          id: string
          image_url: string | null
          name: string
          notes: Json
          notes_hash: string | null
          parent_product_id: string | null
          product_type: string
          tenant_id: string
          updated_at: string
          variant_strategy: string
        }
        Insert: {
          base_price?: number | null
          created_at?: string
          description?: string | null
          description_hash?: string | null
          id: string
          image_url?: string | null
          name: string
          notes?: Json
          notes_hash?: string | null
          parent_product_id?: string | null
          product_type?: string
          tenant_id: string
          updated_at?: string
          variant_strategy?: string
        }
        Update: {
          base_price?: number | null
          created_at?: string
          description?: string | null
          description_hash?: string | null
          id?: string
          image_url?: string | null
          name?: string
          notes?: Json
          notes_hash?: string | null
          parent_product_id?: string | null
          product_type?: string
          tenant_id?: string
          updated_at?: string
          variant_strategy?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_deleted_at: string | null
          avatar_url: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          account_deleted_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          account_deleted_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          activity_id: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          party_size: number
          reservation_date: string
          reservation_time: string
          source: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id?: string
          notes?: string | null
          party_size: number
          reservation_date: string
          reservation_time: string
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          notes?: string | null
          party_size?: number
          reservation_date?: string
          reservation_time?: string
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          activity_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          rating_category: string
          request_ip: string | null
          session_id: string | null
          source: string
          status: string
          tenant_id: string
        }
        Insert: {
          activity_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          rating_category: string
          request_ip?: string | null
          session_id?: string | null
          source?: string
          status?: string
          tenant_id: string
        }
        Update: {
          activity_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          rating_category?: string
          request_ip?: string | null
          session_id?: string | null
          source?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_featured_contents: {
        Row: {
          created_at: string
          featured_content_id: string
          id: string
          schedule_id: string
          slot: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          featured_content_id: string
          id?: string
          schedule_id: string
          slot: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          featured_content_id?: string
          id?: string
          schedule_id?: string
          slot?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_featured_contents_featured_content_id_fkey"
            columns: ["featured_content_id"]
            isOneToOne: false
            referencedRelation: "featured_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_featured_contents_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_featured_contents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_layout: {
        Row: {
          catalog_id: string | null
          created_at: string
          id: string
          schedule_id: string
          style_id: string
          tenant_id: string
        }
        Insert: {
          catalog_id?: string | null
          created_at?: string
          id?: string
          schedule_id: string
          style_id: string
          tenant_id: string
        }
        Update: {
          catalog_id?: string | null
          created_at?: string
          id?: string
          schedule_id?: string
          style_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_layout_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_layout_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_layout_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_price_overrides: {
        Row: {
          created_at: string
          id: string
          option_value_id: string | null
          override_price: number
          product_id: string
          schedule_id: string
          show_original_price: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_value_id?: string | null
          override_price: number
          product_id: string
          schedule_id: string
          show_original_price?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_value_id?: string | null
          override_price?: number
          product_id?: string
          schedule_id?: string
          show_original_price?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_price_overrides_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_price_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_targets: {
        Row: {
          created_at: string
          id: string
          schedule_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          schedule_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          schedule_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_targets_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_visibility_overrides: {
        Row: {
          created_at: string
          id: string
          mode: string | null
          product_id: string
          schedule_id: string
          tenant_id: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string | null
          product_id: string
          schedule_id: string
          tenant_id: string
          visible: boolean
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string | null
          product_id?: string
          schedule_id?: string
          tenant_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "schedule_visibility_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_visibility_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          apply_to_all: boolean
          created_at: string
          days_of_week: number[] | null
          display_order: number
          enabled: boolean
          end_at: string | null
          id: string
          is_baseline: boolean
          name: string | null
          priority: number
          priority_level: Database["public"]["Enums"]["schedule_priority_level"]
          rule_type: string
          start_at: string | null
          target_id: string | null
          target_type: string | null
          tenant_id: string
          time_from: string | null
          time_mode: string
          time_to: string | null
          updated_at: string
          visibility_mode: string
        }
        Insert: {
          apply_to_all?: boolean
          created_at?: string
          days_of_week?: number[] | null
          display_order?: number
          enabled?: boolean
          end_at?: string | null
          id?: string
          is_baseline?: boolean
          name?: string | null
          priority?: number
          priority_level?: Database["public"]["Enums"]["schedule_priority_level"]
          rule_type: string
          start_at?: string | null
          target_id?: string | null
          target_type?: string | null
          tenant_id: string
          time_from?: string | null
          time_mode: string
          time_to?: string | null
          updated_at?: string
          visibility_mode?: string
        }
        Update: {
          apply_to_all?: boolean
          created_at?: string
          days_of_week?: number[] | null
          display_order?: number
          enabled?: boolean
          end_at?: string | null
          id?: string
          is_baseline?: boolean
          name?: string | null
          priority?: number
          priority_level?: Database["public"]["Enums"]["schedule_priority_level"]
          rule_type?: string
          start_at?: string | null
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string
          time_from?: string | null
          time_mode?: string
          time_to?: string | null
          updated_at?: string
          visibility_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      status_checks: {
        Row: {
          checked_at: string
          error_message: string | null
          id: number
          response_time_ms: number | null
          service_key: string
          status: string
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          id?: number
          response_time_ms?: number | null
          service_key: string
          status: string
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          id?: number
          response_time_ms?: number | null
          service_key?: string
          status?: string
        }
        Relationships: []
      }
      status_incidents: {
        Row: {
          affected_services: string[]
          created_at: string
          description: string | null
          id: string
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          title: string
          updated_at: string
          updates: Json
        }
        Insert: {
          affected_services?: string[]
          created_at?: string
          description?: string | null
          id?: string
          resolved_at?: string | null
          severity: string
          started_at?: string
          status: string
          title: string
          updated_at?: string
          updates?: Json
        }
        Update: {
          affected_services?: string[]
          created_at?: string
          description?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
          updates?: Json
        }
        Relationships: []
      }
      status_service_state: {
        Row: {
          last_check_at: string
          last_notified_at: string | null
          last_notified_status: string | null
          last_status: string
          last_status_changed_at: string
          service_key: string
          updated_at: string
        }
        Insert: {
          last_check_at?: string
          last_notified_at?: string | null
          last_notified_status?: string | null
          last_status: string
          last_status_changed_at?: string
          service_key: string
          updated_at?: string
        }
        Update: {
          last_check_at?: string
          last_notified_at?: string | null
          last_notified_status?: string | null
          last_status?: string
          last_status_changed_at?: string
          service_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      style_versions: {
        Row: {
          config: Json
          created_at: string
          id: string
          style_id: string
          tenant_id: string
          version: number
        }
        Insert: {
          config: Json
          created_at?: string
          id?: string
          style_id: string
          tenant_id: string
          version: number
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          style_id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "style_versions_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "style_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      styles: {
        Row: {
          created_at: string
          current_version_id: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "styles_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "style_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "styles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supported_languages: {
        Row: {
          code: string
          created_at: string
          flag_emoji: string | null
          is_available: boolean
          name_en: string
          name_it: string
          name_native: string
          provider_preference: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          flag_emoji?: string | null
          is_available?: boolean
          name_en: string
          name_it: string
          name_native: string
          provider_preference?: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          flag_emoji?: string | null
          is_available?: boolean
          name_en?: string
          name_it?: string
          name_native?: string
          provider_preference?: string
          sort_order?: number
        }
        Relationships: []
      }
      table_zones: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_zones_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          activity_id: string
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          maintenance_mode: boolean
          qr_token: string
          seats: number | null
          tenant_id: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          maintenance_mode?: boolean
          qr_token?: string
          seats?: number | null
          tenant_id: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          maintenance_mode?: boolean
          qr_token?: string
          seats?: number | null
          tenant_id?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "table_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_languages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          language_code: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          language_code: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          language_code?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_languages_language_code_fkey"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenant_languages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_membership_activities: {
        Row: {
          activity_id: string
          created_at: string
          role: string
          tenant_id: string
          tenant_membership_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          role: string
          tenant_id: string
          tenant_membership_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          role?: string
          tenant_id?: string
          tenant_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_membership_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_membership_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_membership_activities_tenant_membership_id_fkey"
            columns: ["tenant_membership_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          invite_accepted_at: string | null
          invite_expires_at: string | null
          invite_sent_at: string | null
          invite_token: string | null
          invited_by: string | null
          invited_email: string | null
          role: string | null
          status: string
          tenant_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invite_accepted_at?: string | null
          invite_expires_at?: string | null
          invite_sent_at?: string | null
          invite_token?: string | null
          invited_by?: string | null
          invited_email?: string | null
          role?: string | null
          status: string
          tenant_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invite_accepted_at?: string | null
          invite_expires_at?: string | null
          invite_sent_at?: string | null
          invite_token?: string | null
          invited_by?: string | null
          invited_email?: string | null
          role?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          applied_promo_code: string | null
          ateco: string | null
          base_language_code: string
          business_subtype: string | null
          city: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          fiscal_code: string | null
          id: string
          is_founder: boolean
          legacy_price_id: string | null
          legal_name: string | null
          locked_at: string | null
          logo_url: string | null
          name: string
          owner_user_id: string
          paid_seats: number
          pec: string | null
          plan: string
          postal_code: string | null
          province: string | null
          rea_code: string | null
          street_number: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          translate_categories: boolean
          translate_ingredients: boolean
          translate_options: boolean
          trial_until: string | null
          vat_number: string | null
          vertical_type: string
        }
        Insert: {
          address?: string | null
          applied_promo_code?: string | null
          ateco?: string | null
          base_language_code?: string
          business_subtype?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          fiscal_code?: string | null
          id?: string
          is_founder?: boolean
          legacy_price_id?: string | null
          legal_name?: string | null
          locked_at?: string | null
          logo_url?: string | null
          name: string
          owner_user_id: string
          paid_seats?: number
          pec?: string | null
          plan?: string
          postal_code?: string | null
          province?: string | null
          rea_code?: string | null
          street_number?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          translate_categories?: boolean
          translate_ingredients?: boolean
          translate_options?: boolean
          trial_until?: string | null
          vat_number?: string | null
          vertical_type?: string
        }
        Update: {
          address?: string | null
          applied_promo_code?: string | null
          ateco?: string | null
          base_language_code?: string
          business_subtype?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          fiscal_code?: string | null
          id?: string
          is_founder?: boolean
          legacy_price_id?: string | null
          legal_name?: string | null
          locked_at?: string | null
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          paid_seats?: number
          pec?: string | null
          plan?: string
          postal_code?: string | null
          province?: string | null
          rea_code?: string | null
          street_number?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          translate_categories?: boolean
          translate_ingredients?: boolean
          translate_options?: boolean
          trial_until?: string | null
          vat_number?: string | null
          vertical_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_base_language_code_fkey"
            columns: ["base_language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenants_plan_fkey"
            columns: ["plan"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      translation_jobs: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          last_error: string | null
          processed_at: string | null
          source_hash: string
          source_text: string
          status: string
          target_language_code: string
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          source_hash: string
          source_text: string
          status?: string
          target_language_code: string
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          source_hash?: string
          source_text?: string
          status?: string
          target_language_code?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "translation_jobs_target_language_code_fkey"
            columns: ["target_language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "translation_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          language_code: string
          provider: string
          source_hash: string
          source_text: string
          status: string
          tenant_id: string | null
          translated_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          language_code: string
          provider: string
          source_hash: string
          source_text: string
          status?: string
          tenant_id?: string | null
          translated_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          language_code?: string
          provider?: string
          source_hash?: string
          source_text?: string
          status?: string
          tenant_id?: string | null
          translated_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "translations_language_code_fkey"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "translations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_other_owner: {
        Row: {
          owner_user_id: string | null
        }
        Insert: {
          owner_user_id?: string | null
        }
        Update: {
          owner_user_id?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          activity_type: string | null
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          activity_type?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          activity_type?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      webhook_errors: {
        Row: {
          error_message: string
          error_stack: string | null
          event_id: string | null
          event_type: string | null
          id: string
          occurred_at: string
          payload: Json | null
          source: string
        }
        Insert: {
          error_message: string
          error_stack?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          source: string
        }
        Update: {
          error_message?: string
          error_stack?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_tenants_view: {
        Row: {
          business_subtype: string | null
          created_at: string | null
          id: string | null
          is_founder: boolean | null
          logo_url: string | null
          name: string | null
          owner_user_id: string | null
          paid_seats: number | null
          plan: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          trial_until: string | null
          user_role: string | null
          vertical_type: string | null
        }
        Relationships: []
      }
      v_tables_with_state: {
        Row: {
          active_sessions_count: number | null
          activity_id: string | null
          bill_requested_count: number | null
          created_at: string | null
          current_total: number | null
          deleted_at: string | null
          id: string | null
          label: string | null
          maintenance_mode: boolean | null
          open_groups_count: number | null
          open_orders_count: number | null
          pending_orders_count: number | null
          qr_token: string | null
          seats: number | null
          tenant_id: string | null
          updated_at: string | null
          zone_id: string | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "table_zones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite_by_token: { Args: { p_token: string }; Returns: string }
      accept_tenant_invite: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      activity_has_feature: {
        Args: { p_activity_id: string; p_feature_id: string }
        Returns: boolean
      }
      analytics_conversion_funnel: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          percentage: number
          session_count: number
          step_label: string
          step_name: string
        }[]
      }
      analytics_device_distribution: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          device_count: number
          device_type: string
          percentage: number
        }[]
      }
      analytics_featured_performance: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_limit?: number
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          click_count: number
          slot: string
          title: string
        }[]
      }
      analytics_hourly_distribution: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          hour: number
          view_count: number
        }[]
      }
      analytics_overview_stats: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          avg_events_per_session: number
          total_views: number
          unique_sessions: number
        }[]
      }
      analytics_page_views_trend: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_granularity?: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          count: number
          date: string
        }[]
      }
      analytics_review_metrics: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: Json
      }
      analytics_search_rate: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          rate: number
          search_sessions: number
          total_sessions: number
        }[]
      }
      analytics_social_clicks: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          click_count: number
          social_type: string
        }[]
      }
      analytics_top_search_terms: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_limit?: number
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          avg_results: number
          search_count: number
          search_term: string
        }[]
      }
      analytics_top_selected_products: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_limit?: number
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          product_name: string
          selection_count: number
        }[]
      }
      analytics_top_viewed_products: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_limit?: number
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          product_name: string
          view_count: number
        }[]
      }
      can_read_schedule: {
        Args: {
          p_apply_to_all: boolean
          p_schedule_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      can_read_schedule_target: {
        Args: {
          p_schedule_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: boolean
      }
      can_write_schedule: { Args: { p_schedule_id: string }; Returns: boolean }
      change_member_role: {
        Args: {
          p_activity_ids?: string[]
          p_membership_id: string
          p_new_role: string
        }
        Returns: string
      }
      claim_pending_translation_jobs: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          entity_id: string
          entity_type: string
          field: string
          id: string
          source_hash: string
          source_text: string
          target_language_code: string
          tenant_id: string
        }[]
      }
      clear_account_deleted: { Args: { p_user_id: string }; Returns: undefined }
      close_table_with_resolution: {
        Args: { p_action: string; p_table_id: string; p_tenant_id: string }
        Returns: Json
      }
      decline_invite_by_token: { Args: { p_token: string }; Returns: boolean }
      delete_invite: { Args: { p_membership_id: string }; Returns: boolean }
      delete_my_otp_verification: { Args: never; Returns: undefined }
      enqueue_platform_languages_backfill: { Args: never; Returns: number }
      enqueue_tenant_language_backfill: {
        Args: { p_target_lang: string; p_tenant_id: string }
        Returns: number
      }
      execute_account_deletion_tenant_ops: {
        Args: { p_actions: Json }
        Returns: undefined
      }
      expire_old_invites: { Args: never; Returns: number }
      get_daily_uptime: {
        Args: { p_days?: number; p_service_key: string }
        Returns: {
          check_count: number
          day: string
          worst: string
        }[]
      }
      get_invite_info_by_token: {
        Args: { p_token: string }
        Returns: {
          activity_ids: string[]
          activity_names: string[]
          effective_role: string
          status: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      get_jwt_customer_session_id: { Args: never; Returns: string }
      get_my_activity_ids: { Args: never; Returns: string[] }
      get_my_deleted_tenants: {
        Args: never
        Returns: {
          created_at: string
          deleted_at: string
          id: string
          name: string
          vertical_type: string
        }[]
      }
      get_my_pending_invites: {
        Args: never
        Returns: {
          activity_ids: string[]
          activity_names: string[]
          effective_role: string
          invite_token: string
          inviter_email: string
          membership_id: string
          status: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      get_my_permissions: {
        Args: { p_tenant_id: string }
        Returns: {
          activity_ids: string[]
          permissions: string[]
          role: string
        }[]
      }
      get_my_tenant_ids: { Args: never; Returns: string[] }
      get_operative_day_start: { Args: never; Returns: string }
      get_public_catalog: { Args: { p_catalog_id: string }; Returns: Json }
      get_public_tenant_ids: { Args: never; Returns: string[] }
      get_public_translations: {
        Args: { p_entities: Json; p_lang: string; p_tenant_id: string }
        Returns: {
          entity_id: string
          entity_type: string
          field: string
          source_hash: string
          translated_text: string
        }[]
      }
      get_schedule_featured_contents: {
        Args: { p_schedule_id: string; p_tenant_id: string }
        Returns: Json
      }
      get_tenant_members: {
        Args: { p_tenant_id: string }
        Returns: {
          activity_ids: string[]
          activity_names: string[]
          created_at: string
          effective_role: string
          email: string
          invite_expires_at: string
          invited_at: string
          invited_by_email: string
          membership_id: string
          status: string
          user_id: string
        }[]
      }
      get_tenant_public_info: { Args: { p_tenant_id: string }; Returns: Json }
      get_translation_progress: { Args: { p_tenant_id: string }; Returns: Json }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_user_tenants: {
        Args: never
        Returns: {
          business_subtype: string
          created_at: string
          id: string
          is_founder: boolean
          logo_url: string
          name: string
          owner_user_id: string
          paid_seats: number
          plan: string
          stripe_customer_id: string
          stripe_subscription_id: string
          subscription_status: string
          trial_until: string
          user_role: string
          vertical_type: string
        }[]
      }
      get_users_with_activity_permission: {
        Args: { p_activity_id: string; p_permission_id: string }
        Returns: string[]
      }
      has_permission: {
        Args: { p_activity_id?: string; p_permission_id: string }
        Returns: boolean
      }
      has_permission_any_activity: {
        Args: { p_permission_id: string; p_tenant_id: string }
        Returns: boolean
      }
      increment_otp_attempt: {
        Args: { challenge_id: string }
        Returns: undefined
      }
      increment_rate_limit: {
        Args: { p_bucket_key: string; p_window_start: string }
        Returns: number
      }
      invite_tenant_member: {
        Args: {
          p_activity_ids?: string[]
          p_email: string
          p_role: string
          p_tenant_id: string
        }
        Returns: string
      }
      is_reserved_slug: { Args: { slug: string }; Returns: boolean }
      is_schedule_active: {
        Args: { s: Database["public"]["Tables"]["schedules"]["Row"] }
        Returns: boolean
      }
      is_schedule_active_now: {
        Args: { days: number[]; end_t: string; start_t: string; tz: string }
        Returns: boolean
      }
      leave_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      mark_account_deleted: { Args: { p_user_id: string }; Returns: undefined }
      purge_locked_expired_tenants: { Args: never; Returns: number }
      purge_user_data: { Args: { p_user_id: string }; Returns: Json }
      rectify_order_atomic: {
        Args: {
          p_items_to_storno: Json
          p_notes: string
          p_parent_order_id: string
        }
        Returns: Json
      }
      remove_tenant_member: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      replace_product_allergens: {
        Args: {
          p_allergen_ids: number[]
          p_product_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      replace_product_characteristics: {
        Args: {
          p_characteristic_ids: string[]
          p_product_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      replace_product_ingredients: {
        Args: {
          p_ingredient_ids: string[]
          p_product_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      resend_invite: { Args: { p_membership_id: string }; Returns: boolean }
      resolve_table_by_token: {
        Args: { p_token: string }
        Returns: {
          activity_id: string
          activity_slug: string
          label: string
          maintenance_mode: boolean
          table_id: string
          tenant_id: string
          zone: string
        }[]
      }
      retry_all_failed_translations: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      revert_manual_translation: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_field: string
          p_language_code: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      revoke_invite: { Args: { p_membership_id: string }; Returns: boolean }
      simple_slug: { Args: { input: string }; Returns: string }
      submit_order_atomic: {
        Args: {
          p_activity_id: string
          p_customer_name_snapshot: string
          p_customer_session_id: string
          p_items: Json
          p_notes: string
          p_resolved_schedule_id: string
          p_table_id: string
          p_target_group_id: string
          p_tenant_id: string
          p_total_amount: number
        }
        Returns: Json
      }
      transfer_ownership: {
        Args: { p_new_owner_user_id: string; p_tenant_id: string }
        Returns: undefined
      }
      unlock_owned_tenants: { Args: { p_user_id: string }; Returns: number }
      update_schedule_targets: {
        Args: { p_schedule_id: string; p_targets: Json }
        Returns: number
      }
      update_tenant_logo: {
        Args: { p_logo_url: string; p_tenant_id: string }
        Returns: undefined
      }
      upsert_auto_translation: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_field: string
          p_language_code: string
          p_provider: string
          p_source_hash: string
          p_source_text: string
          p_tenant_id: string
          p_translated_text: string
        }
        Returns: boolean
      }
      upsert_manual_translation: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_field: string
          p_language_code: string
          p_source_hash: string
          p_source_text: string
          p_tenant_id: string
          p_translated_text: string
        }
        Returns: undefined
      }
    }
    Enums: {
      schedule_priority_level: "low" | "medium" | "high" | "urgent"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      schedule_priority_level: ["low", "medium", "high", "urgent"],
    },
  },
} as const
