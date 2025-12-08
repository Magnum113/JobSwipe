import "undici";
import type { Job } from "@shared/schema";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Agent } from "undici";

const TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// ================================
// ХЕЛПЕР ДЛЯ ДЛИННЫХ ЛОГОВ
// ================================
function logLong(label: string, text: string | null | undefined, chunkSize = 500) {
  const safe = text || "";
  console.log(`\n===== ${label} START (length ${safe.length}) =====`);
  for (let i = 0; i < safe.length; i += chunkSize) {
    console.log(safe.substring(i, i + chunkSize));
  }
  console.log(`===== ${label} END =====\n`);
}

// ================================
// ГЛОБАЛЬНО ХРАНИМ ПОСЛЕДНИЙ ПРОМПТ ДЛЯ DEBUG-ЭНДПОИНТА
// ================================
let LAST_DEBUG_PROMPT = "";

// экспортируем геттер, чтобы routes мог забрать последний промпт
export function getLastGigachatPrompt(): string {
  return LAST_DEBUG_PROMPT;
}

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
  // =================== ПОДРОБНОЕ ЛОГИРОВАНИЕ РЕЗЮМЕ И ВАКАНСИИ ===================
  console.log("\n=================== GIGACHAT RESUME DEBUG ===================");
  console.log("🔥 GIGACHAT RESUME LENGTH:", resume ? resume.length : 0);
  logLong("GIGACHAT RESUME TEXT (FULL)", resume || "(EMPTY RESUME FOR GIGACHAT)");
  console.log("🔥 GIGACHAT VACANCY RAW:", {
    id: vacancy.id,
    title: vacancy.title,
    company: vacancy.company,
    salary: vacancy.salary,
    descriptionLength: vacancy.description ? vacancy.description.length : 0,
    // @ts-ignore — в рантайме tags есть, даже если тип Job его не описывает
    tags: (vacancy as any).tags || [],
  });
  console.log("============================================================\n");

  const token = await getAccessToken();
  if (!token) {
    console.log("[GigaChat] TOKEN FAILURE → fallback letter used");
    return fallbackLetter(vacancy);
  }

  // Сформируем текстовый блок с вакансией для промпта
  const vacancyBlock = `
=== ВАКАНСИЯ НАЧАЛО ===
Название вакансии: ${vacancy.title}
Компания: ${vacancy.company}
Зарплата: ${vacancy.salary || "—"}
Краткое описание / обязанности:
${vacancy.description || "—"}
Ключевые теги/направления:
${((vacancy as any).tags && (vacancy as any).tags.length)
  ? (vacancy as any).tags.join(", ")
  : "—"}
=== ВАКАНСИЯ КОНЕЦ ===
`.trim();

  // ------- ПРОМПТ: анализируем ВАКАНСИЮ + РЕЗЮМЕ и вытаскиваем только матчинг -------
  const prompt = `
Ты пишешь короткое, содержательное сопроводительное письмо под КОНКРЕТНУЮ вакансию, строго опираясь на резюме кандидата.

Тебе даны два блока:
1) ВАКАНСИЯ — требования, задачи, контекст роли.
2) РЕЗЮМЕ — опыт кандидата.

Твоя задача:
1) Внимательно прочитай ВАКАНСИЮ и вытащи 3–7 ключевых требований и задач (желаемый опыт, тип проектов, инструменты, уровень ответственности).
2) Затем прочитай РЕЗЮМЕ и найди ТОЛЬКО те факты, кейсы, навыки и результаты, которые максимально соответствуют этим требованиям.
3) На основе этого напиши сопроводительное письмо так, чтобы было видно:
   — кандидат реально делал похожие вещи;
   — его опыт и результаты бьются с задачами вакансии;
   — он понимает, какой вклад может внести.

Жёсткие правила:
1) НЕЛЬЗЯ придумывать факты, достижения, цифры, компании, навыки, опыт. Только то, что есть в резюме.
2) Нельзя использовать информацию, отсутствующую в РЕЗЮМЕ.
3) Если в резюме нет цифр — не используй цифры.
4) Только plain-text. Без markdown, *, #, -, _, списков и заголовков.
5) Не использовать обращения ("уважаемый", "меня зовут", "добрый день" и т.п.).
6) Не упоминать название компании и название вакансии в тексте письма.
7) Пиши коротко, профессионально и по делу, максимум в 3–5 предложений.
8) Фокусируйся на самом свежем и релевантном опыте (последние 2–3 года). Старый опыт используй только если он напрямую попадает в требования вакансии.
9) Не используй в письме точное название должности/профессии из резюме.
10) Не пиши фразы вроде "готов обсудить", "буду рад стать частью команды", "буду рад обсудить детали" и подобные. Письмо должно просто чётко подсвечивать ключевые релевантные моменты из резюме под эту вакансию.
11) Пиши письмо от моего лица, как будто я сам откликаюсь на вакансию. 

Структура письма:
1) Одно короткое предложение, которое описывает профиль кандидата и его релевантный фокус (в терминах задач вакансии), строго опираясь на резюме.
2) 1–3 предложения с конкретными примерами опыта, проектов, зон ответственности или результатов, КОТОРЫЕ ПРЯМО соответствуют требованиям вакансии.
3) Одно короткое завершающее предложение, подытоживающее, чем кандидат может быть полезен в контексте задач вакансии (без фраз про "готов обсудить" и без упоминания компании/вакансии).

Единственные источники информации:

${vacancyBlock}

=== РЕЗЮМЕ НАЧАЛО ===
${resume}
=== РЕЗЮМЕ КОНЕЦ ===

Выведи только текст сопроводительного письма, без пояснений, без заголовков и без лишних комментариев.
`.trim();

  // сохраняем последний промпт в глобалку для debug-эндпоинта
  LAST_DEBUG_PROMPT = prompt;

  // =================== ЛОГИРОВАНИЕ ФИНАЛЬНОГО ПРОМПТА ===================
  console.log("\n=================== GIGACHAT FINAL PROMPT ===================");
  console.log("🔥 PROMPT LENGTH:", prompt.length);
  logLong("GIGACHAT FINAL PROMPT", prompt);
  console.log("============================================================\n");

  // (опционально) сохраняем последний промпт в файл для локального дебага
  try {
    fs.writeFileSync("gigachat_prompt_latest.txt", prompt, "utf8");
  } catch (e) {
    console.warn("[GigaChat] Failed to write prompt file:", e);
  }

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
function fallbackLetter(_vacancy: Job): string {
  return `
Имею релевантный опыт работы и занимался развитием маркетинговых и продуктовых направлений. Работал с аналитикой, гипотезами, процессами и улучшением метрик.

Мой опыт и навыки позволяют закрывать задачи по развитию продукта и маркетинговых направлений.
`.trim();
}