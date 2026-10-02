# Mac di WhatsApp Web (CRM, F1-2)

Il numero dell'agente vive in WhatsApp Web, sul Mac di casa. Lì gira Claude Code con Claude in Chrome: legge le chat e manda i messaggi che il CRM mette in coda. Le regole stanno tutte nel CRM: chi scrivere, quando, quante volte e quando fermarsi. Il Mac esegue e riferisce.

Il Mac non tocca il database. Parla solo con l'edge `crm-wa-worker`, attraverso `crm-wa.mjs`.

## Prima volta

1. Usa un profilo Chrome dedicato, con WhatsApp Web collegato al numero dell'agente e l'estensione Claude in Chrome.
2. Salva URL e segreto nel Portachiavi. Il segreto è `CRM_WA_WORKER_SECRET`: lo imposta Lorenzo tra i segreti delle edge e lo passa a mano, mai in chat.
   ```bash
   security add-generic-password -s cataloglobe-crm-wa-url -a crm -w 'https://<progetto>.supabase.co/functions/v1/crm-wa-worker'
   security add-generic-password -s cataloglobe-crm-wa-secret -a crm -w
   ```
   Il secondo comando chiede il segreto senza mostrarlo.
3. Prova il collegamento: `node scripts/crm-wa/crm-wa.mjs heartbeat ok`. La risposta deve essere `{"ok":true,...}`.
4. Prova le istantanee a mano:
   1. apri una chat di prova e incolla `snapshot.js` nella console;
   2. controlla che ogni messaggio a vista abbia `id`, `from_me`, `text` (o `kind` vocale/foto) e `pre` con l'ora;
   3. se manca qualcosa, WhatsApp Web ha cambiato i selettori: aggiorna `snapshot.js` prima di partire.

Su staging resta acceso «solo numeri di prova» (pagina Agenti): il CRM annulla ogni messaggio verso numeri fuori dalla lista.

## Il giro

Istruzioni per Claude Code sul Mac. Si ripetono finché la sessione è aperta.

1. **Battito**, almeno ogni 5 minuti: `crm-wa.mjs heartbeat ok`.
   - Se WhatsApp Web mostra il QR: `heartbeat needs_relink`.
   - Se mostra un avviso (telefono non connesso, account limitato, qualunque banner): `heartbeat warning "<testo del banner>"`.
   - Negli ultimi due casi il CRM mette in pausa gli agenti e avvisa il team su Telegram. Tu non mandi più nulla finché qualcuno non li riattiva.
   - Appena il telefono è ricollegato o l'avviso sparisce, manda subito `heartbeat ok`: finché il CRM vede l'ultimo stato «da ricollegare» o «avviso», rimette la pausa anche se una persona ha riattivato gli agenti.
   - Senza battito per 15 minuti, il CRM mette in pausa gli agenti da solo.
2. **Chat nuove**: per ogni chat con messaggi non letti,
   1. aprila;
   2. esegui `snapshot.js`;
   3. passa il risultato a `crm-wa.mjs chats` su stdin.

   I messaggi del lead arrivano su Telegram a chi ha il locale. Se una persona ha scritto a mano dal numero dell'agente, il CRM ferma l'agente su quella chat per mezz'ora.
3. **Prossimo invio**: `crm-wa.mjs next`.
   - Con `{"wait":{"reason":...,"seconds":N}}` non mandi nulla e riprovi tra N secondi, facendo intanto i punti 1 e 2.
   - Con `{"send":{"message_id","phone","body"}}`:
     1. apri `https://web.whatsapp.com/send?phone=<numero senza +>` e aspetta il campo di scrittura;
     2. se WhatsApp dice che il numero non è valido: `crm-wa.mjs result <message_id> fail "Numero non su WhatsApp"`;
     3. altrimenti scrivi `body` così com'è, senza cambiare una parola, e premi Invio;
     4. esegui `snapshot.js`, passalo a `chats` e prendi il `data-id` dell'ultimo messaggio tuo;
     5. chiudi con `crm-wa.mjs result <message_id> ok <data-id>`.
   - Se qualcosa va storto a metà invio: `result <message_id> fail "<cosa è successo>"`. Mai rimandare lo stesso messaggio da solo.

   Un invio senza esito per 10 minuti conta come fallito. Tre fallimenti di fila mettono in pausa gli agenti.
4. Dopo un invio il CRM impone 2-4 minuti di pausa: `next` risponde `pacing`.

## Cosa non fare

- Non scrivere niente che non arrivi da `next`, e non correggere i testi.
- Non aprire chat di gruppo e non rispondere a numeri che il CRM non conosce: l'edge li ignora.
- Non riattivare gli agenti dal Mac. Li riattiva una persona, dalla pagina Agenti.
