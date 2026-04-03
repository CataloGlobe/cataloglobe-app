export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

export const PRIORITY_LEVEL_LABELS: Record<PriorityLevel, string> = {
    urgent: 'Urgente',
    high:   'Alta',
    medium: 'Media',
    low:    'Bassa',
};

const PRIORITY_LEVEL_DESCRIPTIONS: Record<PriorityLevel, string> = {
    urgent: 'Massima precedenza',
    high:   'Alta precedenza',
    medium: 'Precedenza standard',
    low:    'Minima precedenza',
};

export const PRIORITY_LEVEL_ORDER: PriorityLevel[] = [
    'urgent', 'high', 'medium', 'low',
];

// Bande di valori per livello: urgent=1-10, high=11-20, medium=21-30, low=31-40
// Permette fino a 10 regole per gruppo senza sovrapposizioni di range
const LEVEL_BASE: Record<PriorityLevel, number> = {
    urgent: 1,
    high:   11,
    medium: 21,
    low:    31,
};

export function computePriority(level: PriorityLevel, displayOrder: number): number {
    return LEVEL_BASE[level] + Math.min(displayOrder, 9);
}

export function levelFromPriority(priority: number): PriorityLevel {
    if (priority <= 10) return 'urgent';
    if (priority <= 20) return 'high';
    if (priority <= 30) return 'medium';
    return 'low';
}

export function getPriorityLevelDescription(level: PriorityLevel): string {
    return PRIORITY_LEVEL_DESCRIPTIONS[level];
}

export type PriorityLevelOption = {
    value: PriorityLevel;
    label: string;
    description: string;
};

export const PRIORITY_LEVEL_OPTIONS: PriorityLevelOption[] = PRIORITY_LEVEL_ORDER.map(level => ({
    value: level,
    label: PRIORITY_LEVEL_LABELS[level],
    description: PRIORITY_LEVEL_DESCRIPTIONS[level],
}));
