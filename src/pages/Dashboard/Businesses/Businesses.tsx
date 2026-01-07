import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@context/useAuth";
import { useNavigate } from "react-router-dom";
import {
    getUserBusinesses,
    addBusiness,
    deleteBusiness,
    updateBusiness
    // uploadBusinessCover
} from "@services/supabase/businesses";

import Text from "@components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import Skeleton from "@/components/ui/Skeleton/Skeleton";

import { BusinessCreateCard } from "@/components/Businesses/BusinessCreateCard/BusinessCreateCard";
import { BusinessEditModal } from "@/components/Businesses/BusinessEditModal/BusinessEditModal";
import { BusinessList } from "@/components/Businesses/BusinessList/BusinessList";

import { useDebounce } from "@/hooks/useDebounce";

import { ensureUniqueBusinessSlug } from "@/utils/businessSlug";
import { generateRandomSuffix, sanitizeSlugForSave } from "@/utils/slugify";

import type { Business } from "@/types/database";
import type { BusinessFormValues } from "@/types/Businesses";

import styles from "./Businesses.module.scss";

// valore statico → performance migliore
const previewBaseUrl = window.location.origin;

// ==========================================
// COMPONENT
// ==========================================
export default function Businesses() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    // ======================================
    // STATE: lista dei business
    // ======================================
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(true);

    // ======================================
    // STATE: form creazione business
    // (ora unificato, molto più pulito)
    // ======================================
    const [createForm, setCreateForm] = useState<BusinessFormValues>({
        name: "",
        city: "",
        address: "",
        slug: "",
        type: "restaurant",
        coverPreview: null
    });
    const [createErrors, setCreateErrors] = useState<
        Partial<Record<keyof BusinessFormValues, string>>
    >({});

    const [createCoverFile, setCreateCoverFile] = useState<File | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createSlugTouched, setCreateSlugTouched] = useState(false);
    const debouncedName = useDebounce(createForm.name, 500);
    const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
    const [showSlugAlreadyUsedModal, setShowSlugAlreadyUsedModal] = useState(false);

    // ======================================
    // STATE: edit
    // ======================================
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<BusinessFormValues | null>(null);
    const [editErrors, setEditErrors] = useState<Partial<Record<keyof BusinessFormValues, string>>>(
        {}
    );
    const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
    const [showSlugWarning, setShowSlugWarning] = useState(false);
    const [pendingEditSubmit, setPendingEditSubmit] = useState(false);

    // ======================================
    // FETCH BUSINESS
    // ======================================
    const refreshBusinesses = useCallback(async () => {
        if (!user) return;

        setIsLoadingBusinesses(true);

        const data = await getUserBusinesses(user.id);

        setBusinesses(data);
        setIsLoadingBusinesses(false);
    }, [user]);

    useEffect(() => {
        refreshBusinesses();
    }, [refreshBusinesses]);

    // GENERAZIONE SLUG AUTOMATICA CON DEBOUNCE
    useEffect(() => {
        if (!debouncedName.trim()) {
            setCreateForm(prev => ({ ...prev, slug: "" }));
            return;
        }
        if (createSlugTouched) return; // l’utente ha modificato manualmente lo slug → non aggiorniamo più

        async function compute() {
            const unique = await ensureUniqueBusinessSlug(debouncedName);
            setCreateForm(prev => ({ ...prev, slug: unique }));
        }

        compute();
    }, [debouncedName, createSlugTouched]);

    // ======================================
    // CALLBACK: campo form create
    // ======================================
    const handleCreateFieldChange = useCallback(
        <K extends keyof BusinessFormValues>(field: K, value: BusinessFormValues[K]) => {
            // se l'utente tocca lo slug, da qui in avanti non lo aggiorniamo più automaticamente
            if (field === "slug") {
                setCreateSlugTouched(true);
            }

            setCreateForm(prev => {
                // cambio del NOME
                if (field === "name") {
                    const newName = value as string;

                    if (!createSlugTouched) {
                        return {
                            ...prev,
                            name: newName
                            // NON aggiorniamo lo slug qui
                            // lo farà useEffect con debounce + ensureUniqueBusinessSlug
                        };
                    }

                    // se lo slug è stato toccato, cambiamo solo il name
                    return {
                        ...prev,
                        name: newName
                    };
                }

                // cambio dello SLUG (campo editabile)
                // dopo — NIENTE slugify live!
                if (field === "slug") {
                    return { ...prev, slug: value as string };
                }

                // tutti gli altri campi
                return {
                    ...prev,
                    [field]: value
                };
            });
        },
        [createSlugTouched]
    );

    function validateCreateForm(values: BusinessFormValues) {
        const errors: Partial<Record<keyof BusinessFormValues, string>> = {};

        if (!values.name.trim()) errors.name = "Il nome è obbligatorio.";
        if (!values.city.trim()) errors.city = "La città è obbligatoria.";
        if (!values.address.trim()) errors.address = "L'indirizzo è obbligatorio.";
        if (!values.type.trim()) errors.type = "Il tipo di attività è obbligatorio.";
        if (!values.slug.trim()) errors.slug = "Lo slug è obbligatorio.";

        return errors;
    }

    // ======================================
    // CALLBACK: cover create
    // ======================================
    const handleCreateCoverChange = useCallback((file: File | null) => {
        if (!file) {
            setCreateCoverFile(null);
            setCreateForm(prev => ({ ...prev, coverPreview: null }));
            return;
        }

        setCreateCoverFile(file);
        const url = URL.createObjectURL(file);
        setCreateForm(prev => ({ ...prev, coverPreview: url }));
    }, []);

    // ======================================
    // CALLBACK: add business
    // ======================================
    const handleAdd = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            const errors = validateCreateForm(createForm);
            setCreateErrors(errors);

            if (Object.keys(errors).length > 0) {
                showToast({
                    message: "Compila tutti i campi obbligatori.",
                    type: "info",
                    duration: 2500
                });
                return;
            }

            if (!user) return;

            // 1. Sanitizziamo lo slug manuale dell’utente
            const baseSlug = sanitizeSlugForSave(createForm.slug || createForm.name);

            // 2. Calcoliamo lo slug univoco
            const uniqueSlug = await ensureUniqueBusinessSlug(baseSlug);

            // 3. Se è diverso → significa che lo slug scelto ESISTE GIÀ
            if (uniqueSlug !== baseSlug) {
                const suggestions = await getSlugSuggestions(baseSlug, uniqueSlug);
                setSlugSuggestions(suggestions);
                setShowSlugAlreadyUsedModal(true);
                return; // BLOCCA la creazione
            }

            setIsCreating(true);
            try {
                const newBusiness = await addBusiness(
                    user.id,
                    createForm.name,
                    createForm.city,
                    createForm.address,
                    uniqueSlug,
                    createForm.type
                );

                // if (createCoverFile) {
                //     await uploadBusinessCover(newBusiness.id, createCoverFile);
                // }

                // reset
                setCreateForm({
                    name: "",
                    city: "",
                    address: "",
                    slug: "",
                    type: "restaurant",
                    coverPreview: null
                });
                setCreateCoverFile(null);
                setCreateSlugTouched(false);

                await refreshBusinesses();
            } catch (e) {
                console.error("Errore aggiunta business:", e);
                showToast({
                    message: "Errore durante la creazione del business.",
                    type: "error",
                    duration: 2500
                });
            } finally {
                setIsCreating(false);
                setIsFormOpen(false);
            }
        },
        [businesses, user, createForm, createCoverFile, refreshBusinesses, showToast]
    );

    // ======================================
    // CALLBACK: delete business
    // ======================================
    const handleDelete = useCallback((id: string) => {
        setDeleteTargetId(id);
        setShowDeleteModal(true);
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!deleteTargetId) return;

        try {
            await deleteBusiness(deleteTargetId);
            await refreshBusinesses();
            showToast({
                message: "Attività eliminata con successo.",
                type: "success",
                duration: 2500
            });
        } catch (e) {
            console.error("Errore eliminazione business:", e);
            showToast({
                message: "Errore durante l'eliminazione del business.",
                type: "error",
                duration: 2500
            });
        } finally {
            setShowDeleteModal(false);
            setDeleteTargetId(null);
        }
    }, [deleteTargetId, refreshBusinesses, showToast]);

    // ======================================
    // CALLBACK: navigazione lista
    // ======================================

    const handleOpenReviews = useCallback(
        (id: string) => navigate(`/dashboard/reviews?businessId=${id}`),
        [navigate]
    );

    // ======================================
    // CALLBACK: edit business (da spostare in modale)
    // ======================================
    const handleEditClick = useCallback((business: Business) => {
        setEditingBusiness(business);
        setEditingId(business.id);
        setEditForm({
            name: business.name,
            city: business.city ?? "",
            address: business.address ?? "",
            slug: business.slug,
            type: business.type,
            coverPreview: business.cover_image ?? null
        });
        setEditCoverFile(null);
        setIsEditOpen(true);
    }, []);

    const handleEditFieldChange = useCallback(
        <K extends keyof BusinessFormValues>(field: K, value: BusinessFormValues[K]) => {
            setEditForm(prev => {
                if (!prev) return prev;
                if (field === "slug") {
                    return { ...prev, slug: value as string };
                }
                return { ...prev, [field]: value };
            });
        },
        []
    );

    function validateEditForm(values: BusinessFormValues) {
        const errors: Partial<Record<keyof BusinessFormValues, string>> = {};

        if (!values.name.trim()) errors.name = "Il nome è obbligatorio.";
        if (!values.city.trim()) errors.city = "La città è obbligatoria.";
        if (!values.address.trim()) errors.address = "L'indirizzo è obbligatorio.";
        if (!values.type.trim()) errors.type = "Il tipo di attività è obbligatorio.";
        if (!values.slug.trim()) errors.slug = "Lo slug è obbligatorio.";

        return errors;
    }

    const handleEditCoverChange = useCallback((file: File | null) => {
        if (!file) {
            setEditCoverFile(null);
            setEditForm(prev => (prev ? { ...prev, coverPreview: null } : prev));
            return;
        }

        setEditCoverFile(file);

        const url = URL.createObjectURL(file);
        setEditForm(prev => (prev ? { ...prev, coverPreview: url } : prev));
    }, []);

    const handleSaveEdit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();

            if (!editingId || !editForm || !editingBusiness) return;

            const errors = validateEditForm(editForm);
            setEditErrors(errors);

            if (Object.keys(errors).length > 0) {
                showToast({
                    message: "Compila tutti i campi obbligatori.",
                    type: "info",
                    duration: 2000
                });
                return;
            }

            // Slug pulizia
            const cleanedSlug = sanitizeSlugForSave(editForm.slug);

            if (!cleanedSlug) {
                showToast({
                    message: "Inserisci uno slug valido.",
                    type: "info",
                    duration: 2500
                });
                return;
            }

            // Se slug diverso → avviso QR
            if (cleanedSlug !== editingBusiness.slug && !pendingEditSubmit) {
                setShowSlugWarning(true);
                return;
            }

            // Reset flag
            setPendingEditSubmit(false);

            // Controllo unicità slug
            const slugAlreadyUsed = businesses.some(
                b => b.id !== editingId && b.slug === cleanedSlug
            );

            if (slugAlreadyUsed) {
                const suggestions = await getSlugSuggestions(cleanedSlug);
                setSlugSuggestions(suggestions);
                setShowSlugAlreadyUsedModal(true);
                return;
            }

            setIsEditing(true);

            try {
                await updateBusiness(editingId, {
                    name: editForm.name,
                    city: editForm.city,
                    address: editForm.address,
                    slug: cleanedSlug,
                    type: editForm.type
                });

                // if (editCoverFile) {
                //     await uploadBusinessCover(editingId, editCoverFile);
                // }

                // RESET
                setIsEditOpen(false);
                setEditingId(null);
                setEditingBusiness(null);
                setEditForm(null);
                setEditErrors({});
                setEditCoverFile(null);

                await refreshBusinesses();
            } catch (err) {
                console.error("Errore aggiornamento business:", err);
                showToast({
                    message: "Errore durante l'aggiornamento.",
                    type: "error",
                    duration: 2500
                });
            } finally {
                setIsEditing(false);
            }
        },
        [
            editingId,
            editForm,
            editCoverFile,
            editingBusiness,
            businesses,
            pendingEditSubmit,
            refreshBusinesses,
            showToast
        ]
    );

    async function getSlugSuggestions(base: string, uniqueSlug?: string): Promise<string[]> {
        const baseSlug = sanitizeSlugForSave(base);
        const suggestions: string[] = [];

        // Prima proposta: lo slug unico calcolato da ensureUniqueBusinessSlug, se diverso dal base
        if (uniqueSlug && uniqueSlug !== baseSlug) {
            suggestions.push(uniqueSlug);
        }

        const commonSuffixes = ["01", "milano", "center", "plus", generateRandomSuffix()];

        for (const suffix of commonSuffixes) {
            const candidate = `${baseSlug}-${suffix}`;
            if (!suggestions.includes(candidate)) {
                suggestions.push(candidate);
            }
        }

        return suggestions;
    }

    function BusinessCardSkeleton() {
        return (
            <div className={styles.skeletonCard}>
                {/* Top */}
                <div className={styles.skeletonTop}>
                    <Skeleton width="80px" height="80px" radius="8px" />
                    <div className={styles.skeletonInfo}>
                        <Skeleton width="140px" height="16px" />
                        <Skeleton width="90px" height="14px" />
                        <Skeleton width="150px" height="14px" />
                    </div>
                    <Skeleton width="70px" height="70px" radius="8px" />
                </div>

                {/* Bottom actions */}
                <div className={styles.skeletonActions}>
                    <Skeleton height="36px" radius="6px" />
                    <Skeleton height="36px" radius="6px" />
                    <Skeleton height="36px" radius="6px" />
                    <Skeleton height="36px" radius="6px" />
                </div>
            </div>
        );
    }

    // ======================================
    // RENDER
    // ======================================
    return (
        <section className={styles.businesses} aria-labelledby="businesses-title">
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Text variant="body" colorVariant="muted">
                        Gestisci le tue attività e genera il QR del sito pubblico.
                    </Text>
                </div>

                {!isFormOpen && (
                    <div className={styles.headerRight}>
                        <button
                            type="button"
                            className={styles.addButton}
                            onClick={() => setIsFormOpen(prev => !prev)}
                        >
                            Aggiungi attività
                        </button>
                    </div>
                )}
            </header>

            {/* Form inline aperto solo quando serve */}
            {isFormOpen && (
                <div className={styles.formWrapper}>
                    <BusinessCreateCard
                        values={createForm}
                        errors={createErrors}
                        onFieldChange={handleCreateFieldChange}
                        onCoverChange={handleCreateCoverChange}
                        onSubmit={handleAdd}
                        onCancel={() => {
                            setIsFormOpen(false);
                            setCreateErrors({});
                            setCreateForm({
                                name: "",
                                city: "",
                                address: "",
                                slug: "",
                                type: "restaurant",
                                coverPreview: null
                            });
                            setCreateCoverFile(null);
                            setCreateSlugTouched(false);
                        }}
                        loading={isCreating}
                        previewBaseUrl={previewBaseUrl}
                    />
                </div>
            )}

            <BusinessEditModal
                open={isEditOpen}
                values={editForm}
                errors={editErrors}
                loading={isEditing}
                previewBaseUrl={previewBaseUrl}
                onFieldChange={handleEditFieldChange}
                onCoverChange={handleEditCoverChange}
                onSubmit={handleSaveEdit}
                onClose={() => {
                    setIsEditOpen(false);
                    setEditingId(null);
                    setEditForm(null);
                    setEditCoverFile(null);
                    setEditErrors({});
                }}
            />

            {/* Lista attività */}
            {isLoadingBusinesses ? (
                <>
                    <BusinessCardSkeleton />
                    <BusinessCardSkeleton />
                    <BusinessCardSkeleton />
                </>
            ) : (
                <BusinessList
                    businesses={businesses}
                    onEdit={handleEditClick}
                    onDelete={handleDelete}
                    onOpenReviews={handleOpenReviews}
                />
            )}

            <ConfirmModal
                isOpen={showSlugWarning}
                title="Modifica dello slug"
                description="Modificando lo slug, i QR code già stampati e i link condivisi smetteranno di funzionare. Vuoi procedere?"
                confirmLabel="Ho capito"
                onConfirm={() => {
                    setShowSlugWarning(false);
                    setPendingEditSubmit(true);

                    // RILANCIA IL SUBMIT DELLA MODALE
                    const form = document.getElementById("edit-business-form");
                    if (form) {
                        form.dispatchEvent(
                            new Event("submit", { cancelable: true, bubbles: true })
                        );
                    }
                }}
            />

            <ConfirmModal
                isOpen={showSlugAlreadyUsedModal}
                title="Slug già esistente"
                description="Questo slug è già in uso. Ecco alcune alternative che puoi usare:"
                confirmLabel="Chiudi"
                onConfirm={() => setShowSlugAlreadyUsedModal(false)}
            >
                <div style={{ marginBottom: "1.3rem" }}>
                    {slugSuggestions.map(s => (
                        <button
                            key={s}
                            style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "8px 12px",
                                borderRadius: 6,
                                border: "1px solid #ddd",
                                marginBottom: 8
                            }}
                            onClick={() => {
                                // se siamo in edit:
                                if (editForm) {
                                    setEditForm(prev => (prev ? { ...prev, slug: s } : prev));
                                }

                                // se siamo in creazione:
                                if (!editForm) {
                                    setCreateForm(prev => ({ ...prev, slug: s }));
                                }

                                setShowSlugAlreadyUsedModal(false);
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </ConfirmModal>

            <ConfirmModal
                isOpen={showDeleteModal}
                title="Elimina attività"
                description="Sei sicuro di voler eliminare questa attività? L'operazione non è reversibile."
                confirmLabel="Elimina"
                cancelLabel="Annulla"
                onConfirm={confirmDelete}
                onCancel={() => {
                    setShowDeleteModal(false);
                    setDeleteTargetId(null);
                }}
            />
        </section>
    );
}
