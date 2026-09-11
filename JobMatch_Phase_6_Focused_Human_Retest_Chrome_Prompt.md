# JobMatch — Phase 6 Focused Human Retest (Chrome)

Aplikacja: `http://localhost:5173`
Canonical oferta: `7b5e9c09-0137-4269-a72e-6071f36ec460`

Nie zmieniaj scoringu, danych workspace ani ustawień listy poza krokami poniżej. W jednym flow można wykonać najwyżej 10 kontrolowanych wywołań AI/provider; zatrzymaj test przy powtarzającym się błędzie bez nowej wiedzy.

## A. Etykiety kryteriów

1. Otwórz bezpośrednio `/offers/7b5e9c09-0137-4269-a72e-6071f36ec460` i odśwież stronę.
2. W sekcji kryteriów potwierdź, że nie występują surowe wartości `MATCH`, `PARTIAL`, `NO_MATCH`, `UNKNOWN`.
3. Potwierdź odpowiedniki: „Spełnione”, „Częściowo spełnione”, „Niespełnione”, „Brak wystarczających danych”.

## B. Bezpieczny generator smoke

4. Kliknij „Wygeneruj wiadomość” dla tej samej oferty i potwierdź canonical URL `/offers/7b5e9c09-0137-4269-a72e-6071f36ec460/message`.
5. Wybierz ton i kliknij pierwsze „Wygeneruj wiadomość”. Sprawdź, że treść odnosi się wyłącznie do danych profilu, oferty i bieżącej analizy.
6. Ręcznie zmień treść, następnie kliknij „Wygeneruj ponownie”. Potwierdź, że UI ostrzega lub chroni ręczne zmiany zgodnie z istniejącym kontraktem; nie akceptuj cichego nadpisania bez ostrzeżenia.
7. Skopiuj wiadomość i potwierdź komunikat oraz zawartość schowka.
8. Ścieżkę failure/retry wykonaj wyłącznie, jeśli można ją wywołać bez destrukcji i bez zmiany danych. W przeciwnym razie wpisz `automated coverage`.
9. Wróć do szczegółów, a następnie listy. Potwierdź, że oferta pozostaje tą samą canonical ofertą.

## Wynik

Zapisz PASS/FAIL dla każdego punktu, URL-e, screenshoty oraz liczbę wykonanych provider calls. Nie commituj i nie rozpoczynaj nowej fazy.