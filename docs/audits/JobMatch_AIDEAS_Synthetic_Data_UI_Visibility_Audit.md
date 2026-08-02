# JobMatch — audyt widoczności syntetycznych ofert w UI

**Zakres:** diagnostyka kodu bez inserta, zapisu Supabase, zmian funkcjonalnych ani commitu.  
**Stan danych wejściowych do audytu:** walidacja Supabase przekazana do audytu potwierdza 2 profile, 2 sesje importu, 5 ofert i 3 analizy oraz poprawne relacje.

## 1. Jednozdaniowa przyczyna

Po zalogowaniu `OffersPage` nie odtwarza ofert z Supabase: czyta wyłącznie przefiltrowaną listę z klucza `sessionStorage` `jobmatch.hard-filter-session.v1`, który nie jest tworzony ani odtwarzany podczas logowania lub chmurowego odczytu importu.

## 2. Faktyczna ścieżka ładowania po logowaniu

```text
Supabase Auth session
  → AppModeProvider ustawia mode = authenticated i Session
  → /offers renderuje OffersPage
  → OffersPage: loadHardFilterSession() z sessionStorage
  → brak klucza hard-filter-session
  → imported = []
  → ekran „Brak wyników Hard Filter”
```

### Auth i `AppMode`

Plik: `src/features/access/AppModeProvider.tsx`

- `supabase.auth.getSession()` ustawia `session` oraz `mode = 'authenticated'` dla aktywnej sesji.
- `onAuthStateChange` aktualizuje wyłącznie sesję i tryb aplikacji.
- Provider nie wywołuje `supabaseImportRepository(...).load()`, nie zapisuje Hard Filter ani nie przechowuje active import session ID.
- Klucz `jobmatch.app-mode.v1` dotyczy wyłącznie demo i nie jest wskaźnikiem importu.

### `OffersPage`

Plik: `src/pages/OffersPage.tsx`

```ts
const sessionResult = loadHardFilterSession()
const imported = useMemo(
  () => sortFilteredOffers(sessionResult.session?.filteredOffers ?? []),
  [sessionResult.session],
)
```

Następnie warunek:

```ts
if (!imported.length) return <... title="Brak wyników Hard Filter" ... />
```

Jedyny efekt poboczny na stronie pobiera **analizy**, nie oferty:

```ts
supabaseAnalysisRepository(session.user).load()
```

`OffersPage` nie importuje `supabaseImportRepository`, nie wywołuje `supabase.from('job_offers')` ani `supabase.from('import_sessions')` i nie ma kontekstu aktualnego raportu. Analizy pobrane z chmury nie są w stanie utworzyć kart ofert bez `FilteredJobOffer` ze storage.

### Storage wymagany przez stronę wyników

Plik: `src/features/hardFilter/hardFilterSessionStorage.ts`

```text
jobmatch.hard-filter-session.v1  → sessionStorage
```

`loadHardFilterSession()` zwraca `null`, gdy klucz nie istnieje. Dane są walidowane `validateHardFilterSession`; nieprawidłowa wartość jest usuwana. Storage jest zależny od sesji przeglądarki, a nie od konta Supabase.

Inne istotne klucze:

| Klucz | Storage | Rola |
| --- | --- | --- |
| `jobmatch.import-session.v1` | `sessionStorage` | lokalny import demo; nie jest źródłem `OffersPage` |
| `jobmatch.job-analyses.v1` | `sessionStorage` | lokalne analizy demo |
| `jobmatch.app-mode.v1` | `sessionStorage` | znacznik trybu demo |
| profil lokalny | `localStorage` | tylko tryb demo |

## 3. Chmurowy flow importu istnieje, ale nie jest połączony z `/offers`

Plik: `src/pages/ImportAnalysisPage.tsx`

Po wejściu na `/import` w trybie authenticated uruchamia się:

```ts
supabaseImportRepository(session.user).load()
```

Repozytorium w `src/features/supabase/repositories.ts` działa w następujący sposób:

1. `supabaseImportSessionRepository(user).loadLatest()` pobiera dokładnie jedną, najnowszą sesję:

```ts
supabase
  .from('import_sessions')
  .select('id, source_type, source_filename, created_at')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

2. Odrzuca sesję, jeżeli `source_type !== 'rocketjobs-eml'`.
3. `supabaseJobOfferRepository(user).load(sessionId)` pobiera tylko oferty użytkownika z tej jednej sesji:

```ts
supabase
  .from('job_offers')
  .select('normalized_data')
  .eq('user_id', user.id)
  .eq('import_session_id', sessionId)
  .order('created_at')
```

4. Odczytane `normalized_data` jest składane do `ImportedReport` i walidowane przez `validateImportedReport`.

Ten flow ustawia lokalny stan `report` wyłącznie w `ImportAnalysisPage`. Nie zapisuje `jobmatch.hard-filter-session.v1`, nie emituje go do kontekstu aplikacji i nie przekazuje go do `OffersPage`.

## 4. Dokładne miejsce utworzenia wyniku Hard Filter

W `ImportAnalysisPage.startHardFilter()` następuje jedyne zapisanie danych wymaganych przez listę ofert:

```ts
const filteredOffers = evaluateOffers(profileResult.profile, visibleOffers)
saveHardFilterSession({ version: 1, filteredOffers })
```

Powyższy zapis jest wykonywany dopiero po ręcznym wejściu na `/import` i kliknięciu **„Analizuj oferty”**. Logowanie samo w sobie go nie uruchamia. Także odczyt najnowszego raportu z chmury nie uruchamia go automatycznie.

## 5. Profil, RLS, walidacja i Network

### Profil

Profil w trybie authenticated jest pobierany poprawnym, odrębnym repozytorium:

```ts
supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
```

`ImportAnalysisPage.startHardFilter()` używa `supabaseProfileRepository(session.user).load()`. Nie znaleziono warunku, który celowo ignoruje profil dodany do Supabase tylko dlatego, że został utworzony ręcznie.

### RLS

Migracje definiują polityki owner-only (`auth.uid() = user_id`) dla `profiles`, `import_sessions`, `job_offers` i `job_analyses`. Repozytoria dodatkowo filtrują zapytania przez `eq('user_id', session.user.id)`.

Nie znaleziono w kodzie dowodu, że pusta lista na `/offers` wynika z RLS, `401`, `403` albo błędu Zod. Zgodnie z przekazanym wynikiem walidacji dane i relacje w Supabase są poprawne. Bezpośrednią przyczyną jest wcześniejszy warunek renderowania oparty na pustym `sessionStorage`.

### Co pojawi się w Network przy bezpośrednim wejściu na `/offers`

Statyczna analiza kodu potwierdza:

- strona może pobrać `job_analyses` dla zalogowanego użytkownika;
- strona nie wywołuje zapytania do `job_offers` ani `import_sessions`;
- zatem brak requestu do `job_offers` na tej trasie jest oczekiwanym skutkiem kodu, a nie błędem sieci;
- brak runtime capture w tym audycie — nie deklarujemy zaobserwowania konkretnego statusu HTTP, konsoli lub Network.

### Walidacja Zod

Zod może odrzucić chmurowe oferty wyłącznie na trasie `/import`, w `supabaseJobOfferRepository.load()`, gdy `normalized_data` nie spełnia `ImportedReport`. `OffersPage` nie uruchamia tej walidacji, gdyż nie ładuje ofert z chmury.

## 6. Ocena poprawności inserta

Na podstawie przekazanej walidacji Supabase (liczności, relacje, statusy i brak osieroconych rekordów) insert danych syntetycznych jest poprawny względem wskazanych tabel. Nie jest to problem aktywnej sesji importu w bazie ani ręcznie dodanych rekordów jako takich.

Problemem jest brak hydratacji transientnego wyniku Hard Filter dla danych odtworzonych z chmury. Aplikacja obsługuje chmurowy import na stronie importu, ale nie dzieli jego stanu z trasą wyników.

## 7. Najkrótsze bezpieczne obejście testowe bez zmiany kodu

### Pełna lista syntetycznych ofert

1. Zaloguj się jako `alicja.testowa@example.com`.
2. Otwórz `/import` i poczekaj, aż aplikacja odczyta najnowszy raport z Supabase.
3. Kliknij **„Analizuj oferty”** — zapisze wynik Hard Filter do `jobmatch.hard-filter-session.v1`.
4. Przejdź do `/offers`.

Uwaga: dla ofert `pass` i `weak` ten przycisk uruchamia także analizę AI, więc może wiązać się z wywołaniem dostawcy AI.

### Najkrótsze potwierdzenie przypadku `FAIL` bez AI i bez przebudowy produktu

1. Zaloguj się jako Alicja i otwórz `/import`.
2. Po odczycie raportu usuń w UI dwie oferty inne niż `synthetic-offer-a-fail-003`. Usunięcie dotyczy wyłącznie bieżącego stanu strony.
3. Kliknij **„Analizuj oferty”**. Dla jedynej widocznej oferty Hard Filter zapisze wynik `fail` do `sessionStorage`; orkiestrator pominie analizę AI dla statusu `fail`.
4. Otwórz ręcznie `/offers` z menu. Karta oferty pokaże status Hard Filter `FAIL` bez tworzenia analizy AI.

To obejście nie zmienia danych w Supabase, nie wykonuje inserta ani nie tworzy sztucznej analizy dla `FAIL`.

## 8. Rekomendacja

Na potrzeby testu AIDEAS istnieje bezpieczne obejście bez zmiany kodu: użyć `/import` do odtworzenia raportu i jednorazowego zapisania Hard Filter w bieżącej sesji przeglądarki.

Docelowa minimalna zmiana produktu, jeśli wyniki z chmury mają być widoczne bez tego kroku: `OffersPage` powinien w trybie authenticated odtworzyć najnowszy `ImportedReport` z `supabaseImportRepository`, pobrać profil, uruchomić `evaluateOffers`, a następnie użyć tego wyniku do renderowania. Alternatywnie można przenieść active import + Hard Filter do współdzielonego repozytorium/chmury. Taka zmiana nie została wykonana w audycie.

## 9. Stan Git

Nowy jest wyłącznie ten dokument audytowy w `docs/audits/`. Pozostałe zmiany są wcześniejszymi zmianami Checkpointu 7, Visual Alignment, `.env.example` i wcześniejszymi materiałami audytowymi.

AUDYT WIDOCZNOŚCI DANYCH GOTOWY. NIE WYKONANO ZMIAN FUNKCJONALNYCH, INSERTU, GIT ADD, COMMITU ANI PUSH.
