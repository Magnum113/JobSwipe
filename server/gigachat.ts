import type { Job } from "@shared/schema";
import fs from "fs";
import path from "path";

// ===============================
// 1. Конфигурация
// ===============================
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY!;
const GIGACHAT_CLIENT_ID = process.env.GIGACHAT_CLIENT_ID!;
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

const TOKEN_URL = "https://gigachat.devices.sberbank.ru/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// ===============================
// 2. Храним токен в памяти
// ===============================
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

// ===============================
// 3. Получение токена OAuth
// ===============================
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Если токен не истёк — используем его
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    scope: GIGACHAT_SCOPE,
    client_id: GIGACHAT_CLIENT_ID,
    grant_type: "client_credentials"
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${GIGACHAT_AUTH_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[GigaChat] Token request failed:", err);
    throw new Error("GigaChat OAuth token error");
  }

  const data = await response.json();

  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_at * 1000;

  console.log("[GigaChat] Token updated");

  return cachedToken!;
}

// ===============================
// 4. Нормализация plain-text
// ===============================
function sanitize(text: string): string {
  return text
    .replace(/[*#_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ===============================
// 5. Компрессор резюме
// ===============================
function compressResume(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 3000) return raw;

  return raw.slice(0, 2000) + "\n...\n" + raw.slice(-800);
}

// ===============================
// 6. Генерация сопроводительного письма
// ===============================
export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const accessToken = await getAccessToken();
  const compressedResume = compressResume(resume);

  const prompt = `
Сгенерируй сопроводительное письмо строго на основе данных резюме. 
Запрещено придумывать факты, цифры или навыки, которых нет в резюме.

=== РЕЗЮМЕ ===
${compressedResume}
=== КОНЕЦ ===

Данные вакансии:
Название: ${vacancy.title}
Компания: ${vacancy.company}

Правила:
- использовать ТОЛЬКО информацию из резюме
- никаких цифр, если их нет в резюме
- писать без Markdown, без списков, без *, -, #
- plain-text
- аккуратный профессиональный стиль
  `.trim();

  const body = {
    model: "GigaChat",
    messages: [
      { role: "system", content: "Ты — профессиональный HR-копирайтер." },
      { role: "user", content: prompt }
    ],
    temperature: 0.3
  };

  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[GigaChat] Completion error:", err);
    throw new Error("GigaChat generation failed");
  }

  const data = await response.json();

  const text =
    data?.choices?.[0]?.message?.content ??
    "Не удалось сгенерировать письмо.";

  return sanitize(text);
}

// ===============================
// 7. Fallback
// ===============================
export function getFallbackLetter(): string {
  return "Имею релевантный опыт работы. Готов обсудить детали и показать достижения.";
}
