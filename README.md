# Organisation

Kleine Web-App (PWA) fürs iPhone: Aufgaben mit Listen und Fälligkeitsdatum, Trainingsplan mit Gym-Modus (Sätze abhaken, Gewichte loggen, Pausentimer, Verlauf).

- Reines HTML/CSS/JS, kein Build-Schritt.
- Daten liegen lokal im Browser (localStorage). Backup über "Mehr" → Exportieren.
- Läuft offline (Service Worker).

## Lokal starten

    python3 -m http.server 8000

## Aufs iPhone

Über HTTPS hosten (z. B. GitHub Pages), in Safari öffnen → Teilen → "Zum Home-Bildschirm".

## Bildnachweis

Übungsfotos in `img/ex/` stammen aus der [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense / Public Domain).
