import type { Job } from "@shared/schema";
import fs from "fs";
import path from "path";

// ===============================
// 0. Подключаем сертификаты
// ===============================
const rootCA = path.resolve(process.cwd(), "server/certs/russian_trusted_root_ca_pem.crt");
const subCA = path.resolve(process.cwd(), "server/certs/russian_trusted_sub_ca_pem.crt");

process.env.NODE_EXTRA_CA_CERTS = rootCA;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // В Replit иначе НЕ РАБОТАЕТ

// ===============================
// 1. Конфиг GigaChat API
// ===============================
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY!;
const GIGACHAT_CLIENT_ID = process.env.GIGACHAT_CLIENT_ID!;
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

const TOKEN_URL = "https://gigachat.devices.sberbank.ru/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// OAuth токен
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// ===============================
// 2. Получение токена
// ===============================
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const params = new URLSearchParams({
    scope: GIGACHAT_SCOPE,
    client_id: GIGACHAT_CLIENT_ID,
    grant_type: "client_credentials"
  });

  console.log("[GigaChat] TOKEN REQUEST BODY:", params.toString());
  console.log("[GigaChat] CLIENT_ID:", GIGACHAT_CLIENT_ID);
  console.log("[GigaChat] SCOPE:", GIGACHAT_SCOPE);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${GIGACHAT_AUTH_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  }).catch(e => {
    console.error("[GigaChat] FETCH ERROR:", e);
    throw e;
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("[GigaChat] TOKEN ERROR RESPONSE:", text);
    throw new Error("OAuth token request failed: " + text);
  }

  const data = JSON.parse(text);

  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_at * 1000;

  return cachedToken!;
}


// ===============================
// 3. Sanitize
// ===============================
function sanitize(text: string): string {
  return text.replace(/[*#_\-]/g, " ").replace(/\s+/g, " ").trim();
}

// ===============================
// 4. Компрессор резюме
// ===============================
function compressResume(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 3000) return raw;
  return raw.slice(0, 2000) + "\n...\n" + raw.slice(-800);
}

// ===============================
// 5. Generate
// ===============================
export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("[GigaChat] TOKEN FAILURE → fallback letter used");
    return getFallbackLetter(vacancy);
  }

  const prompt = `
Создай сопроводительное письмо строго по данным резюме.
Запрещено придумывать факты, цифры, навыки или опыт.

=== РЕЗЮМЕ ===
${compressResume(resume)}
=== КОНЕЦ ===

Вакансия: ${vacancy.title}
Компания: ${vacancy.company}

Требования:
- писать только plain-text
- без markdown
- без списков и символов
- только факты из резюме
`.trim();

  const body = {
    model: "GigaChat",
    messages: [
      { role: "system", content: "Ты эксперт по написанию сопроводительных писем." },
      { role: "user", content: prompt }
    ],
    temperature: 0.3
  };

  console.log("[GigaChat] Sending completion request...");

  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  }).catch(err => {
    console.error("[GigaChat] COMPLETION FETCH ERROR:", err);
    return null;
  });

  if (!response || !response.ok) {
    console.error("[GigaChat] COMPLETION ERROR:", response ? await response.text() : "");
    return getFallbackLetter(vacancy);
  }

  const data = await response.json().catch(e => {
    console.error("[GigaChat] JSON parse error:", e);
    return null;
  });

  if (!data?.choices?.[0]?.message?.content) {
    console.error("[GigaChat] EMPTY RESPONSE → fallback");
    return getFallbackLetter(vacancy);
  }

  return sanitize(data.choices[0].message.content);
}

// ===============================
// 6. Fallback (возвращён!)
// ===============================
export function getFallbackLetter(vacancy: Job): string {
  return `
Имею релевантный опыт работы и развивал продуктовые и маркетинговые направления. 
Работал с аналитикой, гипотезами, развитием продукта и улучшением процессов. 
Готов обсудить, как мой опыт будет полезен для вашей компании.
`.trim();
}
