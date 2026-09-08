/**
 * Pending note text flushed from an open (unconfirmed) editor right at
 * submit time. Passed alongside onSubmitOrder() so the caller can fold it
 * into the request payload synchronously — the flush's onSave() call also
 * updates parent state, but that update lands on the NEXT render, too late
 * for a submit handler reading state in the same tick.
 */
export interface SubmitOrderOverrides {
    itemNoteOverrides?: Map<number, string>;
    orderNoteOverride?: string;
}
