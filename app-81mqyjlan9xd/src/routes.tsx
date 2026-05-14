import { lazy } from 'react';
import type { ReactNode } from 'react';

const InsightsPage = lazy(() => import('@/pages/InsightsPage'));
const MindPage = lazy(() => import('@/pages/MindPage'));
const AccessPage = lazy(() => import('@/pages/AccessPage'));
const AdvancedPage = lazy(() => import('@/pages/AdvancedPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const TalkToDelphiPage = lazy(() => import('@/pages/TalkToDelphiPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const CallbackPage = lazy(() => import('@/pages/CallbackPage'));
const WidgetPage = lazy(() => import('@/pages/WidgetPage'));

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
}

const routes: RouteConfig[] = [
  {
    name: 'Insights',
    path: '/',
    element: <InsightsPage />,
    visible: true,
  },
  {
    name: 'Insights',
    path: '/insights',
    element: <InsightsPage />,
    visible: true,
  },
  {
    name: 'Mind',
    path: '/mind',
    element: <MindPage />,
    visible: true,
  },
  {
    name: 'Access',
    path: '/access',
    element: <AccessPage />,
    visible: true,
  },
  {
    name: 'Advanced',
    path: '/advanced',
    element: <AdvancedPage />,
    visible: true,
  },
  {
    name: 'Settings',
    path: '/settings',
    element: <SettingsPage />,
    visible: false,
  },
  {
    name: 'Talk to MiteshAI',
    path: '/talk-to-miteshai',
    element: <TalkToDelphiPage />,
    visible: false,
  },
  {
    name: 'Chat',
    path: '/chat',
    element: <ChatPage />,
    visible: false,
  },
  {
    name: 'Widget',
    path: '/widget/:profileId',
    element: <WidgetPage />,
    visible: false,
  },
  {
    name: 'Callback',
    path: '/callback',
    element: <CallbackPage />,
    visible: false,
  },
];

export default routes;
