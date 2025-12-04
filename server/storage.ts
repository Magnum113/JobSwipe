import { 
  type User, type InsertUser, 
  type Job, type InsertJob, 
  type Swipe, type InsertSwipe,
  type Resume, type InsertResume,
  type Application, type InsertApplication,
  jobs, swipes, users, resumes, applications 
} from "@shared/schema";
import { db } from "./db";
import { eq, notInArray, desc, ilike, or, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllJobs(): Promise<Job[]>;
  getUnswipedJobs(): Promise<Job[]>;
  searchJobs(filters: { company?: string; minSalary?: number; maxSalary?: number; keyword?: string; title?: string }): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  seedJobs(jobList: InsertJob[]): Promise<void>;
  
  createSwipe(swipe: InsertSwipe): Promise<Swipe>;
  getSwipeHistory(): Promise<Swipe[]>;
  deleteAllSwipes(): Promise<void>;
  
  getResume(): Promise<Resume | undefined>;
  saveResume(content: string): Promise<Resume>;
  
  createApplication(application: InsertApplication): Promise<Application>;
  getAllApplications(): Promise<Application[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllJobs(): Promise<Job[]> {
    return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async getUnswipedJobs(): Promise<Job[]> {
    const swipedJobIds = await db.select({ jobId: swipes.jobId }).from(swipes);
    const swipedIds = swipedJobIds.map((s: { jobId: number }) => s.jobId);
    
    if (swipedIds.length === 0) {
      return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
    }
    
    return await db.select()
      .from(jobs)
      .where(notInArray(jobs.id, swipedIds))
      .orderBy(desc(jobs.createdAt));
  }

  async searchJobs(filters: { company?: string; minSalary?: number; maxSalary?: number; keyword?: string; title?: string }): Promise<Job[]> {
    const conditions = [];
    
    if (filters.company) {
      conditions.push(ilike(jobs.company, `%${filters.company}%`));
    }
    
    if (filters.title) {
      conditions.push(ilike(jobs.title, `%${filters.title}%`));
    }
    
    if (filters.keyword) {
      conditions.push(
        or(
          ilike(jobs.description, `%${filters.keyword}%`),
          ilike(jobs.title, `%${filters.keyword}%`)
        )
      );
    }
    
    if (conditions.length === 0) {
      return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
    }
    
    return await db.select()
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async seedJobs(jobList: InsertJob[]): Promise<void> {
    const existingJobs = await this.getAllJobs();
    if (existingJobs.length === 0) {
      await db.insert(jobs).values(jobList);
    }
  }

  async createSwipe(swipe: InsertSwipe): Promise<Swipe> {
    const [created] = await db.insert(swipes).values(swipe).returning();
    return created;
  }

  async getSwipeHistory(): Promise<Swipe[]> {
    return await db.select().from(swipes).orderBy(desc(swipes.createdAt));
  }

  async deleteAllSwipes(): Promise<void> {
    await db.delete(swipes);
  }

  async getResume(): Promise<Resume | undefined> {
    const [resume] = await db.select().from(resumes).orderBy(desc(resumes.updatedAt)).limit(1);
    return resume;
  }

  async saveResume(content: string): Promise<Resume> {
    const existing = await this.getResume();
    
    if (existing) {
      const [updated] = await db
        .update(resumes)
        .set({ content, updatedAt: new Date() })
        .where(eq(resumes.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(resumes).values({ content }).returning();
    return created;
  }

  async createApplication(application: InsertApplication): Promise<Application> {
    const [created] = await db.insert(applications).values(application).returning();
    return created;
  }

  async getAllApplications(): Promise<Application[]> {
    return await db.select().from(applications).orderBy(desc(applications.appliedAt));
  }
}

export const storage = new DbStorage();
