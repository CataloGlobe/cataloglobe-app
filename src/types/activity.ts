export interface V2Activity {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    activity_type: string | null;
    address: string | null;
    city: string | null;
    cover_image: string | null;
    description: string | null;
    status: "active" | "inactive";
    inactive_reason: "maintenance" | "closed" | "unavailable" | null;
    phone: string | null;
    email_public: string | null;
    website: string | null;
    instagram: string | null;
    facebook: string | null;
    whatsapp: string | null;
    phone_public: boolean;
    email_public_visible: boolean;
    website_public: boolean;
    instagram_public: boolean;
    facebook_public: boolean;
    whatsapp_public: boolean;
    payment_methods: string[];
    payment_methods_public: boolean;
    services: string[];
    services_public: boolean;
    qr_fg_color: string | null;
    qr_bg_color: string | null;
    google_review_url: string | null;
    created_at: string;
    updated_at: string;
}

export type V2ActivityType = string; // can be refined later if there are fixed types
