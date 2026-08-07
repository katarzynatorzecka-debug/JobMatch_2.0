# JobMatch — Phase 6 Final Generator Sanitization Retest (Chrome)

Aplikacja: `http://localhost:5173`
Canonical oferta: `7b5e9c09-0137-4269-a72e-6071f36ec460`

Nie zmieniaj scoringu, workspace ani ustawień listy. Wykonaj najwyżej 10 provider calls; jeśli pierwszy daje jednoznaczny wynik, zakończ test bez kolejnych.

1. Otwórz `/offers/7b5e9c09-0137-4269-a72e-6071f36ec460` i potwierdź tytuł, firmę oraz bieżącą analizę.
2. Przejdź do `/offers/7b5e9c09-0137-4269-a72e-6071f36ec460/message`.
3. Wybierz ton i kliknij „Wygeneruj wiadomość” dokładnie jeden raz.
4. Sprawdź całą wygenerowaną wiadomość: nie może zawierać `MATCH`, `PARTIAL`, `NO_MATCH` ani `UNKNOWN` (również jako osobnych tokenów). Powinna nadal odnosić się do prawdziwych danych oferty, profilu i bieżącej analizy.
5. Zapisz liczbę wykonanych provider calls oraz screenshot generatora. Nie wykonuj regeneracji, jeśli pierwszy wynik jednoznacznie potwierdza brak raw enumów.
6. Wróć do szczegółów i listy, potwierdzając tę samą canonical ofertę.

Wynik: PASS/FAIL, dokładny URL, screenshot i ewentualny znaleziony raw token. Nie commituj i nie uruchamiaj Phase 7.