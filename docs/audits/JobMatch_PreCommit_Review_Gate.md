# JobMatch — Pre-Commit Review Gate

Data przeglądu: 2026-08-02  
Gałąź: `master`  
Ostatni commit: `f2fb37e feat: complete real AI job match analysis flow`

## Decyzje zakresowe

| Zakres | Status | Decyzja techniczna |
| --- | --- | --- |
| A. Checkpoint 7 — live offer content | READY TO COMMIT | Kod, migracja, Edge Function i testy tworzą spójny zakres. Raport CP7 nie wchodzi do tego commitu bez redakcji i uporządkowania dokumentacji. |
| B. Visual Alignment | READY TO COMMIT | Assety używane przez aplikację są poprawnie referencjonowane, a diff nie miesza funkcjonalności. Formalna akceptacja wizualna użytkowniczki została potwierdzona przez PMO; ponowny runtime review nie jest wymagany. |
| C. `.env.example` | READY TO COMMIT | Zawiera wyłącznie bezpieczne placeholdery przy zachowaniu nazw zmiennych używanych przez klienta Supabase. |
| D. AIDEAS — timestamp compatibility | READY TO COMMIT | Minimalna zmiana walidacji timestampu i odpowiadające jej testy. |
| E. AIDEAS — dokumentacja i dane syntetyczne | READY AFTER SMALL CORRECTION | Przed commitem należy zredagować pełny project ref w raporcie bezpieczeństwa. Finalny SQL z UUID kont syntetycznych pozostaje poza repozytorium. |

## A. Checkpoint 7 — feature scope

Zakres obejmuje kontrakt źródła oferty, pobieranie i normalizację treści, repository źródła, integrację orkiestratora, widok importu/listy/szczegółów, Edge Function `fetch-offer-page`, migrację `20260731_offer_page_sources.sql` oraz testy jednostkowe.

Przepływ jest spójny: frontend wywołuje `fetch-offer-page`, wynik jest normalizowany do kontraktu źródła, zapisany w `source_data` i wykorzystywany przez orkiestrator z kontrolowanym fallbackiem. Nie znaleziono domieszki zmian Visual Alignment ani zmian w konfiguracji środowiska.

`JobMatch_Checkpoint_7_Final_Report.md` opisuje ten zakres zgodnie z kodem, ale zawiera pełny project ref. Nie powinien wejść do commitu CP7 w obecnym stanie. Po redakcji do `<PROJECT_REF>` powinien zostać przeniesiony do `docs/checkpoints/` i zacommitowany osobno jako dokumentacja.

Proponowany commit:

```text
feat: add live offer content source integration
```

## B. Visual Alignment

Zakres obejmuje wyłącznie:

- `src/app/AppShell.tsx`
- `src/features/access/AccessGate.tsx`
- `src/styles/global.css`
- `public/assets/jobmatch-logo.png`
- `public/assets/jobmatch-access-background-v2.png`

Referencje assetów są poprawne: komponenty używają `/assets/jobmatch-logo.png`, a arkusz stylów używa `/assets/jobmatch-access-background-v2.png`. Zmiany w komponencie Access Gate pozostają w warstwie prezentacji i zachowują istniejącą obsługę logowania/rejestracji. Nie znaleziono mieszania z funkcją analizy AI ani CP7.

`public/assets/jobmatch-access-art.png` nie jest obecnie referencjonowany — nie należy go dodawać. Pliki propozycji w `design/access-gate-proposals/` są materiałem roboczym i nie powinny wejść do commitu.

Proponowany commit:

```text
feat: rebuild JobMatch access gate visual design
```

## C. Bezpieczny `.env.example`

Plik zawiera wyłącznie:

```dotenv
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_KEY>
```

Nazwy są zgodne z odczytem konfiguracji w `src/features/supabase/client.ts`. Nie zawiera rzeczywistego klucza, JWT, `service_role`, sekretu OpenAI ani pełnego project ref.

Proponowany commit:

```text
chore: replace public Supabase config with env placeholders
```

## D. AIDEAS — timestamp compatibility fix

Zmiana `src/schemas/importSchemas.ts` ustawia `z.string().datetime({ offset: true })` dla `importedAt`. Pozwala to odczytywać timestampy Supabase z offsetem, bez zmiany pozostałego kontraktu importu. `src/schemas/importSchemas.test.ts` obejmuje wariant UTC, wariant z offsetem i wartość niepoprawną.

Proponowany commit:

```text
fix: accept Supabase timestamp offsets in imported reports
```

## E. AIDEAS — security, audit i dane syntetyczne

Dokumentacja audytowa oraz plan danych syntetycznych są merytorycznie rozdzielone od kodu aplikacji. Przed commitem wymagają jednej małej korekty: w `docs/audits/JobMatch_AIDEAS_Security_Synthetic_HTTP_Audit.md` pełny project ref musi zostać zastąpiony placeholderem `<PROJECT_REF>`.

Plik `docs/audits/JobMatch_AIDEAS_Synthetic_Data_FINAL_SQL_READY_FOR_INSERT.sql` zawiera identyfikatory dwóch syntetycznych kont Auth. Nie jest sekretem, ale jest operacyjnym artefaktem przygotowanym do ręcznego inserta — pozostaje poza repozytorium i wymaga decyzji PMO, jeżeli miałby zostać kiedykolwiek wersjonowany.

Po redakcji bezpieczny, osobny commit dokumentacyjny może objąć raporty audytowe i plany, z wyłączeniem finalnego SQL oraz prywatnych/tymczasowych plików.

Proponowany commit:

```text
docs: add AIDEAS security and synthetic data audit evidence
```

## Pliki poza commitami

- `po dodaniu billing w openAI nadal jest blad.png`
- `test rapot 1.pdf`
- `design/access-gate-proposals/proposal-1-warm-editorial.png`
- `design/access-gate-proposals/proposal-2-career-journey.png`
- `public/assets/jobmatch-access-art.png`
- `docs/audits/JobMatch_AIDEAS_Synthetic_Data_FINAL_SQL_READY_FOR_INSERT.sql`

## Zalecana kolejność stagingu

1. Checkpoint 7 — wyłącznie kod, testy, Edge Function i migracja CP7.
2. Visual Alignment — dwa używane assety oraz trzy pliki UI.
3. `.env.example` — osobny commit dokumentacyjno-konfiguracyjny.
4. Timestamp compatibility fix — schemat i jego testy.
5. AIDEAS documentation — dopiero po redakcji project ref; bez finalnego SQL.

Nie należy tworzyć zbiorczego commitu łączącego te zakresy.

## Walidacja techniczna

- `npm.cmd test`: PASS — 23 pliki testowe, 85 testów.
- `npm.cmd run typecheck`: zatrzymane przez blokadę Windows na `tsconfig.tsbuildinfo` (`TS5033`), nie przez błąd TypeScript.
- Równoważne `npx.cmd tsc --noEmit --tsBuildInfoFile` z plikiem tymczasowym: PASS.
- `npm.cmd run build`: zatrzymane przez tę samą blokadę pliku `tsconfig.tsbuildinfo` przed krokiem Vite.
- Równoważne `npx.cmd vite build --outDir` do katalogu tymczasowego: PASS; pozostało jedynie standardowe ostrzeżenie o rozmiarze bundla.

## Stan Git podczas przeglądu

Stan roboczy zawiera niezatwierdzone zmiany ze wszystkich pięciu zakresów oraz pliki tymczasowe wymienione powyżej. Nie wykonano stagingu, commitu, push, stash ani operacji resetujących.
