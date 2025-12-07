import type { Job } from "@shared/schema";
import crypto from "crypto";

const TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

// -------------------------------
// 1. Получение access_token
// -------------------------------
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const CLIENT_ID = process.env.GIGACHAT_CLIENT_ID!;
  const AUTH_KEY = process.env.GIGACHAT_AUTH_KEY!;
  const SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

  const authHeader = crypto
    .createHash("sha256")
    .update(AUTH_KEY)
    .digest("hex");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: crypto.randomUUID(),
      Authorization: `Bearer ${authHeader}`,
    },
    body: new URLSearchParams({
      scope: SCOPE,
      client_id: CLIENT_ID,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[GigaChat] Token error:", err);
    throw new Error("Failed to get GigaChat token");
  }

  const data = await resp.json();

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in - 30) * 1000;

  return cachedToken!;
}

// -------------------------------
// 2. Сжатие резюме как в Gemini
// -------------------------------
function compressResume(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 3000) return raw;
  return raw.slice(0, 2000) + "\n...\n" + raw.slice(-800);
}

// Универсальный очиститель текста
function sanitizeText(text: string): string {
  return text
    .replace(/[*#_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -------------------------------
// 3. Генерация сопроводительного письма
// -------------------------------
export async function generateCoverLetter(
  resume: string,
  vacancy: Job
): Promise<string> {
  try {
    const token = await getAccessToken();
    const compressedResume = compressResume(resume);

    const prompt = `
Ты должен создать сопроводительное письмо строго на основе данных из резюме.

Жёсткие правила:
1) НЕЛЬЗЯ придумывать никакие факты, цифры, опыт, компании, навыки.
2) Используй только то, что реально есть в резюме.
3) Если данных мало — пиши нейтрально.
4) Никакого markdown, списков, *, #, -.

РЕЗЮМЕ:
${compressedResume}

Данные вакансии:
Название: ${vacancy.title}
Компания: ${vacancy.company}
Описание: ${vacancy.description}

Структура письма:
- краткое описание релевантного опыта
- 1–3 навыка из резюме
`.trim();

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "GigaChat",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.4,
      }),
    });

    const data = await resp.json();

    const message = data?.choices?.[0]?.message?.content;

    if (!message) {
      console.error("GigaChat empty response:", data);
      return getFallbackLetter(vacancy);
    }

    return sanitizeText(message);
  } catch (err) {
    console.error("GigaChat generation error:", err);
    return getFallbackLetter(vacancy);
  }
}

// -------------------------------
// 4. Fallback
// -------------------------------
function getFallbackLetter(vacancy: Job): string {
  return `
Имею релевантный опыт работы и развивал продуктовые и маркетинговые направления. Готов обсудить, как мой опыт может быть полезен.
  `.trim();
}
