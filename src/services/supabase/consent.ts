import { supabase } from './client';
import { CURRENT_CONSENT_VERSIONS } from '@/config/consentVersions';

const CURRENT_PRIVACY_VERSION = CURRENT_CONSENT_VERSIONS.privacy;
const CURRENT_TERMS_VERSION = CURRENT_CONSENT_VERSIONS.terms;

export async function recordConsent(userId: string): Promise<void> {
  const records = [
    {
      user_id: userId,
      document_type: 'privacy_policy',
      document_version: CURRENT_PRIVACY_VERSION,
    },
    {
      user_id: userId,
      document_type: 'terms_of_service',
      document_version: CURRENT_TERMS_VERSION,
    },
  ];

  const { error } = await supabase
    .from('consent_records')
    .insert(records);

  if (error) throw error;
}

export { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION };
