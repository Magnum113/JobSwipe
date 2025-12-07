import "undici";
import type { Job } from "@shared/schema";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Agent } from "undici";

const __dirnameResolved = typeof __dirname === "undefined"
  ? path.dirname(fileURLToPath(import.meta.url))
  : __dirname;

const TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// ✓ Загружаем сертификаты Минцифры
const certRoot = fs.readFileSync(
  path.resolve(__dirnameResolved, "certs/russian_trusted_root_ca_pem.crt"),
  "utf8"
);
const certSub = fs.readFileSync(
  path.resolve(__dirnameResolved, "certs/russian_trusted_sub_ca_pem.crt"),
  "utf8"
);

const caCerts = [certRoot, certSub];

// ✓ Создаём HTTPS агент для GigaChat
const gigaChatAgent = new Agent({
  connect: {
    ca: caCerts
  }
});

// ================================
// 1. Получение access_token GigaChat
// ================================
export async function getAccessToken(): Promise<string | null> {
  try {
    const authKey = process.env.GIGACHAT_AUTH_KEY!;
    const scope = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: crypto.randomUUID(),
        Authorization: `Basic ${authKey}`,
      },
      body: new URLSearchParams({ scope }).toString(),
      dispatcher: gigaChatAgent
    } as any);

    if (!response.ok) {
      console.log("[GigaChat] TOKEN ERROR RESPONSE:");
      console.log(await response.text());
      return null;
    }

    const data = await response.json() as any;
    return data.access_token || null;
  } catch (err) {
    console.error("[GigaChat] TOKEN FAILURE:", err);
    return null;
  }
}

// ================================
// 2. Генерация сопроводительного письма
// ================================
export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  console.log("🔥🔥🔥 generateCoverLetter CALLED!");
  console.log("🔥 Resume length:", resume?.length);
  console.log("🔥 Resume first 300 chars:", resume?.slice(0, 300));
  console.log("🔥 Vacancy:", vacancy);

  const token = await getAccessToken();
  if (!token) {
    console.log("[GigaChat] TOKEN FAILURE → fallback letter used");
    return fallbackLetter(vacancy);
  }

  // ------- НОВЫЙ ЖЁСТКИЙ ПРОМПТ -------
  const prompt = `
Ты пишешь сопроводительное письмо строго на основе резюме.

Жёсткие правила:
1) Нельзя придумывать факты, достижения, цифры, компании, навыки, опыт.
2) Нельзя использовать информацию, отсутствующую в резюме.
3) Если в резюме нет цифр — не используй цифры.
4) Только plain-text. Без markdown, *, #, -, _, списков и заголовков.
5) Не использовать обращения ("уважаемый", "меня зовут", "я хотел бы").
6) Не упоминать название компании или название вакансии.
7) Пиши коротко, профессионально и по делу.

Единственный источник информации:
=== РЕЗЮМЕ НАЧАЛО ===
${resume}
=== РЕЗЮМЕ КОНЕЦ ===

Структура письма:
1) Одно короткое предложение с профессиональным профилем, строго из резюме.
2) 1–3 ключевые компетенции, присутствующие в резюме.
3) Короткое завершающее предложение о готовности к обсуждению.

Выведи только текст письма.
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
      dispatcher: gigaChatAgent
    } as any);

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("[GigaChat] CHAT ERROR:", data);
      return fallbackLetter(vacancy);
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) return fallbackLetter(vacancy);

    return sanitize(text.trim());
  } catch (err) {
    console.error("[GigaChat] GENERATION ERROR:", err);
    return fallbackLetter(vacancy);
  }
}

// ================================
// 3. Санитайзер — убираем markdown
// ================================
function sanitize(text: string): string {
  return text
    .replace(/[*#_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ================================
// 4. Fallback письмо
// ================================
function fallbackLetter(vacancy: Job): string {
  return `
Имею релевантный опыт работы и занимался развитием маркетинговых и продуктовых направлений. Работал с аналитикой, гипотезами, процессами и улучшением метрик.

Готов обсудить, как мой опыт может быть полезен вашей компании.
`.trim();
}
