# Rendering Attività Attiva V2

Il sistema di rendering pubblico di CataloGlobe segue un approccio **Single Source of Truth** per garantire determinismo e prestazioni.

## Flusso di Risoluzione

Il resolver `resolveActivityCatalogsV2` aggrega i dati seguendo questa gerarchia:

1.  **Programmazione (v2_schedules)**:
    - Determina il catalogo "Layout" attivo e lo stile caricato.
    - Applica gli override di visibilità e prezzo definiti a livello di regola di programmazione.
2.  **Override Attività (v2_activity_product_overrides)**:
    - Applica l'ultimo strato di visibilità specifico per l'attività.
    - **NOTA**: L'override lato attività gestisce solo la **Visibilità**. I prezzi sono centralizzati nella programmazione.
3.  **Gruppi di Attività**:
    - Utilizzati esclusivamente per il targeting delle regole di programmazione (Target: `activity_group`).

## Vincoli Architetturali

- **Prezzi**: I prezzi non possono essere sovrascritti direttamente dall'attività. Devono passare per una regola di prezzo (`rule_type='price'`) nel modulo Programmazione.
- **Legacy**: La tabella `v2_activity_schedules` è stata rimossa; la programmazione V2 è l'unica fonte di verità per i layout.
- **Gruppi**: Sono aggregatori logici, non hanno logica di business propria oltre ad essere target per gli schedule.
