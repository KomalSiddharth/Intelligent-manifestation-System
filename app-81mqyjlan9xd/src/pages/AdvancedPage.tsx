import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import AdvancedSidebar from '@/components/advanced/AdvancedSidebar';
import ActionsView from '@/components/advanced/sections/ActionsView';
import AlertsView from '@/components/advanced/sections/AlertsView';

const AdvancedPage = () => {
  const [activeSection, setActiveSection] = useState('actions');

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-64px)]">
        <AdvancedSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {activeSection === 'actions' && <ActionsView />}
        {activeSection === 'alerts' && <AlertsView />}
        {activeSection !== 'actions' &&
          activeSection !== 'alerts' && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Section under development
            </div>
          )}
      </div>
    </MainLayout>
  );
};

export default AdvancedPage;
