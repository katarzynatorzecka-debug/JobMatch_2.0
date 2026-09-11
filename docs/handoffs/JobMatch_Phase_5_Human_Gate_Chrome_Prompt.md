# JobMatch — Phase 5 Human Gate — Chrome Prompt

Adres: `http://localhost:5173/offers`

Wykonaj wylacznie authenticated browser smoke test. Nie uruchamiaj nowych analiz AI.

1. Potwierdz, ze domyslny widok pokazuje aktywne, niewykluczone oferty.
2. Przelacz `Zakres ofert` na `Historyczne` i potwierdz, ze pokazuja sie oferty historyczne bez duplikatów canonical.
3. Wróc do `Aktywne`.
4. Sprawdz sortowanie `Najnowszy raport`.
5. Sprawdz sortowanie `AI score: najwyzszy` oraz `AI score: najnizszy`.
6. Potwierdz, ze oferta bez AI score pozostaje na koncu listy.
7. Otwórz szczególy jednej oferty.
8. Wróc do `/offers` i potwierdz zachowanie zakresu, filtrów i sortowania.
9. Potwierdz brak technicznych etykiet lifecycle, queue, freshness i raw error codes w UI.

Zapisz wynik PASS/FAIL wraz z URL-em i screenshotami. Nie commituj zmian.