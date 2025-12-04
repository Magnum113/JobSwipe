import { useState } from "react";
import { motion, PanInfo, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { Check, X, Building2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Job } from "@shared/schema";

interface VacancyCardProps {
  job: Job;
  onSwipe: (direction: "left" | "right") => void;
  active: boolean;
}

export const VacancyCard = ({ job, onSwipe, active }: VacancyCardProps) => {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  
  // Dynamic background color based on swipe direction
  const likeOpacity = useTransform(x, [20, 150], [0, 1]);
  const nopeOpacity = useTransform(x, [-150, -20], [1, 0]);
  
  const handleDragEnd = async (event: any, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset > 100 || velocity > 500) {
      await controls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } });
      onSwipe("right");
    } else if (offset < -100 || velocity < -500) {
      await controls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } });
      onSwipe("left");
    } else {
      controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 500, damping: 30 } });
    }
  };

  if (!active) return null;

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      style={{ x, rotate, opacity, position: "absolute", zIndex: 10, width: "100%", maxWidth: "400px", cursor: "grab" }}
      animate={controls}
      whileTap={{ cursor: "grabbing", scale: 1.02 }}
      onDragEnd={handleDragEnd}
      className="perspective-1000"
    >
      <Card className="h-[550px] w-full overflow-hidden rounded-[24px] border-0 bg-white shadow-2xl select-none relative">
        
        {/* Overlay for Like/Nope feedback */}
        <motion.div style={{ opacity: likeOpacity }} className="absolute inset-0 bg-green-500/10 z-20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-green-500 rounded-xl px-4 py-2 transform -rotate-12">
            <span className="text-4xl font-bold text-green-500 uppercase tracking-widest">Like</span>
          </div>
        </motion.div>
        
        <motion.div style={{ opacity: nopeOpacity }} className="absolute inset-0 bg-red-500/10 z-20 flex items-center justify-center pointer-events-none">
           <div className="border-4 border-red-500 rounded-xl px-4 py-2 transform rotate-12">
            <span className="text-4xl font-bold text-red-500 uppercase tracking-widest">Nope</span>
          </div>
        </motion.div>

        <CardContent className="p-0 h-full flex flex-col relative z-10">
          {/* Header Image / Gradient Placeholder */}
          <div className="h-32 bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
            <Building2 className="w-12 h-12 text-indigo-200" />
          </div>
          
          <div className="px-8 py-6 flex-1 flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold leading-tight text-gray-900 mb-1" data-testid="text-job-title">{job.title}</h2>
              <p className="text-lg font-medium text-indigo-600" data-testid="text-company">{job.company}</p>
            </div>

            <div className="flex items-center gap-2 text-gray-600 bg-gray-50 p-3 rounded-xl w-fit">
              <Wallet className="w-5 h-5" />
              <span className="font-semibold" data-testid="text-salary">{job.salary}</span>
            </div>

            <div className="mt-2 space-y-2">
               <p className="text-gray-600 leading-relaxed line-clamp-4 text-lg" data-testid="text-description">
                {job.description}
              </p>
            </div>
            
            <div className="mt-auto flex gap-2 flex-wrap">
               {job.tags?.map(tag => (
                 <Badge key={tag} variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm py-1 px-3 rounded-full">
                   {tag}
                 </Badge>
               ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
