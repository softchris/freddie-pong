<div align="center">
  <img src="freddie.jpg" alt="Freddie Pong" width="100%" />
</div>

# Freddie Pong 🎤🏓

A voice-controlled 3D Pong game inspired by Freddie Mercury's legendary Live Aid call-and-response. Sing **"Ay‑OH!"** to move your paddle up. Sing **"Eh‑OH!"** to move it down. The game calibrates to *your* voice so any two distinct sounds work. Made with lulz and GitHub Copilot CLI.

## Demo

<div align="center">
  <img src="freddie.gif" alt="Freddie Pong gameplay" width="600" />
</div>

## Features

- 🎤 **Voice-Controlled Paddle** — Sing to play! Calibrates to your unique voice
- 🤖 **AI Opponent** — Play against an AI-controlled paddle
- 🟩 **GitHub Aesthetic** — Dark theme with the iconic green contribution palette
- 🎯 **Voice Calibration** — Record your "Ay‑OH!" and "Eh‑OH!" before each game
- 💥 **Particle Effects** — Scoring triggers green cube fragment explosions
- ⌨️ **Keyboard Fallback** — W/S (P1) and ↑/↓ (P2) also work
- 🖼️ **Freddie on the Table** — The legend himself graces the playing field

## Install

No dependencies required — it's vanilla HTML/CSS/JS with Three.js loaded from CDN.

```bash
git clone https://github.com/softchris/freddie-pong.git
cd freddie-pong
```

## Setup & Run

Serve the directory with any static file server (mic access requires `localhost` or HTTPS):

```bash
# Node.js
npx serve . -p 9000
```

Then open **http://localhost:9000** in Chrome or Edge.

If you use VS Code, you can also run with Live Server:

1. Open [index.html](index.html)
2. Run **Open with Live Server**
3. Play at the localhost URL shown by the extension

## How to Play

1. Open the game in your browser
2. **Allow microphone access** when prompted
3. **Select your mic** from the dropdown on the calibration screen
4. **Record your "Ay‑OH!"** — hold the sound for ~2 seconds
5. **Record your "Eh‑OH!"** — hold the sound for ~2 seconds
6. Press **SPACE** to start
7. **Sing to move your paddle!**
8. First to **5 points** wins!

## Controls

| Input | Action |
|-------|--------|
| 🎤 Sing high (Ay‑OH!) | Paddle moves up |
| 🎤 Sing low (Eh‑OH!) | Paddle moves down |
| `W` / `S` | Player 1 paddle (keyboard) |
| `↑` / `↓` | Player 2 paddle (keyboard) |
| `SPACE` / Tap | Start / Restart |

## Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Mic input, spectral analysis & voice fingerprinting
- Vanilla HTML/CSS/JS — No build step required
