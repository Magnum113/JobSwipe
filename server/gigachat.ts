import "undici";
import type { Job } from "@shared/schema";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Agent } from "undici";

const TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// Определяем путь к сертификатам (работает и в dev и в prod)
function getCertsDir(): string {
  // В production сертификаты лежат в dist/certs
  const prodPath = path.join(process.cwd(), "dist/certs");
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }
  // В dev - в server/certs
  const devPath = path.join(process.cwd(), "server/certs");
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return prodPath; // fallback
}

// ✓ Загружаем сертификаты Минцифры (с fallback если файлы не найдены)
let caCerts: string[] = [];
let gigaChatAgent: Agent | undefined;

try {
  const certsDir = getCertsDir();
  const certRootPath = path.join(certsDir, "russian_trusted_root_ca_pem.crt");
  const certSubPath = path.join(certsDir, "russian_trusted_sub_ca_pem.crt");
  
  if (fs.existsSync(certRootPath) && fs.existsSync(certSubPath)) {
    caCerts = [
      fs.readFileSync(certRootPath, "utf8"),
      fs.readFileSync(certSubPath, "utf8")
    ];
    gigaChatAgent = new Agent({
      connect: { ca: caCerts }
    });
    console.log("[GigaChat] Certificates loaded successfully");
  } else {
    console.warn("[GigaChat] Certificate files not found, GigaChat will be disabled");
  }
} catch (err) {
  console.warn("[GigaChat] Failed to load certificates:", err);
}

// ================================
// 1. Получение access_token GigaChat
// ================================
export async function getAccessToken(): Promise<string | null> {
  if (!gigaChatAgent) {
    console.warn("[GigaChat] Agent not initialized, certificates may be missing");
    return null;
  }
  
  try {
    const authKey = process.env.GIGACHAT_AUTH_KEY;
    if (!authKey) {
      console.warn("[GigaChat] GIGACHAT_AUTH_KEY not set");
      return null;
    }
    
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
  // =================== ПОДРОБНОЕ ЛОГИРОВАНИЕ РЕЗЮМЕ ===================
  console.log("\n=================== GIGACHAT RESUME DEBUG ===================");
  console.log("🔥 GIGACHAT RESUME LENGTH:", resume ? resume.length : 0);
  console.log("🔥 GIGACHAT RESUME TEXT (FULL):");
  console.log("------------------------------------------------------------");
  console.log(resume || "(EMPTY RESUME FOR GIGACHAT)");
  console.log("------------------------------------------------------------");
  console.log("🔥 GIGACHAT VACANCY INFO:", {
    id: vacancy.id,
    title: vacancy.title,
    company: vacancy.company,
    salary: vacancy.salary,
    descriptionLength: vacancy.description ? vacancy.description.length : 0,
  });
  console.log("============================================================\n");

  const token = await getAccessToken();
  if (!token) {
    console.log("[GigaChat] TOKEN FAILURE → fallback letter used");
    return fallbackLetter(vacancy);
  }

  // ------- ПРОМПТ -------
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
8) Используй актуальный опыт из резюме за последние 2 года, не бери данные за 

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

  // =================== ЛОГИРОВАНИЕ ФИНАЛЬНОГО ПРОМПТА ===================
  console.log("\n=================== GIGACHAT FINAL PROMPT ===================");
  console.log("🔥 PROMPT LENGTH:", prompt.length);
  console.log("🔥 PROMPT TEXT (FULL):");
  console.log("------------------------------------------------------------");
  console.log(prompt);
  console.log("------------------------------------------------------------");
  console.log("============================================================\n");

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
