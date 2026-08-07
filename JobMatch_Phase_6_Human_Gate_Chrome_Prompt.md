# JobMatch — Phase 6 Human Gate (Chrome)

Adres aplikacji: `http://localhost:5173`

Nie wykonuj nowych wywołań AI ani nie zmieniaj danych produkcyjnych. Wykorzystaj istniejące analizy; jeśli bezpieczne wykonanie scenariusza wymaga providera, oznacz punkt jako „automated coverage”.

## Scenariusz

1. Otwórz bezpośrednio szczegóły istniejącej oferty: `/offers/<canonical-offer-id>` i odśwież stronę. Potwierdź, że oferta oraz dane bieżącej analizy są dostępne.
2. W sekcji „Historia analiz” potwierdź, że bieżąca wersja jest oznaczona „Aktualna”, a wcześniejsze wersje „Poprzednia”. Przy jednej analizie potwierdź komunikat „To jest pierwsza analiza tej oferty”.
3. Potwierdź, że daty/godziny, score, rekomendacja oraz dostępne pokrycie/wiarygodność są prezentowane produktowo. Nie powinny być widoczne UUID, provider ID, klucze wersji ani surowe kody statusów.
4. Sprawdź etykiety bieżącej i nieaktualnej analizy, w tym stan świeżości/statusu, jeśli występuje. Etykiety mają być zrozumiałe produktowo.
5. Z poziomu tych samych szczegółów kliknij „Wygeneruj wiadomość”. Potwierdź trasę `/offers/<ten-sam-canonical-offer-id>/message`.
6. Odśwież trasę generatora i sprawdź, że nadal ładuje tę samą ofertę oraz profil, bez automatycznej analizy i bez automatycznego generowania.
7. W generatorze sprawdź ton, wygenerowanie treści, ręczną edycję oraz potwierdzenie kopiowania. Po ręcznej zmianie uruchom regenerację tylko wtedy, gdy korzysta ona z już dostępnego bezpiecznego testowego mechanizmu; nie uruchamiaj nowego płatnego providera bez zgody.
8. Jeśli bezpiecznie dostępna jest ścieżka błędu bez providera, potwierdź komunikat i możliwość ponowienia. W przeciwnym razie odnotuj „automated coverage”.
9. Wróć z generatora do szczegółów tej samej oferty, a następnie do `/offers`. Potwierdź zachowanie scope (Active/Historical), filtrów i sortowania listy.
10. Wykonaj refresh listy i ponownie sprawdź, że scope, filtry, sortowanie oraz canonical oferta pozostają niezmienione.

## Wynik

Zapisz PASS/FAIL dla każdego punktu, URL-e oraz screenshoty. Nie commituj i nie uruchamiaj Phase 7.