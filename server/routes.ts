import type { Express } from "express";
import { getLastGigachatPrompt } from "./gigachat"; // путь подкорректируй под свою структуру
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { users, resumes, applications } from "@shared/schema";
import { insertJobSchema, insertSwipeSchema, insertApplicationSchema, type Job, type HHJob, type HHJobsResponse } from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { generateCoverLetter, getAccessToken } from "./gigachat";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getHHUserInfo,
  getValidAccessToken,
  getHHResumes,
  getHHResumeDetail,
  applyToVacancy,
  resumeToText,
} from "./hhAuth";

const BATCH_SIZE = 30;

// Extract profession from resume title or experience
function extractProfession(title: string | null, contentJson: any): string {
  // First try the resume title
  if (title) {
    return title;
  }
  
  // Try to get from experience (last position)
  if (contentJson?.experience && Array.isArray(contentJson.experience) && contentJson.experience.length > 0) {
    const lastJob = contentJson.experience[0];
    if (lastJob.position) {
      return lastJob.position;
    }
  }
  
  // Try specialization
  if (contentJson?.specialization && Array.isArray(contentJson.specialization) && contentJson.specialization.length > 0) {
    return contentJson.specialization[0].name || contentJson.specialization[0];
  }
  
  // Fallback
  return "Специалист";
}

interface HHVacancy {
  id: string;
  name: string;
  employer: {
    name: string;
    logo_urls?: { original?: string; "90"?: string; "240"?: string } | null;
  };
  salary: {
    from: number | null;
    to: number | null;
    currency: string;
  } | null;
  snippet: {
    requirement: string | null;
    responsibility: string | null;
  };
  area: {
    name: string;
  };
  schedule: {
    id: string;
    name: string;
  } | null;
  employment: {
    id: string;
    name: string;
  } | null;
  professional_roles: Array<{ name: string }>;
  alternate_url: string;
}

function formatSalary(salary: HHVacancy["salary"]): string {
  if (!salary) return "Зарплата не указана";
  
  const { from, to, currency } = salary;
  const currencySymbol = currency === "RUR" ? "₽" : currency;
  
  if (from && to) {
    return `${Math.round(from / 1000)}–${Math.round(to / 1000)}k ${currencySymbol}`;
  } else if (from) {
    return `от ${Math.round(from / 1000)}k ${currencySymbol}`;
  } else if (to) {
    return `до ${Math.round(to / 1000)}k ${currencySymbol}`;
  }
  return "Зарплата не указана";
}

function mapEmploymentType(employment: HHVacancy["employment"], schedule: HHVacancy["schedule"]): string {
  if (schedule?.id === "remote") return "remote";
  if (schedule?.id === "flexible") return "hybrid";
  if (employment?.id === "full") return "full-time";
  if (employment?.id === "part") return "part-time";
  return "full-time";
}

async function adaptHHVacancy(vacancy: HHVacancy): Promise<HHJob> {
  // 1. Короткое описание для карточек
  const short = vacancy.snippet.responsibility || vacancy.snippet.requirement || "Описание отсутствует";
  const shortClean = short.replace(/<[^>]*>/g, "");

  // 2. Полное описание — загружаем отдельно
  let fullClean = "";
  try {
    const resp = await fetch(`https://api.hh.ru/vacancies/${vacancy.id}`);
    if (resp.ok) {
      const full = await resp.json();
      fullClean = (full.description || "").replace(/<[^>]*>/g, "");
    }
  } catch (e) {
    console.log("Failed to load full vacancy description:", e);
  }

  // 3. Адаптация остальных данных
  let logoUrl = vacancy.employer.logo_urls?.["240"] || vacancy.employer.logo_urls?.original || undefined;
  if (logoUrl && logoUrl.includes("employer-logo-round")) {
    logoUrl = logoUrl.replace("employer-logo-round", "employer-logo");
  }

  return {
    id: vacancy.id,
    title: vacancy.name,
    company: vacancy.employer.name,
    salary: formatSalary(vacancy.salary),
    description: shortClean,         // ← карточки возвращают короткое описание
    descriptionFull: fullClean,      // ← ПОЛНОЕ описание (это важно!)
    location: vacancy.area.name,
    employmentType: mapEmploymentType(vacancy.employment, vacancy.schedule),
    tags: vacancy.professional_roles.map(role => role.name).slice(0, 5),
    url: vacancy.alternate_url,
    logoUrl,
  };
}

const SEED_JOBS = [
  {
    title: "Product Marketing Manager – Marketplace",
    company: "05.ru",
    salary: "150–200k",
    description: "Оптимизация воронки, аналитика продаж, GA4, CRM. Мы ищем человека, который сможет вывести наш маркетплейс на новый уровень.",
    tags: ["Marketing", "Analytics", "Growth"],
    employmentType: "full-time",
    location: "Москва"
  },
  {
    title: "Data Analyst – Retail & eCommerce",
    company: "X5 Tech",
    salary: "200–260k",
    description: "SQL, Python, ClickHouse, построение витрин. Работа с большими данными и влияние на принятие продуктовых решений.",
    tags: ["Data", "SQL", "Python"],
    employmentType: "hybrid",
    location: "Москва"
  },
  {
    title: "Product Manager – Digital Banking",
    company: "T-Bank",
    salary: "230–300k",
    description: "Разработка мобильных фич, A/B тесты, CJM. Лидирование продуктовой команды и развитие мобильного приложения банка.",
    tags: ["Product", "Fintech", "Mobile"],
    employmentType: "hybrid",
    location: "Москва"
  },
  {
    title: "Frontend Developer – React Core",
    company: "Yandex",
    salary: "250–350k",
    description: "Разработка сложных интерфейсов, оптимизация производительности, архитектура фронтенда. Стек: React, TypeScript, Effector.",
    tags: ["Frontend", "React", "TypeScript"],
    employmentType: "full-time",
    location: "Москва"
  },
  {
    title: "UX/UI Designer – Design System",
    company: "Avito",
    salary: "180–240k",
    description: "Развитие дизайн-системы, создание компонентов, работа над консистентностью интерфейсов всего продукта.",
    tags: ["Design", "Figma", "UI/UX"],
    employmentType: "hybrid",
    location: "Санкт-Петербург"
  },
  {
    title: "Backend Engineer – High Load Systems",
    company: "Ozon",
    salary: "280–380k",
    description: "Разработка микросервисов на Go, работа с Kubernetes, оптимизация производительности высоконагруженных систем.",
    tags: ["Backend", "Go", "Microservices"],
    employmentType: "full-time",
    location: "Москва"
  },
  {
    title: "ML Engineer – Recommender Systems",
    company: "VK",
    salary: "300–400k",
    description: "Построение рекомендательных систем, работа с большими данными, A/B тестирование ML моделей в продакшене.",
    tags: ["ML", "Python", "Recommendations"],
    employmentType: "full-time",
    location: "Санкт-Петербург"
  },
  {
    title: "DevOps Engineer – Cloud Infrastructure",
    company: "Yandex Cloud",
    salary: "220–300k",
    description: "Управление облачной инфраструктурой, автоматизация CI/CD, мониторинг и обеспечение отказоустойчивости.",
    tags: ["DevOps", "AWS", "Kubernetes"],
    employmentType: "remote",
    location: "Удалённо"
  },
  {
    title: "Senior iOS Developer",
    company: "Сбер",
    salary: "280–350k",
    description: "Разработка мобильного приложения СберБанк Онлайн. Swift, SwiftUI, CI/CD, работа в крупной продуктовой команде.",
    tags: ["iOS", "Swift", "Mobile"],
    employmentType: "full-time",
    location: "Москва"
  },
  {
    title: "Business Analyst – Fintech",
    company: "Тинькофф",
    salary: "180–250k",
    description: "Анализ бизнес-процессов, написание ТЗ, работа с продуктовыми командами. Опыт в финтехе приветствуется.",
    tags: ["Business Analysis", "Fintech", "Product"],
    employmentType: "hybrid",
    location: "Москва"
  },
  {
    title: "QA Engineer – Automation",
    company: "Wildberries",
    salary: "200–280k",
    description: "Автоматизация тестирования, Selenium, Python, CI/CD интеграция. Большой e-commerce проект.",
    tags: ["QA", "Automation", "Python"],
    employmentType: "remote",
    location: "Удалённо"
  },
  {
    title: "System Administrator – Linux",
    company: "Mail.ru Group",
    salary: "150–220k",
    description: "Администрирование Linux серверов, мониторинг, автоматизация. Работа с высоконагруженной инфраструктурой.",
    tags: ["Linux", "DevOps", "Infrastructure"],
    employmentType: "full-time",
    location: "Москва"
  },
  {
    title: "Product Owner – Mobile App",
    company: "Yandex",
    salary: "250–320k",
    description: "Развитие мобильного приложения, постановка задач команде, аналитика, UX-гипотезы.",
    tags: ["Product", "Mobile", "Analytics"],
    employmentType: "hybrid",
    location: "Москва"
  },
  {
    title: "Performance Marketing Manager",
    company: "Ozon",
    salary: "180–240k",
    description: "Управление рекламными кампаниями, оптимизация CPA, аналитика каналов, работа с креативами.",
    tags: ["Marketing", "Performance", "Analytics"],
    employmentType: "remote",
    location: "Удалённо"
  },
  {
    title: "Product Analyst",
    company: "VK",
    salary: "200–260k",
    description: "Аналитика поведения пользователей, SQL, A/B тесты, продуктовые рекомендации.",
    tags: ["Analytics", "SQL", "Product"],
    employmentType: "full-time",
    location: "Санкт-Петербург"
  },
  {
    title: "Senior Product Manager – Fintech",
    company: "Tinkoff",
    salary: "260–350k",
    description: "Запуск финтех-фич, работа с кросс-командами, анализ метрик, рост юнит-экономики.",
    tags: ["Product", "Fintech", "Strategy"],
    employmentType: "hybrid",
    location: "Москва"
  },
  {
    title: "Email/CRM Marketing Lead",
    company: "Wildberries",
    salary: "180–240k",
    description: "Стратегия CRM-коммуникаций, сегментация, персонализация, автоматизации.",
    tags: ["CRM", "Marketing", "Automation"],
    employmentType: "remote",
    location: "Удалённо"
  },
  {
    title: "UX/UI Designer – eCommerce",
    company: "Lamoda",
    salary: "150–200k",
    description: "Дизайн пользовательских сценариев, оптимизация интерфейсов, мобильные UI, CJM.",
    tags: ["Design", "UX/UI", "eCommerce"],
    employmentType: "hybrid",
    location: "Москва"
  },
  {
    title: "Data Engineer – Retail Analytics",
    company: "Magnit Tech",
    salary: "220–300k",
    description: "Построение витрин данных, ETL, ClickHouse, Airflow, оптимизация хранилищ.",
    tags: ["Data", "ETL", "Analytics"],
    employmentType: "full-time",
    location: "Краснодар"
  },
  {
    title: "Digital Marketing Manager",
    company: "СберМаркет",
    salary: "160–230k",
    description: "Стратегия digital-продвижения, управление перформанс-каналами, работа с аналитикой.",
    tags: ["Digital", "Marketing", "Strategy"],
    employmentType: "remote",
    location: "Удалённо"
  },
  {
    title: "Front-end Developer – React",
    company: "Avito",
    salary: "260–330k",
    description: "Разработка интерфейсов, оптимизация производительности, работа с дизайнерами.",
    tags: ["Frontend", "React", "JavaScript"],
    employmentType: "hybrid",
    location: "Санкт-Петербург"
  },
  {
    title: "Product Researcher",
    company: "Циан",
    salary: "180–240k",
    description: "Проведение пользовательских исследований, CJM, глубинные интервью, формирование инсайтов.",
    tags: ["Research", "UX", "Product"],
    employmentType: "full-time",
    location: "Москва"
  }
];

const searchFiltersSchema = z.object({
  company: z.string().optional(),
  minSalary: z.number().optional(),
  maxSalary: z.number().optional(),
  keyword: z.string().optional(),
  title: z.string().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed jobs on startup
  await storage.seedJobs(SEED_JOBS);

  // Test GigaChat integration
  app.get("/api/test-gigachat", async (_req, res) => {
    try {
      const token = await getAccessToken();
      if (!token) {
        return res.json({ ok: false, error: "Token failed" });
      }

      const response = await fetch("https://gigachat.devices.sberbank.ru/api/v1/models", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });

      const data = await response.text();
      res.send(data);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // HH.ru API - Get jobs with batch pagination
  // Each batch = one HH API page with per_page=30
  // Filters out already-swiped vacancies for authenticated users
  app.get("/api/hh/jobs", async (req, res) => {
    try {
      const text = (req.query.text as string) || "маркетинг";
      const area = (req.query.area as string) || "1";
      const employment = req.query.employment as string | undefined;
      const schedule = req.query.schedule as string | undefined;
      const experience = req.query.experience as string | undefined;
      const batch = parseInt(req.query.batch as string) || 1;
      const userId = req.query.userId as string | undefined;
      
      const page = batch - 1;
      
      const params = new URLSearchParams({
        text,
        area,
        per_page: String(BATCH_SIZE),
        page: String(page),
      });
      
      if (employment && employment !== "all") params.append("employment", employment);
      if (schedule && schedule !== "all") params.append("schedule", schedule);
      if (experience && experience !== "all") params.append("experience", experience);
      
      const url = `https://api.hh.ru/vacancies?${params.toString()}`;
      console.log(`[HH API] Fetching batch ${batch} (page ${page}): ${url}`);
      
      const response = await fetch(url, {
        headers: {
          "User-Agent": "JobSwipe/1.0 (job-search-app)",
          "Accept": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[HH API] Error ${response.status}: ${errorText}`);
        throw new Error(`HH API error: ${response.status}`);
      }
      
      const data = await response.json();
      const items = data.items as HHVacancy[];
      const totalFound = data.found as number;
      const pages = data.pages as number;
      
      let jobs = await Promise.all(items.map(adaptHHVacancy));
      
      // Filter out already-swiped vacancies for authenticated users
      if (userId) {
        const swipedIds = await storage.getSwipedVacancyIds(userId);
        const swipedSet = new Set(swipedIds);
        const beforeFilter = jobs.length;
        jobs = jobs.filter(job => !swipedSet.has(job.id));
        console.log(`[HH API] Filtered swiped vacancies: ${beforeFilter} -> ${jobs.length} (removed ${beforeFilter - jobs.length})`);
      }
      
      const hasMore = batch < pages;
      
      console.log(`[HH API] Batch ${batch}: got ${jobs.length} jobs, total found: ${totalFound}, pages: ${pages}, hasMore: ${hasMore}`);
      
      const result: HHJobsResponse = {
        jobs,
        hasMore,
        total: totalFound,
        batch,
      };
      
      res.json(result);
    } catch (error) {
      console.error("[HH API] Error:", error);
      res.status(500).json({ error: "Failed to fetch jobs from HH.ru", jobs: [], hasMore: false, total: 0, batch: 1 });
    }
  });

  // Get unswiped jobs with optional filters
  app.get("/api/jobs/unswiped", async (req, res) => {
    try {
      const filters = {
        company: req.query.company as string | undefined,
        salaryRange: req.query.salaryRange as string | undefined,
        employmentType: req.query.employmentType as string | undefined,
        location: req.query.location as string | undefined,
        keyword: req.query.keyword as string | undefined,
      };
      const jobs = await storage.getUnswipedJobs(filters);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching unswiped jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get filter options (companies and locations)
  app.get("/api/jobs/filter-options", async (req, res) => {
    try {
      const options = await storage.getFilterOptions();
      res.json(options);
    } catch (error) {
      console.error("Error fetching filter options:", error);
      res.status(500).json({ error: "Failed to fetch filter options" });
    }
  });

  // Get all jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Search jobs with filters
  app.get("/api/jobs/search", async (req, res) => {
    try {
      const filters = {
        company: req.query.company as string | undefined,
        keyword: req.query.keyword as string | undefined,
        title: req.query.title as string | undefined,
      };
      const jobs = await storage.searchJobs(filters);
      res.json(jobs);
    } catch (error) {
      console.error("Error searching jobs:", error);
      res.status(500).json({ error: "Failed to search jobs" });
    }
  });

  // Create a new job
  app.post("/api/jobs", async (req, res) => {
    try {
      const validatedJob = insertJobSchema.parse(req.body);
      const job = await storage.createJob(validatedJob);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(400).json({ error: "Invalid job data" });
    }
  });

  // Record a swipe
  app.post("/api/swipes", async (req, res) => {
    try {
      const { vacancyId, direction, userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      if (!vacancyId) {
        return res.status(400).json({ error: "Vacancy ID is required" });
      }
      if (!direction || !["left", "right"].includes(direction)) {
        return res.status(400).json({ error: "Direction must be 'left' or 'right'" });
      }
      
      // Check if already swiped
      const alreadySwiped = await storage.hasSwipedVacancy(userId, vacancyId);
      if (alreadySwiped) {
        return res.json({ ok: true, alreadySwiped: true });
      }
      
      // Create swipe
      const swipe = await storage.createSwipe(userId, vacancyId, direction);
      res.status(201).json({ ok: true, swipe });
    } catch (error) {
      console.error("Error recording swipe:", error);
      res.status(400).json({ error: "Failed to record swipe" });
    }
  });

  // Get swipe history
  app.get("/api/swipes", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const swipes = await storage.getSwipeHistory(userId);
      res.json(swipes);
    } catch (error) {
      console.error("Error fetching swipe history:", error);
      res.status(500).json({ error: "Failed to fetch swipe history" });
    }
  });

  // Reset swipes
  app.post("/api/swipes/reset", async (req, res) => {
    try {
      const userId = req.body.userId as string | undefined;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      await storage.deleteAllSwipes(userId);
      res.json({ message: "Swipes reset successfully" });
    } catch (error) {
      console.error("Error resetting swipes:", error);
      res.status(500).json({ error: "Failed to reset swipes" });
    }
  });

  // Get manual resume (user-scoped)
  app.get("/api/resume", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const resume = await storage.getManualResume(userId);
      res.json({ content: resume?.content || "" });
    } catch (error) {
      console.error("Error fetching resume:", error);
      res.status(500).json({ error: "Failed to fetch resume" });
    }
  });

  // Save manual resume (user-scoped)
  app.post("/api/resume", async (req, res) => {
    try {
      const { content, userId } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({ error: "Content must be a string" });
      }
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const resume = await storage.saveManualResume(userId, content);
      res.status(201).json(resume);
    } catch (error) {
      console.error("Error saving resume:", error);
      res.status(500).json({ error: "Failed to save resume" });
    }
  });

  // Create application
  app.post("/api/applications", async (req, res) => {
    try {
      const validatedApplication = insertApplicationSchema.parse(req.body);
      const application = await storage.createApplication(validatedApplication);
      res.status(201).json(application);
    } catch (error) {
      console.error("Error creating application:", error);
      res.status(400).json({ error: "Invalid application data" });
    }
  });

  // Get applications for a user
  app.get("/api/applications", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const applications = await storage.getApplicationsByUser(userId);
      res.json(applications);
    } catch (error) {
      console.error("Error fetching applications:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });

  // Get pending applications count (where cover letter is still being generated)
  app.get("/api/applications/pending-count", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      if (!userId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getPendingApplicationsCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching pending count:", error);
      res.json({ count: 0 });
    }
  });

  // Update application cover letter
  app.patch("/api/applications/:id/cover-letter", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { coverLetter } = req.body;
      
      if (typeof coverLetter !== "string") {
        return res.status(400).json({ error: "Cover letter must be a string" });
      }
      
      const updated = await storage.updateApplicationCoverLetter(id, coverLetter);
      if (!updated) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating cover letter:", error);
      res.status(500).json({ error: "Failed to update cover letter" });
    }
  });

  // Generate cover letter using AI
  const coverLetterRequestSchema = z.object({
    resume: z.string().optional().default(""),
    vacancy: z.object({
      id: z.number(),
      title: z.string(),
      company: z.string(),
      salary: z.string(),
      description: z.string().nullable().optional(),
      tags: z.array(z.string()).nullable().optional(),
    }),
  });

  app.post("/api/cover-letter/generate", async (req, res) => {
    try {
      const validated = coverLetterRequestSchema.parse(req.body);
      console.log("\n========== DEBUG RESUME PAYLOAD ==========");
       console.log("RESUME LENGTH:", validated.resume?.length);
       console.log("RESUME FIRST 500 CHARS:");
       console.log(validated.resume?.slice(0, 500));
       console.log("VACANCY:", validated.vacancy);
    console.log("==========================================\n");
      
      const coverLetter = await generateCoverLetter(
        validated.resume, 
        validated.vacancy as Job
      );
      res.json({ coverLetter });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error generating cover letter:", error);
      res.status(500).json({ error: "Failed to generate cover letter" });
    }
  });

  // =====================================================
  // HH.RU OAUTH ROUTES
  // =====================================================

  // Start OAuth flow - redirect to HH.ru
  app.get("/auth/hh/start", (req, res) => {
    try {
      const authUrl = getAuthUrl();
      console.log("[HH OAuth] Redirecting to:", authUrl);
      res.redirect(authUrl);
    } catch (error) {
      console.error("[HH OAuth] Error starting auth:", error);
      res.status(500).json({ error: "Failed to start OAuth" });
    }
  });

  // OAuth callback - exchange code for tokens
  app.get("/auth/hh/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      if (!code) {
        console.error("[HH OAuth] Missing authorization code");
        return res.redirect("/?hhAuth=error&reason=no_code");
      }

      console.log("[HH OAuth] Received code, exchanging for tokens...");
      const tokens = await exchangeCodeForTokens(code);
      console.log("[HH OAuth] Tokens received, expires_in:", tokens.expires_in);
      
      console.log("[HH OAuth] Getting user info...");
      const userInfo = await getHHUserInfo(tokens.access_token);
      console.log("[HH OAuth] User info:", userInfo.id, userInfo.email);
      
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      
      // Find or create user
      let [user] = await db.select().from(users).where(eq(users.hhUserId, userInfo.id));
      
      if (user) {
        console.log("[HH OAuth] Updating existing user:", user.id);
        await db.update(users)
          .set({
            hhAccessToken: tokens.access_token,
            hhRefreshToken: tokens.refresh_token,
            hhTokenExpiresAt: expiresAt,
            email: userInfo.email,
            firstName: userInfo.first_name,
            lastName: userInfo.last_name,
          })
          .where(eq(users.hhUserId, userInfo.id));
        
        // Refetch updated user
        [user] = await db.select().from(users).where(eq(users.id, user.id));
      } else {
        console.log("[HH OAuth] Creating new user for HH ID:", userInfo.id);
        const [newUser] = await db.insert(users)
          .values({
            username: userInfo.email || `hh_${userInfo.id}`,
            password: "oauth_user",
            hhUserId: userInfo.id,
            hhAccessToken: tokens.access_token,
            hhRefreshToken: tokens.refresh_token,
            hhTokenExpiresAt: expiresAt,
            email: userInfo.email,
            firstName: userInfo.first_name,
            lastName: userInfo.last_name,
          })
          .returning();
        user = newUser;
      }

      console.log("[HH OAuth] User authenticated:", user.id);
      
      // Sync resumes immediately after authentication
      try {
        console.log("[HH OAuth] Syncing resumes...");
        const hhResumes = await getHHResumes(tokens.access_token);
        console.log("[HH OAuth] Found", hhResumes.length, "resumes");
        
        for (const hhResume of hhResumes) {
          const detail = await getHHResumeDetail(tokens.access_token, hhResume.id);
          const contentText = resumeToText(detail);
          
          // Check if resume already exists
          const [existing] = await db.select()
            .from(resumes)
            .where(and(
              eq(resumes.userId, user.id),
              eq(resumes.hhResumeId, hhResume.id)
            ));
          
          if (existing) {
            await db.update(resumes)
              .set({
                title: detail.title,
                content: contentText,
                contentJson: detail as any,
                updatedAt: new Date(),
              })
              .where(eq(resumes.id, existing.id));
            console.log("[HH OAuth] Updated resume:", hhResume.id);
          } else {
            await db.insert(resumes)
              .values({
                userId: user.id,
                hhResumeId: hhResume.id,
                title: detail.title,
                content: contentText,
                contentJson: detail as any,
                selected: true,
              });
            console.log("[HH OAuth] Created resume:", hhResume.id);
          }
        }
        console.log("[HH OAuth] Resumes synced successfully");
      } catch (syncError) {
        console.error("[HH OAuth] Resume sync failed (non-fatal):", syncError);
      }
      
      // Redirect to vacancies page with user ID (main page after auth)
      console.log("[HH OAuth] Redirecting to / with userId:", user.id);
      res.redirect(`/?userId=${user.id}&hhAuth=success`);
    } catch (error) {
      console.error("[HH OAuth] Callback error:", error);
      res.redirect("/?hhAuth=error");
    }
  });

  // Get current auth status
  app.get("/api/auth/status", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.json({ authenticated: false });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.hhAccessToken) {
        return res.json({ authenticated: false });
      }

      const accessToken = await getValidAccessToken(userId);
      res.json({
        authenticated: !!accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          hhUserId: user.hhUserId,
        },
      });
    } catch (error) {
      console.error("[HH Auth] Status error:", error);
      res.json({ authenticated: false });
    }
  });

  // Get user's profession from selected resume
  app.get("/api/user/profession", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.json({ profession: null });
      }

      // Get selected resume
      const [selectedResume] = await db.select()
        .from(resumes)
        .where(and(
          eq(resumes.userId, userId),
          eq(resumes.selected, true)
        ));

      if (!selectedResume) {
        // Try to get any resume
        const [anyResume] = await db.select()
          .from(resumes)
          .where(eq(resumes.userId, userId));
        
        if (!anyResume) {
          return res.json({ profession: null });
        }
        
        // Extract profession from title or content
        const profession = extractProfession(anyResume.title, anyResume.contentJson);
        return res.json({ profession, resumeTitle: anyResume.title });
      }

      const profession = extractProfession(selectedResume.title, selectedResume.contentJson);
      res.json({ profession, resumeTitle: selectedResume.title });
    } catch (error) {
      console.error("[Profession] Error:", error);
      res.json({ profession: null });
    }
  });

  // Get full profile with HH status and resumes
  app.get("/api/profile", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.json({ 
          hhConnected: false, 
          user: null, 
          hhResumes: [],
          manualResume: "",
        });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.json({ 
          hhConnected: false, 
          user: null, 
          hhResumes: [],
          manualResume: "",
        });
      }

      const userResumes = await db.select()
        .from(resumes)
        .where(eq(resumes.userId, userId));
      
      const hhConnected = !!(user.hhAccessToken && user.hhUserId);
      
      const hhResumes = userResumes.filter(r => r.hhResumeId !== null);
      const manualResumeRecord = userResumes.find(r => r.hhResumeId === null);
      
      res.json({
        hhConnected,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          hhUserId: user.hhUserId,
        },
        hhResumes: hhResumes.map(r => ({
          id: r.id,
          hhResumeId: r.hhResumeId,
          title: r.title,
          selected: r.selected,
          updatedAt: r.updatedAt,
        })),
        manualResume: manualResumeRecord?.content || "",
      });
    } catch (error) {
      console.error("[Profile] Error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // =====================================================
  // HH.RU RESUME ROUTES
  // =====================================================

  // Sync resumes from HH.ru
  app.post("/api/hh/resumes/sync", async (req, res) => {
    try {
      const userId = req.body.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const accessToken = await getValidAccessToken(userId);
      if (!accessToken) {
        return res.status(401).json({ error: "Not authenticated with HH.ru" });
      }

      console.log("[HH Resumes] Syncing resumes for user:", userId);
      const hhResumes = await getHHResumes(accessToken);
      
      const syncedResumes: any[] = [];
      
      for (const hhResume of hhResumes) {
        console.log("[HH Resumes] Fetching details for:", hhResume.id);
        const detail = await getHHResumeDetail(accessToken, hhResume.id);
        const contentText = resumeToText(detail);
        
        // Check if resume already exists
        const [existing] = await db.select()
          .from(resumes)
          .where(and(
            eq(resumes.userId, userId),
            eq(resumes.hhResumeId, hhResume.id)
          ));
        
        if (existing) {
          // Update existing resume
          const [updated] = await db.update(resumes)
            .set({
              title: detail.title,
              content: contentText,
              contentJson: detail as any,
              updatedAt: new Date(),
            })
            .where(eq(resumes.id, existing.id))
            .returning();
          syncedResumes.push(updated);
        } else {
          // Create new resume
          const [created] = await db.insert(resumes)
            .values({
              userId,
              hhResumeId: hhResume.id,
              title: detail.title,
              content: contentText,
              contentJson: detail as any,
              selected: syncedResumes.length === 0, // Select first resume by default
            })
            .returning();
          syncedResumes.push(created);
        }
      }

      console.log("[HH Resumes] Synced", syncedResumes.length, "resumes");
      res.json({ resumes: syncedResumes, count: syncedResumes.length });
    } catch (error) {
      console.error("[HH Resumes] Sync error:", error);
      res.status(500).json({ error: "Failed to sync resumes" });
    }
  });

  // Get user's resumes
  app.get("/api/hh/resumes", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const userResumes = await db.select()
        .from(resumes)
        .where(eq(resumes.userId, userId));
      
      res.json(userResumes);
    } catch (error) {
      console.error("[HH Resumes] Get error:", error);
      res.status(500).json({ error: "Failed to get resumes" });
    }
  });

  // Select active resume
  app.post("/api/hh/resumes/select", async (req, res) => {
    try {
      const { userId, resumeId } = req.body;
      if (!userId || !resumeId) {
        return res.status(400).json({ error: "User ID and Resume ID required" });
      }

      // Deselect all resumes for this user
      await db.update(resumes)
        .set({ selected: false })
        .where(eq(resumes.userId, userId));
      
      // Select the specified resume
      const [updated] = await db.update(resumes)
        .set({ selected: true })
        .where(and(
          eq(resumes.id, parseInt(resumeId)),
          eq(resumes.userId, userId)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Resume not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("[HH Resumes] Select error:", error);
      res.status(500).json({ error: "Failed to select resume" });
    }
  });

  // =====================================================
  // HH.RU APPLICATION ROUTES
  // =====================================================

  // Async apply - returns immediately, processes in background
  app.post("/api/apply/async", async (req, res) => {
    try {
      const { userId, vacancyId, vacancyData, resumeText, isDemo } = req.body;
      
      if (!vacancyId) {
        return res.status(400).json({ error: "Vacancy ID required" });
      }

      const jobTitle = vacancyData?.title || "Вакансия";
      const company = vacancyData?.company || "Компания";
      const jobId = parseInt(vacancyId) || null;

      // Create pending application immediately
      const [pendingApp] = await db.insert(applications)
        .values({
          userId: userId || null,
          vacancyId: String(vacancyId),
          jobId,
          jobTitle,
          company,
          status: "pending",
          coverLetter: null,
        })
        .returning();

      console.log("[Async Apply] Created pending application:", pendingApp.id);

      // Return immediately
      res.json({ 
        status: "queued", 
        applicationId: pendingApp.id,
        message: "Отклик поставлен в очередь" 
      });

      // Process in background (after response sent)
      setImmediate(async () => {
        try {
          console.log("[Async Apply] Starting background processing for app:", pendingApp.id);
          
          // Generate cover letter
          let coverLetter = "";
          try {
            const vacancy = {
              id: parseInt(vacancyId) || 0,
              title: vacancyData?.title || "",
              company: vacancyData?.company || "",
              salary: vacancyData?.salary || "",
              description: vacancyData?.description || "",
              tags: vacancyData?.tags || [],
            } as Job;
            
            // --- NEW: Get selected resume text ---
let resumeTextFinal = "";

try {
  const [selectedResume] = await db.select()
    .from(resumes)
    .where(and(
      eq(resumes.userId, userId),
      eq(resumes.selected, true)
    ));

  if (selectedResume) {
    resumeTextFinal = selectedResume.content || "";
    console.log("🔥 Loaded resume from DB, length:", resumeTextFinal.length);
  } else {
    console.log("🔥 No selected resume found");
  }
} catch (e) {
  console.log("🔥 Error loading resume:", e);
}
            console.log("\n==================== FULL RESUME DEBUG ====================");
            console.log("🔥 FULL RESUME — LENGTH:", (resumeText || "").length);
            console.log("🔥 FULL RESUME — CONTENT BELOW:");
            console.log("------------------------------------------------------------");
            console.log(resumeText || "(EMPTY RESUME)");
            console.log("------------------------------------------------------------");
            console.log("🔥 FULL VACANCY OBJECT:");
            console.dir(vacancy, { depth: 5 });
            console.log("============================================================\n");

            
// --- Generate cover letter using real resume ---
coverLetter = await generateCoverLetter(resumeTextFinal, vacancy);

            console.log("[Async Apply] Cover letter generated for app:", pendingApp.id);
          } catch (err) {
            console.error("[Async Apply] Cover letter generation failed:", err);
            coverLetter = "Ошибка генерации сопроводительного письма.";
          }

          // If demo mode or no userId - just update with cover letter
          if (isDemo || !userId) {
            await db.update(applications)
              .set({ 
                coverLetter,
                status: "demo",
              })
              .where(eq(applications.id, pendingApp.id));
            console.log("[Async Apply] Demo application completed:", pendingApp.id);
            return;
          }

          // For authenticated users - apply via HH.ru
          const accessToken = await getValidAccessToken(userId);
          if (!accessToken) {
            await db.update(applications)
              .set({ 
                coverLetter,
                status: "failed",
                errorReason: "Не авторизован на hh.ru"
              })
              .where(eq(applications.id, pendingApp.id));
            return;
          }

          // Get selected resume
          const [selectedResume] = await db.select()
            .from(resumes)
            .where(and(
              eq(resumes.userId, userId),
              eq(resumes.selected, true)
            ));

          if (!selectedResume || !selectedResume.hhResumeId) {
            await db.update(applications)
              .set({ 
                coverLetter,
                status: "failed",
                errorReason: "Не выбрано резюме"
              })
              .where(eq(applications.id, pendingApp.id));
            return;
          }

          // Apply to HH.ru
          const result = await applyToVacancy(
            accessToken,
            vacancyId,
            selectedResume.hhResumeId,
            coverLetter
          );

          if (result.error) {
            await db.update(applications)
              .set({ 
                coverLetter,
                resumeId: selectedResume.id,
                status: "failed",
                errorReason: result.error
              })
              .where(eq(applications.id, pendingApp.id));
            console.log("[Async Apply] HH.ru application failed:", pendingApp.id, result.error);
          } else {
            await db.update(applications)
              .set({ 
                coverLetter,
                resumeId: selectedResume.id,
                status: "success",
                hhNegotiationId: result.id || null
              })
              .where(eq(applications.id, pendingApp.id));
            console.log("[Async Apply] HH.ru application succeeded:", pendingApp.id);
          }
        } catch (bgError) {
          console.error("[Async Apply] Background processing error:", bgError);
          await db.update(applications)
            .set({ 
              status: "failed",
              errorReason: "Внутренняя ошибка обработки"
            })
            .where(eq(applications.id, pendingApp.id));
        }
      });

    } catch (error) {
      console.error("[Async Apply] Error:", error);
      res.status(500).json({ error: "Failed to queue application" });
    }
  });

  // Apply to vacancy through HH.ru API (sync - legacy)
  app.post("/api/hh/apply", async (req, res) => {
    try {
      const { userId, vacancyId, coverLetter } = req.body;
      
      if (!userId || !vacancyId) {
        return res.status(400).json({ error: "User ID and Vacancy ID required" });
      }

      const accessToken = await getValidAccessToken(userId);
      if (!accessToken) {
        return res.status(401).json({ error: "Not authenticated with HH.ru" });
      }

      // Get selected resume
      const [selectedResume] = await db.select()
        .from(resumes)
        .where(and(
          eq(resumes.userId, userId),
          eq(resumes.selected, true)
        ));

      if (!selectedResume || !selectedResume.hhResumeId) {
        return res.status(400).json({ error: "No resume selected" });
      }

      console.log("[HH Apply] Applying to vacancy:", vacancyId, "with resume:", selectedResume.hhResumeId);
      
      const result = await applyToVacancy(
        accessToken,
        vacancyId,
        selectedResume.hhResumeId,
        coverLetter || ""
      );

      // Get vacancy details for logging
      let jobTitle = "Вакансия";
      let company = "Компания";
      try {
        const vacancyRes = await fetch(`https://api.hh.ru/vacancies/${vacancyId}`, {
          headers: { "User-Agent": "JobSwipe/1.0" }
        });
        if (vacancyRes.ok) {
          const vacancy = await vacancyRes.json();
          jobTitle = vacancy.name;
          company = vacancy.employer?.name || "Компания";
        }
      } catch {}

      if (result.error) {
        // Check for test assignment error
        const isTestRequired = result.error.includes("тест") || 
          result.errors?.some(e => e.type === "negotiations" && e.value.includes("test"));
        
        const [app] = await db.insert(applications)
          .values({
            userId,
            vacancyId,
            jobTitle,
            company,
            resumeId: selectedResume.id,
            coverLetter,
            status: "failed",
            errorReason: isTestRequired 
              ? "Вакансия требует тестового задания. Отклик возможен только на hh.ru."
              : result.error,
          })
          .returning();
        
        return res.status(400).json({ 
          success: false, 
          error: app.errorReason,
          application: app,
        });
      }

      // Success
      const [app] = await db.insert(applications)
        .values({
          userId,
          vacancyId,
          jobTitle,
          company,
          resumeId: selectedResume.id,
          coverLetter,
          hhNegotiationId: result.id,
          status: "success",
        })
        .returning();

      console.log("[HH Apply] Application created:", app.id);
      res.json({ success: true, application: app });
    } catch (error) {
      console.error("[HH Apply] Error:", error);
      res.status(500).json({ success: false, error: "Failed to apply" });
    }
  });

  // Get user's applications
  app.get("/api/hh/applications", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const userApplications = await db.select()
        .from(applications)
        .where(eq(applications.userId, userId));
      
      res.json(userApplications);
    } catch (error) {
      console.error("[HH Applications] Get error:", error);
      res.status(500).json({ error: "Failed to get applications" });
    }
  });
  app.get("/api/debug/last-prompt", (_req, res) => {
    const prompt = getLastGigachatPrompt();

    if (!prompt) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send("NO PROMPT YET");
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(prompt);
  });

  return httpServer;
}
