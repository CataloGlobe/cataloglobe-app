// Genera i modelli delle mail di Supabase Auth (pannello → Authentication →
// Emails) dallo stesso layout delle mail mandate dal nostro codice, così le
// due famiglie non si separano più.
//
//   deno run --allow-read --allow-write scripts/email/build-auth-templates.ts
//
// Scrive docs/email/*.html. Non li legge nessuno a runtime: si incollano nel
// pannello di staging e di prod, con l'oggetto scritto in cima a ogni file.
// Le variabili {{ .Token }} e simili sono quelle dei modelli Go di Supabase.

import {
    PARAGRAPH_BODY,
    PARAGRAPH_NOTE,
    renderButton,
    renderCard,
    renderCode,
    renderTitle
} from "../../supabase/functions/_shared/emailLayout.ts";
import { COMPANY } from "../../supabase/functions/_shared/company-config.ts";

/** MAILER_OTP_EXP del pannello: 3600 secondi. */
const EXPIRY = "Vale un'ora.";
const SUPPORT = `<a href="mailto:${COMPANY.contact.support}" style="color:#374151;text-decoration:underline">${COMPANY.contact.support}</a>`;

interface Template {
    file: string;
    panel: string;
    subject: string;
    html: string;
}

const templates: Template[] = [
    {
        file: "conferma-registrazione.html",
        panel: "Confirm signup",
        subject: "{{ .Token }} è il tuo codice CataloGlobe",
        html: renderCard(
            [
                renderTitle("Conferma la tua email"),
                `<p ${PARAGRAPH_BODY}>Scrivi questo codice nella pagina di registrazione:</p>`,
                renderCode("{{ .Token }}"),
                `<p ${PARAGRAPH_BODY}>Oppure conferma con un clic:</p>`,
                renderButton(
                    "Conferma ed entra",
                    "{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&amp;type=signup"
                ),
                `<p ${PARAGRAPH_NOTE}>${EXPIRY} Se non ti sei registrato tu, ignora questa mail.</p>`
            ],
            { preheader: `${EXPIRY} Scrivilo nella pagina di registrazione o conferma con un clic.` }
        )
    },
    {
        file: "recupero-password.html",
        panel: "Reset password",
        subject: "Reimposta la password di CataloGlobe",
        html: renderCard(
            [
                renderTitle("Reimposta la password"),
                `<p ${PARAGRAPH_BODY}>Hai chiesto di cambiare la password. Scegline una nuova da qui:</p>`,
                renderButton("Scegli la nuova password", "{{ .ConfirmationURL }}"),
                `<p ${PARAGRAPH_NOTE}>Il link ${EXPIRY.toLowerCase()} Se non l'hai chiesto tu, ignora questa mail: la password resta quella di prima.</p>`
            ],
            { preheader: `Il link ${EXPIRY.toLowerCase()} Se non l'hai chiesto tu, ignora questa mail.` }
        )
    },
    {
        file: "password-modificata.html",
        panel: "Password changed (notifica)",
        subject: "La password di CataloGlobe è stata cambiata",
        html: renderCard(
            [
                renderTitle("Password cambiata"),
                `<p ${PARAGRAPH_BODY}>La password dell'account <strong>{{ .Email }}</strong> è stata appena cambiata.</p>`,
                `<p ${PARAGRAPH_NOTE}>Se sei stato tu, non devi fare niente. Se non sei stato tu, scrivici subito a ${SUPPORT}.</p>`
            ],
            { preheader: "Se sei stato tu, non devi fare niente." }
        )
    },
    {
        file: "cambio-email.html",
        panel: "Change email address",
        subject: "Conferma il nuovo indirizzo email",
        html: renderCard(
            [
                renderTitle("Conferma il nuovo indirizzo"),
                `<p ${PARAGRAPH_BODY}>Per usare <strong>{{ .NewEmail }}</strong> come email del tuo account, confermalo da qui:</p>`,
                renderButton("Conferma l'indirizzo", "{{ .ConfirmationURL }}"),
                `<p ${PARAGRAPH_NOTE}>Se non l'hai chiesto tu, ignora questa mail: l'indirizzo resta {{ .Email }}.</p>`
            ],
            { preheader: "Conferma con un clic per usare il nuovo indirizzo." }
        )
    },
    {
        file: "email-modificata.html",
        panel: "Email address changed (notifica)",
        subject: "L'email del tuo account CataloGlobe è cambiata",
        html: renderCard(
            [
                renderTitle("Email cambiata"),
                `<p ${PARAGRAPH_BODY}>L'email del tuo account è passata da <strong>{{ .OldEmail }}</strong> a <strong>{{ .Email }}</strong>.</p>`,
                `<p ${PARAGRAPH_NOTE}>Se sei stato tu, non devi fare niente. Se non sei stato tu, scrivici subito a ${SUPPORT}.</p>`
            ],
            { preheader: "Se sei stato tu, non devi fare niente." }
        )
    }
];

const outDir = new URL("../../docs/email/", import.meta.url);
for (const t of templates) {
    const header = `<!--\n  Modello «${t.panel}» del pannello Supabase (Authentication → Emails).\n  Generato da scripts/email/build-auth-templates.ts: non modificarlo a mano.\n  Oggetto: ${t.subject}\n-->\n`;
    await Deno.writeTextFile(new URL(t.file, outDir), t.html.replace("<!doctype html>\n", `<!doctype html>\n${header}`) + "\n");
    console.log(`${t.file}  ·  ${t.subject}`);
}
