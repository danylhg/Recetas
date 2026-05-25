const btn = document.getElementById("btnHablar");
const textoUsuario = document.getElementById("textoUsuario");
const respuestaIA = document.getElementById("respuestaIA");
const app = document.querySelector(".app");

const API_CHAT = "https://localhost:3000/api/chefia";
const API_VOZ = "https://localhost:3000/api/voz";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const recognition = SpeechRecognition ? new SpeechRecognition() : null;

let audioActual = null;
let hablando = false;
let escuchando = false;
let conversacionActiva = false;

if (recognition) {
  recognition.lang = "es-MX";
  recognition.continuous = false;
  recognition.interimResults = false;
} else {
  respuestaIA.textContent =
    "Tu navegador no soporta reconocimiento de voz. Usa Google Chrome.";
}

function setEstado(estado) {
  app.dataset.estado = estado;
}

btn.addEventListener("click", async () => {
  if (!recognition) return;

  conversacionActiva = true;
  setEstado("hablando");

  respuestaIA.textContent = "Hola, ¿qué quieres preparar hoy?";
  await hablar("Hola, ¿qué quieres preparar hoy?");

  iniciarEscucha();
});

function iniciarEscucha() {
  if (!recognition || hablando || escuchando || !conversacionActiva) return;

  try {
    escuchando = true;
    setEstado("escuchando");
    textoUsuario.textContent = "Escuchando...";
    recognition.start();
  } catch {
    escuchando = false;
    setTimeout(iniciarEscucha, 800);
  }
}

if (recognition) {
  recognition.onresult = async (event) => {
    escuchando = false;
    setEstado("pensando");

    const texto = event.results[0][0].transcript;
    textoUsuario.textContent = texto;

    await conversar(texto);
  };

  recognition.onerror = () => {
    escuchando = false;
    setEstado("listo");
    textoUsuario.textContent = "No se entendió tu voz.";
    setTimeout(iniciarEscucha, 1000);
  };

  recognition.onend = () => {
    escuchando = false;
  };
}

async function conversar(texto) {
  setEstado("pensando");
  respuestaIA.textContent = "Pensando...";

  try {
    const res = await fetch(API_CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mensaje: texto }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      setEstado("listo");
      respuestaIA.textContent = data.error || "Error al consultar ChefIA.";
      await hablar("Tuve un problema para responder.");
      iniciarEscucha();
      return;
    }

    respuestaIA.textContent = data.respuesta;

    setEstado("hablando");
    await hablar(data.respuesta);

    iniciarEscucha();
  } catch (error) {
    console.error("ERROR CHAT:", error);
    setEstado("listo");
    respuestaIA.textContent = "No se pudo conectar con el servidor.";
  }
}

async function enviarTexto(texto) {
  conversacionActiva = false;
  textoUsuario.textContent = texto;
  await conversar(texto);
}

async function hablar(texto) {
  return new Promise(async (resolve) => {
    try {
      hablando = true;

      if (audioActual) {
        audioActual.pause();
        audioActual.currentTime = 0;
        audioActual = null;
      }

      const res = await fetch(API_VOZ, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ texto }),
      });

      if (!res.ok) {
        console.error("ERROR VOZ:", await res.text());
        hablando = false;
        setEstado("listo");
        resolve();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      audioActual = new Audio(url);
      audioActual.volume = 1;

      audioActual.onended = () => {
        URL.revokeObjectURL(url);
        hablando = false;
        setEstado("listo");
        resolve();
      };

      audioActual.onerror = () => {
        URL.revokeObjectURL(url);
        hablando = false;
        setEstado("listo");
        resolve();
      };

      await audioActual.play();
    } catch (error) {
      console.error("ERROR AUDIO:", error);
      hablando = false;
      setEstado("listo");
      resolve();
    }
  });
}
