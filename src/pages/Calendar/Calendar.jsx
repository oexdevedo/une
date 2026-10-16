import React, { useState, useEffect } from 'react';
import './Calendar.css';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Sliders, 
  Close, 
  Cloud,
  ChevronLeft,
  ChevronRight,
  Server,
  Reload
} from 'pixelarticons/react';

export default function Calendar() {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connections, setConnections] = useState([
    { id: 1, name: 'Cal.com (API)', type: 'calcom', status: 'connected', lastSync: 'Agora mesmo' }
  ]);
  const [currentDate, setCurrentDate] = useState(() => new Date()); // anchor date of the main calendar (today)
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day'
  const [bookingMonth, setBookingMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [embedUrl, setEmbedUrl] = useState(() => localStorage.getItem('unne_cal_embed_url') || '');
  const [tempUrl, setTempUrl] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('unne_cal_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState('');

  // Sincroniza configurações com o banco de dados
  useEffect(() => {
    fetch('http://localhost:3001/api/calendar/settings?workspace_id=1')
      .then(res => res.json())
      .then(data => {
        if (data) {
          if (data.cal_api_key) {
            setApiKey(data.cal_api_key);
            localStorage.setItem('unne_cal_api_key', data.cal_api_key);
          }
          if (data.cal_link) {
            setEmbedUrl(data.cal_link);
            localStorage.setItem('unne_cal_embed_url', data.cal_link);
          }
        }
      })
      .catch(console.error);
  }, []);

  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: 15, type: 'event-work' });
  
  // Cal.com Booking Mockup States
  const [bookingStep, setBookingStep] = useState(1);
  const [selectedBookingDate, setSelectedBookingDate] = useState(null);
  const [selectedBookingTime, setSelectedBookingTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const loadSlots = async (day) => {
    setSlotsLoading(true);
    setAvailableSlots([]);
    try {
      const d = `${bookingMonth.y}-${String(bookingMonth.m + 1).padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const startTime = `${d}T00:00:00.000Z`;
      const endTime = `${d}T23:59:59.999Z`;
      const res = await fetch(
        `/cal-api/v2/slots/available?eventTypeId=${calEventTypeId || 1}&startTime=${startTime}&endTime=${endTime}&timeZone=America/Sao_Paulo`,
        { headers: calHeaders('2024-08-13') }
      );
      if (!res.ok) throw new Error(await calErrorMessage(res));
      const json = await res.json();
      const list = (json.data && json.data.slots && json.data.slots[d]) || (json.data && json.data[d]) || (json.data && Array.isArray(json.data) ? json.data : []);
      
      setAvailableSlots(list.map(s => {
        const iso = s.time || s.start || s;
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      }));
    } catch (e) {
      console.error('Erro ao carregar horários:', e);
      alert('Erro ao carregar horários: ' + e.message);
    } finally {
      setSlotsLoading(false);
    }
  };
  const [bookingForm, setBookingForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [calEventTypeId, setCalEventTypeId] = useState(null); // Dynamic ID from API
  const [eventTypes, setEventTypes] = useState([]);
  const selectedEventType = eventTypes.find(t => t.id === calEventTypeId);
  const scheduleNameById = (id) => (schedules.find(s => s.id === id) || {}).name;
  
  // Availability (Cal.com schedules)
  const WEEK = [
    ['Sunday', 'Dom'], ['Monday', 'Seg'], ['Tuesday', 'Ter'], ['Wednesday', 'Qua'],
    ['Thursday', 'Qui'], ['Friday', 'Sex'], ['Saturday', 'Sáb']
  ];
  const [isAvailOpen, setIsAvailOpen] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [activeScheduleId, setActiveScheduleId] = useState(null); // null = new schedule
  const [availName, setAvailName] = useState('');
  const [availDays, setAvailDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [availStart, setAvailStart] = useState('09:00');
  const [availEnd, setAvailEnd] = useState('17:00');
  const [availDefault, setAvailDefault] = useState(false);
  const [availSaving, setAvailSaving] = useState(false);

  const calHeaders = (version) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'cal-api-version': version
  });

  const calErrorMessage = async (res) => {
    const d = await res.json().catch(() => ({}));
    return d?.error?.message || d?.message || JSON.stringify(d);
  };

  const selectSchedule = (s) => {
    if (!s) {
      setActiveScheduleId(null);
      setAvailName('');
      setAvailDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
      setAvailStart('09:00');
      setAvailEnd('17:00');
      setAvailDefault(false);
      return;
    }
    const first = (s.availability && s.availability[0]) || {};
    setActiveScheduleId(s.id);
    setAvailName(s.name || '');
    setAvailDays(first.days || []);
    setAvailStart(first.startTime || '09:00');
    setAvailEnd(first.endTime || '17:00');
    setAvailDefault(!!s.isDefault);
  };

  const loadSchedules = async () => {
    if (!apiKey) { alert('Conecte a API Key do Cal.com primeiro.'); return; }
    try {
      const res = await fetch('/cal-api/v2/schedules', { headers: calHeaders('2024-06-11') });
      if (!res.ok) throw new Error(await calErrorMessage(res));
      const json = await res.json();
      const list = json.data || [];
      setSchedules(list);
      selectSchedule(list.find(s => s.isDefault) || list[0] || null);
      setIsAvailOpen(true);
    } catch (e) {
      alert('Erro ao carregar disponibilidade: ' + e.message);
    }
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    if (availDays.length === 0) { alert('Selecione ao menos um dia da semana.'); return; }
    if (availStart >= availEnd) { alert('O horário final deve ser maior que o inicial.'); return; }
    setAvailSaving(true);
    try {
      const body = {
        name: availName || 'Horário de atendimento',
        timeZone: 'America/Sao_Paulo',
        isDefault: availDefault,
        availability: [{ days: availDays, startTime: availStart, endTime: availEnd }]
      };
      const res = await fetch(
        activeScheduleId ? `/cal-api/v2/schedules/${activeScheduleId}` : '/cal-api/v2/schedules',
        { method: activeScheduleId ? 'PATCH' : 'POST', headers: calHeaders('2024-06-11'), body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error(await calErrorMessage(res));
      alert(activeScheduleId ? 'Disponibilidade atualizada!' : 'Agenda criada com sucesso!');
      setIsAvailOpen(false);
    } catch (err) {
      alert('Erro ao salvar disponibilidade: ' + err.message);
    } finally {
      setAvailSaving(false);
    }
  };

  const deleteSchedule = async () => {
    if (!activeScheduleId || !window.confirm('Excluir esta agenda?')) return;
    try {
      const res = await fetch(`/cal-api/v2/schedules/${activeScheduleId}`, { method: 'DELETE', headers: calHeaders('2024-06-11') });
      if (!res.ok) throw new Error(await calErrorMessage(res));
      setIsAvailOpen(false);
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const toggleDay = (d) => setAvailDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // Real weekday helpers (October 2026)
  const dayDate = (day) => new Date(bookingMonth.y, bookingMonth.m, day);
  const weekdayLong = (day) => dayDate(day).toLocaleDateString('pt-BR', { weekday: 'long' });
  const weekdayShort = (day) => dayDate(day).toLocaleDateString('pt-BR', { weekday: 'short' });
  const endTimeOf = (time) => {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + (selectedEventType?.lengthInMinutes || 60);
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Events state
  const [events, setEvents] = useState([]);

  // Carrega eventos manuais persistidos no banco de dados
  React.useEffect(() => {
    fetch('http://localhost:3001/api/calendar/events?workspace_id=1')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const dbEvts = data.map(e => ({
            id: e.id,
            dateKey: e.date,
            time: e.time || '10:00',
            title: e.title,
            type: e.type || 'event-work'
          }));
          setEvents(prev => [...prev, ...dbEvts]);
        }
      })
      .catch(console.error);
  }, []);

  // Two-way Sync with Cal.com API
  React.useEffect(() => {
    if (!apiKey) return;
    
    const syncCalCom = async () => {
      try {
        // 1. Fetch Event Types to get the real eventTypeId for bookings
        const typesRes = await fetch(`/cal-api/v2/event-types`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'cal-api-version': '2024-06-14'
          }
        });
        if (typesRes.ok) {
          const typesData = await typesRes.json();
          const typesList = typesData.data || typesData.event_types || [];
          if (typesList.length > 0) {
            setEventTypes(typesList);
            setCalEventTypeId(prev => (prev && typesList.some(t => t.id === prev)) ? prev : typesList[0].id);
          }
        } else {
          console.warn('Falha ao carregar event-types:', await typesRes.text());
        }
        try {
          const schRes = await fetch(`/cal-api/v2/schedules`, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'cal-api-version': '2024-06-11' }
          });
          if (schRes.ok) setSchedules((await schRes.json()).data || []);
        } catch (e) { /* schedules are optional here */ }

        // 2. Fetch real bookings to populate the agenda
        const bookingsRes = await fetch(`/cal-api/v2/bookings`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'cal-api-version': '2024-08-13'
          }
        });
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          const bookingsList = bookingsData.data || bookingsData.bookings || [];
          const apiEvents = bookingsList.map(b => {
            const d = new Date(b.start || b.startTime);
            return {
              id: b.id,
              dateKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
              time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
              title: b.title || b.attendees?.[0]?.name || 'Agendamento Cal.com',
              type: 'event-marketing'
            };
          });
          setEvents(apiEvents);
        }
      } catch (err) {
        console.warn("Erro ao sincronizar com API do Cal.com:", err);
      }
    };

    syncCalCom();
    // Also re-sync every 30 seconds to keep agenda updated
    const interval = setInterval(syncCalCom, 30000);
    return () => clearInterval(interval);
  }, [apiKey]);

  // ---- Calendar date helpers ----
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = dateKey(new Date());
  const eventsOn = (key) => events
    .filter(e => e.dateKey === key)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const startOfWeek = (d) => { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); return s; };
  const weekDays = () => { const s = startOfWeek(currentDate); return Array.from({ length: 7 }, (_, i) => { const x = new Date(s); x.setDate(s.getDate() + i); return x; }); };

  const shiftCalendar = (dir) => {
    const d = new Date(currentDate);
    if (viewMode === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    else if (viewMode === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  const calendarTitle = () => {
    if (viewMode === 'month') return cap(currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    if (viewMode === 'week') {
      const w = weekDays();
      const f = (d) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
      return `${f(w[0])} – ${f(w[6])} ${w[6].getFullYear()}`;
    }
    return cap(currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  };

  const shiftBookingMonth = (dir) => {
    const d = new Date(bookingMonth.y, bookingMonth.m + dir, 1);
    setBookingMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedBookingDate(null);
    setAvailableSlots([]);
  };

  const openDay = (d) => { setCurrentDate(new Date(d)); setViewMode('day'); };

  const renderEventBadge = (e) => (
    <div key={e.id} className={`event-badge ${e.type}`}>
      {e.time ? `${e.time} ` : ''}{e.title}
    </div>
  );

  // Month grid
  const renderCalendarDays = () => {
    const days = [];
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDayIndex = new Date(y, m, 1).getDay();
    
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(y, m, i);
      const key = dateKey(date);
      days.push(
        <div key={i} className={`calendar-day ${key === todayKey ? 'today' : ''}`} style={{ cursor: 'pointer' }} onClick={() => openDay(date)}>
          <span className="day-number">{i}</span>
          <div className="day-events">
            {eventsOn(key).map(renderEventBadge)}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className="calendar-container">
      <header className="calendar-header">
        <div>
          <h1 className="calendar-title">Agenda</h1>
          <p className="calendar-subtitle">Integração nativa com Cal.com para centralizar e sincronizar seus agendamentos.</p>
        </div>
        <div className="calendar-actions">

          <button className="btn-secondary" onClick={loadSchedules}>
            <Sliders size={18} /> Disponibilidade
          </button>
          <button className="btn-primary" onClick={() => { setBookingMonth({ y: currentDate.getFullYear(), m: currentDate.getMonth() }); setIsEventModalOpen(true); }}>
            <Plus size={18} /> Novo Evento
          </button>
        </div>
      </header>

      <div className="calendar-content">
        {/* Sidebar */}
        <aside className="calendar-sidebar">
          <div className="sidebar-section">
            <h3>Contas Conectadas</h3>
            {connections.length === 0 ? (
              <p className="no-connections">Nenhuma conta sincronizada ainda.</p>
            ) : (
              <ul className="connections-list">
                {connections.map(conn => (
                  <li key={conn.id} className="connection-item">
                    <div className="conn-icon">
                      <Server size={16} />
                    </div>
                    <div className="conn-info">
                      <span className="conn-name">{conn.name}</span>
                      <span className="conn-sync"><Reload size={10} /> Sincronizado {conn.lastSync}</span>
                    </div>
                    <button className="icon-btn-small" title="Configurações"><Sliders size={14}/></button>
                  </li>
                ))}
              </ul>
            )}
            <button className="add-conn-btn" onClick={() => setIsConnectModalOpen(true)}>
              <Plus size={14} /> Configurar API (Cal.com)
            </button>
          </div>

          <div className="sidebar-section">
            <h3>Filtros</h3>
            <div className="filter-checkboxes">
              <label><input type="checkbox" defaultChecked /> Reuniões de Trabalho</label>
              <label><input type="checkbox" defaultChecked /> Eventos de Marketing</label>
              <label><input type="checkbox" defaultChecked /> Compromissos Pessoais</label>
            </div>
          </div>
        </aside>

        {/* Calendar Grid */}
        <div className="calendar-main">
          {embedUrl ? (
            <div style={{ width: '100%', height: '100%' }}>
              <iframe 
                src={embedUrl} 
                style={{ border: 0, width: '100%', height: '100%' }} 
                frameBorder="0" 
                scrolling="no"
                title="Google Calendar Embed"
              ></iframe>
            </div>
          ) : (
            <>
              <div className="calendar-toolbar">
                <div className="month-nav">
                  <button className="icon-btn" onClick={() => shiftCalendar(-1)}><ChevronLeft size={20} /></button>
                  <h2>{calendarTitle()}</h2>
                  <button className="icon-btn" onClick={() => shiftCalendar(1)}><ChevronRight size={20} /></button>
                  <button className="toggle-btn" onClick={() => setCurrentDate(new Date())}>Hoje</button>
                </div>
                <div className="view-toggles">
                  <button className={`toggle-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Mês</button>
                  <button className={`toggle-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Semana</button>
                  <button className={`toggle-btn ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>Dia</button>
                </div>
              </div>

              <div className="calendar-grid-wrapper">
                {viewMode === 'month' && (
                  <>
                    <div className="calendar-weekdays">
                      {daysOfWeek.map(day => (
                        <div key={day} className="weekday">{day}</div>
                      ))}
                    </div>
                    <div className="calendar-grid">
                      {renderCalendarDays()}
                    </div>
                  </>
                )}

                {viewMode === 'week' && (
                  <>
                    <div className="calendar-weekdays">
                      {weekDays().map(d => (
                        <div key={dateKey(d)} className="weekday">{daysOfWeek[d.getDay()]} {d.getDate()}</div>
                      ))}
                    </div>
                    <div className="calendar-grid">
                      {weekDays().map(d => (
                        <div key={dateKey(d)} className={`calendar-day ${dateKey(d) === todayKey ? 'today' : ''}`} style={{ cursor: 'pointer', minHeight: '320px' }} onClick={() => openDay(d)}>
                          <span className="day-number">{d.getDate()}</span>
                          <div className="day-events">{eventsOn(dateKey(d)).map(renderEventBadge)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {viewMode === 'day' && (
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {eventsOn(dateKey(currentDate)).length === 0 ? (
                      <p style={{ color: 'var(--text-light)' }}>Nenhum compromisso neste dia.</p>
                    ) : (
                      eventsOn(dateKey(currentDate)).map(e => (
                        <div key={e.id} className={`event-badge ${e.type}`} style={{ padding: '14px 16px', fontSize: '1rem' }}>
                          <strong>{e.time}</strong> — {e.title}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Availability Modal */}
      {isAvailOpen && (
        <div className="modal-overlay">
          <div className="modal-content connect-modal">
            <div className="modal-header">
              <h2>Disponibilidade e Agendas</h2>
              <button className="close-btn" onClick={() => setIsAvailOpen(false)}><Close size={20} /></button>
            </div>
            <form className="modal-body caldav-form" style={{ padding: '24px' }} onSubmit={saveSchedule}>
              <div className="form-group">
                <label>Agenda</label>
                <select
                  value={activeScheduleId ?? 'new'}
                  onChange={(e) => selectSchedule(e.target.value === 'new' ? null : schedules.find(s => String(s.id) === e.target.value))}
                >
                  {schedules.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.isDefault ? ' (padrão)' : ''}</option>
                  ))}
                  <option value="new">+ Criar nova agenda</option>
                </select>
              </div>
              <div className="form-group">
                <label>Nome da agenda</label>
                <input type="text" placeholder="Ex: Atendimento comercial" value={availName} onChange={(e) => setAvailName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Dias liberados</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {WEEK.map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      className={availDays.includes(key) ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => toggleDay(key)}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group flex-1">
                  <label>Das</label>
                  <input type="time" value={availStart} onChange={(e) => setAvailStart(e.target.value)} />
                </div>
                <div className="form-group flex-1">
                  <label>Até</label>
                  <input type="time" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} />
                </div>
              </div>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                <input type="checkbox" checked={availDefault} onChange={(e) => setAvailDefault(e.target.checked)} />
                Usar como agenda padrão (libera os horários para agendamento)
              </label>
              <div className="modal-actions" style={{ paddingTop: '24px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  {activeScheduleId && <button type="button" className="btn-secondary" onClick={deleteSchedule}>Excluir</button>}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsAvailOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={availSaving}>
                    {availSaving ? 'Salvando...' : activeScheduleId ? 'Salvar disponibilidade' : 'Criar agenda'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {isConnectModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content connect-modal">
            <div className="modal-header">
              <h2>Configurar Integração Cal.com</h2>
              <button className="close-btn" onClick={() => setIsConnectModalOpen(false)}><Close size={20} /></button>
            </div>
            
            <div className="modal-body" style={{ padding: '24px' }}>
              <p style={{ color: 'var(--text-light)', marginBottom: '24px', fontSize: '0.95rem' }}>
                O Unne usa o <strong>Cal.com</strong> como infraestrutura oficial de agendamentos. Insira sua chave de API para habilitar a sincronização bidirecional.
              </p>

              <form className="caldav-form" onSubmit={(e) => {
                e.preventDefault();
                setIsConnectModalOpen(false);
                if (tempApiKey) {
                  setApiKey(tempApiKey);
                  localStorage.setItem('unne_cal_api_key', tempApiKey);
                }
                if (tempUrl) {
                  setEmbedUrl(tempUrl);
                  localStorage.setItem('unne_cal_embed_url', tempUrl);
                }
                alert("Configurações do Cal.com salvas localmente!");
              }}>
                <div className="form-group">
                  <label>API Key (Cal.com)</label>
                  <input 
                    type="password" 
                    placeholder="Ex: cal_..." 
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>Username (ex: cal.com/seu-nome)</label>
                    <input type="text" placeholder="Ex: wyllkens" />
                  </div>
                </div>
                <p className="help-text">Dica: Se quiser apenas exibir um Google Calendar no modo visitante (iframe), use o campo abaixo.</p>
                <div className="form-group" style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <label>Ou insira o Link Embed do Google Calendar</label>
                  <input 
                    type="text" 
                    placeholder="Ex: https://calendar.google.com/calendar/embed?src=..." 
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                  />
                </div>

                <div className="modal-actions" style={{ padding: '24px 0 0', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsConnectModalOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary">Autenticar e Sincronizar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* New Event Modal - Native UI connecting to API */}
      {isEventModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content calcom-booking-modal">
            
            <div className="calcom-layout">
              {/* Left Panel - Event Details */}
              <div className="calcom-left">
                <div className="calcom-avatar">ED</div>
                <div style={{ marginBottom: '16px' }}>
                  {/* Event type selector removed as requested */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>Agenda de disponibilidade</label>
                    <select
                      style={{ width: '100%', padding: '8px', borderRadius: '8px' }}
                      value={selectedEventType?.scheduleId ?? (schedules.find(s => s.isDefault) || {}).id ?? ''}
                      disabled={bookingStep === 2 || schedules.length === 0 || !calEventTypeId}
                      onChange={async (e) => {
                        const scheduleId = Number(e.target.value);
                        try {
                          const res = await fetch(`/cal-api/v2/event-types/${calEventTypeId}`, {
                            method: 'PATCH',
                            headers: calHeaders('2024-06-14'),
                            body: JSON.stringify({ scheduleId })
                          });
                          if (!res.ok) throw new Error(await calErrorMessage(res));
                          setEventTypes(prev => prev.map(t => t.id === calEventTypeId ? { ...t, scheduleId } : t));
                          setSelectedBookingDate(null);
                          setSelectedBookingTime('');
                          setAvailableSlots([]);
                        } catch (err) {
                          alert('Erro ao trocar a agenda: ' + err.message);
                        }
                      }}
                    >
                      {schedules.length === 0 && <option value="">Nenhuma agenda encontrada — crie em Disponibilidade</option>}
                      {schedules.map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.isDefault ? ' (padrão)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <h2 className="calcom-title">{scheduleNameById(selectedEventType?.scheduleId ?? (schedules.find(s => s.isDefault) || {}).id) || 'Agenda'}</h2>
                <p className="calcom-description">
                  {selectedEventType ? (selectedEventType.description || '') : (<>A mentoria <strong>Acolhimento Financeiro</strong> foi criada para ser o seu porto seguro. Diferente de cursos teóricos, aqui resolvemos problemas pontuais.</>)}
                </p>
                <div className="calcom-details">
                  {bookingStep === 2 && selectedBookingDate && (
                    <div className="calcom-detail-item">
                      <CalendarIcon size={16} /> 
                      <span>{weekdayLong(selectedBookingDate)}, {selectedBookingDate} de {dayDate(selectedBookingDate).toLocaleDateString('pt-BR', { month: 'long' })} de {bookingMonth.y}<br/>{selectedBookingTime} - {endTimeOf(selectedBookingTime)}</span>
                    </div>
                  )}
                  <div className="calcom-detail-item">
                    <span>⏱️</span> <span>{selectedEventType?.lengthInMinutes ? `${selectedEventType.lengthInMinutes} min` : '1h'}</span>
                  </div>
                  <div className="calcom-detail-item">
                    <span>📹</span> <span>Google Meet</span>
                  </div>
                  <div className="calcom-detail-item">
                    <span>🌍</span> <span>America/Sao_Paulo</span>
                  </div>
                </div>
              </div>

              {/* Right Panel - Dynamic Content based on Step */}
              <div className="calcom-right">
                
                {bookingStep === 1 && (
                  <div className="calcom-step1-container">
                    
                    {/* Mini Calendar */}
                    <div className="calcom-mini-calendar">
                      <div className="calcom-month-header">
                        <span>{cap(new Date(bookingMonth.y, bookingMonth.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</span>
                        <div className="calcom-month-nav">
                          <button type="button" onClick={() => shiftBookingMonth(-1)}><ChevronLeft size={20} /></button>
                          <button type="button" onClick={() => shiftBookingMonth(1)}><ChevronRight size={20} /></button>
                        </div>
                      </div>
                      <div className="calcom-days-grid">
                        {['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'].map(n => (
                          <div key={n} className="calcom-day-name">{n}</div>
                        ))}
                        
                        {Array.from({ length: new Date(bookingMonth.y, bookingMonth.m, 1).getDay() }, (_, i) => (
                          <div key={`e${i}`} className="calcom-day-cell empty"></div>
                        ))}
                        
                        {Array.from({ length: new Date(bookingMonth.y, bookingMonth.m + 1, 0).getDate() }, (_, i) => i + 1).map(day => {
                          const isSelected = selectedBookingDate === day;
                          const key = dateKey(new Date(bookingMonth.y, bookingMonth.m, day));
                          const hasEvents = eventsOn(key).length > 0;
                          const isPast = key < todayKey;
                          
                          return (
                            <div 
                              key={day} 
                              className={`calcom-day-cell ${isSelected ? 'selected' : ''} ${hasEvents ? 'has-dot' : ''}`}
                              style={isPast ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
                              onClick={() => { setSelectedBookingDate(day); loadSlots(day); }}
                            >
                              {day}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time Slots Panel */}
                    {selectedBookingDate && (
                      <div className="calcom-times-panel">
                        <div className="calcom-times-header">
                          {weekdayShort(selectedBookingDate)} {selectedBookingDate}
                        </div>
                        <div className="calcom-times-list">
                          {slotsLoading && <div>Carregando horários...</div>}
                          {!slotsLoading && availableSlots.length === 0 && <div>Nenhum horário disponível neste dia.</div>}
                          {availableSlots.map(time => (
                            <button 
                              key={time} 
                              className="calcom-time-btn"
                              onClick={() => {
                                setSelectedBookingTime(time);
                                setBookingStep(2);
                              }}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {bookingStep === 2 && (
                  <div className="calcom-step2-container">
                    <form className="calcom-form" onSubmit={async (e) => {
                      e.preventDefault();
                      setIsBookingLoading(true);

                      try {
                        if (!apiKey) {
                          throw new Error("API Key não configurada. Conecte a conta primeiro.");
                        }

                        // Log para depurar
                        console.log("Tentando agendar com eventTypeId:", calEventTypeId);

                        // Construindo o payload da API do Cal.com v2
                        const payload = {
                          eventTypeId: calEventTypeId || 1, // Substitua pelo ID real
                          start: new Date(`${dateKey(dayDate(selectedBookingDate))}T${selectedBookingTime}:00-03:00`).toISOString(),
                          attendee: {
                            name: bookingForm.name,
                            email: bookingForm.email,
                            timeZone: "America/Sao_Paulo",
                            language: "pt-BR"
                          },
                          bookingFieldsResponses: {
                            notes: bookingForm.notes
                          }
                        };

                        const response = await fetch(`/cal-api/v2/bookings`, {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                            'cal-api-version': '2024-08-13'
                          },
                          body: JSON.stringify(payload)
                        });

                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({}));
                          throw new Error(errorData.message || JSON.stringify(errorData) || 'Falha ao agendar na API do Cal.com');
                        }
                        
                        alert("Evento agendado com sucesso direto no Cal.com!");
                        
                        // Atualizar a grid local e persistir no banco de dados
                        const evtTitle = 'Acolhimento Financeiro - ' + bookingForm.name;
                        const evtDate = dateKey(dayDate(selectedBookingDate));
                        fetch('http://localhost:3001/api/calendar/events', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            workspace_id: 1,
                            title: evtTitle,
                            date: evtDate,
                            time: selectedBookingTime,
                            type: 'event-marketing'
                          })
                        }).catch(console.error);

                        setEvents([...events, {
                          id: Date.now(),
                          dateKey: evtDate,
                          time: selectedBookingTime,
                          title: evtTitle,
                          type: 'event-marketing'
                        }]);
                        
                        setIsEventModalOpen(false);
                        setBookingStep(1);
                        setSelectedBookingDate(null);
                        setBookingForm({ name: '', email: '', phone: '', notes: '' });

                      } catch (error) {
                        console.error("Erro completo:", error);
                        if (error.message.includes('ConflictException') || error.message.includes('already has booking')) {
                          alert("Este horário não está mais disponível (já reservado ou bloqueado). Escolha outro horário.");
                          loadSlots(selectedBookingDate);
                          setBookingStep(1);
                        } else {
                          alert("Erro ao agendar: " + error.message);
                        }
                      } finally {
                        setIsBookingLoading(false);
                      }
                    }}>
                      
                      <div className="calcom-input-group">
                        <label>Seu nome *</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="Ex: João da Silva"
                          value={bookingForm.name}
                          onChange={(e) => setBookingForm({...bookingForm, name: e.target.value})}
                        />
                      </div>

                      <div className="calcom-input-group">
                        <label>Endereço de e-mail *</label>
                        <input 
                          type="email" 
                          required 
                          placeholder="joao@email.com"
                          value={bookingForm.email}
                          onChange={(e) => setBookingForm({...bookingForm, email: e.target.value})}
                        />
                      </div>

                      <div className="calcom-input-group">
                        <label>Número de Telefone</label>
                        <div className="calcom-phone-input">
                          <div className="calcom-phone-prefix">🇧🇷 +55</div>
                          <input 
                            type="text" 
                            placeholder="(11) 99999-9999"
                            value={bookingForm.phone}
                            onChange={(e) => setBookingForm({...bookingForm, phone: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="calcom-input-group">
                        <label>Como posso te ajudar? *</label>
                        <textarea 
                          required 
                          rows={4}
                          placeholder="Por favor, compartilhe qualquer coisa que nos ajude a nos preparar para nossa reunião."
                          value={bookingForm.notes}
                          onChange={(e) => setBookingForm({...bookingForm, notes: e.target.value})}
                        ></textarea>
                      </div>

                      <div className="calcom-form-actions">
                        <button type="button" className="calcom-btn-back" onClick={() => setBookingStep(1)} disabled={isBookingLoading}>
                          Voltar
                        </button>
                        <button type="submit" className="calcom-btn-confirm" disabled={isBookingLoading}>
                          {isBookingLoading ? 'Agendando...' : 'Confirmar'}
                        </button>
                      </div>

                    </form>
                  </div>
                )}

              </div>
            </div>

            {/* Absolute close button */}
            <button 
              className="close-btn" 
              style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => {
                setIsEventModalOpen(false);
                setBookingStep(1);
                setSelectedBookingDate(null);
              }}
            >
              <Close size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
