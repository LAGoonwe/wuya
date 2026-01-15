import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, ArrowRight, Loader2, KeyRound } from 'lucide-react';

interface LoginViewProps {
    onLoginSuccess: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'email' | 'code'>('email');
    const [msg, setMsg] = useState('');
    const [countdown, setCountdown] = useState(0);

    // Countdown timer for resending code
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg('');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    // Force the email link type to magic link if needed, 
                    // but for OTP we use shouldCreateUser: true default.
                }
            });

            if (error) throw error;

            setStep('code');
            setCountdown(60);
            setMsg('验证码已发送，请查收邮件 (也请检查垃圾箱)');
        } catch (error: any) {
            console.error(error);
            setMsg(error.message || '发送失败，请检查邮箱是否正确');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg('');

        try {
            // Sequential verification attempt chain
            // 1. Try 'signup' (Best for first-time users)
            let result = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'signup'
            });

            // 2. Fallback to 'email' (Standard OTP)
            if (result.error) {
                console.log('Signup verification failed, trying fallback: email');
                result = await supabase.auth.verifyOtp({
                    email,
                    token: code,
                    type: 'email'
                });
            }

            // 3. Last resort 'magiclink' (Catch-all for some configurations)
            if (result.error) {
                console.log('Email verification failed, trying fallback: magiclink');
                result = await supabase.auth.verifyOtp({
                    email,
                    token: code,
                    type: 'magiclink'
                });
            }

            if (result.error) throw result.error;

            if (result.data.session) {
                onLoginSuccess();
            } else {
                setMsg('验证失败，请重试');
            }
        } catch (error: any) {
            console.error('Final verification error:', error);
            setMsg(error.message || '验证码错误或已过期');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-slate-900">
            <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-xl border border-slate-100">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2 font-serif-sc text-slate-900">
                        加入无涯
                    </h1>
                    <p className="text-slate-400 text-sm">
                        {step === 'email' ? '输入邮箱开启学习之旅' : '输入邮件中的验证码'}
                    </p>
                </div>

                {step === 'email' ? (
                    <form onSubmit={handleSendCode} className="space-y-5">
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                            <input
                                type="email"
                                required
                                className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 placeholder:text-slate-300"
                                placeholder="您的邮箱地址"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !email}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all transform active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <>获取验证码 <ArrowRight size={18} /></>}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerify} className="space-y-5">
                        <div className="relative">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                            <input
                                type="text"
                                required
                                maxLength={8}
                                className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 placeholder:text-slate-300 tracking-widest text-lg"
                                placeholder="输入验证码"
                                value={code}
                                onChange={(e) => setCode(e.target.value.trim())}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || code.length < 6}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all transform active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : '立即登录'}
                        </button>

                        <div className="text-center">
                            <button
                                type="button"
                                disabled={countdown > 0 || loading}
                                onClick={handleSendCode}
                                className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                            >
                                {countdown > 0 ? `${countdown}秒后重新获取` : '重新获取验证码'}
                            </button>
                        </div>
                        <div className="text-center mt-2">
                            <button
                                type="button"
                                onClick={() => { setStep('email'); setMsg(''); }}
                                className="text-xs text-slate-300 hover:text-slate-500 transition-colors"
                            >
                                修改邮箱
                            </button>
                        </div>
                    </form>
                )}

                {msg && (
                    <div className="mt-6 p-3 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium text-center animate-in fade-in slide-in-from-bottom-2">
                        {msg}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoginView;
