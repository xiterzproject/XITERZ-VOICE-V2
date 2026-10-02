# XITERZ VOICE V2 FIX
Node.js + Express + WebSocket + WebRTC.

Render:
- Build Command: npm install
- Start Command: npm start
- Health Check: /healthz

Fixes:
- ICE candidate queue to prevent candidates arriving before remote description.
- Remote audio element uses autoplay + playsInline.
- Mobile browser audio unlock button if autoplay is blocked.
- /rtc-config endpoint for STUN and optional TURN environment variables.
- Connection status/debug text.
- Keeps WebSocket signaling at /ws.

Optional TURN environment variables:
TURN_URL
TURN_USERNAME
TURN_CREDENTIAL

STUN alone can work for many networks, but a TURN server is needed for networks where direct WebRTC connectivity is blocked.
