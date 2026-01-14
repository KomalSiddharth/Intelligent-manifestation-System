import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from 'next-themes';
import routes from './routes';

import { v4 as uuidv4 } from 'uuid';
import { useEffect } from 'react';

const App: React.FC = () => {
  useEffect(() => {
    // Initialize Guest ID if not present
    const storedId = localStorage.getItem('chat_user_id');
    if (!storedId) {
      const newId = uuidv4();
      localStorage.setItem('chat_user_id', newId);
      console.log("Generated new Guest ID:", newId);
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Router>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
          }
        >
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster />
      </Router>
    </ThemeProvider>
  );
};

export default App;
