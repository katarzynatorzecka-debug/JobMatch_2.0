# JobMatch — Checkpoint 7: raport końcowy

**Status:** READY FOR DEVELOPMENT REVIEW  
**Data:** 1 sierpnia 2026  
**Zakres:** Live Offer Content Source Integration

## 1. Cel checkpointu

Checkpoint 7 rozszerza analizę ofert o pobieranie aktualnej treści ogłoszenia z dozwolonego źródła RocketJobs. Aplikacja pobiera źródło po stronie Supabase Edge Function, normalizuje je do bezpiecznej struktury i przekazuje do istniejącego flow analizy AI.

Frontend nie pobiera stron ofert bezpośrednio.

## 2. Zrealizowany flow

```text
ImportedJobOffer
  → sourceUrl
  → fetch-offer-page (Supabase Edge Function)
  → OfferPageSource / normalizacja
  → ocena jakości źródła
  → AnalysisOrchestrator
  → analiza AI
  → zapis wyniku
  → lista ofert i szczegóły
```

Obsługiwane są trzy stany źródła:

- **Źródło pełne** — wykorzystano kompletną treść oferty.
- **Źródło częściowe** — analiza wykorzystuje dostępne dane importu oraz częściowo odzyskane dane źródłowe.
- **Źródło niedostępne** — analiza korzysta z bezpiecznego fallbacku danych importu; użytkownik widzi kod przyczyny i może ponowić próbę.

## 3. Implementacja

Dodano:

- kontrakty `OfferPageSource`, jakości, statusów i kodów błędów,
- walidację Zod dla danych źródłowych,
- `offerContentFetcher`, `offerContentNormalizer` i `offerSourceRepository`,
- lokalne przechowywanie cache źródeł w trybie demo oraz zapis znormalizowanych źródeł w `job_offers.source_data` dla kont zalogowanych,
- integrację pobrania źródła z `AnalysisOrchestrator`,
- status pobierania oraz etykiety jakości źródła w imporcie, na liście i w szczegółach oferty,
- Edge Function `fetch-offer-page`,
- migrację `20260731_offer_page_sources.sql`.

Funkcja źródłowa akceptuje wyłącznie HTTPS dla `rocketjobs.pl` i `www.rocketjobs.pl`. Kontroluje przekierowania, limit rozmiaru odpowiedzi oraz timeout.

## 4. Prywatność i bezpieczeństwo

Nie są przechowywane ani wysyłane do repozytorium:

- surowy HTML,
- DOM,
- skrypty, trackery i cookies,
- surowa treść plików `.eml`.

Zapisywane są wyłącznie znormalizowane dane użyteczne dla analizy: opis, wymagania, obowiązki, benefity i metadane oferty. Pole `source_data` dziedziczy istniejące polityki RLS tabeli `job_offers`.

Obsługiwane kody diagnostyczne:

- `SOURCE_URL_MISSING`
- `UNSUPPORTED_SOURCE_DOMAIN`
- `SOURCE_FETCH_FAILED`
- `SOURCE_TIMEOUT`
- `SOURCE_TOO_LARGE`
- `SOURCE_EMPTY`
- `SOURCE_PARSE_FAILED`
- `SOURCE_BLOCKED`

## 5. Wdrożenie Supabase

- Projekt: `jobmatch-aideas`
- Project ref: `<PROJECT_REF>`
- Wdrożona migracja: `20260731_offer_page_sources.sql`
- Wdrożona funkcja: `fetch-offer-page`, wersja 1

Nie zmieniano sekretu OpenAI ani nie dodawano sekretów do frontendu.

## 6. Walidacja manualna

Przetestowano dwa raporty RocketJobs, łącznie pięć ofert:

| Raport | Liczba ofert | Wynik |
| --- | ---: | --- |
| `rocketjobs-report-1.eml` | 3 | 3/3 ukończone; 1 źródło pełne, 2 częściowe |
| `rocketjobs-report-2.eml` | 2 | 2/2 ukończone; 2 źródła pełne |

Potwierdzono:

- przejście każdej oferty przez pobranie źródła i analizę AI,
- zapis wyników,
- wyświetlenie wyniku na liście,
- score i cztery kategorie w szczegółach,
- odtworzenie danych po reloadzie,
- poprawny licznik analiz dotyczący bieżącego importu.

Przycisk retry jest zaimplementowany. Nie został wywołany ręcznie, ponieważ testy live nie zwróciły błędu pobrania źródła.

## 7. Walidacja automatyczna

| Polecenie | Wynik |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test` | PASS — 22 pliki, 82 testy |
| `npm.cmd run build` | PASS |
| Dev server | aktywny pod `http://127.0.0.1:5190/` |

Build wyświetla wyłącznie standardowe ostrzeżenie Vite o rozmiarze bundla; nie wpływa ono na wynik kompilacji.

## 8. Stan Git

Ostatni commit:

```text
f2fb37e feat: complete real AI job match analysis flow
```

Checkpoint 7 nie został dodany do indeksu ani zacommitowany.

Zmiany Visual Alignment, pliki `design/`, `public/`, screenshot oraz PDF testowy pozostają poza zakresem Checkpointu 7 i muszą być wyłączone z jego commitu.

Proponowany komunikat commitu:

```text
feat: add live offer content source integration
```

## 9. Decyzja

**Checkpoint 7 jest gotowy do Development Review.**
