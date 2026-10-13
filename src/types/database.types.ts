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
          ordering_verification_mode: string
          payment_methods: string[]
          payment_methods_public: boolean
          phone: string | null
          phone_public: boolean
          plan_override: string | null
          postal_code: string | null
          province: string | null
          qr_bg_color: string | null
          qr_fg_color: string | null
          reservation_cancellation_cutoff_minutes: number
          reservation_capacity: number | null
          reservation_confirmation_mode: string
          reservation_duration_minutes: number
          reservation_horizon_days: number
          reservation_min_notice_minutes: number
          reservation_notification_emails: string[]
          reservation_overbooking_form: string
          reservation_pacing_max_bookings: number | null
          reservation_pacing_max_covers: number | null
          reservation_pacing_slot_minutes: number
          reservation_privacy_contact_email: string | null
          reservation_reminder_enabled: boolean
          services: string[]
          services_public: boolean
          slug: string
          status: string
          street_number: string | null
          sunmi_shop_id: number | null
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
          ordering_verification_mode?: string
          payment_methods?: string[]
          payment_methods_public?: boolean
          phone?: string | null
          phone_public?: boolean
          plan_override?: string | null
          postal_code?: string | null
          province?: string | null
          qr_bg_color?: string | null
          qr_fg_color?: string | null
          reservation_cancellation_cutoff_minutes?: number
          reservation_capacity?: number | null
          reservation_confirmation_mode?: string
          reservation_duration_minutes?: number
          reservation_horizon_days?: number
          reservation_min_notice_minutes?: number
          reservation_notification_emails?: string[]
          reservation_overbooking_form?: string
          reservation_pacing_max_bookings?: number | null
          reservation_pacing_max_covers?: number | null
          reservation_pacing_slot_minutes?: number
          reservation_privacy_contact_email?: string | null
          reservation_reminder_enabled?: boolean
          services?: string[]
          services_public?: boolean
          slug: string
          status?: string
          street_number?: string | null
          sunmi_shop_id?: number | null
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
          ordering_verification_mode?: string
          payment_methods?: string[]
          payment_methods_public?: boolean
          phone?: string | null
          phone_public?: boolean
          plan_override?: string | null
          postal_code?: string | null
          province?: string | null
          qr_bg_color?: string | null
          qr_fg_color?: string | null
          reservation_cancellation_cutoff_minutes?: number
          reservation_capacity?: number | null
          reservation_confirmation_mode?: string
          reservation_duration_minutes?: number
          reservation_horizon_days?: number
          reservation_min_notice_minutes?: number
          reservation_notification_emails?: string[]
          reservation_overbooking_form?: string
          reservation_pacing_max_bookings?: number | null
          reservation_pacing_max_covers?: number | null
          reservation_pacing_slot_minutes?: number
          reservation_privacy_contact_email?: string | null
          reservation_reminder_enabled?: boolean
          services?: string[]
          services_public?: boolean
          slug?: string
          status?: string
          street_number?: string | null
          sunmi_shop_id?: number | null
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
          mode: string | null
          price_override: number | null
          product_id: string
          updated_at: string
          visible_override: boolean | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          id: string
          mode?: string | null
          price_override?: number | null
          product_id: string
          updated_at?: string
          visible_override?: boolean | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          mode?: string | null
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
      ai_usage_events: {
        Row: {
          cost_nanos_usd: number | null
          created_at: string
          id: string
          model: string
          operation: string
          price_map_version: string | null
          provider: string
          raw_meta: Json | null
          tenant_id: string | null
          unit_kind: string
          units_input: number | null
          units_output: number | null
          units_total: number | null
        }
        Insert: {
          cost_nanos_usd?: number | null
          created_at?: string
          id?: string
          model: string
          operation: string
          price_map_version?: string | null
          provider: string
          raw_meta?: Json | null
          tenant_id?: string | null
          unit_kind: string
          units_input?: number | null
          units_output?: number | null
          units_total?: number | null
        }
        Update: {
          cost_nanos_usd?: number | null
          created_at?: string
          id?: string
          model?: string
          operation?: string
          price_map_version?: string | null
          provider?: string
          raw_meta?: Json | null
          tenant_id?: string | null
          unit_kind?: string
          units_input?: number | null
          units_output?: number | null
          units_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          sort_order: number
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
          sort_order: number
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
          sort_order?: number
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
      crm_account_suggestions: {
        Row: {
          created_at: string
          dismissed_at: string | null
          id: string
          reason: string
          tenant_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          id?: string
          reason: string
          tenant_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          id?: string
          reason?: string
          tenant_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_account_suggestions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_agent_decisions: {
        Row: {
          action: string
          actor: string
          actor_user_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          lead_id: string | null
          payload: Json
          reason: string
          review_notes: string | null
          review_outcome: string | null
          venue_id: string | null
        }
        Insert: {
          action: string
          actor: string
          actor_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          lead_id?: string | null
          payload?: Json
          reason: string
          review_notes?: string | null
          review_outcome?: string | null
          venue_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          actor_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          lead_id?: string | null
          payload?: Json
          reason?: string
          review_notes?: string | null
          review_outcome?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_agent_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_decisions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_agent_draft_messages: {
        Row: {
          chat_id: number
          created_at: string
          draft_id: string
          id: string
          message_id: number
          role: string
          user_id: string | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          draft_id: string
          id?: string
          message_id: number
          role: string
          user_id?: string | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          draft_id?: string
          id?: string
          message_id?: number
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_agent_draft_messages_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "crm_agent_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_draft_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_team_members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_agent_drafts: {
        Row: {
          appointment_id: string | null
          contact_id: string | null
          cost_usd: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_id: string | null
          final_text: string | null
          follow_up_number: number | null
          id: string
          kind: string
          last_reminded_at: string | null
          lead_id: string | null
          message_id: string | null
          notified_at: string | null
          proposed_starts_at: string | null
          proposed_text: string | null
          reason: string | null
          reminders: number
          review_notes: string | null
          review_rounds: number
          sent_autonomously: boolean
          status: string
          trigger_message_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          appointment_id?: string | null
          contact_id?: string | null
          cost_usd?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_id?: string | null
          final_text?: string | null
          follow_up_number?: number | null
          id?: string
          kind: string
          last_reminded_at?: string | null
          lead_id?: string | null
          message_id?: string | null
          notified_at?: string | null
          proposed_starts_at?: string | null
          proposed_text?: string | null
          reason?: string | null
          reminders?: number
          review_notes?: string | null
          review_rounds?: number
          sent_autonomously?: boolean
          status?: string
          trigger_message_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          appointment_id?: string | null
          contact_id?: string | null
          cost_usd?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_id?: string | null
          final_text?: string | null
          follow_up_number?: number | null
          id?: string
          kind?: string
          last_reminded_at?: string | null
          lead_id?: string | null
          message_id?: string | null
          notified_at?: string | null
          proposed_starts_at?: string | null
          proposed_text?: string | null
          reason?: string | null
          reminders?: number
          review_notes?: string | null
          review_rounds?: number
          sent_autonomously?: boolean
          status?: string
          trigger_message_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_agent_drafts_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "crm_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_drafts_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "crm_agent_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_drafts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "crm_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_drafts_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "crm_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_drafts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_agent_trust: {
        Row: {
          approved_in_row: number
          autonomous: boolean
          autonomous_since: string | null
          earned_once: boolean
          eligible_notified_at: string | null
          kind: string
          required_in_row: number
          since: string | null
          started_at: string | null
          total_approved: number
          total_auto: number
          total_discarded: number
          total_edited: number
          updated_at: string
        }
        Insert: {
          approved_in_row?: number
          autonomous?: boolean
          autonomous_since?: string | null
          earned_once?: boolean
          eligible_notified_at?: string | null
          kind: string
          required_in_row?: number
          since?: string | null
          started_at?: string | null
          total_approved?: number
          total_auto?: number
          total_discarded?: number
          total_edited?: number
          updated_at?: string
        }
        Update: {
          approved_in_row?: number
          autonomous?: boolean
          autonomous_since?: string | null
          earned_once?: boolean
          eligible_notified_at?: string | null
          kind?: string
          required_in_row?: number
          since?: string | null
          started_at?: string | null
          total_approved?: number
          total_auto?: number
          total_discarded?: number
          total_edited?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_ai_usage: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          cost_usd: number
          created_at: string
          decision_id: string | null
          id: string
          input_tokens: number
          model: string
          ok: boolean
          output_tokens: number
          price_version: string | null
          request_id: string | null
          role: string
          venue_id: string | null
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number
          created_at?: string
          decision_id?: string | null
          id?: string
          input_tokens?: number
          model: string
          ok: boolean
          output_tokens?: number
          price_version?: string | null
          request_id?: string | null
          role: string
          venue_id?: string | null
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number
          created_at?: string
          decision_id?: string | null
          id?: string
          input_tokens?: number
          model?: string
          ok?: boolean
          output_tokens?: number
          price_version?: string | null
          request_id?: string | null
          role?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_ai_usage_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "crm_agent_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ai_usage_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_appointments: {
        Row: {
          brief_sent_at: string | null
          caller_answered_at: string | null
          caller_asked_at: string | null
          caller_reminded_at: string | null
          caller_user_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          creator_asked_at: string | null
          ends_at: string
          google_claimed_at: string | null
          google_error: string | null
          google_event_id: string | null
          google_rev: number
          google_sync: string
          google_synced_at: string | null
          handover_failed_at: string | null
          id: string
          kind: string
          lead_id: string | null
          note: string | null
          outcome_asked_at: string | null
          outcome_at: string | null
          outcome_by: string | null
          reminder_queued_at: string | null
          soon_queued_for: string | null
          starts_at: string
          status: string
          status_reason: string | null
          time_set_at: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          brief_sent_at?: string | null
          caller_answered_at?: string | null
          caller_asked_at?: string | null
          caller_reminded_at?: string | null
          caller_user_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          creator_asked_at?: string | null
          ends_at: string
          google_claimed_at?: string | null
          google_error?: string | null
          google_event_id?: string | null
          google_rev?: number
          google_sync?: string
          google_synced_at?: string | null
          handover_failed_at?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          note?: string | null
          outcome_asked_at?: string | null
          outcome_at?: string | null
          outcome_by?: string | null
          reminder_queued_at?: string | null
          soon_queued_for?: string | null
          starts_at: string
          status: string
          status_reason?: string | null
          time_set_at?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          brief_sent_at?: string | null
          caller_answered_at?: string | null
          caller_asked_at?: string | null
          caller_reminded_at?: string | null
          caller_user_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          creator_asked_at?: string | null
          ends_at?: string
          google_claimed_at?: string | null
          google_error?: string | null
          google_event_id?: string | null
          google_rev?: number
          google_sync?: string
          google_synced_at?: string | null
          handover_failed_at?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          note?: string | null
          outcome_asked_at?: string | null
          outcome_at?: string | null
          outcome_by?: string | null
          reminder_queued_at?: string | null
          soon_queued_for?: string | null
          starts_at?: string
          status?: string
          status_reason?: string | null
          time_set_at?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_appointments_caller_user_id_fkey"
            columns: ["caller_user_id"]
            isOneToOne: false
            referencedRelation: "crm_team_members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_appointments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_brand_rules: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          status: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: string
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: string
          version?: number
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone_e164: string | null
          role: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone_e164?: string | null
          role?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone_e164?: string | null
          role?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          payload: Json
          type: string
          venue_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          type: string
          venue_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          type?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_expense_settlements: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          from_name: string
          id: string
          note: string | null
          settled_on: string
          to_name: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          from_name: string
          id?: string
          note?: string | null
          settled_on: string
          to_name: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          from_name?: string
          id?: string
          note?: string | null
          settled_on?: string
          to_name?: string
        }
        Relationships: []
      }
      crm_expenses: {
        Row: {
          amount_cents: number
          billing_interval: string | null
          cancelled_on: string | null
          category: string
          created_at: string
          created_by: string | null
          first_charge_on: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          paid_by: string | null
          paid_on: string | null
          remind_days_before: number | null
          reminded_for: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          billing_interval?: string | null
          cancelled_on?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          first_charge_on?: string | null
          id?: string
          kind: string
          name: string
          notes?: string | null
          paid_by?: string | null
          paid_on?: string | null
          remind_days_before?: number | null
          reminded_for?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_interval?: string | null
          cancelled_on?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          first_charge_on?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          paid_by?: string | null
          paid_on?: string | null
          remind_days_before?: number | null
          reminded_for?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_gea_inbox: {
        Row: {
          answered_at: string | null
          body: string | null
          chat_id: number
          confirmed_at: string | null
          confirmed_by: string | null
          cost_usd: number
          created_at: string
          error: string | null
          id: string
          intent: string | null
          message_id: number
          pending_command: Json | null
          reply: string | null
          source: string
          status: string
          tool: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          body?: string | null
          chat_id: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          intent?: string | null
          message_id: number
          pending_command?: Json | null
          reply?: string | null
          source: string
          status?: string
          tool?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string | null
          body?: string | null
          chat_id?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          intent?: string | null
          message_id?: number
          pending_command?: Json | null
          reply?: string | null
          source?: string
          status?: string
          tool?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_gea_inbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_team_members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_import_runs: {
        Row: {
          created_at: string
          created_by: string | null
          created_count: number
          duplicate_count: number
          failed_count: number
          id: string
          notified_at: string | null
          returned_count: number
          source: string
          suppressed_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_count: number
          duplicate_count: number
          failed_count: number
          id?: string
          notified_at?: string | null
          returned_count: number
          source: string
          suppressed_count: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          duplicate_count?: number
          failed_count?: number
          id?: string
          notified_at?: string | null
          returned_count?: number
          source?: string
          suppressed_count?: number
        }
        Relationships: []
      }
      crm_imported_refs: {
        Row: {
          imported_at: string
          source: string
          source_ref: string
        }
        Insert: {
          imported_at?: string
          source: string
          source_ref: string
        }
        Update: {
          imported_at?: string
          source?: string
          source_ref?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          campaign: string | null
          consent_at: string | null
          consent_text: string | null
          contact_id: string | null
          contact_name_given: string | null
          created_at: string
          escalated_at: string | null
          form_answers: Json
          id: string
          interests: string[]
          notified_at: string | null
          received_at: string
          source: string
          source_ref: string | null
          venue_id: string
          venue_name_check: string | null
          venue_name_given: string | null
          venue_name_match: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          campaign?: string | null
          consent_at?: string | null
          consent_text?: string | null
          contact_id?: string | null
          contact_name_given?: string | null
          created_at?: string
          escalated_at?: string | null
          form_answers?: Json
          id?: string
          interests?: string[]
          notified_at?: string | null
          received_at?: string
          source: string
          source_ref?: string | null
          venue_id: string
          venue_name_check?: string | null
          venue_name_given?: string | null
          venue_name_match?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          campaign?: string | null
          consent_at?: string | null
          consent_text?: string | null
          contact_id?: string | null
          contact_name_given?: string | null
          created_at?: string
          escalated_at?: string | null
          form_answers?: Json
          id?: string
          interests?: string[]
          notified_at?: string | null
          received_at?: string
          source?: string
          source_ref?: string | null
          venue_id?: string
          venue_name_check?: string | null
          venue_name_given?: string | null
          venue_name_match?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_messages: {
        Row: {
          appointment_id: string | null
          attempts: number
          author: string
          body: string | null
          claimed_at: string | null
          contact_id: string | null
          created_at: string
          decision_id: string | null
          direction: string
          draft_id: string | null
          id: string
          kind: string
          lead_id: string | null
          notified_at: string | null
          purpose: string | null
          send_after: string | null
          sent_at: string | null
          status: string | null
          status_reason: string | null
          venue_id: string
          wa_message_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          author: string
          body?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string
          decision_id?: string | null
          direction: string
          draft_id?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          notified_at?: string | null
          purpose?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string | null
          status_reason?: string | null
          venue_id: string
          wa_message_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          author?: string
          body?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string
          decision_id?: string | null
          direction?: string
          draft_id?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          notified_at?: string | null
          purpose?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string | null
          status_reason?: string | null
          venue_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_messages_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "crm_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "crm_agent_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "crm_agent_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_next_steps: {
        Row: {
          due_on: string | null
          owner_user_id: string | null
          set_at: string
          set_by: string
          snoozed: boolean
          step: string
          venue_id: string
        }
        Insert: {
          due_on?: string | null
          owner_user_id?: string | null
          set_at?: string
          set_by?: string
          snoozed?: boolean
          step: string
          venue_id: string
        }
        Update: {
          due_on?: string | null
          owner_user_id?: string | null
          set_at?: string
          set_by?: string
          snoozed?: boolean
          step?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_next_steps_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_objection_answers: {
        Row: {
          answer: string
          category: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          answer: string
          category: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answer?: string
          category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_objections: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          source: string
          venue_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          source: string
          venue_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          source?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_objections_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_post_sale_actions: {
        Row: {
          alerted_at: string | null
          done_at: string | null
          done_by: string | null
          kind: string
          snoozed_until: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          alerted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          kind: string
          snoozed_until?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          alerted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          kind?: string
          snoozed_until?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_post_sale_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_settings: {
        Row: {
          agent_autonomy_on: boolean
          agent_followups_on: boolean
          agent_reactivation_days: number
          agent_reactivation_message: string | null
          agent_replies_on: boolean
          agent_replies_on_since: string | null
          ai_alert_day: string | null
          ai_alert_month: string | null
          ai_day_cap_usd: number
          ai_model_conversation: string
          ai_model_gea: string
          ai_model_reviewer: string
          ai_model_sensitive: string
          ai_month_cap_usd: number
          brake_changed_at: string | null
          brake_changed_by: string | null
          brake_on: boolean
          brake_reason: string | null
          brake_source: string
          call_confirm_message: string | null
          call_duration_minutes: number
          call_min_notice_minutes: number
          call_reminder_message: string | null
          call_soon_message: string | null
          call_windows: Json
          google_calendar_id: string | null
          id: boolean
          summary_mail_week: string | null
          telegram_bot_username: string | null
          updated_at: string
          wa_first_message: string | null
          wa_test_numbers: string[]
          wa_test_only: boolean
          whatsapp_template: string | null
        }
        Insert: {
          agent_autonomy_on?: boolean
          agent_followups_on?: boolean
          agent_reactivation_days?: number
          agent_reactivation_message?: string | null
          agent_replies_on?: boolean
          agent_replies_on_since?: string | null
          ai_alert_day?: string | null
          ai_alert_month?: string | null
          ai_day_cap_usd?: number
          ai_model_conversation?: string
          ai_model_gea?: string
          ai_model_reviewer?: string
          ai_model_sensitive?: string
          ai_month_cap_usd?: number
          brake_changed_at?: string | null
          brake_changed_by?: string | null
          brake_on?: boolean
          brake_reason?: string | null
          brake_source?: string
          call_confirm_message?: string | null
          call_duration_minutes?: number
          call_min_notice_minutes?: number
          call_reminder_message?: string | null
          call_soon_message?: string | null
          call_windows?: Json
          google_calendar_id?: string | null
          id?: boolean
          summary_mail_week?: string | null
          telegram_bot_username?: string | null
          updated_at?: string
          wa_first_message?: string | null
          wa_test_numbers?: string[]
          wa_test_only?: boolean
          whatsapp_template?: string | null
        }
        Update: {
          agent_autonomy_on?: boolean
          agent_followups_on?: boolean
          agent_reactivation_days?: number
          agent_reactivation_message?: string | null
          agent_replies_on?: boolean
          agent_replies_on_since?: string | null
          ai_alert_day?: string | null
          ai_alert_month?: string | null
          ai_day_cap_usd?: number
          ai_model_conversation?: string
          ai_model_gea?: string
          ai_model_reviewer?: string
          ai_model_sensitive?: string
          ai_month_cap_usd?: number
          brake_changed_at?: string | null
          brake_changed_by?: string | null
          brake_on?: boolean
          brake_reason?: string | null
          brake_source?: string
          call_confirm_message?: string | null
          call_duration_minutes?: number
          call_min_notice_minutes?: number
          call_reminder_message?: string | null
          call_soon_message?: string | null
          call_windows?: Json
          google_calendar_id?: string | null
          id?: boolean
          summary_mail_week?: string | null
          telegram_bot_username?: string | null
          updated_at?: string
          wa_first_message?: string | null
          wa_test_numbers?: string[]
          wa_test_only?: boolean
          whatsapp_template?: string | null
        }
        Relationships: []
      }
      crm_suppressions: {
        Row: {
          created_at: string
          phone_fingerprint: string
        }
        Insert: {
          created_at?: string
          phone_fingerprint: string
        }
        Update: {
          created_at?: string
          phone_fingerprint?: string
        }
        Relationships: []
      }
      crm_team_members: {
        Row: {
          created_at: string
          display_name: string
          is_default_assignee: boolean
          receives_escalations: boolean
          telegram_chat_id: number | null
          telegram_link_expires_at: string | null
          telegram_link_token: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          is_default_assignee?: boolean
          receives_escalations?: boolean
          telegram_chat_id?: number | null
          telegram_link_expires_at?: string | null
          telegram_link_token?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          is_default_assignee?: boolean
          receives_escalations?: boolean
          telegram_chat_id?: number | null
          telegram_link_expires_at?: string | null
          telegram_link_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      crm_telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          id: string
          kind: string
          lead_id: string
          message_id: number | null
          user_id: string
          venue_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          message_id?: number | null
          user_id: string
          venue_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          message_id?: number | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_telegram_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_telegram_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_team_members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_telegram_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "crm_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_venues: {
        Row: {
          account_state: string | null
          agent_hold_at: string | null
          agent_hold_by: string | null
          assigned_to: string | null
          city: string | null
          created_at: string
          first_contacted_at: string | null
          id: string
          last_activity_at: string
          link_source: string | null
          lost_kind: string | null
          lost_reason: string | null
          name: string
          name_pending: boolean
          name_to_verify: string | null
          referred_by: string | null
          stage: string
          stage_changed_at: string
          stage_lock_note: string | null
          stage_locked_at: string | null
          stage_locked_by: string | null
          tenant_id: string | null
          trial_ends_at: string | null
          trial_kind: string | null
          updated_at: string
        }
        Insert: {
          account_state?: string | null
          agent_hold_at?: string | null
          agent_hold_by?: string | null
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          first_contacted_at?: string | null
          id?: string
          last_activity_at?: string
          link_source?: string | null
          lost_kind?: string | null
          lost_reason?: string | null
          name: string
          name_pending?: boolean
          name_to_verify?: string | null
          referred_by?: string | null
          stage?: string
          stage_changed_at?: string
          stage_lock_note?: string | null
          stage_locked_at?: string | null
          stage_locked_by?: string | null
          tenant_id?: string | null
          trial_ends_at?: string | null
          trial_kind?: string | null
          updated_at?: string
        }
        Update: {
          account_state?: string | null
          agent_hold_at?: string | null
          agent_hold_by?: string | null
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          first_contacted_at?: string | null
          id?: string
          last_activity_at?: string
          link_source?: string | null
          lost_kind?: string | null
          lost_reason?: string | null
          name?: string
          name_pending?: boolean
          name_to_verify?: string | null
          referred_by?: string | null
          stage?: string
          stage_changed_at?: string
          stage_lock_note?: string | null
          stage_locked_at?: string | null
          stage_locked_by?: string | null
          tenant_id?: string | null
          trial_ends_at?: string | null
          trial_kind?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_venues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "crm_team_members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_wa_channel: {
        Row: {
          alert_pending: string | null
          failures_in_row: number
          id: boolean
          last_heartbeat_at: string | null
          next_send_at: string | null
          silent_alerted_at: string | null
          updated_at: string
          wa_state: string
          wa_state_at: string | null
          wa_state_detail: string | null
          worker_version: string | null
        }
        Insert: {
          alert_pending?: string | null
          failures_in_row?: number
          id?: boolean
          last_heartbeat_at?: string | null
          next_send_at?: string | null
          silent_alerted_at?: string | null
          updated_at?: string
          wa_state?: string
          wa_state_at?: string | null
          wa_state_detail?: string | null
          worker_version?: string | null
        }
        Update: {
          alert_pending?: string | null
          failures_in_row?: number
          id?: boolean
          last_heartbeat_at?: string | null
          next_send_at?: string | null
          silent_alerted_at?: string | null
          updated_at?: string
          wa_state?: string
          wa_state_at?: string | null
          wa_state_detail?: string | null
          worker_version?: string | null
        }
        Relationships: []
      }
      crm_weekly_goals: {
        Row: {
          calls_target: number
          set_at: string
          set_by: string
          week_start: string
        }
        Insert: {
          calls_target: number
          set_at?: string
          set_by?: string
          week_start: string
        }
        Update: {
          calls_target?: number
          set_at?: string
          set_by?: string
          week_start?: string
        }
        Relationships: []
      }
      customer_invoices: {
        Row: {
          address: string | null
          amount_cents: number
          billing_interval: string | null
          city: string | null
          codice_destinatario: string | null
          country: string | null
          created_at: string
          currency: string
          first_name: string | null
          fiscal_code: string | null
          id: string
          last_name: string | null
          legal_entity_type: string | null
          legal_name: string | null
          paid_at: string
          pec: string | null
          plan_code: string | null
          postal_code: string | null
          province: string | null
          seats: number | null
          status: string
          street_number: string | null
          stripe_customer_id: string
          stripe_hosted_invoice_url: string | null
          stripe_invoice_id: string
          stripe_invoice_number: string | null
          stripe_invoice_pdf: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          amount_cents: number
          billing_interval?: string | null
          city?: string | null
          codice_destinatario?: string | null
          country?: string | null
          created_at?: string
          currency: string
          first_name?: string | null
          fiscal_code?: string | null
          id?: string
          last_name?: string | null
          legal_entity_type?: string | null
          legal_name?: string | null
          paid_at: string
          pec?: string | null
          plan_code?: string | null
          postal_code?: string | null
          province?: string | null
          seats?: number | null
          status?: string
          street_number?: string | null
          stripe_customer_id: string
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id: string
          stripe_invoice_number?: string | null
          stripe_invoice_pdf?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          amount_cents?: number
          billing_interval?: string | null
          city?: string | null
          codice_destinatario?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          first_name?: string | null
          fiscal_code?: string | null
          id?: string
          last_name?: string | null
          legal_entity_type?: string | null
          legal_name?: string | null
          paid_at?: string
          pec?: string | null
          plan_code?: string | null
          postal_code?: string | null
          province?: string | null
          seats?: number | null
          status?: string
          street_number?: string | null
          stripe_customer_id?: string
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string
          stripe_invoice_number?: string | null
          stripe_invoice_pdf?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          vat_number?: string | null
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
          waiter_called_at: string | null
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
          waiter_called_at?: string | null
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
          waiter_called_at?: string | null
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
      disposable_domains: {
        Row: {
          domain: string
        }
        Insert: {
          domain: string
        }
        Update: {
          domain?: string
        }
        Relationships: []
      }
      featured_content_positions: {
        Row: {
          activity_id: string
          featured_content_id: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          featured_content_id: string
          position: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          featured_content_id?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_content_positions_activity_fkey"
            columns: ["activity_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "featured_content_positions_featured_content_id_fkey"
            columns: ["featured_content_id"]
            isOneToOne: false
            referencedRelation: "featured_contents"
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
          cta_action: string
          cta_text_hash: string | null
          cta_url: string | null
          description: string | null
          description_hash: string | null
          id: string
          internal_name: string
          layout_style: string | null
          media_aspect_ratio: number | null
          media_fill_color: string | null
          media_fill_mode: string
          media_focal_x: number
          media_focal_y: number
          media_id: string | null
          media_zoom: number
          pricing_mode: string
          show_original_total: boolean
          shown_date_from: string | null
          shown_date_kind: string | null
          shown_date_to: string | null
          shown_time_from: string | null
          shown_time_to: string | null
          shown_weekdays: number[] | null
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
          cta_action?: string
          cta_text_hash?: string | null
          cta_url?: string | null
          description?: string | null
          description_hash?: string | null
          id?: string
          internal_name: string
          layout_style?: string | null
          media_aspect_ratio?: number | null
          media_fill_color?: string | null
          media_fill_mode?: string
          media_focal_x?: number
          media_focal_y?: number
          media_id?: string | null
          media_zoom?: number
          pricing_mode?: string
          show_original_total?: boolean
          shown_date_from?: string | null
          shown_date_kind?: string | null
          shown_date_to?: string | null
          shown_time_from?: string | null
          shown_time_to?: string | null
          shown_weekdays?: number[] | null
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
          cta_action?: string
          cta_text_hash?: string | null
          cta_url?: string | null
          description?: string | null
          description_hash?: string | null
          id?: string
          internal_name?: string
          layout_style?: string | null
          media_aspect_ratio?: number | null
          media_fill_color?: string | null
          media_fill_mode?: string
          media_focal_x?: number
          media_focal_y?: number
          media_id?: string | null
          media_zoom?: number
          pricing_mode?: string
          show_original_total?: boolean
          shown_date_from?: string | null
          shown_date_kind?: string | null
          shown_date_to?: string | null
          shown_time_from?: string | null
          shown_time_to?: string | null
          shown_weekdays?: number[] | null
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
          default_unit: string | null
          id: string
          name: string
          name_hash: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          default_unit?: string | null
          id?: string
          name: string
          name_hash?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          default_unit?: string | null
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
      leads: {
        Row: {
          consent_at: string
          consent_text: string | null
          created_at: string
          email: string | null
          id: string
          interests: string[]
          ip_hash: string | null
          landing_path: string | null
          name: string
          notes: string | null
          phone: string
          referrer: string | null
          status: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variant: string | null
          venue_name: string
        }
        Insert: {
          consent_at: string
          consent_text?: string | null
          created_at?: string
          email?: string | null
          id?: string
          interests?: string[]
          ip_hash?: string | null
          landing_path?: string | null
          name: string
          notes?: string | null
          phone: string
          referrer?: string | null
          status?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant?: string | null
          venue_name: string
        }
        Update: {
          consent_at?: string
          consent_text?: string | null
          created_at?: string
          email?: string | null
          id?: string
          interests?: string[]
          ip_hash?: string | null
          landing_path?: string | null
          name?: string
          notes?: string | null
          phone?: string
          referrer?: string | null
          status?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant?: string | null
          venue_name?: string
        }
        Relationships: []
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
          seating_id: string | null
          status: string
          table_id: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          activity_id: string
          closed_at?: string | null
          created_at?: string
          id?: string
          seating_id?: string | null
          status?: string
          table_id: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          activity_id?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          seating_id?: string | null
          status?: string
          table_id?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
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
            foreignKeyName: "order_groups_seating_id_fkey"
            columns: ["seating_id"]
            isOneToOne: false
            referencedRelation: "seatings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_groups_seating_id_fkey"
            columns: ["seating_id"]
            isOneToOne: false
            referencedRelation: "v_seatings_with_state"
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
      order_idempotency_keys: {
        Row: {
          created_at: string
          customer_session_id: string
          id: string
          idempotency_key: string
          order_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_session_id: string
          id?: string
          idempotency_key: string
          order_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_session_id?: string
          id?: string
          idempotency_key?: string
          order_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_idempotency_keys_customer_session_id_fkey"
            columns: ["customer_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_idempotency_keys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_idempotency_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          item_notes: string | null
          line_total: number
          options_snapshot: Json
          order_id: string
          parent_order_item_id: string | null
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          item_notes?: string | null
          line_total: number
          options_snapshot?: Json
          order_id: string
          parent_order_item_id?: string | null
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          item_notes?: string | null
          line_total?: number
          options_snapshot?: Json
          order_id?: string
          parent_order_item_id?: string | null
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
            foreignKeyName: "order_items_parent_order_item_id_fkey"
            columns: ["parent_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
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
          created_by_user_id: string | null
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
          created_by_user_id?: string | null
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
          created_by_user_id?: string | null
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
      plan_prices: {
        Row: {
          billing_interval: string
          created_at: string
          id: string
          plan_code: string
          price_cents: number
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          billing_interval: string
          created_at?: string
          id?: string
          plan_code: string
          price_cents: number
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          id?: string
          plan_code?: string
          price_cents?: number
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      plans: {
        Row: {
          ai_quota_nanos_usd_per_seat: number | null
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
        }
        Insert: {
          ai_quota_nanos_usd_per_seat?: number | null
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
        }
        Update: {
          ai_quota_nanos_usd_per_seat?: number | null
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
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      print_jobs: {
        Row: {
          activity_id: string
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          order_id: string
          printer_id: string
          processed_at: string | null
          status: string
          tenant_id: string
          trade_no: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          order_id: string
          printer_id: string
          processed_at?: string | null
          status?: string
          tenant_id: string
          trade_no: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          order_id?: string
          printer_id?: string
          processed_at?: string | null
          status?: string
          tenant_id?: string
          trade_no?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_reprints: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          last_error: string | null
          order_id: string
          printer_id: string
          requested_by: string | null
          status: string
          tenant_id: string
          trade_no: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          order_id: string
          printer_id: string
          requested_by?: string | null
          status: string
          tenant_id: string
          trade_no: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          order_id?: string
          printer_id?: string
          requested_by?: string | null
          status?: string
          tenant_id?: string
          trade_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_reprints_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_reprints_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_reprints_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_reprints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          is_active: boolean
          is_online: boolean | null
          label: string
          lack_paper_count: number | null
          last_online_at: string | null
          last_status_at: string | null
          out_of_paper: boolean
          paper_will_end_count: number | null
          sn: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_online?: boolean | null
          label: string
          lack_paper_count?: number | null
          last_online_at?: string | null
          last_status_at?: string | null
          out_of_paper?: boolean
          paper_will_end_count?: number | null
          sn: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_online?: boolean | null
          label?: string
          lack_paper_count?: number | null
          last_online_at?: string | null
          last_status_at?: string | null
          out_of_paper?: boolean
          paper_will_end_count?: number | null
          sn?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printers_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          quantity: number | null
          sort_order: number
          tenant_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          ingredient_id: string
          product_id: string
          quantity?: number | null
          sort_order?: number
          tenant_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number | null
          sort_order?: number
          tenant_id?: string
          unit?: string | null
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
      product_pairings: {
        Row: {
          created_at: string
          id: string
          note: string | null
          paired_product_id: string
          product_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          paired_product_id: string
          product_id: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          paired_product_id?: string
          product_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pairings_paired_product_id_fkey"
            columns: ["paired_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pairings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pairings_tenant_id_fkey"
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
          image_aspect_ratio: number | null
          image_framing: Json | null
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
          image_aspect_ratio?: number | null
          image_framing?: Json | null
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
          image_aspect_ratio?: number | null
          image_framing?: Json | null
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
      reservation_guest_notes: {
        Row: {
          activity_id: string
          created_at: string
          guest_id: string
          id: string
          notes: string | null
          tags: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          guest_id: string
          id?: string
          notes?: string | null
          tags?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          guest_id?: string
          id?: string
          notes?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_guest_notes_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "reservation_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guest_stats"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "reservation_guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guests_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_guest_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_guests: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          phone_e164: string
          tags: string[]
          tenant_id: string
          updated_at: string
          venue_notes: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          phone_e164: string
          tags?: string[]
          tenant_id: string
          updated_at?: string
          venue_notes?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone_e164?: string
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          venue_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_guests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_reminder_runs: {
        Row: {
          candidates: number
          created_at: string
          errors: Json
          failed: number
          finished_at: string | null
          id: string
          sent: number
          skipped: Json
          started_at: string
          target_date: string
          trigger_source: string
        }
        Insert: {
          candidates?: number
          created_at?: string
          errors?: Json
          failed?: number
          finished_at?: string | null
          id?: string
          sent?: number
          skipped?: Json
          started_at?: string
          target_date: string
          trigger_source: string
        }
        Update: {
          candidates?: number
          created_at?: string
          errors?: Json
          failed?: number
          finished_at?: string | null
          id?: string
          sent?: number
          skipped?: Json
          started_at?: string
          target_date?: string
          trigger_source?: string
        }
        Relationships: []
      }
      reservation_tables: {
        Row: {
          activity_id: string
          assigned_at: string
          assignment_source: string
          created_at: string
          id: string
          reservation_id: string
          table_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          assigned_at?: string
          assignment_source?: string
          created_at?: string
          id?: string
          reservation_id: string
          table_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          assigned_at?: string
          assignment_source?: string
          created_at?: string
          id?: string
          reservation_id?: string
          table_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_tables_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_tables_reservation_fkey"
            columns: ["reservation_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "reservation_tables_reservation_fkey"
            columns: ["reservation_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guest_visits"
            referencedColumns: ["reservation_id", "activity_id"]
          },
          {
            foreignKeyName: "reservation_tables_table_fkey"
            columns: ["table_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "reservation_tables_table_fkey"
            columns: ["table_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "v_tables_with_state"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "reservation_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          activity_id: string
          allergies: string | null
          allergies_consent_at: string | null
          allergies_consent_version: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string | null
          customer_email: string
          customer_language: string | null
          customer_name: string
          customer_phone: string
          customer_phone_digits: string | null
          customer_phone_e164: string | null
          guest_confirmed_at: string | null
          guest_id: string | null
          ics_sequence: number
          id: string
          notes: string | null
          party_size: number
          reminder_attempts: number
          reminder_failed_at: string | null
          reminder_last_error: string | null
          reminder_sent_at: string | null
          reservation_date: string
          reservation_time: string
          seated_at: string | null
          source: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          allergies?: string | null
          allergies_consent_at?: string | null
          allergies_consent_version?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_email: string
          customer_language?: string | null
          customer_name: string
          customer_phone: string
          customer_phone_digits?: string | null
          customer_phone_e164?: string | null
          guest_confirmed_at?: string | null
          guest_id?: string | null
          ics_sequence?: number
          id?: string
          notes?: string | null
          party_size: number
          reminder_attempts?: number
          reminder_failed_at?: string | null
          reminder_last_error?: string | null
          reminder_sent_at?: string | null
          reservation_date: string
          reservation_time: string
          seated_at?: string | null
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          allergies?: string | null
          allergies_consent_at?: string | null
          allergies_consent_version?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_email?: string
          customer_language?: string | null
          customer_name?: string
          customer_phone?: string
          customer_phone_digits?: string | null
          customer_phone_e164?: string | null
          guest_confirmed_at?: string | null
          guest_id?: string | null
          ics_sequence?: number
          id?: string
          notes?: string | null
          party_size?: number
          reminder_attempts?: number
          reminder_failed_at?: string | null
          reminder_last_error?: string | null
          reminder_sent_at?: string | null
          reservation_date?: string
          reservation_time?: string
          seated_at?: string | null
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
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "reservation_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guest_stats"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guests_directory"
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
            isOneToOne: true
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
      schedule_menu: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          schedule_id: string
          tenant_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          schedule_id: string
          tenant_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          schedule_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_menu_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_menu_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "schedules"
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
      schedule_slot_targets: {
        Row: {
          created_at: string
          schedule_id: string
          schedule_target_id: string
          slot_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          schedule_id: string
          schedule_target_id: string
          slot_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          schedule_id?: string
          schedule_target_id?: string
          slot_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slot_targets_slot_fkey"
            columns: ["slot_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id", "schedule_id"]
          },
          {
            foreignKeyName: "schedule_slot_targets_target_fkey"
            columns: ["schedule_target_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "schedule_targets"
            referencedColumns: ["id", "schedule_id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          created_at: string
          days_of_week: number[] | null
          end_minute: number
          id: string
          schedule_id: string
          sort_order: number
          start_minute: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[] | null
          end_minute: number
          id?: string
          schedule_id: string
          sort_order?: number
          start_minute: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[] | null
          end_minute?: number
          id?: string
          schedule_id?: string
          sort_order?: number
          start_minute?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_style: {
        Row: {
          created_at: string
          id: string
          schedule_id: string
          style_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          schedule_id: string
          style_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          schedule_id?: string
          style_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_style_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_style_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_targets: {
        Row: {
          created_at: string
          id: string
          overlap_mode: string | null
          schedule_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          overlap_mode?: string | null
          schedule_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          overlap_mode?: string | null
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
          on_air_since: string
          overlap_mode: string | null
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
          on_air_since?: string
          overlap_mode?: string | null
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
          on_air_since?: string
          overlap_mode?: string | null
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
      seating_reservations: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          reservation_id: string
          seating_id: string
          tenant_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          reservation_id: string
          seating_id: string
          tenant_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          reservation_id?: string
          seating_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seating_reservations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seating_reservations_reservation_fkey"
            columns: ["reservation_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_reservations_reservation_fkey"
            columns: ["reservation_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guest_visits"
            referencedColumns: ["reservation_id", "activity_id"]
          },
          {
            foreignKeyName: "seating_reservations_seating_fkey"
            columns: ["seating_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "seatings"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_reservations_seating_fkey"
            columns: ["seating_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "v_seatings_with_state"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seating_tables: {
        Row: {
          activity_id: string
          assigned_at: string
          created_at: string
          id: string
          seating_id: string
          table_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          assigned_at?: string
          created_at?: string
          id?: string
          seating_id: string
          table_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          assigned_at?: string
          created_at?: string
          id?: string
          seating_id?: string
          table_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seating_tables_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seating_tables_seating_fkey"
            columns: ["seating_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "seatings"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_tables_seating_fkey"
            columns: ["seating_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "v_seatings_with_state"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_tables_table_fkey"
            columns: ["table_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_tables_table_fkey"
            columns: ["table_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "v_tables_with_state"
            referencedColumns: ["id", "activity_id"]
          },
          {
            foreignKeyName: "seating_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seatings: {
        Row: {
          activity_id: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_user_id: string | null
          party_size: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_user_id?: string | null
          party_size?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_user_id?: string | null
          party_size?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seatings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seatings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_reminders: {
        Row: {
          sent_at: string
          user_id: string
        }
        Insert: {
          sent_at?: string
          user_id: string
        }
        Update: {
          sent_at?: string
          user_id?: string
        }
        Relationships: []
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
      stories: {
        Row: {
          activity_id: string | null
          body_blocks: Json
          cover_media: string | null
          created_at: string
          eyebrow: string | null
          id: string
          product_id: string | null
          sort_order: number
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          body_blocks?: Json
          cover_media?: string | null
          created_at?: string
          eyebrow?: string | null
          id?: string
          product_id?: string | null
          sort_order?: number
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          body_blocks?: Json
          cover_media?: string | null
          created_at?: string
          eyebrow?: string | null
          id?: string
          product_id?: string | null
          sort_order?: number
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_activity_id_tenant_id_fkey"
            columns: ["activity_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "stories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_processed_events: {
        Row: {
          completed_at: string | null
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          completed_at?: string | null
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          completed_at?: string | null
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
      sunmi_callback_events: {
        Row: {
          completed_at: string | null
          created_at: string
          notify_type: string
          sn: string
          sunmi_nonce: string
          sunmi_timestamp: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          notify_type: string
          sn: string
          sunmi_nonce: string
          sunmi_timestamp: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          notify_type?: string
          sn?: string
          sunmi_nonce?: string
          sunmi_timestamp?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          author_kind: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_kind: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_kind?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          activity_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_last_read_at: string | null
          id: string
          last_message_at: string
          last_message_kind: string | null
          status: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_last_read_at?: string | null
          id?: string
          last_message_at?: string
          last_message_kind?: string | null
          status?: string
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_last_read_at?: string | null
          id?: string
          last_message_at?: string
          last_message_kind?: string | null
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
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
      table_combination_groups: {
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
            foreignKeyName: "table_combination_groups_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_combination_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          assignment_priority: number
          bookable_online: boolean
          combination_group_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          maintenance_mode: boolean
          max_seats: number | null
          min_seats: number | null
          qr_token: string
          seats: number | null
          tenant_id: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          activity_id: string
          assignment_priority?: number
          bookable_online?: boolean
          combination_group_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          maintenance_mode?: boolean
          max_seats?: number | null
          min_seats?: number | null
          qr_token?: string
          seats?: number | null
          tenant_id: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          activity_id?: string
          assignment_priority?: number
          bookable_online?: boolean
          combination_group_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          maintenance_mode?: boolean
          max_seats?: number | null
          min_seats?: number | null
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
            foreignKeyName: "tables_combination_group_id_fkey"
            columns: ["combination_group_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "table_combination_groups"
            referencedColumns: ["id", "activity_id"]
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
          billing_interval: string | null
          business_subtype: string | null
          city: string | null
          codice_destinatario: string | null
          country: string | null
          created_at: string
          creation_idempotency_key: string | null
          current_period_end: string | null
          current_period_start: string | null
          deleted_at: string | null
          first_name: string | null
          fiscal_code: string | null
          id: string
          is_founder: boolean
          last_name: string | null
          legacy_price_id: string | null
          legal_entity_type: string | null
          legal_name: string | null
          locked_at: string | null
          logo_url: string | null
          name: string
          owner_user_id: string
          paid_seats: number
          pec: string | null
          plan: string
          plan_monthly_value_cents: number | null
          postal_code: string | null
          province: string | null
          rea_code: string | null
          story_cover: string | null
          story_intro: string | null
          story_title: string | null
          street_number: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          subscription_status_event_at: string | null
          translate_categories: boolean
          translate_ingredients: boolean
          translate_options: boolean
          trial_until: string | null
          vat_number: string | null
          vertical_type: string
          website: string | null
        }
        Insert: {
          address?: string | null
          applied_promo_code?: string | null
          ateco?: string | null
          base_language_code?: string
          billing_interval?: string | null
          business_subtype?: string | null
          city?: string | null
          codice_destinatario?: string | null
          country?: string | null
          created_at?: string
          creation_idempotency_key?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          deleted_at?: string | null
          first_name?: string | null
          fiscal_code?: string | null
          id?: string
          is_founder?: boolean
          last_name?: string | null
          legacy_price_id?: string | null
          legal_entity_type?: string | null
          legal_name?: string | null
          locked_at?: string | null
          logo_url?: string | null
          name: string
          owner_user_id: string
          paid_seats?: number
          pec?: string | null
          plan?: string
          plan_monthly_value_cents?: number | null
          postal_code?: string | null
          province?: string | null
          rea_code?: string | null
          story_cover?: string | null
          story_intro?: string | null
          story_title?: string | null
          street_number?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_status_event_at?: string | null
          translate_categories?: boolean
          translate_ingredients?: boolean
          translate_options?: boolean
          trial_until?: string | null
          vat_number?: string | null
          vertical_type?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          applied_promo_code?: string | null
          ateco?: string | null
          base_language_code?: string
          billing_interval?: string | null
          business_subtype?: string | null
          city?: string | null
          codice_destinatario?: string | null
          country?: string | null
          created_at?: string
          creation_idempotency_key?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          deleted_at?: string | null
          first_name?: string | null
          fiscal_code?: string | null
          id?: string
          is_founder?: boolean
          last_name?: string | null
          legacy_price_id?: string | null
          legal_entity_type?: string | null
          legal_name?: string | null
          locked_at?: string | null
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          paid_seats?: number
          pec?: string | null
          plan?: string
          plan_monthly_value_cents?: number | null
          postal_code?: string | null
          province?: string | null
          rea_code?: string | null
          story_cover?: string | null
          story_intro?: string | null
          story_title?: string | null
          street_number?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_status_event_at?: string | null
          translate_categories?: boolean
          translate_ingredients?: boolean
          translate_options?: boolean
          trial_until?: string | null
          vat_number?: string | null
          vertical_type?: string
          website?: string | null
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
          claimed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          last_error: string | null
          processed_at: string | null
          run_after: string
          source_hash: string
          source_text: string
          status: string
          target_language_code: string
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          run_after?: string
          source_hash: string
          source_text: string
          status?: string
          target_language_code: string
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          run_after?: string
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
          current_period_end: string | null
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
      v_reservation_guest_stats: {
        Row: {
          first_visit_date: string | null
          guest_id: string | null
          last_visit_date: string | null
          tenant_id: string | null
          visible_activities: number | null
          visible_cancelled: number | null
          visible_confirmed: number | null
          visible_no_shows: number | null
          visible_visits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_guests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_reservation_guest_visits: {
        Row: {
          activity_id: string | null
          activity_name: string | null
          created_at: string | null
          guest_id: string | null
          guest_notes: string | null
          party_size: number | null
          reservation_date: string | null
          reservation_id: string | null
          reservation_time: string | null
          source: string | null
          status: string | null
          tenant_id: string | null
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
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "reservation_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guest_stats"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_guests_directory"
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
      v_reservation_guests_directory: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          first_visit_date: string | null
          id: string | null
          last_visit_date: string | null
          phone_e164: string | null
          tags: string[] | null
          tenant_id: string | null
          updated_at: string | null
          venue_notes: string | null
          visible_activities: number | null
          visible_no_shows: number | null
          visible_visits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_guests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_seatings_with_state: {
        Row: {
          activity_id: string | null
          closed_at: string | null
          closed_reason: string | null
          id: string | null
          opened_at: string | null
          opened_by_user_id: string | null
          party_size: number | null
          pending_orders_count: number | null
          pending_orders_deliverable: boolean | null
          reservations: Json | null
          status: string | null
          tables: Json | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seatings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seatings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tables_with_state: {
        Row: {
          active_orders: Json | null
          active_sessions_count: number | null
          activity_id: string | null
          assignment_priority: number | null
          bill_requested_count: number | null
          bookable_online: boolean | null
          combination_group_id: string | null
          combination_group_name: string | null
          created_at: string | null
          current_total: number | null
          deleted_at: string | null
          id: string | null
          label: string | null
          maintenance_mode: boolean | null
          max_seats: number | null
          min_seats: number | null
          open_groups_count: number | null
          open_orders_count: number | null
          pending_orders_count: number | null
          qr_token: string | null
          seats: number | null
          session_opened_at: string | null
          tenant_id: string | null
          updated_at: string | null
          waiter_called_count: number | null
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
            foreignKeyName: "tables_combination_group_id_fkey"
            columns: ["combination_group_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "table_combination_groups"
            referencedColumns: ["id", "activity_id"]
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
      _close_order_group_unchecked: {
        Args: {
          p_action: string
          p_cancellation_reason: string
          p_group_id: string
        }
        Returns: Json
      }
      _close_seating_unchecked: {
        Args: { p_reason: string; p_seating_id: string }
        Returns: {
          activity_id: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_user_id: string | null
          party_size: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seatings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _open_seating_for_table_unchecked: {
        Args: { p_activity_id: string; p_table_id: string; p_tenant_id: string }
        Returns: string
      }
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
      analytics_orders_conversion: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          conversion_rate: number
          orders_count: number
          selection_sessions: number
        }[]
      }
      analytics_orders_hourly: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          hour: number
          orders_count: number
          revenue: number
        }[]
      }
      analytics_orders_latency: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          avg_delivery_seconds: number
          avg_prep_seconds: number
          avg_total_seconds: number
          delivered_count: number
          median_delivery_seconds: number
          median_prep_seconds: number
          median_total_seconds: number
          skipped_ready_count: number
        }[]
      }
      analytics_orders_overview: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          avg_order_value: number
          cancellation_rate: number
          cancelled_count: number
          orders_count: number
          revenue: number
        }[]
      }
      analytics_orders_trend: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_granularity?: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          date: string
          orders_count: number
          revenue: number
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
      analytics_reservations_hourly: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          hour: number
          reservations_count: number
        }[]
      }
      analytics_reservations_overview: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          cancelled_count: number
          confirm_rate: number
          confirmed_count: number
          covers: number
          declined_count: number
          manual_count: number
          online_count: number
          reservations_count: number
        }[]
      }
      analytics_reservations_trend: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_granularity?: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          covers: number
          date: string
          reservations_count: number
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
      analytics_top_ordered_products: {
        Args: {
          p_activity_id?: string
          p_from: string
          p_limit?: number
          p_order_by?: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          product_name: string
          quantity: number
          revenue: number
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
      assign_sunmi_shop_id: { Args: { p_activity_id: string }; Returns: number }
      assign_tables_for_reservation: {
        Args: { p_reservation_id: string }
        Returns: {
          assigned: boolean
          reason: string
          table_id: string
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
      cancel_order_item_atomic: {
        Args: { p_order_id: string; p_order_item_id: string; p_reason: string }
        Returns: Json
      }
      catalog_category_in_tenant: {
        Args: { p_category_id: string; p_tenant_id: string }
        Returns: boolean
      }
      change_member_role: {
        Args: {
          p_activity_ids?: string[]
          p_membership_id: string
          p_new_role: string
        }
        Returns: string
      }
      claim_pending_print_jobs: {
        Args: {
          p_limit: number
          p_max_attempts?: number
          p_reclaim_after_minutes?: number
        }
        Returns: {
          activity_id: string
          attempts: number
          id: string
          kind: string
          order_id: string
          printer_id: string
          tenant_id: string
          trade_no: string
        }[]
      }
      claim_pending_translation_jobs: {
        Args: {
          p_limit: number
          p_max_attempts?: number
          p_reclaim_after_minutes?: number
        }
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
      claim_signup_reminders: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      clear_account_deleted: { Args: { p_user_id: string }; Returns: undefined }
      close_seating: {
        Args: { p_action?: string; p_reason: string; p_seating_id: string }
        Returns: {
          activity_id: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_user_id: string | null
          party_size: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seatings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_stale_seatings: { Args: never; Returns: Json }
      close_table_with_resolution: {
        Args: { p_action: string; p_table_id: string; p_tenant_id: string }
        Returns: Json
      }
      count_tenant_language_backfill: {
        Args: { p_target_lang: string; p_tenant_id: string }
        Returns: number
      }
      create_schedule_with_targets: {
        Args: {
          p_name: string
          p_rule_type: string
          p_targets: Json
          p_tenant_id: string
        }
        Returns: string
      }
      create_support_ticket: {
        Args: {
          p_activity_id: string
          p_first_message: string
          p_subject: string
          p_tenant_id: string
        }
        Returns: {
          activity_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_last_read_at: string | null
          id: string
          last_message_at: string
          last_message_kind: string | null
          status: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crm_add_note: {
        Args: { p_text: string; p_venue_id: string }
        Returns: string
      }
      crm_admin_decide_draft: {
        Args: { p_decision: string; p_draft_id: string; p_text?: string }
        Returns: string
      }
      crm_agenda_begin: { Args: { p_actor_user_id: string }; Returns: string }
      crm_agenda_check_slot: {
        Args: {
          p_allow_overlap: boolean
          p_caller_user_id: string
          p_ends_at: string
          p_exclude_id: string
          p_starts_at: string
        }
        Returns: undefined
      }
      crm_agenda_enqueue_reminders: {
        Args: { p_now?: string }
        Returns: number
      }
      crm_agenda_expire: { Args: { p_now?: string }; Returns: number }
      crm_agenda_has_work: { Args: { p_now?: string }; Returns: boolean }
      crm_agent_actor: { Args: never; Returns: string }
      crm_agent_auto_send: { Args: { p_draft_id: string }; Returns: boolean }
      crm_agent_candidates: {
        Args: { p_limit?: number; p_now?: string }
        Returns: {
          r_follow_ups: number
          r_kind: string
          r_last_in_at: string
          r_last_in_id: string
          r_last_out_at: string
          r_objection: boolean
          r_venue_id: string
        }[]
      }
      crm_agent_decide_draft: {
        Args: {
          p_actor_user_id?: string
          p_decision: string
          p_draft_id: string
          p_text?: string
        }
        Returns: string
      }
      crm_agent_has_work: { Args: { p_now?: string }; Returns: boolean }
      crm_agent_is_night: { Args: { p_at: string }; Returns: boolean }
      crm_agent_mark_stop: {
        Args: { p_actor_user_id?: string; p_reason: string; p_venue_id: string }
        Returns: boolean
      }
      crm_agent_trust_refresh: { Args: never; Returns: undefined }
      crm_ai_gate: {
        Args: { p_role: string }
        Returns: {
          r_allowed: boolean
          r_model: string
          r_reason: string
        }[]
      }
      crm_ai_spend: {
        Args: never
        Returns: {
          r_brake_on: boolean
          r_brake_reason: string
          r_day_cap: number
          r_day_usd: number
          r_month_cap: number
          r_month_usd: number
        }[]
      }
      crm_answer_call: {
        Args: {
          p_accept: boolean
          p_actor_user_id?: string
          p_appointment_id: string
        }
        Returns: string
      }
      crm_approve_brand_rules: {
        Args: { p_actor_user_id?: string; p_version: number }
        Returns: undefined
      }
      crm_assign: {
        Args: {
          p_actor_user_id?: string
          p_user_id: string
          p_venue_id: string
        }
        Returns: boolean
      }
      crm_bind_agent_actor: {
        Args: { p_actor_user_id: string }
        Returns: string
      }
      crm_call_advance_stage: {
        Args: { p_actor_user_id: string; p_stage: string; p_venue_id: string }
        Returns: boolean
      }
      crm_call_ask_creator: {
        Args: { p_actor_user_id?: string; p_appointment_id: string }
        Returns: string
      }
      crm_call_propose_other: {
        Args: {
          p_actor_user_id?: string
          p_appointment_id: string
          p_text: string
        }
        Returns: string
      }
      crm_call_reminder_at: { Args: { p_starts_at: string }; Returns: string }
      crm_call_windows_ok: { Args: { p_windows: Json }; Returns: boolean }
      crm_cancel_call: {
        Args: {
          p_actor_user_id?: string
          p_appointment_id: string
          p_reason?: string
        }
        Returns: boolean
      }
      crm_discard_brand_rules: {
        Args: { p_actor_user_id?: string; p_version: number }
        Returns: undefined
      }
      crm_e164_list_ok: { Args: { p_numbers: string[] }; Returns: boolean }
      crm_expense_charges: {
        Args: { p_until: string }
        Returns: {
          r_amount_cents: number
          r_charged_on: string
          r_expense_id: string
        }[]
      }
      crm_expense_next_charges: {
        Args: { p_today?: string }
        Returns: {
          r_expense_id: string
          r_next_charge_on: string
        }[]
      }
      crm_expense_renewals_due: {
        Args: { p_today?: string }
        Returns: {
          r_amount_cents: number
          r_billing_interval: string
          r_expense_id: string
          r_name: string
          r_next_charge_on: string
          r_paid_by: string
        }[]
      }
      crm_gea_add_note: {
        Args: { p_actor_user_id: string; p_text: string; p_venue_id: string }
        Returns: string
      }
      crm_gea_agenda: { Args: { p_from: string; p_to: string }; Returns: Json }
      crm_gea_claim: { Args: { p_id: string }; Returns: boolean }
      crm_gea_confirm: {
        Args: { p_actor_user_id: string; p_id: string }
        Returns: Json
      }
      crm_gea_diary: { Args: { p_days?: number }; Returns: Json }
      crm_gea_find_venues: { Args: { p_query: string }; Returns: Json }
      crm_gea_finish: {
        Args: {
          p_cost_usd?: number
          p_error?: string
          p_id: string
          p_intent?: string
          p_pending?: Json
          p_reply?: string
          p_status: string
          p_tool?: string
        }
        Returns: boolean
      }
      crm_gea_log: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_payload?: Json
          p_reason: string
          p_venue_id?: string
        }
        Returns: string
      }
      crm_gea_mask: { Args: { p_text: string }; Returns: string }
      crm_gea_pending_drafts: { Args: never; Returns: Json }
      crm_gea_pipeline: { Args: never; Returns: Json }
      crm_gea_receive: {
        Args: {
          p_body: string
          p_chat_id: number
          p_message_id: number
          p_source: string
          p_user_id: string
        }
        Returns: string
      }
      crm_gea_stale: { Args: { p_days?: number }; Returns: Json }
      crm_gea_today: { Args: never; Returns: Json }
      crm_gea_venue_card: { Args: { p_venue_id: string }; Returns: Json }
      crm_gea_venue_chat: { Args: { p_venue_id: string }; Returns: Json }
      crm_handover_call: {
        Args: { p_actor_user_id?: string; p_appointment_id: string }
        Returns: string
      }
      crm_ingest_lead: {
        Args: {
          p_ad_id?: string
          p_ad_name?: string
          p_campaign?: string
          p_city?: string
          p_consent_at?: string
          p_consent_text?: string
          p_email?: string
          p_form_answers?: Json
          p_interests?: string[]
          p_name: string
          p_phone_e164: string
          p_received_at?: string
          p_silent?: boolean
          p_source: string
          p_source_ref: string
          p_venue_name: string
        }
        Returns: {
          r_lead_id: string
          r_outcome: string
          r_venue_id: string
        }[]
      }
      crm_lead_send_gate: {
        Args: { p_channel: string; p_contact_id: string; p_sender: string }
        Returns: {
          r_allowed: boolean
          r_reason: string
        }[]
      }
      crm_link_account: {
        Args: {
          p_actor_user_id?: string
          p_link_source?: string
          p_tenant_id: string
          p_venue_id: string
        }
        Returns: boolean
      }
      crm_log_whatsapp_opened: {
        Args: {
          p_actor_user_id?: string
          p_lead_id?: string
          p_venue_id: string
        }
        Returns: boolean
      }
      crm_move_call: {
        Args: {
          p_actor_user_id?: string
          p_allow_overlap?: boolean
          p_appointment_id: string
          p_caller_user_id: string
          p_duration_minutes: number
          p_starts_at: string
        }
        Returns: boolean
      }
      crm_move_stage: {
        Args: {
          p_actor_user_id?: string
          p_confirm_stop?: boolean
          p_expected_stage?: string
          p_lost_kind?: string
          p_lost_reason?: string
          p_stage: string
          p_venue_id: string
        }
        Returns: boolean
      }
      crm_move_stage_locked: {
        Args: { p_note: string; p_stage: string; p_venue_id: string }
        Returns: boolean
      }
      crm_phone_fingerprint: { Args: { p_phone_e164: string }; Returns: string }
      crm_post_sale_accounts: {
        Args: never
        Returns: {
          activities_published: number
          activities_total: number
          has_live_menu: boolean
          live_menu_since: string
          paid_seats: number
          plan: string
          products_count: number
          tenant_created_at: string
          tenant_id: string
          venue_id: string
        }[]
      }
      crm_propose_brand_rules: {
        Args: { p_actor_user_id?: string; p_body: string; p_note?: string }
        Returns: number
      }
      crm_purge_agent_decisions: {
        Args: { p_cutoff: string; p_dry_run?: boolean }
        Returns: number
      }
      crm_purge_gea_inbox: {
        Args: { p_cutoff: string; p_dry_run?: boolean }
        Returns: number
      }
      crm_purge_messages: {
        Args: { p_cutoff: string; p_dry_run?: boolean }
        Returns: number
      }
      crm_purge_venues: {
        Args: { p_cutoff: string; p_dry_run?: boolean }
        Returns: number
      }
      crm_record_ai_usage: {
        Args: {
          p_cache_read_tokens: number
          p_cache_write_tokens: number
          p_cost_usd: number
          p_decision_id?: string
          p_input_tokens: number
          p_model: string
          p_ok: boolean
          p_output_tokens: number
          p_price_version: string
          p_request_id?: string
          p_role: string
          p_venue_id?: string
        }
        Returns: string
      }
      crm_refresh_name_to_verify: {
        Args: { p_venue_id: string }
        Returns: undefined
      }
      crm_rename_venue: {
        Args: { p_city?: string; p_name: string; p_venue_id: string }
        Returns: undefined
      }
      crm_resolve_venue_name: {
        Args: { p_actor_user_id?: string; p_choice: string; p_lead_id: string }
        Returns: boolean
      }
      crm_schedule_call: {
        Args: {
          p_actor_user_id?: string
          p_allow_overlap?: boolean
          p_caller_user_id: string
          p_duration_minutes: number
          p_note?: string
          p_starts_at: string
          p_venue_id: string
        }
        Returns: string
      }
      crm_set_agent_hold: {
        Args: { p_hold: boolean; p_venue_id: string }
        Returns: boolean
      }
      crm_set_brake: {
        Args: {
          p_actor_user_id?: string
          p_on: boolean
          p_reason?: string
          p_source?: string
        }
        Returns: boolean
      }
      crm_set_call_outcome: {
        Args: {
          p_actor_user_id?: string
          p_appointment_id: string
          p_outcome: string
        }
        Returns: boolean
      }
      crm_set_default_assignee: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      crm_start_telegram_link: {
        Args: { p_display_name: string }
        Returns: string
      }
      crm_summary: { Args: { p_from: string; p_to: string }; Returns: Json }
      crm_sync_account_state: {
        Args: {
          p_account_state: string
          p_trial_ends_at: string
          p_trial_kind: string
          p_venue_id: string
        }
        Returns: boolean
      }
      crm_sync_landing_leads: { Args: never; Returns: number }
      crm_unlink_account: { Args: { p_venue_id: string }; Returns: boolean }
      crm_unlock_stage: { Args: { p_venue_id: string }; Returns: boolean }
      crm_venue_name_match: {
        Args: { p_given: string; p_known: string }
        Returns: string
      }
      crm_wa_cancel_message: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      crm_wa_claim_next: {
        Args: { p_now?: string }
        Returns: {
          r_body: string
          r_contact_name: string
          r_message_id: string
          r_name_pending: boolean
          r_phone: string
          r_purpose: string
          r_reason: string
          r_template: string
          r_venue_id: string
          r_venue_name: string
          r_wait_seconds: number
        }[]
      }
      crm_wa_heartbeat: {
        Args: {
          p_detail?: string
          p_now?: string
          p_state: string
          p_version?: string
        }
        Returns: string
      }
      crm_wa_ingest_chat: {
        Args: { p_messages: Json; p_now?: string; p_phone: string }
        Returns: {
          r_matched: number
          r_new_in: number
          r_new_person: number
          r_status: string
          r_venue_id: string
        }[]
      }
      crm_wa_is_quiet: { Args: { p_at: string }; Returns: boolean }
      crm_wa_report_result: {
        Args: {
          p_error?: string
          p_message_id: string
          p_now?: string
          p_ok: boolean
          p_wa_message_id?: string
        }
        Returns: string
      }
      crm_wa_retry_message: { Args: { p_message_id: string }; Returns: boolean }
      crm_wa_watchdog: { Args: { p_now?: string }; Returns: boolean }
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
      get_ai_usage_current_cycle: {
        Args: { p_tenant_id: string }
        Returns: {
          breakdown: Json
          eligible: boolean
          events_count: number
          percent: number
          quota_nanos_usd: number
          reset_at: string
          status: string
          total_cost_nanos_usd: number
          window_end: string
          window_source: string
          window_start: string
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
      get_my_permission_activities: {
        Args: { p_tenant_id: string }
        Returns: {
          activity_ids: string[]
          permission_id: string
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
      get_operative_day_bounds: {
        Args: { p_date?: string }
        Returns: {
          day_end: string
          day_start: string
        }[]
      }
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
      get_rectifiable_residual: {
        Args: { p_order_id: string }
        Returns: {
          r_order_item_id: string
          r_original_qty: number
          r_product_name: string
          r_rectified_qty: number
          r_residual_qty: number
        }[]
      }
      get_reservation_capacity_check: {
        Args: {
          p_activity_id: string
          p_exclude_reservation_id?: string
          p_party_size: number
          p_reservation_date: string
          p_reservation_time: string
        }
        Returns: {
          capacity: number
          duration_minutes: number
          pacing_bucket_bookings: number
          pacing_bucket_covers: number
          pacing_max_bookings: number
          pacing_max_covers: number
          pacing_slot_minutes: number
          peak_with_candidate: number
        }[]
      }
      get_reservation_day_availability: {
        Args: {
          p_activity_id: string
          p_party_size: number
          p_reservation_date: string
          p_times: string[]
        }
        Returns: {
          available: boolean
          slot_time: string
        }[]
      }
      get_schedule_featured_contents: {
        Args: { p_schedule_id: string; p_tenant_id: string }
        Returns: Json
      }
      get_service_day_start: { Args: never; Returns: string }
      get_stale_translations: {
        Args: { p_language_code: string; p_tenant_id: string }
        Returns: Json
      }
      get_tenant_member_names: {
        Args: { p_tenant_id: string }
        Returns: {
          display_name: string
          user_id: string
        }[]
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
      get_translation_coverage: { Args: { p_tenant_id: string }; Returns: Json }
      get_translation_progress: { Args: { p_tenant_id: string }; Returns: Json }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_user_tenants: {
        Args: never
        Returns: {
          business_subtype: string
          created_at: string
          current_period_end: string
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
      has_permission_owner_admin: {
        Args: { p_permission_id: string; p_tenant_id: string }
        Returns: boolean
      }
      import_products_into_catalog: {
        Args: {
          p_catalog_id: string
          p_categories: Json
          p_new_catalog_name: string
          p_products: Json
          p_tenant_id: string
        }
        Returns: Json
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
      is_platform_admin: { Args: never; Returns: boolean }
      is_reserved_slug: { Args: { slug: string }; Returns: boolean }
      is_schedule_active: {
        Args: { s: Database["public"]["Tables"]["schedules"]["Row"] }
        Returns: boolean
      }
      is_schedule_active_now: {
        Args: { days: number[]; end_t: string; start_t: string; tz: string }
        Returns: boolean
      }
      is_tenant_owner_or_admin: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      is_valid_partita_iva: { Args: { p_vat_number: string }; Returns: boolean }
      leave_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      list_active_public_slugs: {
        Args: never
        Returns: {
          base_lang: string
          slug: string
          tenant_id: string
        }[]
      }
      list_expired_orphan_reservations: {
        Args: { p_cutoff: string; p_limit: number }
        Returns: {
          reservation_id: string
          tenant_id: string
        }[]
      }
      list_expired_reservation_guests: {
        Args: { p_cutoff: string; p_limit: number }
        Returns: {
          guest_id: string
          tenant_id: string
        }[]
      }
      mark_account_deleted: { Args: { p_user_id: string }; Returns: undefined }
      mark_support_ticket_read: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      open_seating_for_reservation: {
        Args: { p_reservation_id: string }
        Returns: {
          activity_id: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_user_id: string | null
          party_size: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seatings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_walkin_seating: {
        Args: {
          p_activity_id: string
          p_party_size: number
          p_table_ids: string[]
        }
        Returns: {
          activity_id: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_user_id: string | null
          party_size: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seatings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_online_reservation: {
        Args: {
          p_activity_id: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_notes: string
          p_party_size: number
          p_reservation_date: string
          p_reservation_time: string
          p_source?: string
        }
        Returns: {
          capacity: number
          peak: number
          reason: string
          reservation_id: string
          status: string
        }[]
      }
      purge_locked_expired_tenants: { Args: never; Returns: number }
      purge_unconfirmed_accounts: { Args: never; Returns: number }
      purge_user_data: { Args: { p_user_id: string }; Returns: Json }
      reassign_activity_tables: {
        Args: { p_activity_id: string; p_date: string }
        Returns: {
          reassigned: number
          skipped_manual: number
          unassigned: number
        }[]
      }
      rectify_order_atomic: {
        Args: {
          p_items_to_storno: Json
          p_notes: string
          p_parent_order_id: string
        }
        Returns: Json
      }
      regenerate_table_qr_token: {
        Args: { p_table_id: string; p_terminate_active_sessions?: boolean }
        Returns: string
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
        Args: { p_ingredients: Json; p_product_id: string; p_tenant_id: string }
        Returns: undefined
      }
      replace_product_pairings: {
        Args: { p_pairings: Json; p_product_id: string; p_tenant_id: string }
        Returns: undefined
      }
      resend_invite: { Args: { p_membership_id: string }; Returns: boolean }
      reservation_pacing_block: {
        Args: {
          p_activity_id: string
          p_max_bookings: number
          p_max_covers: number
          p_party_size: number
          p_reservation_date: string
          p_reservation_time: string
          p_slot_minutes: number
        }
        Returns: string
      }
      reservation_peak_with_candidate: {
        Args: {
          p_activity_id: string
          p_duration_minutes: number
          p_party_size: number
          p_reservation_date: string
          p_reservation_time: string
        }
        Returns: number
      }
      reset_reservation_tables_to_system: {
        Args: { p_reservation_id: string }
        Returns: {
          assigned: boolean
          reason: string
          table_id: string
        }[]
      }
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
      set_reservation_tables: {
        Args: { p_reservation_id: string; p_table_ids: string[] }
        Returns: {
          activity_id: string
          assigned_at: string
          assignment_source: string
          created_at: string
          id: string
          reservation_id: string
          table_id: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reservation_tables"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_seating_party_size: {
        Args: { p_party_size: number; p_seating_id: string }
        Returns: {
          activity_id: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_user_id: string | null
          party_size: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seatings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_seating_tables: {
        Args: { p_seating_id: string; p_table_ids: string[] }
        Returns: {
          activity_id: string
          assigned_at: string
          created_at: string
          id: string
          seating_id: string
          table_id: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "seating_tables"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      simple_slug: { Args: { input: string }; Returns: string }
      submit_order_atomic: {
        Args: {
          p_activity_id: string
          p_customer_name_snapshot: string
          p_customer_session_id: string
          p_idempotency_key?: string
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
      translate_now: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_tenant_id: string
        }
        Returns: number
      }
      translation_debounce_interval: { Args: never; Returns: string }
      undo_seating: { Args: { p_seating_id: string }; Returns: undefined }
      unlock_owned_tenants: { Args: { p_user_id: string }; Returns: number }
      update_schedule_targets: {
        Args: { p_schedule_id: string; p_targets: Json }
        Returns: number
      }
      update_tenant_billing_details: {
        Args: {
          p_address: string
          p_city: string
          p_codice_destinatario: string
          p_country: string
          p_first_name: string
          p_fiscal_code: string
          p_last_name: string
          p_legal_entity_type: string
          p_legal_name: string
          p_pec: string
          p_postal_code: string
          p_province: string
          p_street_number: string
          p_tenant_id: string
          p_vat_number: string
        }
        Returns: undefined
      }
      update_tenant_logo: {
        Args: { p_logo_url: string; p_tenant_id: string }
        Returns: undefined
      }
      update_tenant_name: {
        Args: { p_name: string; p_tenant_id: string }
        Returns: undefined
      }
      update_tenant_story_settings: {
        Args: {
          p_story_cover: string
          p_story_intro: string
          p_story_title: string
          p_tenant_id: string
          p_website: string
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      schedule_priority_level: ["low", "medium", "high", "urgent"],
    },
  },
} as const
