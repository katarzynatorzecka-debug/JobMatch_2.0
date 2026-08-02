# JobMatch — pakiet danych syntetycznych do akceptacji AIDEAS

**Status:** materiał do review; nie jest skryptem wykonanym w bazie.  
**Źródło prawdy:** `docs/audits/JobMatch_AIDEAS_Security_Synthetic_HTTP_Audit.md`, aktualne migracje i kontrakty aplikacji.  
**Zakaz wykonany:** nie utworzono kont Auth, nie wykonano inserta, nie wywołano zapisu Supabase, nie zmieniono migracji ani funkcjonalności aplikacji.

## Prompt faktycznie użyty do wygenerowania finalnego pakietu

```markdown
Wygeneruj wyłącznie syntetyczne dane testowe dla projektu JobMatch, zgodne z rzeczywistym schematem Supabase: `profiles`, `import_sessions`, `job_offers`, `job_analyses`.

Nie łącz się z Supabase i nie wykonuj inserta. Najpierw zwróć plan rekordów, tabelę zależności i jeden blok SQL do ręcznej akceptacji.

Użyj tylko fikcyjnych danych:
- osoby: Alicja Testowa, Marek Demonstracyjny,
- firmy: Northstar Demo Labs, Amber Cloud Studio, Fictional Systems Europe,
- e-maile wyłącznie w domenie `example.com`,
- adresy URL wyłącznie w domenie `example.com`.

Nie kopiuj danych z CV, plików `.eml`, bazy, historii rozmów ani realnych ofert. Nie używaj prawdziwych osób, firm, adresów, telefonów, tokenów, JWT, kluczy Supabase, `service_role`, sekretów OpenAI ani wartości `.env`.

Przygotuj:
- 2 profile,
- 2 sesje importu,
- 5 ofert,
- 3 analizy,
- co najmniej 1 ofertę bez analizy,
- przypadki Hard Filter: `pass`, `weak`, `fail`,
- źródła jakości: `full`, `partial`, `unavailable`,
- co najmniej 1 ofertę z brakującymi polami.

Zachowaj:
- poprawne UUID v4,
- poprawne `timestamptz`,
- wszystkie foreign keys i UNIQUE constraints,
- zgodność `user_id` właściciela,
- zgodność `import_session_id`,
- `job_offer_id` w `job_analyses` jako tekstowy `external_id`,
- kolejność insertów: `profiles` → `import_sessions` → `job_offers` → `job_analyses`.

Konta mają wcześniej istnieć w `auth.users`. Użyj placeholderów `<AUTH_USER_A_UUID>` i `<AUTH_USER_B_UUID>`. Nie wykonuj operacji na `auth.users`.

`profile_data`, `normalized_data` i `analysis_data` muszą być zgodne z aktualnymi kontraktami aplikacji. Dla analiz użyj rekomendacji wyłącznie: `Warto aplikować`, `Wymaga sprawdzenia`, `Nie rekomenduję`; `modelInfo.provider = "openai"` i `status = "ready"`.

SQL nie może zawierać `DELETE`, `TRUNCATE`, `DROP`, zmian schematu ani nadpisywania nieznanych rekordów.

Na końcu wypisz ryzyka i zakończ:
`BRAK INSERTU — oczekuję na akceptację właścicielki danych.`
```

### Wynik użycia promptu

Prompt został użyty do pełnej walidacji istniejącego pakietu. Nie wykryto rozbieżności w rekordach, UUID, właścicielach, zależnościach, kolejności insertów ani bloku SQL. Pakiet pozostał identyczny; jedyną zmianą dokumentu jest dodanie tego dosłownego promptu oraz doprecyzowanie walidacji przypadku `FAIL` poniżej.

## 1. Założenia i ograniczenia

Potwierdzone tabele aplikacji to wyłącznie `profiles`, `import_sessions`, `job_offers` i `job_analyses`. Pakiet zakłada dwa wcześniej utworzone konta w `auth.users`, dwa profile, dwie sesje importu, pięć ofert oraz trzy analizy.

Wszystkie nazwy, opisy, pliki i adresy w tym dokumencie są fikcyjne. Dozwolone osoby to wyłącznie **Alicja Testowa** i **Marek Demonstracyjny**, firmy: **Northstar Demo Labs**, **Amber Cloud Studio** i **Fictional Systems Europe**. Każdy e-mail używa domeny `example.com`; każdy URL używa `example.com`.

Przed ewentualnym wykonaniem SQL należy ręcznie uzupełnić wyłącznie:

```text
<AUTH_USER_A_UUID>  → UUID konta alicja.testowa@example.com
<AUTH_USER_B_UUID>  → UUID konta marek.demonstracyjny@example.com
```

Nie wolno zastępować tych placeholderów hasłem, JWT, kluczem Supabase, `service_role`, kluczem OpenAI ani wartością z `.env`.

Hard Filter nie ma osobnej tabeli ani kolumny w aktualnym schemacie: jest wyliczany deterministycznie z profilu i `normalized_data`. Dla zapisanej analizy jego status jest powielony w `job_analyses.filter_status` i `analysis_data.hardFilterStatus`. Ten dokument nie tworzy nieistniejącej tabeli wyników filtra.

## 2. Bezpieczne utworzenie dwóch kont Auth

1. W Supabase Dashboard otwórz **Authentication → Users → Add user**.
2. Utwórz konto `alicja.testowa@example.com` z unikalnym, jednorazowym hasłem ustawionym poza dokumentem i poza repozytorium.
3. Utwórz analogicznie `marek.demonstracyjny@example.com`.
4. Po utworzeniu skopiuj wyłącznie UUID każdego użytkownika. Nie kopiuj hasła, tokena, refresh tokena ani kluczy API.
5. Wklej UUID do dwóch placeholderów w SQL, sprawdź ich format UUID i wykonaj osobną akceptację przed insertem.

## 3. Tabela zależności i pokrycie przypadków

| Rekord | UUID rekordu | Właściciel | Sesja / powiązanie | `external_id` / `job_offer_id` | Hard Filter | Analiza | Źródło | Cel testowy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| profil Alicji | `9e0a743d-b93c-4a5d-9eb8-295df4c7c9c1` | `<AUTH_USER_A_UUID>` | — | — | — | — | — | profil z wykluczonym `onsite` |
| profil Marka | `c29b02b4-d1a9-48a7-9f47-7e8dc28afef7` | `<AUTH_USER_B_UUID>` | — | — | — | — | — | drugi izolowany właściciel |
| sesja Alicji | `69e7adca-8f65-43d0-874c-6d00e77d41df` | Alicja | 3 oferty | — | — | — | — | import syntetyczny A |
| sesja Marka | `12e59c9a-3c95-4a94-a2af-b6d50ce9bd3e` | Marek | 2 oferty | — | — | — | — | import syntetyczny B |
| oferta A1 | `bb4f0e67-dca0-4fbe-aa5c-59e8eb825134` | Alicja | sesja Alicji | `synthetic-offer-a-pass-001` | PASS | ready | full | pełne dane i pełne źródło |
| oferta A2 | `b23380ef-75d2-484e-9bc4-f8041769a64c` | Alicja | sesja Alicji | `synthetic-offer-a-weak-002` | WEAK | ready | partial | brak wynagrodzenia, częściowe źródło |
| oferta A3 | `55b61a9d-2c06-42dc-808c-cd283da662a0` | Alicja | sesja Alicji | `synthetic-offer-a-fail-003` | FAIL | brak | unavailable | wykluczony model `onsite` |
| oferta B1 | `1a2e1fc8-dc5b-49fb-a4b4-d1c2a3c831c9` | Marek | sesja Marka | `synthetic-offer-b-pass-004` | PASS | ready | full | pełne dane drugiego użytkownika |
| oferta B2 | `f4ce5870-bf12-4b3d-8a08-0fdd8e89a4d7` | Marek | sesja Marka | `synthetic-offer-b-pending-005` | WEAK | brak | unavailable | brak typu umowy i brak analizy |
| analiza A1 | `adcf4fd1-0101-4db5-a51c-3f7439a1a1d3` | Alicja | — | `synthetic-offer-a-pass-001` | pass | ready | full | rekomendacja pozytywna |
| analiza A2 | `7bd0cc4c-d796-4c8b-a025-61c3e1fd5445` | Alicja | — | `synthetic-offer-a-weak-002` | weak | ready | partial | rekomendacja warunkowa |
| analiza B1 | `2e0e9381-30f2-4d4e-a436-4fc3caacd9bf` | Marek | — | `synthetic-offer-b-pass-004` | pass | ready | full | izolacja danych Marka |

Pokryte sytuacje skrajne: PASS, WEAK, FAIL; źródło `full`, `partial`, `unavailable`; oferta z brakującymi polami; oferta celowo niespełniająca kryterium; co najmniej jedna oferta bez analizy (w tym dwie: A3 i B2).

## 4. Lista UUID

Wszystkie poniższe identyfikatory są syntetycznymi UUID v4 i są unikalne w pakiecie.

```text
profiles
9e0a743d-b93c-4a5d-9eb8-295df4c7c9c1
c29b02b4-d1a9-48a7-9f47-7e8dc28afef7

import_sessions
69e7adca-8f65-43d0-874c-6d00e77d41df
12e59c9a-3c95-4a94-a2af-b6d50ce9bd3e

job_offers
bb4f0e67-dca0-4fbe-aa5c-59e8eb825134
b23380ef-75d2-484e-9bc4-f8041769a64c
55b61a9d-2c06-42dc-808c-cd283da662a0
1a2e1fc8-dc5b-49fb-a4b4-d1c2a3c831c9
f4ce5870-bf12-4b3d-8a08-0fdd8e89a4d7

job_analyses
adcf4fd1-0101-4db5-a51c-3f7439a1a1d3
7bd0cc4c-d796-4c8b-a025-61c3e1fd5445
2e0e9381-30f2-4d4e-a436-4fc3caacd9bf
```

Nie generowano UUID dla `auth.users`: należą do rzeczywistych, ręcznie utworzonych kont testowych i muszą zostać wstawione dopiero przy akceptacji.

## 5. Plan insertów

1. `profiles` — wymagają istniejących UUID z `auth.users`.
2. `import_sessions` — wymagają tego samego `user_id` co profil właściciela.
3. `job_offers` — wymagają istniejącej sesji importu oraz zgodnego właściciela; `normalized_data.id` musi być równy `external_id`.
4. `job_analyses` — wymagają co najmniej tekstowego `external_id` oferty tego samego użytkownika, choć schema nie wymusza FK dla `job_offer_id`.

Ta kolejność zachowuje wszystkie istniejące klucze obce. Każdy `INSERT` stosuje `ON CONFLICT DO NOTHING`: nie usuwa ani nie nadpisuje istniejących rekordów. W przypadku kolizji należy zatrzymać się, sprawdzić istniejący rekord i wygenerować nowy pakiet — nie używać `UPDATE` dla danych nieznanego użytkownika.

## 6. SQL do ręcznej akceptacji — **nie wykonywać przed zgodą**

> Przed uruchomieniem: zastąp dwa placeholdery UUID właściwymi UUID kont Auth. SQL jest przeznaczony dla uprawnionego administratora w Supabase SQL Editor; nie działa jako operacja wykonywana przez frontend ani z kluczem `service_role` w aplikacji.

```sql
begin;

-- 1. Profiles
insert into public.profiles (id, user_id, profile_data, created_at, updated_at) values
('9e0a743d-b93c-4a5d-9eb8-295df4c7c9c1', '<AUTH_USER_A_UUID>'::uuid, $$
{"primaryRole":"Synthetic Automation Specialist","alternativeRoles":["Synthetic Operations Analyst"],"experienceSummary":"Fikcyjne doświadczenie w automatyzacji procesów i analizie danych dla potrzeb testowych.","skills":["SQL","TypeScript","Automation"],"acceptedWorkModes":["remote","hybrid"],"acceptedContractTypes":["employment","b2b"],"acceptedLocations":["Fictional City"],"minimumSalary":12000,"studentStatusAvailable":false,"excludedContractTypes":["internship"],"excludedWorkModes":["onsite"],"excludedKeywords":["night shifts"],"requiresStudentStatus":false,"additionalMustHave":"automation","additionalBlacklist":"night shifts","priorities":["experience","skills","preferences","growth"]}
$$::jsonb, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z'),
('c29b02b4-d1a9-48a7-9f47-7e8dc28afef7', '<AUTH_USER_B_UUID>'::uuid, $$
{"primaryRole":"Synthetic Product Operations Specialist","alternativeRoles":["Synthetic Delivery Coordinator"],"experienceSummary":"Fikcyjne doświadczenie w koordynowaniu operacji produktowych i procesów zespołowych.","skills":["Process Design","Documentation","Analytics"],"acceptedWorkModes":["hybrid"],"acceptedContractTypes":["employment"],"acceptedLocations":["Demo District"],"minimumSalary":9000,"studentStatusAvailable":false,"excludedContractTypes":["internship"],"excludedWorkModes":["onsite"],"excludedKeywords":["night shifts"],"requiresStudentStatus":false,"additionalMustHave":"operations","additionalBlacklist":"night shifts","priorities":["experience","skills","preferences","growth"]}
$$::jsonb, '2026-08-01T09:05:00.000Z', '2026-08-01T09:05:00.000Z')
on conflict do nothing;

-- 2. Import sessions
insert into public.import_sessions (id, user_id, source_type, source_filename, offer_count, created_at) values
('69e7adca-8f65-43d0-874c-6d00e77d41df', '<AUTH_USER_A_UUID>'::uuid, 'rocketjobs-eml', 'synthetic-alicja-report.eml', 3, '2026-08-01T09:10:00.000Z'),
('12e59c9a-3c95-4a94-a2af-b6d50ce9bd3e', '<AUTH_USER_B_UUID>'::uuid, 'rocketjobs-eml', 'synthetic-marek-report.eml', 2, '2026-08-01T09:15:00.000Z')
on conflict do nothing;

-- 3. Job offers
insert into public.job_offers (id, user_id, import_session_id, external_id, title, company, url, normalized_data, source_data, created_at) values
('bb4f0e67-dca0-4fbe-aa5c-59e8eb825134', '<AUTH_USER_A_UUID>'::uuid, '69e7adca-8f65-43d0-874c-6d00e77d41df', 'synthetic-offer-a-pass-001', 'Synthetic Automation Analyst', 'Northstar Demo Labs', 'https://example.com/offers/synthetic-a-pass',
$$ {"id":"synthetic-offer-a-pass-001","title":"Synthetic Automation Analyst","company":"Northstar Demo Labs","location":"Fictional City","workMode":"remote","contractType":"employment","salary":"12000-15000 synthetic units","sourceUrl":"https://example.com/offers/synthetic-a-pass","sourceLabel":"Synthetic source","missingFields":[],"warnings":[]} $$::jsonb,
$$ {"offerId":"synthetic-offer-a-pass-001","sourceUrl":"https://example.com/offers/synthetic-a-pass","status":"completed","sourceQuality":"full","title":"Synthetic Automation Analyst","company":"Northstar Demo Labs","location":"Fictional City","workMode":"remote","contractType":"employment","salary":"12000-15000 synthetic units","description":"Fikcyjny opis oferty automatyzacji.","requirements":["SQL","TypeScript"],"responsibilities":["Automatyzacja procesów"],"benefits":["Fikcyjny budżet rozwojowy"],"missingInformation":[],"warnings":[],"fetchedAt":"2026-08-01T09:20:00.000Z"} $$::jsonb, '2026-08-01T09:20:00.000Z'),
('b23380ef-75d2-484e-9bc4-f8041769a64c', '<AUTH_USER_A_UUID>'::uuid, '69e7adca-8f65-43d0-874c-6d00e77d41df', 'synthetic-offer-a-weak-002', 'Synthetic Operations Coordinator', 'Amber Cloud Studio', 'https://example.com/offers/synthetic-a-weak',
$$ {"id":"synthetic-offer-a-weak-002","title":"Synthetic Operations Coordinator","company":"Amber Cloud Studio","location":"Fictional City","workMode":"hybrid","contractType":"b2b","sourceUrl":"https://example.com/offers/synthetic-a-weak","sourceLabel":"Synthetic source","missingFields":["salary"],"warnings":["Fikcyjny brak wynagrodzenia."]} $$::jsonb,
$$ {"offerId":"synthetic-offer-a-weak-002","sourceUrl":"https://example.com/offers/synthetic-a-weak","status":"partial","sourceQuality":"partial","title":"Synthetic Operations Coordinator","company":"Amber Cloud Studio","description":"Częściowy fikcyjny opis oferty.","requirements":["Automation"],"responsibilities":[],"benefits":[],"missingInformation":["salary"],"warnings":["Fikcyjnie niepełne źródło."],"fetchedAt":"2026-08-01T09:21:00.000Z"} $$::jsonb, '2026-08-01T09:21:00.000Z'),
('55b61a9d-2c06-42dc-808c-cd283da662a0', '<AUTH_USER_A_UUID>'::uuid, '69e7adca-8f65-43d0-874c-6d00e77d41df', 'synthetic-offer-a-fail-003', 'Synthetic Onsite Process Assistant', 'Fictional Systems Europe', 'https://example.com/offers/synthetic-a-fail',
$$ {"id":"synthetic-offer-a-fail-003","title":"Synthetic Onsite Process Assistant","company":"Fictional Systems Europe","location":"Fictional City","workMode":"onsite","contractType":"employment","salary":"8000-9000 synthetic units","sourceUrl":"https://example.com/offers/synthetic-a-fail","sourceLabel":"Synthetic source","missingFields":[],"warnings":[]} $$::jsonb,
$$ {"offerId":"synthetic-offer-a-fail-003","sourceUrl":"https://example.com/offers/synthetic-a-fail","status":"unavailable","sourceQuality":"unavailable","requirements":[],"responsibilities":[],"benefits":[],"missingInformation":["description"],"warnings":["Fikcyjnie niedostępne źródło."],"fetchedAt":"2026-08-01T09:22:00.000Z","errorCode":"SOURCE_FETCH_FAILED"} $$::jsonb, '2026-08-01T09:22:00.000Z'),
('1a2e1fc8-dc5b-49fb-a4b4-d1c2a3c831c9', '<AUTH_USER_B_UUID>'::uuid, '12e59c9a-3c95-4a94-a2af-b6d50ce9bd3e', 'synthetic-offer-b-pass-004', 'Synthetic Product Operations Specialist', 'Amber Cloud Studio', 'https://example.com/offers/synthetic-b-pass',
$$ {"id":"synthetic-offer-b-pass-004","title":"Synthetic Product Operations Specialist","company":"Amber Cloud Studio","location":"Demo District","workMode":"hybrid","contractType":"employment","salary":"9000-11000 synthetic units","sourceUrl":"https://example.com/offers/synthetic-b-pass","sourceLabel":"Synthetic source","missingFields":[],"warnings":[]} $$::jsonb,
$$ {"offerId":"synthetic-offer-b-pass-004","sourceUrl":"https://example.com/offers/synthetic-b-pass","status":"completed","sourceQuality":"full","title":"Synthetic Product Operations Specialist","company":"Amber Cloud Studio","location":"Demo District","workMode":"hybrid","contractType":"employment","salary":"9000-11000 synthetic units","description":"Fikcyjny pełny opis operacji produktowych.","requirements":["Documentation","Analytics"],"responsibilities":["Koordynacja procesów"],"benefits":["Fikcyjne szkolenia"],"missingInformation":[],"warnings":[],"fetchedAt":"2026-08-01T09:25:00.000Z"} $$::jsonb, '2026-08-01T09:25:00.000Z'),
('f4ce5870-bf12-4b3d-8a08-0fdd8e89a4d7', '<AUTH_USER_B_UUID>'::uuid, '12e59c9a-3c95-4a94-a2af-b6d50ce9bd3e', 'synthetic-offer-b-pending-005', 'Synthetic Documentation Associate', 'Northstar Demo Labs', 'https://example.com/offers/synthetic-b-pending',
$$ {"id":"synthetic-offer-b-pending-005","title":"Synthetic Documentation Associate","company":"Northstar Demo Labs","location":"Demo District","workMode":"hybrid","sourceUrl":"https://example.com/offers/synthetic-b-pending","sourceLabel":"Synthetic source","missingFields":["contractType","salary"],"warnings":["Fikcyjne braki w danych importu."]} $$::jsonb,
$$ {"offerId":"synthetic-offer-b-pending-005","sourceUrl":"https://example.com/offers/synthetic-b-pending","status":"unavailable","sourceQuality":"unavailable","requirements":[],"responsibilities":[],"benefits":[],"missingInformation":["contractType","salary","description"],"warnings":["Fikcyjnie niedostępne źródło."],"fetchedAt":"2026-08-01T09:26:00.000Z","errorCode":"SOURCE_EMPTY"} $$::jsonb, '2026-08-01T09:26:00.000Z')
on conflict do nothing;

-- 4. Job analyses. A3 and B2 intentionally have no analysis.
insert into public.job_analyses (id, user_id, job_offer_id, filter_status, analysis_data, created_at, updated_at) values
('adcf4fd1-0101-4db5-a51c-3f7439a1a1d3', '<AUTH_USER_A_UUID>'::uuid, 'synthetic-offer-a-pass-001', 'pass', $$
{"offerId":"synthetic-offer-a-pass-001","overallScore":78,"categoryScores":{"experience":{"score":80,"rationale":"Fikcyjne doświadczenie pasuje do roli."},"skills":{"score":82,"rationale":"Fikcyjne umiejętności pokrywają wymagania."},"preferences":{"score":76,"rationale":"Tryb pracy jest zgodny."},"growth":{"score":74,"rationale":"Oferta wspiera fikcyjny rozwój."}},"recommendation":"Warto aplikować","summary":"Fikcyjne pozytywne dopasowanie.","strengths":["SQL","TypeScript"],"risks":["Potwierdzić zakres roli."],"missingInformation":[],"hardFilterStatus":"pass","hardFilterReasons":[],"sourceQuality":"full","modelInfo":{"provider":"openai","model":"synthetic-test-model","provisional":false},"createdAt":"2026-08-01T09:30:00.000Z","status":"ready"}
$$::jsonb, '2026-08-01T09:30:00.000Z', '2026-08-01T09:30:00.000Z'),
('7bd0cc4c-d796-4c8b-a025-61c3e1fd5445', '<AUTH_USER_A_UUID>'::uuid, 'synthetic-offer-a-weak-002', 'weak', $$
{"offerId":"synthetic-offer-a-weak-002","overallScore":58,"categoryScores":{"experience":{"score":65,"rationale":"Część doświadczenia jest zbieżna."},"skills":{"score":67,"rationale":"Fikcyjne umiejętności wymagają weryfikacji."},"preferences":{"score":45,"rationale":"Brakuje wynagrodzenia."},"growth":{"score":55,"rationale":"Zakres rozwoju jest częściowy."}},"recommendation":"Wymaga sprawdzenia","summary":"Fikcyjny wynik warunkowy z brakującym wynagrodzeniem.","strengths":["Automatyzacja"],"risks":["Brak wynagrodzenia"],"missingInformation":["salary"],"hardFilterStatus":"weak","hardFilterReasons":["Brak wynagrodzenia potrzebnego do oceny minimalnej stawki."],"sourceQuality":"partial","modelInfo":{"provider":"openai","model":"synthetic-test-model","provisional":true},"createdAt":"2026-08-01T09:31:00.000Z","status":"ready"}
$$::jsonb, '2026-08-01T09:31:00.000Z', '2026-08-01T09:31:00.000Z'),
('2e0e9381-30f2-4d4e-a436-4fc3caacd9bf', '<AUTH_USER_B_UUID>'::uuid, 'synthetic-offer-b-pass-004', 'pass', $$
{"offerId":"synthetic-offer-b-pass-004","overallScore":73,"categoryScores":{"experience":{"score":74,"rationale":"Fikcyjne doświadczenie operacyjne pasuje."},"skills":{"score":75,"rationale":"Umiejętności analityczne są zbieżne."},"preferences":{"score":72,"rationale":"Hybrydowy tryb jest zgodny."},"growth":{"score":71,"rationale":"Oferta daje fikcyjną przestrzeń rozwoju."}},"recommendation":"Warto aplikować","summary":"Fikcyjne pozytywne dopasowanie Marka.","strengths":["Documentation","Analytics"],"risks":["Potwierdzić priorytety zespołu."],"missingInformation":[],"hardFilterStatus":"pass","hardFilterReasons":[],"sourceQuality":"full","modelInfo":{"provider":"openai","model":"synthetic-test-model","provisional":false},"createdAt":"2026-08-01T09:32:00.000Z","status":"ready"}
$$::jsonb, '2026-08-01T09:32:00.000Z', '2026-08-01T09:32:00.000Z')
on conflict do nothing;

commit;
```

## 7. Zapytania walidacyjne po hipotetycznym insercie — nie wykonywać teraz

`pass` i `weak` można potwierdzić przez odczyt `job_analyses.filter_status` i `analysis_data.hardFilterStatus` dla ofert, które mają analizę. Oferta `FAIL` **celowo nie ma** rekordu w `job_analyses`: jest przypadkiem testowym wynikającym z profilu Alicji (wykluczony `onsite`) oraz `normalized_data` oferty A3 (`workMode = onsite`). Samo zapytanie do `job_analyses` nie potwierdza statusu `fail`.

Po zaakceptowanym insercie status `FAIL` należy potwierdzić przez uruchomienie deterministycznego Hard Filter w aplikacji dla oferty `synthetic-offer-a-fail-003` albo przez oddzielną kontrolę danych wejściowych profilu i oferty. Nie należy tworzyć sztucznej analizy dla tej oferty.

```sql
-- Counts by owner and table.
select 'profiles' as entity, user_id, count(*) from public.profiles
where user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid) group by user_id
union all
select 'import_sessions', user_id, count(*) from public.import_sessions
where user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid) group by user_id
union all
select 'job_offers', user_id, count(*) from public.job_offers
where user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid) group by user_id
union all
select 'job_analyses', user_id, count(*) from public.job_analyses
where user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid) group by user_id;

-- Offers must belong to an import session of the same user.
select o.id, o.external_id from public.job_offers o
left join public.import_sessions s on s.id = o.import_session_id and s.user_id = o.user_id
where o.id in ('bb4f0e67-dca0-4fbe-aa5c-59e8eb825134','b23380ef-75d2-484e-9bc4-f8041769a64c','55b61a9d-2c06-42dc-808c-cd283da662a0','1a2e1fc8-dc5b-49fb-a4b4-d1c2a3c831c9','f4ce5870-bf12-4b3d-8a08-0fdd8e89a4d7')
and s.id is null;

-- PASS and WEAK stored statuses for analyzed records only.
-- FAIL is intentionally absent from job_analyses and must be verified in the app's deterministic Hard Filter.
select filter_status, count(*) from public.job_analyses
where user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid)
and job_offer_id like 'synthetic-offer-%' group by filter_status;

-- Offers intentionally lacking an analysis.
select o.external_id from public.job_offers o
left join public.job_analyses a on a.user_id = o.user_id and a.job_offer_id = o.external_id
where o.user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid)
and o.external_id like 'synthetic-offer-%' and a.id is null;

-- Source quality coverage.
select source_data ->> 'sourceQuality' as source_quality, count(*) from public.job_offers
where user_id in ('<AUTH_USER_A_UUID>'::uuid, '<AUTH_USER_B_UUID>'::uuid)
and external_id like 'synthetic-offer-%'
group by source_data ->> 'sourceQuality';
```

## 8. Ryzyka i punkty do sprawdzenia przed zgodą

1. Zweryfikuj w Auth, że oba UUID należą do wyłącznie syntetycznych kont `@example.com`.
2. Zastąp tylko oba placeholdery w SQL; nie edytuj pozostałych identyfikatorów ani danych.
3. Potwierdź, że wybrane UUID rekordów i `external_id` nie kolidują z danymi testowymi już obecnymi w projekcie.
4. SQL Editor administratora może ominąć RLS; dlatego przed uruchomieniem szczególnie ważne jest sprawdzenie obu `user_id` i relacji sesja–oferta.
5. Nie zmieniaj `ON CONFLICT DO NOTHING` na `DO UPDATE`.
6. Po insercie wykonaj wyłącznie zatwierdzone zapytania walidacyjne, a następnie testuj izolację kont w aplikacji.
7. Nie umieszczaj tego SQL w frontendzie, migracji ani automatycznym pipeline.

## 9. Stan Git

Ten dokument jest nowym plikiem: `docs/audits/JobMatch_AIDEAS_Synthetic_Data_Plan_and_SQL.md`. Jest niezależny od wcześniej istniejących zmian Checkpointu 7 i Visual Alignment. Nie wykonano `git add`, `git commit` ani `git push`.

PAKIET DANYCH SYNTETYCZNYCH GOTOWY DO REVIEW. NIE WYKONANO INSERTU, GIT ADD, COMMITU ANI PUSH.
