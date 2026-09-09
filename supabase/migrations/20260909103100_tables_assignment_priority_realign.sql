-- I tre stati UI (Per primo/Normale/Per ultimo) mappano 100/50/0 su scala 0-100
-- dove piu alto = scelto prima. Oggi tutti i tavoli sono a 0, che nella nuova
-- scala significa "Per ultimo": senza riallineamento il parco tavoli intero
-- cambierebbe comportamento senza che nessuno l'abbia chiesto.
UPDATE tables SET assignment_priority = 50 WHERE assignment_priority = 0;
