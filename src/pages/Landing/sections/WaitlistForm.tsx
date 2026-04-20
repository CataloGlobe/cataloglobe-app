import { useState, type FormEvent } from 'react';
import { CircleCheck } from 'lucide-react';
import s from './WaitlistForm.module.scss';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const ACTIVITY_TYPES = [
    { value: 'ristorante', label: 'Ristorante' },
    { value: 'bar', label: 'Bar' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'retail', label: 'Retail' },
    { value: 'altro', label: 'Altro' },
] as const;

function isValidEmail(email: string): boolean {
    const i = email.indexOf('@');
    return i > 0 && email.slice(i + 1).includes('.');
}

export default function WaitlistForm() {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [activityType, setActivityType] = useState('');
    const [status, setStatus] = useState<Status>('idle');

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!isValidEmail(email.trim())) return;

        setStatus('submitting');
        try {
            const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-waitlist`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: email.trim(),
                        name: name.trim() || undefined,
                        activity_type: activityType || undefined,
                    }),
                }
            );
            const data = await res.json();
            if (data.success) {
                setStatus('success');
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    }

    if (status === 'success') {
        return (
            <div className={s.success}>
                <CircleCheck size={24} strokeWidth={2} />
                <span>Perfetto! Ti contatteremo appena saremo pronti.</span>
            </div>
        );
    }

    return (
        <form className={s.form} onSubmit={handleSubmit} noValidate>
            <input
                className={s.input}
                type="email"
                placeholder="La tua email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />
            <input
                className={s.input}
                type="text"
                placeholder="Il tuo nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <select
                className={`${s.select} ${activityType === '' ? s.selectEmpty : ''}`}
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
            >
                <option value="">Tipo di attività (opzionale)</option>
                {ACTIVITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                        {t.label}
                    </option>
                ))}
            </select>
            <button
                className={s.submitBtn}
                type="submit"
                disabled={status === 'submitting'}
            >
                {status === 'submitting' ? 'Invio in corso...' : "Iscriviti alla lista d'attesa"}
            </button>
            {status === 'error' && (
                <p className={s.errorMsg}>Si è verificato un errore. Riprova.</p>
            )}
        </form>
    );
}
