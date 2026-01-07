export interface FeedbackItem {
    id: string;
    customer: string;
    comment: string;
    rating: number;
    date: string;
}

export const feedbackData: FeedbackItem[] = [
    {
        id: "1",
        customer: "Mario Rossi",
        comment: "Servizio impeccabile, tornerò sicuramente!",
        rating: 5,
        date: "2025-10-10"
    },
    {
        id: "2",
        customer: "Giulia Bianchi",
        comment: "Tutto ok, ma il tempo di attesa un po' lungo.",
        rating: 4,
        date: "2025-10-12"
    },
    {
        id: "3",
        customer: "Luca Verdi",
        comment: "Esperienza deludente, il piatto era freddo.",
        rating: 2,
        date: "2025-10-15"
    },
    {
        id: "4",
        customer: "Sara Neri",
        comment: "Ottimo rapporto qualità-prezzo.",
        rating: 5,
        date: "2025-10-18"
    },
    {
        id: "5",
        customer: "Elisa Blu",
        comment: "Staff cordiale ma servizio lento.",
        rating: 3,
        date: "2025-10-22"
    }
];
