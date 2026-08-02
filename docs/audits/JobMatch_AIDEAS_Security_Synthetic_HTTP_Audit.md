# JobMatch — audyt AIDEAS: bezpieczeństwo, dane syntetyczne i HTTP

**Data audytu:** 1 sierpnia 2026  
**Zakres:** lokalne repozytorium JobMatch, konfiguracja Git, migracje Supabase, kontrakty aplikacji oraz Edge Function `analyze-job-match`.  
**Ograniczenie:** nie wykonano inserta do Supabase, zmian funkcjonalnych ani commitu.

## 1. Wynik wykonawczy

| Obszar | Wynik |
| --- | --- |
| Pliki `.env` i `.env.local` | Ignorowane przez Git; nie są śledzone, nie są staged i nie występują w historii Git. |
| Staging area | Pusta. |
| Skan kodu pod kątem sekretów | Nie wykryto `service_role`, `OPENAI_API_KEY` ani wzorca `sk-...` w wersjonowanym kodzie poza nazwami zmiennych/obsługą sekretu po stronie Edge Function. |
| `.env.example` | **Wymaga korekty dokumentacyjnej:** zawiera wartości konfiguracji publicznej zamiast samych placeholderów. Nie ujawniamy ich w tym raporcie. |
| Schemat Supabase | Zidentyfikowano cztery tabele aplikacyjne: `profiles`, `import_sessions`, `job_offers`, `job_analyses`. |
| Edge Function analizy | Uwierzytelniona funkcja POST. Przetwarza profil, znormalizowaną ofertę, wynik Hard Filter i opcjonalną znormalizowaną treść oferty. Nie wysyła surowego CV ani surowego `.eml`. |

## 2. Audyt Git i sekretów

### Użyte komendy

```powershell
git status --ignored
git status --short
git check-ignore -v .env
git check-ignore -v .env.local
git ls-files .env .env.local
git diff --cached --name-only
git log --all -- .env .env.local
```

Dodatkowo wykonano bezpieczne wyszukiwanie nazw/wzorców potencjalnych sekretów w kodzie z wyłączeniem `.env*` i `node_modules`; nie wypisywano żadnych wartości.

### Wynik

- `.env` jest objęty regułą `.env` w `.gitignore`.
- `.env.local` jest objęty regułami `.env.*` oraz `*.local`.
- `git ls-files .env .env.local` nie zwrócił śledzonych plików.
- `git diff --cached --name-only` nie zwrócił plików: staging area była pusta.
- `git log --all -- .env .env.local` nie zwrócił wpisów: pliki nie występują w dostępnej historii Git.
- `git status --ignored` potwierdził ignorowanie `.env.local`.
- `.gitignore` zawiera reguły `.env`, `.env.*` i wyjątek `!.env.example`.

### Uwaga dotycząca `.env.example`

Plik jest śledzony i zawiera dwie nazwy zmiennych frontendu:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Zawiera także ich konkretne wartości konfiguracji publicznej. Publishable key nie jest sekretem serwerowym, jednak dla zgodności z wymaganiem AIDEAS plik powinien zawierać wyłącznie bezpieczne placeholdery, np.:

```dotenv
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_KEY>
```

Nie zmieniono tego pliku w ramach audytu.

### Procedura awaryjna: sekret trafił do staging area

1. Przerwać przygotowanie commitu i nie wykonywać `git commit` ani `git push`.
2. Zweryfikować wyłącznie nazwę pliku przez `git diff --cached --name-only` — nie publikować wartości sekretu.
3. Usunąć plik z indeksu, zachowując plik lokalnie: `git restore --staged -- <plik>` albo równoważne `git rm --cached -- <plik>` zależnie od sytuacji.
4. Dopisać właściwą regułę do `.gitignore` oraz ponownie sprawdzić `git check-ignore -v <plik>`.
5. Jeżeli wartość była widoczna w terminalu, logach CI lub udostępnionym zrzucie ekranu, potraktować ją jako ujawnioną i przejść do rotacji.
6. Potwierdzić pusty staging area przez `git diff --cached --name-only`.

To usuwa plik **z indeksu**; nie unieważnia samego sekretu i nie zmienia historii Git.

### Procedura awaryjna: sekret jest już w commicie

1. Natychmiast unieważnić lub zrotować sekret w systemie wydającym: Supabase/OpenAI/inny dostawca. To jest najważniejszy krok.
2. Zaktualizować bezpieczną konfigurację lokalną i deploymentową bez zapisywania nowej wartości do repozytorium.
3. Ocenić zasięg ekspozycji: commit lokalny, zdalne repozytorium, fork, CI, logi, release artefakty i screenshoty.
4. Usunąć sekret z bieżącego drzewa oraz, jeśli commit został opublikowany, przepisać historię odpowiednim narzędziem (np. `git filter-repo`), następnie force-push wyłącznie po uzgodnieniu z właścicielami repozytorium.
5. Poinformować współpracowników, aby nie przywracali starej historii i ponownie sklonowali repozytorium po operacji.
6. Ponownie przeskanować historię oraz potwierdzić rotację sekretu.

Rotacja/unieważnienie sekretu jest niezależne od usunięcia pliku z indeksu i niezależne od czyszczenia historii. Wszystkie trzy czynności mogą być potrzebne.

## 3. Rzeczywisty schemat Supabase

Źródła: `supabase/migrations/20260728_access_and_persistence.sql`, `20260729_job_analyses.sql`, `20260731_offer_page_sources.sql` oraz repozytoria w `src/features/supabase/repositories.ts` i `src/features/analysis/analysisRepository.ts`.

### `public.profiles`

| Kolumna | Typ | Null | Klucz / domyślna wartość |
| --- | --- | --- | --- |
| `id` | `uuid` | NOT NULL | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL | UNIQUE, FK → `auth.users(id)` `ON DELETE CASCADE` |
| `profile_data` | `jsonb` | NOT NULL | Zwalidowany `UserProfile` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

RLS jest włączony. Polityka `profiles own rows` umożliwia użytkownikowi uwierzytelnionemu operacje wyłącznie wtedy, gdy `auth.uid() = user_id`.

### `public.import_sessions`

| Kolumna | Typ | Null | Klucz / domyślna wartość |
| --- | --- | --- | --- |
| `id` | `uuid` | NOT NULL | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `source_type` | `text` | NOT NULL | W aplikacji: `rocketjobs-eml` |
| `source_filename` | `text` | NOT NULL | Nazwa raportu, bez jego treści |
| `offer_count` | `integer` | NOT NULL | Liczba ofert w sesji |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

RLS jest włączony. Polityka `import sessions own rows` ogranicza dostęp do właściciela przez `auth.uid() = user_id`.

### `public.job_offers`

| Kolumna | Typ | Null | Klucz / domyślna wartość |
| --- | --- | --- | --- |
| `id` | `uuid` | NOT NULL | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `import_session_id` | `uuid` | NOT NULL | FK → `public.import_sessions(id)` `ON DELETE CASCADE` |
| `external_id` | `text` | NOT NULL | część UNIQUE (`user_id`, `import_session_id`, `external_id`) |
| `title` | `text` | NOT NULL | znormalizowany tytuł |
| `company` | `text` | NOT NULL | znormalizowana nazwa firmy |
| `url` | `text` | NULL | URL źródłowy oferty |
| `normalized_data` | `jsonb` | NOT NULL | Zwalidowany `ImportedJobOffer` |
| `source_data` | `jsonb` | NULL | Znormalizowany `OfferSourceResult`; bez HTML, DOM, skryptów, trackerów i EML |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

RLS jest włączony. Polityka `job offers own rows` ogranicza dostęp do właściciela. Indeksy obejmują `user_id` i `import_session_id`.

### `public.job_analyses`

| Kolumna | Typ | Null | Klucz / domyślna wartość |
| --- | --- | --- | --- |
| `id` | `uuid` | NOT NULL | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `job_offer_id` | `text` | NOT NULL | część UNIQUE (`user_id`, `job_offer_id`); **nie ma FK** do `job_offers.id` |
| `filter_status` | `text` | NOT NULL | CHECK: `pass`, `weak`, `fail` |
| `analysis_data` | `jsonb` | NOT NULL | Zwalidowany `JobAnalysis` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

RLS jest włączony. Polityka `job analyses own rows` ogranicza dostęp do właściciela. W aplikacji `job_offer_id` przechowuje `ImportedJobOffer.id` (`external_id` z raportu), a nie UUID wiersza `job_offers.id`.

## 4. Kontrakty JSON istotne dla danych syntetycznych

### `profile_data` (`UserProfile`)

Wymagane pola: `primaryRole`, `alternativeRoles`, `experienceSummary`, `skills`, `acceptedWorkModes`, `acceptedContractTypes`, `acceptedLocations`, `minimumSalary`, `studentStatusAvailable`, `excludedContractTypes`, `excludedWorkModes`, `excludedKeywords`, `requiresStudentStatus`, `additionalMustHave`, `additionalBlacklist`, `priorities`.

Dozwolone enumy:

- work mode: `remote`, `hybrid`, `onsite`;
- contract type: `employment`, `b2b`, `mandate`, `freelance`, `internship`;
- priorities: dokładnie po jednym `experience`, `skills`, `preferences`, `growth`.

### `normalized_data` (`ImportedJobOffer`)

Wymagane: `id` (8–120 znaków), `title`, `company`, `missingFields`, `warnings`. Opcjonalne: `location`, `workMode`, `contractType`, `salary`, `sourceUrl`, `sourceLabel`.

### `analysis_data` (`JobAnalysis`)

Wymagane są m.in. `offerId`, `overallScore` (integer 0–100), cztery `categoryScores` (`experience`, `skills`, `preferences`, `growth`), `recommendation`, `summary`, `strengths`, `risks`, `missingInformation`, `hardFilterStatus`, `hardFilterReasons`, `sourceQuality`, `modelInfo`, `createdAt`, `status`.

Dozwolone rekomendacje: `Warto aplikować`, `Wymaga sprawdzenia`, `Nie rekomenduję`. Dozwolone statusy Hard Filter: `pass`, `weak`, `fail`.

## 5. Dokładny prompt dla agenta tworzącego dane syntetyczne

> Jesteś agentem przygotowującym **wyłącznie syntetyczne dane testowe** dla JobMatch. Nie wykonuj inserta, nie łącz się z Supabase i nie generuj komend zawierających sekrety. Wygeneruj najpierw plan, potem jeden blok SQL przeznaczony wyłącznie do ręcznej akceptacji.
>
> Użyj tylko fikcyjnych danych. Nie kopiuj ani nie parafrazuj danych z CV, plików `.eml`, bazy Supabase, historii rozmów lub realnych ogłoszeń. Jeśli potrzebujesz e-maila, używaj wyłącznie domeny `example.com`. Nie używaj realnych firm, osób, adresów, telefonów ani URL-i z realnych serwisów.
>
> Rzeczywisty schemat JobMatch składa się z: `profiles`, `import_sessions`, `job_offers`, `job_analyses`. Konta muszą wcześniej istnieć w `auth.users`; w SQL przyjmij jako parametry `<AUTH_USER_A_UUID>` i `<AUTH_USER_B_UUID>` i nie próbuj bezpośrednio wstawiać do `auth.users`.
>
> Utwórz: 2 profile, 2 sesje importu, 5 ofert i 3 analizy. Użytkownicy to `Alicja Testowa` i `Marek Demonstracyjny`; nazwy firm mogą być wyłącznie `Northstar Demo Labs`, `Amber Cloud Studio`, `Fictional Systems Europe`. Rozdziel dane między użytkowników zgodnie z `user_id`; nie mieszaj właścicieli.
>
> Zachowaj następujące warunki:
>
> 1. Użyj nowych, poprawnych UUID v4 dla każdego rekordu aplikacyjnego i poprawnego `timestamptz` ISO-8601.
> 2. `profiles.user_id` jest UNIQUE i FK do `auth.users(id)`; `profile_data` musi zawierać wszystkie pola `UserProfile`. `priorities` musi zawierać dokładnie cztery różne wartości: `experience`, `skills`, `preferences`, `growth`.
> 3. `import_sessions` musi używać `source_type = 'rocketjobs-eml'`, fikcyjnych nazw plików, poprawnego `offer_count` i `user_id` właściciela.
> 4. `job_offers.import_session_id` musi wskazywać sesję tego samego użytkownika. `external_id` musi być unikalny w obrębie (`user_id`, `import_session_id`). `normalized_data` musi odpowiadać `ImportedJobOffer`: wymagane są `id`, `title`, `company`, `missingFields`, `warnings`; opcjonalne są `location`, `workMode`, `contractType`, `salary`, `sourceUrl`, `sourceLabel`. Użyj wyłącznie adresów `https://example.com/...`.
> 5. Przygotuj oferty obejmujące Hard Filter `pass`, `weak` i `fail`: co najmniej jedną pełną ofertę, co najmniej jedną ofertę z brakami i jedną ofertę celowo niespełniającą kryterium (np. wykluczony model pracy). Nie zapisuj surowego HTML, DOM, EML, cookies ani trackerów. Jeśli tworzysz `source_data`, ma to być wyłącznie znormalizowany obiekt `OfferSourceResult` ze statusem `completed`, `partial` albo `unavailable`.
> 6. Utwórz trzy `job_analyses`. `job_offer_id` jest tekstowym `external_id`, a nie FK do UUID rekordu oferty. Każdy rekord musi mieć poprawny `filter_status` (`pass`, `weak` albo `fail`) i `analysis_data` zgodne z `JobAnalysis`: score 0–100, cztery kategorie (`experience`, `skills`, `preferences`, `growth`), rekomendację dokładnie jedną z `Warto aplikować`, `Wymaga sprawdzenia`, `Nie rekomenduję`, `modelInfo.provider = 'openai'`, poprawny `createdAt` i `status = 'ready'`.
> 7. Jeden z pięciu rekordów ofert ma pozostać bez wpisu w `job_analyses` jako kontrolowany brak analizy. Co najmniej jedna analiza ma odpowiadać ofercie `weak`; nie twórz analizy dla oferty `fail`, jeśli chcesz odtworzyć standardowy flow aplikacji.
> 8. Nie używaj `service_role`, `OPENAI_API_KEY`, tokenów JWT, kluczy publishable ani realnych wartości środowiskowych.
> 9. Najpierw pokaż tabelę zależności i wszystkie UUID. Dopiero pod nią zwróć SQL z kolejnością: profile → import_sessions → job_offers → job_analyses. SQL ma być idempotentny wyłącznie przez jawne sprawdzenie, że żaden wybrany UUID i `external_id` nie istnieje; nie nadpisuj danych nieznanego użytkownika.
>
> Na końcu podaj listę ograniczeń i napisz: `BRAK INSERTU — oczekuję na akceptację właścicielki danych.`

## 6. Plan minimalnego zestawu rekordów — bez inserta

Konta Auth należy utworzyć ręcznie w Supabase Auth albo przez bezpieczny panel administracyjny. W raporcie i SQL nie wolno umieszczać ich haseł. Po utworzeniu kont trzeba skopiować wyłącznie ich UUID do oznaczonych parametrów.

| Encja | Właściciel | Proponowany identyfikator / zależność | Cel |
| --- | --- | --- | --- |
| `auth.users` | Alicja | `<AUTH_USER_A_UUID>` | konto testowe, e-mail wyłącznie `alicja.testowa@example.com` |
| `auth.users` | Marek | `<AUTH_USER_B_UUID>` | konto testowe, e-mail wyłącznie `marek.demonstracyjny@example.com` |
| `profiles` | Alicja | nowy UUID → `<AUTH_USER_A_UUID>` | profil data/automation, preferencje remote/hybrid |
| `profiles` | Marek | nowy UUID → `<AUTH_USER_B_UUID>` | profil product operations, preferencje hybrid |
| `import_sessions` | Alicja | nowy UUID → Alicja | `synthetic-alicja-report.eml`, 3 oferty |
| `import_sessions` | Marek | nowy UUID → Marek | `synthetic-marek-report.eml`, 2 oferty |
| `job_offers` | Alicja | 3 rekordy → sesja Alicji | `pass`, `weak`, `fail` |
| `job_offers` | Marek | 2 rekordy → sesja Marka | pełna oferta i oferta z brakami |
| `job_analyses` | Alicja/Marek | 3 rekordy → tekstowe `external_id` | dwie analizy Alicji, jedna Marka |

### Sytuacje skrajne, które ma objąć zestaw

- oferta PASS z kompletem podstawowych informacji i `source_data.sourceQuality = full`;
- oferta WEAK bez wynagrodzenia lub trybu pracy oraz `sourceQuality = partial`;
- oferta FAIL z wykluczonym modelem pracy — bez analizy;
- oferta z `sourceQuality = unavailable` i kontrolowanym kodem źródła;
- przynajmniej jeden brakujący rekord `job_analyses`, aby zweryfikować UI „brak analizy”.

**Nie przygotowano SQL do wykonania ani nie wykonano zapisu. Wymagana jest oddzielna akceptacja użytkowniczki przed każdym insertem.**

## 7. Anatomia żądania HTTP do `analyze-job-match`

### Endpoint i metoda

```text
POST https://<PROJECT_REF>.supabase.co/functions/v1/analyze-job-match
```

Funkcja obsługuje także preflight `OPTIONS`. Inna metoda niż `POST` daje `405 METHOD_NOT_ALLOWED`.

### Nagłówki

```http
Authorization: Bearer <REDACTED_USER_JWT>
apikey: <REDACTED_PUBLISHABLE_KEY>
Content-Type: application/json
```

`Authorization` jest wymagany przez funkcję: Edge Function wywołuje `auth.getUser()` na tokenie użytkownika. Brak lub niepoprawny token zwraca odpowiednio `401 AUTH_REQUIRED` albo `401 AUTH_INVALID`. Klucz `apikey` jest wymagany przez bramkę Supabase; publishable key nie jest kluczem `service_role`.

### Rzeczywista struktura request payload

```json
{
  "profile": {
    "primaryRole": "Synthetic Automation Specialist",
    "alternativeRoles": ["Synthetic Operations Analyst"],
    "experienceSummary": "Fikcyjne podsumowanie testowe dłuższe niż dwadzieścia znaków.",
    "skills": ["SQL", "TypeScript"],
    "acceptedWorkModes": ["remote", "hybrid"],
    "acceptedContractTypes": ["employment", "b2b"],
    "acceptedLocations": ["Fictional City"],
    "minimumSalary": 12000,
    "studentStatusAvailable": false,
    "excludedContractTypes": ["internship"],
    "excludedWorkModes": ["onsite"],
    "excludedKeywords": ["night shifts"],
    "requiresStudentStatus": false,
    "additionalMustHave": "automation",
    "additionalBlacklist": "night shifts",
    "priorities": ["experience", "skills", "preferences", "growth"]
  },
  "offer": {
    "id": "synthetic-offer-a-pass-001",
    "title": "Synthetic Automation Analyst",
    "company": "Northstar Demo Labs",
    "location": "Fictional City",
    "workMode": "remote",
    "contractType": "employment",
    "salary": "12000-15000 synthetic currency units",
    "sourceUrl": "https://example.com/synthetic-offer-a-pass-001",
    "sourceLabel": "Synthetic source",
    "missingFields": [],
    "warnings": []
  },
  "hardFilter": {
    "offerId": "synthetic-offer-a-pass-001",
    "status": "pass",
    "reasons": [],
    "missingInformation": [],
    "checkedCriteria": ["Typ umowy", "Tryb pracy", "Lokalizacja"]
  },
  "offerContent": "Fikcyjna, znormalizowana treść oferty. Nie jest to HTML ani plik EML.",
  "sourceQuality": "full"
}
```

W rzeczywistym kodzie `offerContent` jest opcjonalnym łańcuchem, ograniczonym przed wysłaniem do 18 000 znaków. Funkcja przyjmuje analizę tylko dla statusów Hard Filter `pass` i `weak`.

Payload zawiera profil, znormalizowaną ofertę, wynik Hard Filter, znormalizowaną treść oferty i jakość źródła. Nie zawiera surowego CV/PDF ani surowej treści `.eml`.

### Rzeczywista struktura odpowiedzi sukcesu

Przy sukcesie funkcja zwraca HTTP `200` i obiekt zgodny z `JobAnalysis`, np. całkowicie syntetycznie:

```json
{
  "offerId": "synthetic-offer-a-pass-001",
  "overallScore": 78,
  "categoryScores": {
    "experience": { "score": 80, "rationale": "Fikcyjne doświadczenie pasuje do zakresu roli." },
    "skills": { "score": 82, "rationale": "Fikcyjne umiejętności obejmują wymagane narzędzia." },
    "preferences": { "score": 76, "rationale": "Fikcyjny model pracy jest zgodny z preferencjami." },
    "growth": { "score": 74, "rationale": "Fikcyjna oferta daje przestrzeń do rozwoju." }
  },
  "recommendation": "Warto aplikować",
  "summary": "W pełni syntetyczne podsumowanie dopasowania.",
  "strengths": ["Zbieżność fikcyjnych kompetencji", "Zgodny tryb pracy"],
  "risks": ["Należy potwierdzić szczegóły zakresu roli"],
  "missingInformation": [],
  "hardFilterStatus": "pass",
  "hardFilterReasons": [],
  "sourceQuality": "full",
  "modelInfo": { "provider": "openai", "model": "gpt-5.4-mini", "provisional": false },
  "createdAt": "2026-08-01T12:00:00.000Z",
  "status": "ready"
}
```

### Kody odpowiedzi i diagnostyka

| Warunek | HTTP | Kod |
| --- | ---: | --- |
| Sukces | 200 | obiekt `JobAnalysis` |
| Błędna metoda | 405 | `METHOD_NOT_ALLOWED` |
| Brak/autoryzacja niepoprawna | 401 | `AUTH_REQUIRED` / `AUTH_INVALID` |
| Niepoprawny payload lub status `fail` | 400 | `REQUEST_INVALID` |
| Brak sekretu OpenAI w Edge Function | 503 | `OPENAI_NOT_CONFIGURED` |
| Błąd dostawcy OpenAI lub formatu | 502 | m.in. `OPENAI_HTTP_ERROR`, `OPENAI_REFUSAL`, `OPENAI_INCOMPLETE`, `OPENAI_EMPTY_OUTPUT`, `OPENAI_SCHEMA_MISMATCH` |

Klient mapuje błędy funkcji na kontrolowane kody diagnostyczne UI, np. `OPENAI_SECRET_MISSING`, `EDGE_FUNCTION_HTTP_ERROR` i `EDGE_RESPONSE_SCHEMA_MISMATCH`. Logi Edge Function zapisują wyłącznie bezpieczne metadane diagnostyczne, bez profilu i treści oferty.

## 8. Instrukcja Network dla screenshotu AIDEAS

1. Uruchom aplikację: `npm.cmd run dev`.
2. Otwórz aplikację, zaloguj się na przeznaczone do tego konto testowe i zaimportuj wyłącznie syntetyczną ofertę.
3. Otwórz narzędzia deweloperskie przeglądarki (`F12`) → **Network**.
4. Włącz zachowywanie wpisów (Preserve log), wyczyść listę i wpisz filtr `analyze-job-match`.
5. Uruchom analizę pojedynczej syntetycznej oferty.
6. Otwórz żądanie `analyze-job-match` i przygotuj screenshoty zakładek **Headers**, **Payload** i **Response**.
7. Przed wykonaniem screenshotu zamaskuj: `Authorization`, `apikey`, cookies, e-mail, UUID użytkownika, project ref, URL źródłowy oraz wszystkie dane mogące identyfikować osobę lub prawdziwą ofertę. Można zostawić widoczne nazwy pól, metodę `POST`, kod odpowiedzi i syntetyczne wartości.
8. Jeśli używasz **Copy as cURL**, zapisz komendę wyłącznie lokalnie. Zwykle zawiera ona `Authorization` i `apikey`; przed przekazaniem do formularza AIDEAS zastąp je odpowiednio `<REDACTED_USER_JWT>` i `<REDACTED_PUBLISHABLE_KEY>`. Nie wklejaj niezanonimizowanego cURL do formularza, ticketa ani czatu.

## 9. Walidacja techniczna

| Polecenie | Wynik |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test` | PASS — 22 pliki testowe, 82 testy |
| `npm.cmd run build` | Kod kompiluje się poprawnie. Standardowy build zatrzymał się na blokadzie Windows `EPERM` podczas czyszczenia istniejącego `dist/assets`. |
| `npm.cmd run build -- --outDir <TEMP>` | PASS — build zakończony poprawnie w tymczasowym katalogu; pozostało jedynie standardowe ostrzeżenie Vite o bundle >500 kB. |

Blokada `dist/assets` jest problemem dostępu do istniejącego katalogu wyjściowego, a nie błędem TypeScript ani bundlowania aplikacji. Nie usuwano ani nie odblokowywano plików w ramach audytu.

## 10. Stan Git przy audycie

W staging area nie było plików. Drzewo robocze zawiera istniejące zmiany Checkpointu 7 i Visual Alignment oraz pliki nieśledzone. Audyt dodał wyłącznie ten raport do `docs/audits/`.

Nie wykonano `git add`, `git commit`, `git push`, inserta ani zmiany funkcjonalnej.

---

**Wniosek:** nie wykryto sekretu serwerowego ani danych osobowych w wersjonowanym kodzie objętym audytem. Wykryto wymagającą poprawy praktykę dokumentacyjną `.env.example`, ponieważ zawiera konkretne wartości konfiguracji publicznej zamiast placeholderów.

AUDYT AIDEAS GOTOWY. NIE WYKONANO INSERTU, ZMIAN FUNKCJONALNYCH ANI COMMITU.
