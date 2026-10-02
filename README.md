# XITERZ VOICE V2 DEBUG

Build Command: `npm install`
Start Command: `npm start`
Health Check: `/healthz`

This build adds detailed Render logs for WebSocket, rooms, signaling, ICE, errors, and WebRTC connection states. It also sends WebSocket heartbeat pings every 25 seconds.

Optional TURN environment variables:
- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

STUN alone may fail on some mobile/carrier/NAT networks. In that case a TURN server is needed.
