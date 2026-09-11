# JobMatch — Dashboard 1–7 Chrome Smoke Test

Adres aplikacji: `http://localhost:5173`

## Zakres

Zaloguj istniejące konto testowe z profilem i sprawdź wyłącznie poniższe punkty. Nie uruchamiaj importu, analizy AI ani provider calls.

1. Wejdź na `/` i potwierdź dashboard oraz nazwę użytkownika z profilu.
2. Potwierdź brak osobnego kafelka „Edytuj profil” nad „Profile Assistance”.
3. Potwierdź wyrównanie „O mnie” i „Profile Assistance” do tej samej wysokości.
4. Potwierdź brak „Nowe oferty” w panelu bocznym i głównej treści.
5. Potwierdź, że „Aplikowano” zajmuje pełną szerokość głównej treści.
6. Potwierdź etykietę „Pulpit” zamiast „Start”.
7. Na onboardingu bez profilu potwierdź kafelek „Po przejściu przez flow”: pogrubione pierwsze zdanie „Otrzymasz spersonalizowany PULPIT użytkownika, a wraz z nim czytelną listę wartościowych ofert.” oraz mniejszy tekst „Najpierw powstanie profil do sprawdzenia, a potem czytelna lista ofert z pomocniczą oceną i określonymi ryzykami.”

## Kontrola końcowa

Odśwież `/` i zapisz PASS/FAIL dla każdego punktu oraz screenshot dashboardu i onboardingu.
