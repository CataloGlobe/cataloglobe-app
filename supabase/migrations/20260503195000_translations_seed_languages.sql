-- =============================================================================
-- Translations: seed supported_languages (Prompt 4 di 24)
-- =============================================================================
--
-- Popola supported_languages con le 32 lingue DeepL Pro mancanti (oltre 'it'
-- già inserito al Prompt 1 come seed minimo per FK su tenants.base_language_code).
--
-- Lingue scelte: ISO 639-1 base, NESSUNA variante regionale (en/pt/zh non
-- sono splittate en-US/en-GB / pt-BR/pt-PT / zh-Hans/zh-Hant). Il provider
-- adapter (Prompt 6) deciderà mapping default. Coerente con doc v3 sez. 5.4.
--
-- Pre-flight verificato in chat: 0 attività con slug = language code
-- (limitazione is_reserved_slug STABLE — Prompt 1 sez. 8). Se in futuro nuove
-- lingue verranno aggiunte, ripetere il pre-flight prima di INSERT.
--
-- Idempotenza: ON CONFLICT (code) DO NOTHING. Re-applicabile.
--
-- Sort order: 'it'=0 (Prompt 1, lingua sorgente piattaforma), poi step 10
-- per inserimenti futuri senza renumber.
--
-- Ref: docs/translations-architecture-v3.md sez. 4.2, 5.4.
-- =============================================================================

INSERT INTO public.supported_languages (
    code, name_en, name_native, flag_emoji, provider_preference, is_available, sort_order
) VALUES
    ('en', 'English',              'English',              '🇬🇧', 'deepl', true,  10),
    ('fr', 'French',               'Français',             '🇫🇷', 'deepl', true,  20),
    ('de', 'German',               'Deutsch',              '🇩🇪', 'deepl', true,  30),
    ('es', 'Spanish',              'Español',              '🇪🇸', 'deepl', true,  40),
    ('pt', 'Portuguese',           'Português',            '🇵🇹', 'deepl', true,  50),
    ('nl', 'Dutch',                'Nederlands',           '🇳🇱', 'deepl', true,  60),
    ('pl', 'Polish',               'Polski',               '🇵🇱', 'deepl', true,  70),
    ('ru', 'Russian',              'Русский',              '🇷🇺', 'deepl', true,  80),
    ('uk', 'Ukrainian',            'Українська',           '🇺🇦', 'deepl', true,  90),
    ('sv', 'Swedish',              'Svenska',              '🇸🇪', 'deepl', true, 100),
    ('da', 'Danish',               'Dansk',                '🇩🇰', 'deepl', true, 110),
    ('nb', 'Norwegian Bokmål',     'Norsk',                '🇳🇴', 'deepl', true, 120),
    ('fi', 'Finnish',              'Suomi',                '🇫🇮', 'deepl', true, 130),
    ('cs', 'Czech',                'Čeština',              '🇨🇿', 'deepl', true, 140),
    ('sk', 'Slovak',               'Slovenčina',           '🇸🇰', 'deepl', true, 150),
    ('sl', 'Slovenian',            'Slovenščina',          '🇸🇮', 'deepl', true, 160),
    ('hu', 'Hungarian',            'Magyar',               '🇭🇺', 'deepl', true, 170),
    ('ro', 'Romanian',             'Română',               '🇷🇴', 'deepl', true, 180),
    ('bg', 'Bulgarian',            'Български',            '🇧🇬', 'deepl', true, 190),
    ('el', 'Greek',                'Ελληνικά',             '🇬🇷', 'deepl', true, 200),
    ('tr', 'Turkish',              'Türkçe',               '🇹🇷', 'deepl', true, 210),
    ('lt', 'Lithuanian',           'Lietuvių',             '🇱🇹', 'deepl', true, 220),
    ('lv', 'Latvian',              'Latviešu',             '🇱🇻', 'deepl', true, 230),
    ('et', 'Estonian',             'Eesti',                '🇪🇪', 'deepl', true, 240),
    ('hr', 'Croatian',             'Hrvatski',             '🇭🇷', 'deepl', true, 250),
    ('ar', 'Arabic',               'العربية',              '🇸🇦', 'deepl', true, 260),
    ('zh', 'Chinese (Simplified)', '中文',                  '🇨🇳', 'deepl', true, 270),
    ('ja', 'Japanese',             '日本語',                 '🇯🇵', 'deepl', true, 280),
    ('ko', 'Korean',               '한국어',                 '🇰🇷', 'deepl', true, 290),
    ('id', 'Indonesian',           'Bahasa Indonesia',     '🇮🇩', 'deepl', true, 300),
    ('he', 'Hebrew',               'עברית',                '🇮🇱', 'deepl', true, 310),
    ('vi', 'Vietnamese',           'Tiếng Việt',           '🇻🇳', 'deepl', true, 320)
ON CONFLICT (code) DO NOTHING;
