import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Chat from './pages/Chat/Chat';
import Contacts from './pages/Contacts/Contacts';
import Connections from './pages/Connections/Connections';
import Agents from './pages/Agents/Agents';
import MassMessage from './pages/MassMessage/MassMessage';
import Automations from './pages/Automations/Automations';
import Settings from './pages/Settings/Settings';
import Login from './pages/Login/Login';
import Calendar from './pages/Calendar/Calendar';
import Templates from './pages/Templates/Templates';
import Contracts from './pages/Contracts/Contracts';
import Emails from './pages/Emails/Emails';
import Tasks from './pages/Tasks/Tasks';

function PlaceholderPage({ title }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      <h2 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>{title}</h2>
      <p>Esta página será construída na próxima etapa do desenvolvimento.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="mensagens" element={<Chat />} />
          <Route path="contatos" element={<Contacts />} />
          <Route path="ia" element={<Agents />} />
          <Route path="emails" element={<Emails />} />
          <Route path="tarefas" element={<Tasks />} />
          <Route path="contratos" element={<Contracts />} />
          <Route path="automacao" element={<Automations />} />
          <Route path="massa" element={<MassMessage />} />
          <Route path="conexoes" element={<Connections />} />
          <Route path="agenda" element={<Calendar />} />
          <Route path="templates" element={<Templates />} />
          <Route path="configuracoes" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
