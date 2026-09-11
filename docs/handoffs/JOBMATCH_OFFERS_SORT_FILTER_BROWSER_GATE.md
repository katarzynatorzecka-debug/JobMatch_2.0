# JOBMATCH — OFFERS SORT/FILTER HUMAN BROWSER GATE

Wykonaj ręcznie w Chrome na `http://localhost:5173/offers`. Nie zmieniaj kodu, nie uruchamiaj analizy AI i nie commituj.

1. Otwórz `/offers` i potwierdź, że domyślnie widok jest `Najnowsze`, a oferty są ułożone od najnowszego importu/raportu do najstarszego.
2. Sprawdź kolejno `Najstarsze`, `Najwyższy AI score` i `Najniższy AI score`. Przy sortowaniu po score oferty bez score muszą być na końcu.
3. Ustaw jednocześnie Hard Filter oraz dostępne filtry źródła/raportu importu. Potwierdź, że lista spełnia wszystkie wybrane filtry i nadal zachowuje wybrany sort.
4. Kliknij `Wyczyść filtry`. Potwierdź powrót do wszystkich ofert i sortowania `Najnowsze`.
5. Przejdź do innej zakładki i wróć do `/offers`, następnie odśwież stronę. Potwierdź, że wybrany sort i filtry pozostają zachowane w obrębie aplikacji.

Raport zwrotny:

- `PASS` albo `BLOCKED`;
- zaobserwowana kolejność dla każdego sortowania;
- czy null score był na końcu;
- czy kombinacja filtrów i reset działały;
- ewentualny błąd UI lub konsoli z dokładnym tekstem.