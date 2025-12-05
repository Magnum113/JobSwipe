import { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
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

export interface VacancyCardRef {
  swipe: (direction: "left" | "right") => Promise<void>;
}

const employmentTypeLabels: Record<string, string> = {
  "full-time": "Офис",
  "remote": "Удалённо",
  "hybrid": "Гибрид",
};

const companyDomains: Record<string, string> = {
  "Ozon": "ozon.ru",
  "Wildberries": "wildberries.ru",
  "Yandex": "yandex.ru",
  "Yandex Cloud": "cloud.yandex.ru",
  "Яндекс Маркет": "market.yandex.ru",
  "Avito": "avito.ru",
  "VK": "vk.com",
  "VK Play": "vkplay.ru",
  "Tinkoff": "tinkoff.ru",
  "Тинькофф": "tinkoff.ru",
  "T-Bank": "tinkoff.ru",
  "Сбер": "sber.ru",
  "СберМаркет": "sbermarket.ru",
  "Lamoda": "lamoda.ru",
  "X5 Tech": "x5.ru",
  "Mail.ru Group": "mail.ru",
  "Magnit Tech": "magnit.ru",
  "Циан": "cian.ru",
  "05.ru": "05.ru",
  "Самокат": "samokat.ru",
  "Delivery Club": "delivery-club.ru",
  "Skillbox": "skillbox.ru",
  "Skyeng": "skyeng.ru",
  "Золотое Яблоко": "goldapple.ru",
  "Мегамаркет": "megamarket.ru",
};

function getCompanyLogoUrl(company: string): string {
  const domain = companyDomains[company];
  if (domain) {
    return `https://api.companyenrich.com/logo/${domain}`;
  }
  return "";
}

export const VacancyCard = forwardRef<VacancyCardRef, VacancyCardProps>(
  ({ job, onSwipe, onExpand, active }, ref) => {
    const controls = useAnimation();
    const x = useMotionValue(0);
    const isMounted = useRef(true);
    const hasSwiped = useRef(false);  // 🔥 Защита от двойного свайпа

    const rotate = useTransform(x, [-200, 200], [-15, 15]);
    const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

    const likeOpacity = useTransform(x, [20, 150], [0, 1]);
    const nopeOpacity = useTransform(x, [-150, -20], [1, 0]);

    const [logoError, setLogoError] = useState(false);
    const logoUrl = getCompanyLogoUrl(job.company);

    useEffect(() => {
      isMounted.current = true;
      hasSwiped.current = false;  // ← сбрасываем при показе новой карточки
      setLogoError(false);
      return () => {
        isMounted.current = false;
      };
    }, [job.company]);

    // -----------------------------------------------------
    // 🔥 Главное: блокируем повторные свайпы
    // -----------------------------------------------------
    const performSwipe = useCallback(async (direction: "left" | "right") => {
      if (!isMounted.current || hasSwiped.current) return;
      hasSwiped.current = true;

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

    // -----------------------------------------------------
    // 🔥 Защита в dragEnd
    // -----------------------------------------------------
    const handleDragEnd = useCallback(async (event: any, info: PanInfo) => {
      if (hasSwiped.current) return;

      const offset = info.offset.x;
      const velocity = info.velocity.x;

      if (offset > 100 || velocity > 500) {
        await performSwipe("right");
      } else if (offset < -100 || velocity < -500) {
        await performSwipe("left");
      } else {
        if (isMounted.current) {
          controls.start({
            x: 0,
            rotate: 0,
            transition: { type: "spring", stiffness: 500, damping: 30 }
          });
        }
      }
    }, [controls, performSwipe]);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (Math.abs(x.get()) < 5) onExpand();
      },
      [x, onExpand]
    );

    if (!active) return null;

    return (
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        style={{
          x,
          rotate,
          opacity,
          position: "absolute",
          zIndex: 10,
          width: "100%",
          maxWidth: "400px",
          cursor: "grab",
        }}
        animate={controls}
        whileTap={{ cursor: "grabbing", scale: 1.02 }}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        className="perspective-1000"
      >
        <Card className="h-[480px] w-full overflow-hidden rounded-[28px] border-0 select-none relative bg-gradient-to-br from-white via-white to-gray-50/80 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          
          {/* Glass effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-transparent to-indigo-50/30 pointer-events-none" />

          {/* Like */}
          <motion.div style={{ opacity: likeOpacity }} className="absolute inset-0 bg-green-500/10 flex items-center justify-center z-20 pointer-events-none rounded-[28px]">
            <div className="border-4 border-green-500 px-5 py-2.5 rounded-xl transform -rotate-12 bg-white/50 backdrop-blur-sm">
              <span className="text-4xl font-black text-green-500">Like</span>
            </div>
          </motion.div>

          {/* Nope */}
          <motion.div style={{ opacity: nopeOpacity }} className="absolute inset-0 bg-red-500/10 flex items-center justify-center z-20 pointer-events-none rounded-[28px]">
            <div className="border-4 border-red-500 px-5 py-2.5 rounded-xl transform rotate-12 bg-white/50 backdrop-blur-sm">
              <span className="text-4xl font-black text-red-500">Nope</span>
            </div>
          </motion.div>

          <CardContent className="p-0 h-full flex flex-col relative z-10">
            {/* Header */}
            <div className="h-24 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 flex items-center justify-center relative overflow-hidden">
              <div className="w-16 h-16 rounded-2xl bg-white/90 shadow-lg flex items-center justify-center overflow-hidden">
                {!logoError && logoUrl ? (
                  <img src={logoUrl} className="w-12 h-12 object-contain" onError={() => setLogoError(true)} />
                ) : (
                  <Building2 className="w-8 h-8 text-indigo-500" />
                )}
              </div>
            </div>

            <div className="px-6 py-5 flex-1 flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">{job.title}</h2>
                <p className="text-base font-semibold text-indigo-600">{job.company}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-full">
                  <Wallet className="w-3.5 h-3.5" />
                  <span className="font-semibold text-sm">{job.salary}</span>
                </div>

                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="font-medium text-sm">{job.location}</span>
                </div>

                <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-medium text-sm">{employmentTypeLabels[job.employmentType]}</span>
                </div>
              </div>

              <p className="text-gray-600 line-clamp-4 text-[15px]">{job.description}</p>

              <div className="flex gap-2 flex-wrap">
                {job.tags?.slice(0, 4).map(tag => (
                  <Badge key={tag} variant="secondary" className="bg-gray-100 text-gray-600 text-xs py-1 px-2 rounded-full">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="text-center text-xs text-gray-400">Нажми, чтобы узнать больше</div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }
);

VacancyCard.displayName = "VacancyCard";
