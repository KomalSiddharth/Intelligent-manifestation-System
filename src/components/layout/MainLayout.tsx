import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Menu, X, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';


import { useTheme } from 'next-themes';

interface MainLayoutProps {
  children: React.ReactNode;
}

import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/db/supabase';

const MainLayout = ({ children }: MainLayoutProps) => {
  const { toast } = useToast();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Real-time Broadcast Listener
  useEffect(() => {
    setMounted(true);

    const channel = supabase.channel('platform-broadcast')
      .on('broadcast', { event: 'notification' }, (payload) => {
        console.log('📢 Broadcast received:', payload);
        toast({
          title: payload.payload.title || 'Announcement',
          description: payload.payload.message,
          variant: 'default',
        });
      })
      .on('broadcast', { event: 'reminder' }, (payload) => {
        console.log('⏰ Reminder received:', payload);
        toast({
          title: payload.payload.title || '⏰ Reminder',
          description: payload.payload.message,
          variant: 'default',
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);


  const tabs = [

    { name: 'Insights', path: '/insights' },
    { name: 'Mind', path: '/mind' },
    { name: 'Access', path: '/access' },
    { name: 'Advanced', path: '/advanced' },
  ];

  const isActiveTab = (path: string) => {
    return location.pathname === path || (path === '/insights' && location.pathname === '/');
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full animate-slow-glow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-500/10 blur-[120px] rounded-full animate-slow-glow" style={{ animationDelay: '2s' }} />
      </div>

      {/* Top Header */}
      <header className="sticky top-0 z-50 w-full glass border-b border-white/20">
        <div className="flex h-16 items-center px-4 xl:px-6">
          {/* Logo and User Name */}
          <div className="flex items-center gap-3 mr-8 cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <img
                src="https://miaoda-conversation-file.s3cdn.medo.dev/user-7nqges6yla0w/conv-81mqyjlan9xc/20251206/file-81ndgdtyydq8.png"
                alt="MK Logo"
                className="relative w-10 h-10 rounded-lg object-contain bg-white"
              />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground hidden xl:inline-block">
              Mitesh <span className="text-orange-500">AI</span>
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden xl:flex items-center gap-1 mr-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.path}
                to={tab.path}
                className={`relative px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${isActiveTab(tab.path)
                  ? 'text-orange-600 bg-orange-50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
              >
                {tab.name}
                {isActiveTab(tab.path) && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="xl:hidden mr-auto p-2"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>



          {/* Notifications, Theme Toggle, and Profile */}
          <div className="flex items-center gap-2">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5 text-yellow-500 transition-all hover:scale-110" />
                ) : (
                  <Moon className="h-5 w-5 text-slate-700 transition-all hover:scale-110" />
                )}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
            </Button>

          </div>
        </div>

        {/* Mobile Navigation */}
        {isSidebarOpen && (
          <div className="xl:hidden border-t bg-card">
            <nav className="flex flex-col p-4 gap-2">
              {tabs.map((tab) => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActiveTab(tab.path)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                >
                  {tab.name}
                </Link>
              ))}

            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
};

export default MainLayout;
