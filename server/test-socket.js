const { io } = require("socket.io-client");
const socket = io("http://localhost:3001");

console.log("Connecting to socket...");

socket.on("connect", () => {
    console.log("Connected to server! ID:", socket.id);
    console.log("Requesting status...");
    socket.emit("request_status");
});

socket.on("whatsapp_status", (status) => {
    console.log("WhatsApp Status received:", status);
});

socket.on("ready", (isReady) => {
    console.log("Ready state received:", isReady);
});

socket.on("connect_error", (err) => {
    console.error("Connection Error:", err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log("Timeout waiting for events. Exiting.");
    process.exit(0);
}, 5000);
