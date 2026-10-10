// Mail dell'account: codice di accesso, codice di recupero, invito nel team,
// lista d'attesa. Prima vivevano come HTML dentro le edge function, ognuna
// con la sua copia dello stile; qui usano il guscio comune di `emailLayout.ts`.
//
// Funzioni pure: niente env, rete o DB. Gli URL arrivano già assoluti.

import { getEmailFooterText } from "./company-config.ts";
import { escapeHtml, formatDateIt } from "./emailFormat.ts";
import {
    PARAGRAPH_BODY,
    PARAGRAPH_NOTE,
    renderButton,
    renderCard,
    renderCode,
    renderTitle,
    type EmailContent
} from "./emailLayout.ts";

/** Durata del codice a 6 cifre, come in `send-otp` e `recover-account`. */
const CODE_MINUTES = 5;

/**
 * Codice di accesso. Il codice sta anche nell'oggetto: si legge dalla notifica
 * senza aprire la mail, e l'iPhone lo propone da solo nel campo del codice.
 */
export function buildLoginCodeEmail(code: string): EmailContent {
    const expiry = `Scade tra ${CODE_MINUTES} minuti.`;
    const subject = `${code} è il tuo codice di accesso a CataloGlobe`;
    const html = renderCard(
        [
            renderTitle("Il tuo codice di accesso"),
            `<p ${PARAGRAPH_BODY}>Inseriscilo nella pagina di accesso per entrare.</p>`,
            renderCode(code),
            `<p ${PARAGRAPH_NOTE}>${expiry} Se non stai entrando tu, ignora questa mail.</p>`
        ],
        { preheader: expiry }
    );
    const text =
        `Il tuo codice di accesso: ${code}\n\n` +
        `${expiry} Se non stai entrando tu, ignora questa mail.\n\n` +
        getEmailFooterText();
    return { subject, html, text };
}

/** Codice per recuperare un account (stessa forma del codice di accesso). */
export function buildRecoveryCodeEmail(code: string): EmailContent {
    const expiry = `Scade tra ${CODE_MINUTES} minuti.`;
    const subject = `${code} è il tuo codice per recuperare l'account`;
    const html = renderCard(
        [
            renderTitle("Recupero dell'account"),
            `<p ${PARAGRAPH_BODY}>Inserisci questo codice per confermare il recupero.</p>`,
            renderCode(code),
            `<p ${PARAGRAPH_NOTE}>${expiry} Se non l'hai chiesto tu, ignora questa mail.</p>`
        ],
        { preheader: expiry }
    );
    const text =
        `Il tuo codice per recuperare l'account: ${code}\n\n` +
        `${expiry} Se non l'hai chiesto tu, ignora questa mail.\n\n` +
        getEmailFooterText();
    return { subject, html, text };
}

export interface TenantInviteEmailArgs {
    /** Nome dell'azienda, scritto dall'utente: escapato qui. */
    tenantName: string;
    /** Email di chi invita, scritta dall'utente: escapata qui. */
    inviterEmail: string;
    /** URL assoluto dell'invito, costruito dal chiamante. */
    inviteUrl: string;
}

export function buildTenantInviteEmail(args: TenantInviteEmailArgs): EmailContent {
    const { tenantName, inviterEmail, inviteUrl } = args;
    const eTenant = escapeHtml(tenantName);
    const eInviter = escapeHtml(inviterEmail);
    const eUrl = escapeHtml(inviteUrl);

    const subject = `Invito a collaborare su ${tenantName}`;
    const html = renderCard(
        [
            renderTitle("Ti hanno invitato su CataloGlobe"),
            `<p ${PARAGRAPH_BODY}><strong>${eInviter}</strong> ti ha invitato a collaborare su <strong>${eTenant}</strong>.</p>`,
            renderButton("Accetta l'invito", eUrl),
            `<p ${PARAGRAPH_NOTE}>Se non hai ancora un account, lo crei dopo il clic.</p>`,
            `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;word-break:break-all">Il bottone non funziona? Copia questo link: ${eUrl}</p>`
        ],
        { preheader: `${inviterEmail} ti ha invitato a collaborare su ${tenantName}.` }
    );
    const text =
        `${inviterEmail} ti ha invitato a collaborare su ${tenantName}.\n\n` +
        `Accetta l'invito: ${inviteUrl}\n\n` +
        `Se non hai ancora un account, lo crei dopo il clic.\n\n` +
        getEmailFooterText();
    return { subject, html, text };
}

/**
 * Iscrizione alla lista d'attesa. È l'unica mail commerciale: porta i dati
 * legali completi nel footer (`legal: true`).
 */
export function buildWaitlistEmail(): EmailContent {
    const subject = "Sei nella lista d'attesa di CataloGlobe";
    const lead = "Ti scriviamo appena la piattaforma è disponibile.";
    const html = renderCard(
        [
            renderTitle("Grazie, sei in lista"),
            `<p ${PARAGRAPH_BODY}>${lead}</p>`,
            `<p ${PARAGRAPH_BODY}>Se intanto hai domande, rispondi a questa mail.</p>`,
            `<p ${PARAGRAPH_NOTE}>Il team CataloGlobe</p>`
        ],
        { preheader: lead, legal: true }
    );
    const text =
        `Grazie, sei nella lista d'attesa di CataloGlobe.\n\n` +
        `${lead}\nSe intanto hai domande, rispondi a questa mail.\n\n` +
        `Il team CataloGlobe\n\n` +
        getEmailFooterText({ legal: true });
    return { subject, html, text };
}

export interface SignupReminderEmailArgs {
    /** Ultimo giorno per confermare, "YYYY-MM-DD" (registrazione + 7 giorni). */
    deleteAfter: string;
    /** URL assoluto della pagina di accesso. Niente email nell'URL. */
    loginUrl: string;
}

/**
 * Promemoria a chi si è registrato e non ha confermato l'email: uno solo, due
 * giorni dopo. Non porta un codice (quello della prima mail vale un'ora): dalla
 * pagina di accesso «Mandami il codice di conferma» ne manda uno nuovo.
 */
export function buildSignupReminderEmail(args: SignupReminderEmailArgs): EmailContent {
    const day = formatDateIt(args.deleteAfter);
    const eUrl = escapeHtml(args.loginUrl);
    const subject = "Manca un passo: conferma il tuo account CataloGlobe";
    const deadline = `Se non lo confermi entro il ${day}, lo cancelliamo.`;
    const html = renderCard(
        [
            renderTitle("Conferma il tuo account"),
            `<p ${PARAGRAPH_BODY}>Ti sei registrato su CataloGlobe ma non hai ancora confermato l'email. ${deadline}</p>`,
            `<p ${PARAGRAPH_BODY}>Entra con email e password: ti mandiamo un codice nuovo.</p>`,
            renderButton("Conferma l'account", eUrl),
            `<p ${PARAGRAPH_NOTE}>Se non ti sei registrato tu, ignora questa mail: l'account sparisce da solo.</p>`
        ],
        { preheader: deadline }
    );
    const text =
        `Ti sei registrato su CataloGlobe ma non hai ancora confermato l'email. ${deadline}\n\n` +
        `Entra con email e password, ti mandiamo un codice nuovo: ${args.loginUrl}\n\n` +
        `Se non ti sei registrato tu, ignora questa mail: l'account sparisce da solo.\n\n` +
        getEmailFooterText();
    return { subject, html, text };
}
