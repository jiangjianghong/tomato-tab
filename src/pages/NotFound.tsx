import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TomatoIcon from '@/components/TomatoIcon';

export default function NotFound() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center overflow-hidden">
      {/* 背景粒子动画 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-float"
            style={{
              left: `${10 + i * 10}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${12 + i}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center max-w-2xl px-6">
        {/* 404 数字：中间的 0 用番茄替代，强化品牌烙印 */}
        <div className="text-[120px] font-extrabold leading-none mb-6 flex items-center justify-center gap-3">
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent animate-gradient">
            4
          </span>
          <div className="inline-block" style={{ width: 110, height: 110 }}>
            <TomatoIcon size={110} variant="bounce" />
          </div>
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent animate-gradient">
            4
          </span>
        </div>

        {/* 标题 */}
        <h1 className="text-3xl font-semibold text-white mb-4 animate-fadeInUp">
          页面走丢了
        </h1>

        {/* 描述 */}
        <p className="text-white/70 text-lg mb-8 animate-fadeInUp animation-delay-200">
          抱歉，您访问的页面不存在或已被移除。
          <br />
          别担心，我们正在帮您返回首页。
        </p>

        {/* 加载指示器 */}
        <div className="flex items-center justify-center gap-3 mb-8 animate-fadeInUp animation-delay-300">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>

        {/* 倒计时 */}
        <p className="text-white/60 text-sm mb-6 animate-fadeInUp animation-delay-400">
          <span className="text-white/80 font-semibold text-lg">{countdown}</span> 秒后自动跳转
        </p>

        {/* 返回按钮 */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-medium hover:scale-105 hover:shadow-xl hover:shadow-purple-500/50 transition-all duration-300 animate-fadeInUp animation-delay-500"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          返回首页
        </button>
      </div>

      <style>{`
        @keyframes float {
          0% {
            transform: translateY(100vh) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) scale(1);
            opacity: 0;
          }
        }

        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-float {
          animation: float 15s infinite;
        }

        .animate-gradient {
          background-size: 300% 300%;
          animation: gradient 3s ease infinite;
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease forwards;
        }

        .animation-delay-200 {
          animation-delay: 0.2s;
          opacity: 0;
        }

        .animation-delay-300 {
          animation-delay: 0.3s;
          opacity: 0;
        }

        .animation-delay-400 {
          animation-delay: 0.4s;
          opacity: 0;
        }

        .animation-delay-500 {
          animation-delay: 0.5s;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
