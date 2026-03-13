# print-server

A small server that runs on a computer on the same network as the Raspberry Pi. The website sends it text; it converts the text to braille cells with [`../shared`](../shared) and pipes them over SSH to `~/receive_text.sh` on the Pi.

- `POST /print` checks the text and sends it to the Pi
- `POST /api/terminate-print` stops a print in progress

Run it with `npm run print-server`. The Pi's address, SSH user and key are set in `.env` (see `.env.example`).
