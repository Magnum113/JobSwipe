import { useRef, useCallback, useEffect } from "react";
import { motion, PanInfo, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { Building2, Wallet, MapPin, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Job } from "@shared/schema";

interface VacancyCardProps {
  job: Job;
  onSwipe: (direction: "left" | "right") => void;
  onExpand: () => void;
  active: boolean;
}

const employmentTypeLabels: Record<string, string> = {
  "full-time": "Офис",
  "remote": "Удалённо",
  "hybrid": "Гибрид",
};

export const VacancyCard = ({ job, onSwipe, onExpand, active }: VacancyCardProps) => {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const isMounted = useRef(true);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  
  const likeOpacity = useTransform(x, [20, 150], [0, 1]);
  const nopeOpacity = useTransform(x, [-150, -20], [1, 0]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  const handleDragEnd = useCallback(async (event: any, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset > 100 || velocity > 500) {
      if (isMounted.current) {
        await controls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } });
      }
      onSwipe("right");
    } else if (offset < -100 || velocity < -500) {
      if (isMounted.current) {
        await controls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } });
      }
      onSwipe("left");
    } else {
      if (isMounted.current) {
        controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 500, damping: 30 } });
      }
    }
  }, [controls, onSwipe]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (Math.abs(x.get()) < 5) {
      onExpand();
    }
  }, [x, onExpand]);

  if (!active) return null;

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      style={{ x, rotate, opacity, position: "absolute", zIndex: 10, width: "100%", maxWidth: "400px", cursor: "grab" }}
      animate={controls}
      whileTap={{ cursor: "grabbing", scale: 1.02 }}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className="perspective-1000"
    >
      <Card className="h-[480px] w-full overflow-hidden rounded-[28px] border-0 select-none relative bg-gradient-to-br from-white via-white to-gray-50/80 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-transparent to-indigo-50/30 pointer-events-none" />
        
        {/* Like overlay */}
        <motion.div style={{ opacity: likeOpacity }} className="absolute inset-0 bg-gradient-to-br from-green-500/15 to-emerald-500/10 z-20 flex items-center justify-center pointer-events-none rounded-[28px]">
          <div className="border-4 border-green-500 rounded-2xl px-5 py-2.5 transform -rotate-12 bg-white/50 backdrop-blur-sm">
            <span className="text-4xl font-black text-green-500 uppercase tracking-widest">Like</span>
          </div>
        </motion.div>
        
        {/* Nope overlay */}
        <motion.div style={{ opacity: nopeOpacity }} className="absolute inset-0 bg-gradient-to-br from-red-500/15 to-rose-500/10 z-20 flex items-center justify-center pointer-events-none rounded-[28px]">
           <div className="border-4 border-red-500 rounded-2xl px-5 py-2.5 transform rotate-12 bg-white/50 backdrop-blur-sm">
            <span className="text-4xl font-black text-red-500 uppercase tracking-widest">Nope</span>
          </div>
        </motion.div>

        <CardContent className="p-0 h-full flex flex-col relative z-10">
          {/* Header gradient */}
          <div className="h-24 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.15),transparent_70%)]" />
            <div className="w-16 h-16 rounded-2xl bg-white/90 shadow-lg flex items-center justify-center">
              <Building2 className="w-8 h-8 text-indigo-500" />
            </div>
          </div>
          
          <div className="px-6 py-5 flex-1 flex flex-col gap-4">
            {/* Title and company */}
            <div>
              <h2 className="text-xl font-bold leading-tight text-gray-900 mb-1 line-clamp-2" data-testid="text-job-title">
                {job.title}
              </h2>
              <p className="text-base font-semibold text-indigo-600" data-testid="text-company">
                {job.company}
              </p>
            </div>

            {/* Info pills */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 px-3 py-1.5 rounded-full border border-green-100/50">
                <Wallet className="w-3.5 h-3.5" />
                <span className="font-semibold text-sm" data-testid="text-salary">{job.salary}</span>
              </div>
              
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-100/50">
                <MapPin className="w-3.5 h-3.5" />
                <span className="font-medium text-sm">{job.location}</span>
              </div>
              
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 px-3 py-1.5 rounded-full border border-purple-100/50">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium text-sm">{employmentTypeLabels[job.employmentType] || job.employmentType}</span>
              </div>
            </div>

            {/* Description */}
            <div className="flex-1">
              <p className="text-gray-600 leading-relaxed line-clamp-4 text-[15px]" data-testid="text-description">
                {job.description}
              </p>
            </div>
            
            {/* Tags */}
            <div className="flex gap-2 flex-wrap">
              {job.tags?.slice(0, 4).map(tag => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 text-xs py-1 px-2.5 rounded-full font-medium border border-gray-200/50"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            
            {/* Tap hint */}
            <div className="text-center">
              <span className="text-xs text-gray-400 font-medium">Нажми, чтобы узнать больше</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
