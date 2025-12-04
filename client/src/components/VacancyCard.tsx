import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useState } from "react";
import { motion, PanInfo, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { Wallet, MapPin, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Job } from "@shared/schema";

interface VacancyCardProps {
  job: Job;
  onSwipe: (direction: "left" | "right") => void;
  onExpand: () => void;
  active: boolean;
}

export interface VacancyCardRef {
  swipe: (direction: "left" | "right") => Promise<void>;
}

const companyDomains: Record<string, string> = {
  "Ozon": "ozon.ru",
  "Wildberries": "wildberries.ru",
  "Yandex": "yandex.ru",
  "Яндекс Маркет": "market.yandex.ru",
  "VK": "vk.com",
  "VK Play": "vk.com",
  "Тинькофф": "tinkoff.ru",
  "Tinkoff": "tinkoff.ru",
  "T-Bank": "tinkoff.ru",
  "Сбер": "sber.ru",
  "СберМаркет": "sbermarket.ru",
  "Lamoda": "lamoda.ru",
  "Avito": "avito.ru",
  "Mail.ru Group": "mail.ru",
  "X5 Tech": "x5.ru",
  "Magnit Tech": "magnit.ru",
  "Yandex Cloud": "cloud.yandex.ru",
  "Циан": "cian.ru",
  "05.ru": "05.ru",
  "Самокат": "samokat.ru",
  "Delivery Club": "delivery-club.ru",
  "Золотое Яблоко": "goldapple.ru",
  "Skillbox": "skillbox.ru",
  "Мегамаркет": "megamarket.ru",
  "Skyeng": "skyeng.ru",
};

const employmentTypeColors: Record<string, { bg: string; text: string }> = {
  "full-time": { bg: "bg-blue-500", text: "text-white" },
  "remote": { bg: "bg-rose-400", text: "text-white" },
  "hybrid": { bg: "bg-purple-500", text: "text-white" },
};

const employmentTypeLabels: Record<string, string> = {
  "full-time": "Full Time",
  "remote": "Remote",
  "hybrid": "Hybrid",
};

const tagColors = [
  { bg: "bg-cyan-100", text: "text-cyan-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-lime-100", text: "text-lime-700" },
  { bg: "bg-pink-100", text: "text-pink-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
];

function getCompanyLogo(company: string): string | null {
  const domain = companyDomains[company];
  if (domain) {
    return `https://logo.clearbit.com/${domain}`;
  }
  return null;
}

function getCompanyInitials(company: string): string {
  return company
    .split(" ")
    .map(word => word[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function getInitialsColor(company: string): string {
  const colors = [
    "from-blue-500 to-indigo-600",
    "from-purple-500 to-pink-600",
    "from-emerald-500 to-teal-600",
    "from-orange-500 to-red-600",
    "from-cyan-500 to-blue-600",
    "from-rose-500 to-pink-600",
  ];
  const index = company.length % colors.length;
  return colors[index];
}

function getDaysAgo(date: Date | string): string {
  const now = new Date();
  const created = new Date(date);
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;
  return `${Math.floor(diffDays / 30)} мес. назад`;
}

export const VacancyCard = forwardRef<VacancyCardRef, VacancyCardProps>(
  ({ job, onSwipe, onExpand, active }, ref) => {
    const controls = useAnimation();
    const x = useMotionValue(0);
    const isMounted = useRef(true);
    const rotate = useTransform(x, [-200, 200], [-15, 15]);
    const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
    
    const likeOpacity = useTransform(x, [20, 150], [0, 1]);
    const nopeOpacity = useTransform(x, [-150, -20], [1, 0]);

    const [logoError, setLogoError] = useState(false);
    const logoUrl = getCompanyLogo(job.company);

    useEffect(() => {
      isMounted.current = true;
      setLogoError(false);
      return () => {
        isMounted.current = false;
      };
    }, [job.company]);

    const performSwipe = useCallback(async (direction: "left" | "right") => {
      if (!isMounted.current) return;
      
      const targetX = direction === "right" ? 500 : -500;
      await controls.start({ 
        x: targetX, 
        opacity: 0, 
        transition: { duration: 0.25 } 
      });
      
      onSwipe(direction);
    }, [controls, onSwipe]);

    useImperativeHandle(ref, () => ({
      swipe: performSwipe
    }), [performSwipe]);
    
    const handleDragEnd = useCallback(async (event: any, info: PanInfo) => {
      const offset = info.offset.x;
      const velocity = info.velocity.x;

      if (offset > 100 || velocity > 500) {
        await performSwipe("right");
      } else if (offset < -100 || velocity < -500) {
        await performSwipe("left");
      } else {
        if (isMounted.current) {
          controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 500, damping: 30 } });
        }
      }
    }, [controls, performSwipe]);

    const handleClick = useCallback((e: React.MouseEvent) => {
      if (Math.abs(x.get()) < 5) {
        onExpand();
      }
    }, [x, onExpand]);

    if (!active) return null;

    const employmentStyle = employmentTypeColors[job.employmentType] || { bg: "bg-gray-500", text: "text-white" };

    return (
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        style={{ x, rotate, opacity, position: "absolute", zIndex: 10, width: "100%", maxWidth: "380px", cursor: "grab" }}
        animate={controls}
        whileTap={{ cursor: "grabbing", scale: 1.02 }}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        className="perspective-1000"
      >
        <Card className="h-[540px] w-full overflow-hidden rounded-[32px] border-0 select-none relative bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15),0_8px_25px_rgba(0,0,0,0.1)]">
          
          {/* Like overlay */}
          <motion.div style={{ opacity: likeOpacity }} className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-500/15 z-20 flex items-center justify-center pointer-events-none rounded-[32px]">
            <div className="border-4 border-green-500 rounded-2xl px-6 py-3 transform -rotate-12 bg-white/60 backdrop-blur-sm">
              <span className="text-4xl font-black text-green-500 uppercase tracking-widest">Like</span>
            </div>
          </motion.div>
          
          {/* Nope overlay */}
          <motion.div style={{ opacity: nopeOpacity }} className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-rose-500/15 z-20 flex items-center justify-center pointer-events-none rounded-[32px]">
            <div className="border-4 border-red-500 rounded-2xl px-6 py-3 transform rotate-12 bg-white/60 backdrop-blur-sm">
              <span className="text-4xl font-black text-red-500 uppercase tracking-widest">Nope</span>
            </div>
          </motion.div>

          <CardContent className="p-0 h-full flex flex-col relative z-10">
            {/* Header with gradient background */}
            <div className="h-[180px] bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 flex flex-col items-center justify-center relative overflow-hidden px-6">
              {/* Decorative elements */}
              <div className="absolute top-4 right-4 bg-amber-400 text-white rounded-full px-2.5 py-1 flex items-center gap-1 text-xs font-bold shadow-lg">
                <Zap className="w-3 h-3" />
                <span>1</span>
              </div>
              
              {/* Company logo */}
              <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center overflow-hidden">
                {logoUrl && !logoError ? (
                  <img 
                    src={logoUrl} 
                    alt={job.company}
                    className="w-14 h-14 object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${getInitialsColor(job.company)} flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-white">{getCompanyInitials(job.company)}</span>
                  </div>
                )}
              </div>
              
              {/* Company name */}
              <h3 className="mt-3 text-lg font-bold text-gray-800" data-testid="text-company">
                {job.company}
              </h3>
            </div>
            
            <div className="px-5 py-4 flex-1 flex flex-col">
              {/* Description */}
              <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 text-center mb-3" data-testid="text-description">
                {job.description}
              </p>
              
              {/* Job title */}
              <h2 className="text-lg font-bold text-gray-900 text-center leading-tight mb-2 line-clamp-2" data-testid="text-job-title">
                {job.title}
              </h2>
              
              {/* Posted date */}
              <p className="text-xs text-gray-400 text-center mb-4">
                {getDaysAgo(job.createdAt)}
              </p>
              
              {/* Salary and location */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <Wallet className="w-4 h-4 text-gray-400" />
                  <span className="font-semibold text-sm" data-testid="text-salary">{job.salary}</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-sm">{job.location}</span>
                </div>
              </div>
              
              {/* Tags */}
              <div className="flex flex-wrap gap-2 justify-center mt-auto">
                {/* Employment type tag */}
                <span className={`${employmentStyle.bg} ${employmentStyle.text} px-3 py-1 rounded-full text-xs font-semibold`}>
                  {employmentTypeLabels[job.employmentType] || job.employmentType}
                </span>
                
                {/* Skill tags */}
                {job.tags?.slice(0, 3).map((tag, index) => {
                  const colorStyle = tagColors[index % tagColors.length];
                  return (
                    <span 
                      key={tag} 
                      className={`${colorStyle.bg} ${colorStyle.text} px-3 py-1 rounded-full text-xs font-medium`}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>
              
              {/* Tap hint */}
              <div className="text-center mt-4">
                <span className="text-xs text-gray-300 font-medium">Нажми для подробностей</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }
);

VacancyCard.displayName = "VacancyCard";
