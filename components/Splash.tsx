
import React from 'react';

const Splash: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-50 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/4 -left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 -right-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
      
      <div className="flex flex-col items-center animate-in fade-in duration-1000">
        <div className="mb-6 relative">
          <div className="w-20 h-20 border-4 border-white rounded-xl flex items-center justify-center shadow-lg transform rotate-12 transition-transform">
             <span className="text-4xl font-serif-sc text-white -rotate-12">涯</span>
          </div>
        </div>
        
        <h1 className="text-white text-5xl font-serif-sc tracking-[0.5em] mb-4 opacity-0 animate-[fadeIn_1.5s_ease-out_forwards]">
          无涯
        </h1>
        
        <p className="text-slate-400 text-lg font-serif-sc tracking-widest opacity-0 animate-[fadeIn_1.5s_ease-out_0.5s_forwards]">
          学海无涯 · 勤为径
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Splash;
