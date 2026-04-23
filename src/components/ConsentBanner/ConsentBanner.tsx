import { useState } from 'react';
import { recordConsent } from '@services/supabase/consent';
import styles from './ConsentBanner.module.scss';

interface ConsentBannerProps {
  userId: string;
  onAccepted: () => void;
}

export default function ConsentBanner({ userId, onAccepted }: ConsentBannerProps) {
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await recordConsent(userId);
      onAccepted();
    } catch (error) {
      console.error('Error recording consent:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <p className={styles.text}>
          Abbiamo aggiornato la nostra{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>{' '}
          e i{' '}
          <a href="/legal/termini" target="_blank" rel="noopener noreferrer">
            Termini di Servizio
          </a>
          . Per continuare a utilizzare CataloGlobe, è necessario accettare
          le nuove condizioni.
        </p>
        <button
          className={styles.acceptButton}
          onClick={handleAccept}
          disabled={loading}
        >
          {loading ? 'Salvataggio...' : 'Ho letto e accetto'}
        </button>
      </div>
    </div>
  );
}
