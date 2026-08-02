# JobMatch — diagnoza „Zapisany import ma nieprawidłowy format”

**Zakres:** wyłącznie diagnostyka. Nie wykonano `UPDATE`, inserta, zmiany kodu ani commitu.

## Jednozdaniowa przyczyna

Odtworzenie syntetycznego importu Alicji odrzuca `importedAt`, ponieważ Supabase zwraca `import_sessions.created_at` jako timestamp z offsetem UTC (`2026-08-01T09:10:00+00:00`), a aktualny `importedReportSchema` używa `z.string().datetime()` bez `offset: true` i akceptuje tylko wariant zakończony `Z`.

## Dokładny flow i punkt odrzucenia

Plik: `src/features/supabase/repositories.ts`, funkcja `supabaseImportRepository(user).load()`.

1. `supabaseImportSessionRepository(user).loadLatest()` pobiera dla Alicji najnowszą sesję `import_sessions` filtrem `user_id = session.user.id`, sortuje `created_at DESC` i ogranicza wynik do jednej sesji.
2. `supabaseJobOfferRepository(user).load(sessionId)` pobiera `normalized_data` dla tej samej Alicji i tej sesji. Buduje pomocniczy `ImportedReport` z bezpiecznym `fileName = 'validation.eml'` i aktualnym czasem, po czym wywołuje `validateImportedReport`.
3. Ponieważ komunikat UI brzmi **„Zapisany import ma nieprawidłowy format.”**, wcześniejsza walidacja ofert musiała przejść. Gdyby nie przeszła, repozytorium zwróciłoby wcześniejszy komunikat **„Zapisane oferty maja nieprawidlowy format.”**.
4. `supabaseImportRepository.load()` następnie buduje finalny obiekt:

```ts
{
  version: 1,
  source: session.data.source,
  fileName: session.data.fileName,
  importedAt: session.data.importedAt,
  offers: storedOffers.data,
  warnings: [],
}
```

5. To końcowe `validateImportedReport(report)` zwraca błąd, dlatego kod zwraca dokładnie komunikat widoczny w UI.

## Rekord i pole powodujące błąd

| Rekord | Tabela | Pole | Obecna wartość odczytywana przez aplikację | Oczekiwany format obecnego schematu |
| --- | --- | --- | --- | --- |
| sesja Alicji `69e7adca-8f65-43d0-874c-6d00e77d41df` | `import_sessions` | `created_at` → `ImportedReport.importedAt` | `2026-08-01T09:10:00+00:00` | ISO datetime bez offsetu, np. `2026-08-01T09:10:00.000Z` |

SQL pakietu syntetycznego zapisał prawidłowy `timestamptz` (`2026-08-01T09:10:00.000Z`). Po odczycie przez API Supabase jest on serializowany jako równoważny czas z offsetem `+00:00`; nie jest to niepoprawny typ ani nieprawidłowa wartość danych.

## Dowód reguły walidacyjnej

Plik: `src/schemas/importSchemas.ts`.

```ts
importedAt: z.string().datetime()
```

Test wykonany na zainstalowanej wersji Zod:

```text
z.string().datetime().safeParse('2026-08-01T09:10:00.000Z').success    → true
z.string().datetime().safeParse('2026-08-01T09:10:00+00:00').success  → false
z.string().datetime({ offset: true }).safeParse('2026-08-01T09:10:00+00:00').success → true
```

## Wykluczone przyczyny

### `normalized_data` trzech ofert Alicji

| `external_id` | Wynik wcześniejszej walidacji ofert | Ustalenie |
| --- | --- | --- |
| `synthetic-offer-a-pass-001` | przechodzi | wymagane `id`, `title`, `company`, `missingFields`, `warnings` są obecne; `id` jest zgodne z `external_id` |
| `synthetic-offer-a-weak-002` | przechodzi | brak `salary` jest dozwolony, bo jest polem opcjonalnym; brak jest poprawnie opisany w `missingFields` |
| `synthetic-offer-a-fail-003` | przechodzi | `workMode = onsite` jest poprawnym tekstem importu; status FAIL jest regułą Hard Filter, nie walidacji Zod importu |

Nie stwierdzono brakującego wymaganego pola, niepoprawnego enumu, długości tekstu, złego typu ani niespójności `normalized_data.id` i `external_id` dla tych trzech rekordów. `source_data` nie jest odczytywane przez `supabaseJobOfferRepository.load()` i nie bierze udziału w tej walidacji.

### Pozostałe pola finalnego `ImportedReport`

- `source` nie jest przyczyną: `loadLatest()` zwraca sesję tylko dla `source_type === 'rocketjobs-eml'`.
- `fileName` nie jest przyczyną: syntetyczna nazwa `synthetic-alicja-report.eml` spełnia regułę `z.string().trim().min(1).max(260)`.
- `offers` nie są przyczyną: ich walidacja następuje wcześniej, z innym komunikatem błędu.
- RLS nie jest przyczyną komunikatu: RLS lub błąd zapytania zwróciłyby ogólny błąd połączenia z chmurą; odczyt doszedł do walidacji Zod.

## Klasyfikacja problemu

To błąd mechanizmu odtwarzania danych, ujawniony przez poprawne dane syntetyczne. Ten sam problem wystąpi dla każdego `timestamptz` odczytanego z Supabase w formacie offsetowym, nie tylko dla danych syntetycznych.

Zmiana `created_at` przez SQL `UPDATE` nie jest właściwą korektą: baza nadal przechowuje `timestamptz` i API nadal może serializować czas z offsetem. Nie przygotowano pliku `JobMatch_AIDEAS_Synthetic_Data_Format_Fix_Plan.md`, bo problem nie leży w danych.

## Minimalna zmiana kodu do osobnego zatwierdzenia — nie zaimplementowano

W `src/schemas/importSchemas.ts` zmienić wyłącznie regułę:

```ts
importedAt: z.string().datetime({ offset: true })
```

Zachowuje to walidację daty i dodatkowo akceptuje prawidłowy offset RFC 3339 zwracany przez Supabase. Alternatywnie można normalizować `created_at` do formatu `Z` w repozytorium przed walidacją, ale to jest większa odpowiedzialność repozytorium niż minimalna poprawka schematu.

## Bezpieczne odczytowe zapytanie do ewentualnego potwierdzenia w Supabase SQL Editor

```sql
select
  id,
  user_id,
  source_type,
  source_filename,
  created_at,
  created_at::text as created_at_serialized
from public.import_sessions
where id = '69e7adca-8f65-43d0-874c-6d00e77d41df';
```

To zapytanie jest tylko materiałem diagnostycznym. Nie zostało wykonane w ramach tego zadania i nie odczytuje ofert prywatnych ani sekretów.

DIAGNOZA FORMATU IMPORTU GOTOWA. NIE WYKONANO UPDATE, INSERTU, GIT ADD, COMMITU ANI PUSH.
