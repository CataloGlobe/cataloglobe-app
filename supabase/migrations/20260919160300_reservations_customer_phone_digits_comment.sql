COMMENT ON COLUMN public.reservations.customer_phone_digits IS
    'Sole cifre del telefono, generate dal DB da coalesce(customer_phone_e164, customer_phone). Colonna della ricerca per telefono (LIKE per suffisso, indice GIN trigram). Non scrivibile.';
