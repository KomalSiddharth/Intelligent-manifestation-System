import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import AdvancedSidebar from '@/components/advanced/AdvancedSidebar';
import ManageMonetizationView from '@/components/advanced/sections/ManageMonetizationView';
import ActionsView from '@/components/advanced/sections/ActionsView';
import AlertsView from '@/components/advanced/sections/AlertsView';
import ProductsView from '@/components/advanced/sections/ProductsView';

const AdvancedPage = () => {
  const [activeSection, setActiveSection] = useState('manage-monetization');

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-64px)]">
        <AdvancedSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {activeSection === 'manage-monetization' && <ManageMonetizationView />}
        {activeSection === 'actions' && <ActionsView />}
        {activeSection === 'alerts' && <AlertsView />}
        {activeSection === 'products' && <ProductsView />}
        {activeSection !== 'manage-monetization' &&
          activeSection !== 'actions' &&
          activeSection !== 'alerts' &&
          activeSection !== 'products' && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Section under development
            </div>
          )}
      </div>
    </MainLayout>
  );
};

export default AdvancedPage;
