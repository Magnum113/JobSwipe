import type { Job } from "@shared/schema";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirnameResolved = typeof __dirname === "undefined"
  ? path.dirname(fileURLToPath(import.meta.url))
  : __dirname;

const TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// ✓ Грузим сертификат Минцифры
const caCert = fs.readFileSync(
  path.resolve(__dirnameResolved, "certs/russian_trusted_root_ca_pem.crt")
);

// ✓ Получаем токен GigaChat
async function getAccessToken(): Promise<string | null> {
  try {
    const authKey = process.env.GIGACHAT_AUTH_KEY!;
    const clientId = process.env.GIGACHAT_CLIENT_ID!;
    const scope = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: crypto.randomUUID(),
        Authorization: `Basic ${authKey}`,
      },
      body: `scope=${scope}&client_id=${clientId}&grant_type=client_credentials`,
      dispatcher: new (require("undici").Agent)({
        connect: {
          ca: caCert
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.log("[GigaChat] TOKEN ERROR RESPONSE:", data);
      return null;
    }

    return data.access_token;
  } catch (err) {
    console.error("[GigaChat] TOKEN FAILURE:", err);
    return null;
  }
}

// ===================
// Генерация письма
// ===================
export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    console.log("[GigaChat] TOKEN FAILURE → fallback letter used");
    return fallbackLetter(vacancy);
  }

  const prompt = `
Ты должен создать сопроводительное письмо строго на основе данных из резюме.

Жёсткие правила:
- нельзя придумывать цифры, компании, метрики
- нельзя добавлять опыт, которого нет в резюме
- если нет цифр — не используй цифры
- только plain-text

Резюме:
${resume}

Вакансия:
${vacancy.title}, ${vacancy.company}
`.trim();

  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "GigaChat",
        messages: [
          { role: "user", content: prompt }
        ],
      }),
      dispatcher: new (require("undici").Agent)({
        connect: {
          ca: caCert
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[GigaChat] CHAT ERROR:", data);
      return fallbackLetter(vacancy);
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) return fallbackLetter(vacancy);

    return text.trim();
  } catch (err) {
    console.error("[GigaChat] GENERATION ERROR:", err);
    return fallbackLetter(vacancy);
  }
}

// ===================
// Фоллбек письмо
// ===================
function fallbackLetter(vacancy: Job): string {
  return `
Имею релевантный опыт работы и развивал продуктовые и маркетинговые направления. Работал с аналитикой, гипотезами, улучшением процессов и ростом метрик.

Готов обсудить, как мой опыт может быть полезен для вас.
`.trim();
}
