# Mission Control Dashboard – Anleitung

## Ziel
Eine lokale Web-App, um OpenClaw bequem zu bedienen:
- Projekte/Dateibaum
- Datei-Editor
- Chat
- Skills-Dropdown

## Installation (Windows)

### Voraussetzung
- Node.js installiert
- OpenClaw läuft auf dem gleichen PC

### Schritt 1 – Dateien installieren
Im Skill-Ordner liegt ein Template (Server + public UI).

Beispiel:
```powershell
# im Skill-Ordner
.\scripts\install.ps1 -TargetDir C:\mission-control
```

### Schritt 2 – Starten (sicher: nur lokal)
```powershell
.\scripts\start.ps1 -Dir C:\mission-control -Bind 127.0.0.1 -Port 3000
```
Dann im Browser öffnen:
- http://127.0.0.1:3000

### Schritt 3 – Optional LAN/VPN
Nur wenn du weißt was du tust:
```powershell
.\scripts\start.ps1 -Dir C:\mission-control -Bind 0.0.0.0 -Port 3000
```

## Sicherheit
- Standard ist **localhost-only**.
- Keine Tokens in Dateien eintragen.
- Wenn du LAN/VPN nutzt: nur in vertrauenswürdigem Netz.

## Screenshots
- Lege Screenshots unter `assets/screenshots/` ab (optional).
