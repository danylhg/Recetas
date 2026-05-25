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

async function generarRespuesta(prompt) {
  const modelos = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite",
  ].filter((modelo, index, lista) => modelo && lista.indexOf(modelo) === index);

  let ultimoError = null;

  for (const model of modelos) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      return response.text;
    } catch (error) {
      ultimoError = error;
      console.error(`Problema al responder con ${model}:`, error.message);
    }
  }

  throw ultimoError;
}

function limpiarRespuesta(texto) {
  return String(texto || "")
    .replace(/^\s*(asistente|chefia|chef|respuesta)\s*:\s*/i, "")
    .trim();
}

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function esTemaDeCocina(mensaje) {
  const texto = normalizarTexto(mensaje);
  const temasFueraDeCocina = [
    "casa",
    "construir",
    "cemento",
    "ladrillo",
    "medicina",
    "medicamento",
    "pastilla",
    "inyeccion",
    "enfermedad",
    "doctor",
    "abogado",
    "demanda",
    "programar",
    "codigo",
    "matematicas",
    "tarea",
    "historia",
    "politica",
    "finanzas",
    "dinero",
  ];
  const palabrasCocina = [
    "receta",
    "cocina",
    "cocinar",
    "comida",
    "bebida",
    "preparar",
    "ingrediente",
    "horno",
    "sarten",
    "olla",
    "freir",
    "hervir",
    "asar",
    "hornear",
    "licuar",
    "batir",
    "mezclar",
    "postre",
    "desayuno",
    "cena",
    "almuerzo",
    "sopa",
    "ensalada",
    "pollo",
    "carne",
    "pescado",
    "arroz",
    "pasta",
    "huevo",
    "verdura",
    "fruta",
    "salsa",
    "taco",
    "mexicana",
    "vegana",
    "saludable",
    "coctel",
    "jugo",
    "agua",
    "cafe",
    "te",
    "malteada",
    "smoothie",
    "enchilada",
    "enchiladas",
    "pozole",
    "mole",
    "tamales",
    "quesadilla",
    "quesadillas",
    "tostada",
    "tostadas",
    "chilaquiles",
    "flautas",
    "sopes",
    "gorditas",
    "tortilla",
    "tortillas",
    "frijoles",
    "guacamole",
    "caldo",
    "birria",
    "barbacoa",
    "hamburguesa",
    "pizza",
    "sandwich",
    "hot cakes",
    "hotcakes",
    "licuado",
    "atole",
    "chocolate",
    "pan",
    "pastel",
    "galletas",
    "helado",
    "limonada",
    "naranjada",
    "coctel",
    "cocktail",
    "queso",
    "crema",
    "leche",
    "mantequilla",
    "aceite",
    "sal",
    "azucar",
    "harina",
    "masa",
    "jitomate",
    "tomate",
    "cebolla",
    "chile",
    "aguacate",
    "papas",
    "papa",
    "zanahoria",
    "platano",
    "manzana",
  ];
  const intencionesCocina = [
    "que ocupo",
    "que necesito",
    "como hago",
    "como preparar",
    "como preparo",
    "voy a preparar",
    "quiero preparar",
    "quiero hacer",
    "para hacer",
    "para preparar",
    "se cocina",
    "se prepara",
    "cuanto tiempo",
    "a que temperatura",
  ];

  const tieneCocina = palabrasCocina.some((palabra) => texto.includes(palabra));
  const tieneIntencion = intencionesCocina.some((frase) => texto.includes(frase));
  const tieneFuera = temasFueraDeCocina.some((palabra) => texto.includes(palabra));

  if (tieneCocina) return true;
  if (tieneIntencion && !tieneFuera) return true;

  return false;
}

app.post("/api/chefia", async (req, res) => {
  try {
    const { mensaje } = req.body;

    if (!mensaje) {
      return res.status(400).json({ error: "No se recibió mensaje." });
    }

    if (!esTemaDeCocina(mensaje)) {
      return res.json({
        respuesta: "Solo puedo responder sobre cocina, recetas, comida y bebidas.",
      });
    }

    historial.push(`Usuario: ${mensaje}`);

    const prompt = `
Responde como una guía de cocina por voz.

Reglas:
- Responde solo sobre cocina, recetas, comida y bebidas.
- Si el usuario pide otro tema, di: "Solo puedo responder sobre cocina, recetas, comida y bebidas."
- Responde corto.
- Usa máximo 2 frases.
- Haz una sola pregunta por turno.
- No empieces tu respuesta con nombres, etiquetas ni prefijos.
- No des toda la receta de golpe.
- Primero confirma ingredientes.
- Después guía paso a paso.
- Si el usuario dice "listo", continúa.
- Si falta algo, sugiere sustitución.

Conversación:
${historial.join("\n")}
`;

    const respuesta = limpiarRespuesta(await generarRespuesta(prompt));

    historial.push(respuesta);

    res.json({ respuesta });
  } catch (error) {
    console.error("Problema al responder:", error?.message || error);

    res.json({
      respuesta: "Tengo un problema en este momento. Intenta de nuevo en unos minutos.",
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
      console.error("Problema al generar voz:", response.data);

      return res.status(500).json({
        error: "No se pudo generar la voz.",
      });
    }

    const audioBuffer = Buffer.from(response.data.audioContent, "base64");

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    console.error("Problema al generar voz:", error.message);

    res.status(500).json({
      error: "Error al generar voz.",
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
