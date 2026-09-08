/**
 * Imperative handle shared by ItemNoteEditor + OrderNoteEditor. Lets the
 * parent flush an open, unconfirmed draft at submit time instead of
 * silently discarding it (bug: user types a note, hits "Invia ordine"
 * without pressing "Conferma" — text vanished).
 *
 * flushPendingNote(): if the editor is mid-edit with non-empty text,
 * commits it (calls onSave, transitions to "saved") and RETURNS the
 * trimmed value — synchronously, so the caller can fold it into the
 * submit payload without waiting for the onSave state update to
 * propagate back through props on the next render. Returns undefined
 * when there is nothing to flush (not editing, or draft empty).
 */
export interface NoteEditorHandle {
    flushPendingNote: () => string | undefined;
}
