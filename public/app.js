// Nastavitve
const isViewer = new URLSearchParams(location.search).get("viewer") === "1";
const roomParam = new URLSearchParams(location.search).get("room");
let roomId = roomParam || null;

const statusEl = document.getElementById("status");
const createLinkBtn = document.getElementById("createLinkBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const shareBox = document.getElementById("shareBox");
const shareLinkEl = document.getElementById("shareLink");
const copyBtn = document.getElementById("copyBtn");

// Inicializiraj Leaflet
const map = L.map("map");
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
}).addTo(map);

let myMarker = null;
let accuracyCircle = null;
let remoteMarker = null;
map.setView([46.0569, 14.5058], 7); // Slovenija kot izhodišče

let ws = null;
let watchId = null;

// Pomožne funkcije
function setStatus(msg) {
  statusEl.textContent = `Status: ${msg}`;
}

function buildViewerLink(id) {
  const url = new URL(location.href);
  url.searchParams.set("room", id);
  url.searchParams.set("viewer", "1");
  return url.toString();
}

function connectWS(role) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${roomId}&role=${role}`);

  ws.onopen = () => {
    setStatus(role === "sender" ? "deljenje pripravljeno" : "povezan kot gledalec");
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "loc" && isViewer) {
        // Posodobi oddaljeno lokacijo
        const latlng = [msg.lat, msg.lng];
        if (!remoteMarker) {
          remoteMarker = L.marker(latlng).addTo(map);
          map.setView(latlng, 15);
        } else {
          remoteMarker.setLatLng(latlng);
        }
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    if (role === "sender") setStatus("povezava zaprta");
  };
}

// Poženi kot gledalec (če je link s parametrom)
if (isViewer && roomId) {
  createLinkBtn.disabled = true;
  startBtn.disabled = true;
  setStatus("čakam na lokacijo…");
  connectWS("viewer");
} else {
  // Smo v načinu pošiljatelja
  if (roomId) {
    // Link je že ustvarjen (npr. deljen med napravami)
    shareBox.hidden = false;
    shareLinkEl.textContent = buildViewerLink(roomId);
    shareLinkEl.href = buildViewerLink(roomId);
    startBtn.disabled = false;
  }
}

// Gumbi
createLinkBtn.addEventListener("click", async () => {
  const res = await fetch("/new");
  const data = await res.json();
  roomId = data.id;

  shareBox.hidden = false;
  const link = buildViewerLink(roomId);
  shareLinkEl.textContent = link;
  shareLinkEl.href = link;
  startBtn.disabled = false;
  setStatus("povezava ustvarjena");
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLinkEl.href);
    setStatus("povezava kopirana");
  } catch {
    setStatus("kopiranje ni uspelo");
  }
});

startBtn.addEventListener("click", () => {
  if (!roomId) return;
  connectWS("sender");
  startBtn.disabled = true;
  stopBtn.disabled = false;
  createLinkBtn.disabled = true;
  setStatus("deljenje v teku…");

  if ("geolocation" in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng = [latitude, longitude];

        // Prikaz lastne lokacije
        if (!myMarker) {
          myMarker = L.marker(latlng, { title: "Ti" }).addTo(map);
          accuracyCircle = L.circle(latlng, { radius: accuracy }).addTo(map);
          map.setView(latlng, 16);
        } else {
          myMarker.setLatLng(latlng);
          accuracyCircle.setLatLng(latlng).setRadius(accuracy);
        }

        // Pošlji po WS
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "loc",
            lat: latitude,
            lng: longitude,
            accuracy,
            ts: Date.now()
          }));
        }
      },
      (err) => {
        setStatus(`napaka geolokacije: ${err.code}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  } else {
    setStatus("geolokacija ni podprta");
  }
});

stopBtn.addEventListener("click", () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (ws && ws.readyState <= 1) {
    ws.close();
  }
  stopBtn.disabled = true;
  setStatus("deljenje ustavljeno");
});
