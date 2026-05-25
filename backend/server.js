import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SSL_PFX_PATH =
  process.env.SSL_PFX_PATH || path.join(__dirname, "certs", "localhost.pfx");
const SSL_PFX_PASSPHRASE = process.env.SSL_PFX_PASSPHRASE || "local-dev";
const SSL_KEY_PATH =
  process.env.SSL_KEY_PATH || path.join(__dirname, "certs", "localhost-key.pem");
const SSL_CERT_PATH =
  process.env.SSL_CERT_PATH || path.join(__dirname, "certs", "localhost-cert.pem");
const FRONTEND_PATH = path.join(__dirname, "..", "frontend");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_PATH));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

let historial = [];

app.post("/api/chefia", async (req, res) => {
  try {
    const { mensaje } = req.body;

    if (!mensaje) {
      return res.status(400).json({ error: "No se recibió mensaje." });
    }

    historial.push(`Usuario: ${mensaje}`);

    const prompt = `
Eres una asistente de cocina por voz.

Reglas:
- Responde corto.
- Usa máximo 2 frases.
- Haz una sola pregunta por turno.
- No des toda la receta de golpe.
- Primero confirma ingredientes.
- Después guía paso a paso.
- Si el usuario dice "listo", continúa.
- Si falta algo, sugiere sustitución.

Conversación:
${historial.join("\n")}
`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const respuesta = response.text;

    historial.push(`ChefIA: ${respuesta}`);

    res.json({ respuesta });
  } catch (error) {
    console.error("ERROR GEMINI:", error.message);

    res.json({
      respuesta:
        "Tuve un problema con la IA. Podemos seguir con una receta sencilla. ¿Quieres pasta, huevo o pollo?",
    });
  }
});

app.post("/api/voz", async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "No se recibió texto." });
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ error: "Falta INWORLD_API_KEY en .env" });
    }

    if (!process.env.INWORLD_VOICE_ID) {
      return res.status(500).json({ error: "Falta INWORLD_VOICE_ID en .env" });
    }

    const response = await axios.post(
      "https://api.inworld.ai/tts/v1/voice",
      {
        text: texto,
        voiceId: process.env.INWORLD_VOICE_ID,
        modelId: process.env.INWORLD_MODEL_ID || "inworld-tts-1",
        audioConfig: {
          audioEncoding: "MP3",
          sampleRateHertz: 24000,
        },
      },
      {
        headers: {
          Authorization: `Basic ${process.env.INWORLD_API_KEY}`,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      }
    );

    if (response.status !== 200) {
      console.error("ERROR INWORLD REAL:", response.data);

      return res.status(500).json({
        error: "No se pudo generar la voz con Inworld.",
      });
    }

    const audioBuffer = Buffer.from(response.data.audioContent, "base64");

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    console.error("ERROR INWORLD:", error.message);

    res.status(500).json({
      error: "Error al generar voz con Inworld.",
    });
  }
});

app.post("/api/reiniciar", (req, res) => {
  historial = [];
  res.json({ ok: true, mensaje: "Conversación reiniciada." });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, "index.html"));
});

function startProductionServer() {
  http.createServer(app).listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor activo en puerto ${PORT}`);
  });
}

function startLocalServer() {
  if (
    !fs.existsSync(SSL_PFX_PATH) &&
    (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH))
  ) {
    console.error(
      "Faltan certificados HTTPS. Crea backend/certs/localhost.pfx o backend/certs/localhost-key.pem y backend/certs/localhost-cert.pem."
    );
    process.exit(1);
  }

  const httpsOptions = fs.existsSync(SSL_PFX_PATH)
    ? {
        pfx: fs.readFileSync(SSL_PFX_PATH),
        passphrase: SSL_PFX_PASSPHRASE,
      }
    : {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
      };

  https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Servidor activo en https://localhost:${PORT}`);
  });
}

if (IS_PRODUCTION) {
  startProductionServer();
} else {
  startLocalServer();
}
