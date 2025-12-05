import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertSwipeSchema, insertApplicationSchema, type Job, type HHJob, type HHJobsResponse } from "@shared/schema";
import { z } from "zod";
import { generateCoverLetter } from "./gemini";

const BATCH_SIZE = 30;

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

function adaptHHVacancy(vacancy: HHVacancy): HHJob {
  const description = vacancy.snippet.responsibility || vacancy.snippet.requirement || "Описание отсутствует";
  const cleanDescription = description.replace(/<[^>]*>/g, "");
  
  return {
    id: vacancy.id,
    title: vacancy.name,
    company: vacancy.employer.name,
    salary: formatSalary(vacancy.salary),
    description: cleanDescription,
    location: vacancy.area.name,
    employmentType: mapEmploymentType(vacancy.employment, vacancy.schedule),
    tags: vacancy.professional_roles.map(role => role.name).slice(0, 5),
    url: vacancy.alternate_url,
    logoUrl: vacancy.employer.logo_urls?.["240"] || vacancy.employer.logo_urls?.original || undefined,
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

  // HH.ru API - Get jobs with batch pagination
  // Each batch = one HH API page with per_page=30
  app.get("/api/hh/jobs", async (req, res) => {
    try {
      const text = (req.query.text as string) || "маркетинг";
      const area = (req.query.area as string) || "1";
      const employment = req.query.employment as string | undefined;
      const schedule = req.query.schedule as string | undefined;
      const experience = req.query.experience as string | undefined;
      const batch = parseInt(req.query.batch as string) || 1;
      
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
      
      const jobs = items.map(adaptHHVacancy);
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
      const validatedSwipe = insertSwipeSchema.parse(req.body);
      const swipe = await storage.createSwipe(validatedSwipe);
      res.status(201).json(swipe);
    } catch (error) {
      console.error("Error recording swipe:", error);
      res.status(400).json({ error: "Invalid swipe data" });
    }
  });

  // Get swipe history
  app.get("/api/swipes", async (req, res) => {
    try {
      const swipes = await storage.getSwipeHistory();
      res.json(swipes);
    } catch (error) {
      console.error("Error fetching swipe history:", error);
      res.status(500).json({ error: "Failed to fetch swipe history" });
    }
  });

  // Reset swipes
  app.post("/api/swipes/reset", async (req, res) => {
    try {
      await storage.deleteAllSwipes();
      res.json({ message: "Swipes reset successfully" });
    } catch (error) {
      console.error("Error resetting swipes:", error);
      res.status(500).json({ error: "Failed to reset swipes" });
    }
  });

  // Get resume
  app.get("/api/resume", async (req, res) => {
    try {
      const resume = await storage.getResume();
      res.json(resume || { content: "" });
    } catch (error) {
      console.error("Error fetching resume:", error);
      res.status(500).json({ error: "Failed to fetch resume" });
    }
  });

  // Save resume
  app.post("/api/resume", async (req, res) => {
    try {
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({ error: "Content must be a string" });
      }
      const resume = await storage.saveResume(content);
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

  // Get all applications
  app.get("/api/applications", async (req, res) => {
    try {
      const applications = await storage.getAllApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching applications:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
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

  return httpServer;
}
