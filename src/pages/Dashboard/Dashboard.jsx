import React from 'react';
import {
  WarningDiamond,
  Send,
  Inbox,
  CheckDouble,
  Undo,
  UserPlus,
  Message,
  ChartLine,
  ChartColumnDecreasing,
  Sparkles,
  Megaphone,
  Download,
  Sliders
} from 'pixelarticons/react';

export default function Dashboard() {
  return (
    <div>
      {/* Alert Bar */}
      <div className="alert-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <WarningDiamond size={18} />
          <span>3 conversas sem resposta há mais de 2 horas.</span>
        </div>
        <a href="#" style={{ textDecoration: 'underline', fontWeight: '600' }}>Ver agora</a>
      </div>

      {/* Filters */}
      <div className="filter-group" style={{ justifyContent: 'space-between' }}>
        <div className="filter-pills">
          <button className="filter-pill active">Hoje</button>
          <button className="filter-pill">7 dias</button>
          <button className="filter-pill">30 dias</button>
          <button className="filter-pill">Personalizado</button>
        </div>
        
        <div className="filter-pills">
          <button className="filter-pill active">Todos</button>
          <button className="filter-pill">WhatsApp</button>
          <button className="filter-pill">Telegram</button>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="kpis-row">
        <div className="card highlight">
          <div className="kpi-title">
            <span>Mensagens<br/>enviadas</span>
            <div style={{ background: '#18181B', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={12} />
            </div>
          </div>
          <div className="kpi-val">18.432</div>
          <div className="kpi-trend">
            <ChartLine size={12} />
            <span>+12% vs. semana passada</span>
          </div>
        </div>

        <div className="card">
          <div className="kpi-title">
            <span>Mensagens<br/>recebidas</span>
            <div style={{ background: '#F4F4F5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Inbox size={12} color="var(--text-main)" />
            </div>
          </div>
          <div className="kpi-val">11.209</div>
          <div className="kpi-trend" style={{ color: 'var(--success)' }}>
            <ChartLine size={12} />
            <span>+7% vs. semana passada</span>
          </div>
        </div>

        <div className="card">
          <div className="kpi-title">
            <span>Taxa de entrega</span>
            <div style={{ background: '#F4F4F5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckDouble size={12} color="var(--text-main)" />
            </div>
          </div>
          <div className="kpi-val">96,2%</div>
          <div className="kpi-trend" style={{ color: 'var(--success)' }}>
            <ChartLine size={12} />
            <span>+0,4% vs. semana passada</span>
          </div>
        </div>

        <div className="card">
          <div className="kpi-title">
            <span>Taxa de resposta</span>
            <div style={{ background: '#F4F4F5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Undo size={12} color="var(--text-main)" />
            </div>
          </div>
          <div className="kpi-val">28,5%</div>
          <div className="kpi-trend" style={{ color: 'var(--success)' }}>
            <ChartLine size={12} />
            <span>+3% vs. semana passada</span>
          </div>
        </div>

        <div className="card">
          <div className="kpi-title">
            <span>Novos contatos</span>
            <div style={{ background: '#F4F4F5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={12} color="var(--text-main)" />
            </div>
          </div>
          <div className="kpi-val">847</div>
          <div className="kpi-trend" style={{ color: 'var(--success)' }}>
            <ChartLine size={12} />
            <span>+21% vs. semana passada</span>
          </div>
        </div>

        <div className="card">
          <div className="kpi-title">
            <span>Conversas<br/>abertas</span>
            <div style={{ background: '#F4F4F5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Message size={12} color="var(--text-main)" />
            </div>
          </div>
          <div className="kpi-val">134</div>
          <div className="kpi-trend" style={{ color: 'var(--danger)' }}>
            <ChartColumnDecreasing size={12} />
            <span>-5% vs. semana passada</span>
          </div>
        </div>
      </div>

      <div className="main-grid">
        {/* Chart Area Placeholder */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <span>Mensagens — últimos 7 dias</span>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', fontWeight: '500' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }}></div>Enviadas</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--sidebar-bg)' }}></div>Recebidas</span>
            </div>
          </div>
          
          <div style={{ flex: 1, borderTop: '1px solid var(--border-color)', position: 'relative', marginTop: '16px', paddingTop: '16px' }}>
             {/* Fake chart visualization */}
             <div style={{ width: '100%', height: '180px', position: 'relative' }}>
                {/* Horizontal lines */}
                <div style={{ position: 'absolute', top: '25%', width: '100%', borderTop: '1px solid #F4F4F5' }}></div>
                <div style={{ position: 'absolute', top: '50%', width: '100%', borderTop: '1px solid #F4F4F5' }}></div>
                <div style={{ position: 'absolute', top: '75%', width: '100%', borderTop: '1px solid #F4F4F5' }}></div>
                <div style={{ position: 'absolute', bottom: '0', width: '100%', borderTop: '1px solid #E4E4E7' }}></div>
                
                {/* Lines (SVG) */}
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', zIndex: 2 }}>
                  <path d="M 0,80 L 16,65 L 33,75 L 50,30 L 66,35 L 83,60 L 100,80" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
                  <path d="M 0,80 L 16,65 L 33,75 L 50,30 L 66,35 L 83,60 L 100,80 L 100,100 L 0,100 Z" fill="var(--warning-bg)" opacity="0.4" />
                  
                  <path d="M 0,90 L 16,80 L 33,85 L 50,55 L 66,60 L 83,85 L 100,95" fill="none" stroke="var(--sidebar-bg)" strokeWidth="1.5" strokeDasharray="2 2" />
                  
                  {/* Dots - Enviadas */}
                  <circle cx="0" cy="80" r="1.5" fill="var(--primary)" />
                  <circle cx="16" cy="65" r="1.5" fill="var(--primary)" />
                  <circle cx="33" cy="75" r="1.5" fill="var(--primary)" />
                  <circle cx="50" cy="30" r="1.5" fill="var(--primary)" />
                  <circle cx="66" cy="35" r="1.5" fill="var(--primary)" />
                  <circle cx="83" cy="60" r="1.5" fill="var(--primary)" />
                  <circle cx="100" cy="80" r="1.5" fill="var(--primary)" />

                  {/* Dots - Recebidas */}
                  <circle cx="0" cy="90" r="1" fill="var(--sidebar-bg)" />
                  <circle cx="50" cy="55" r="1" fill="var(--sidebar-bg)" />
                </svg>
             </div>
             
             {/* X axis labels */}
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span>
             </div>
          </div>
        </div>

        {/* Temperature Donut Placeholder */}
        <div className="card">
          <div className="card-header">Temperatura dos contatos</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px', marginTop: '24px' }}>
             <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                {/* Fake donut using conic-gradient */}
                <div style={{ 
                  width: '100%', height: '100%', borderRadius: '50%',
                  background: 'conic-gradient(var(--danger) 0% 34%, var(--primary) 34% 76%, var(--info) 76% 100%)'
                }}></div>
                <div style={{
                  position: 'absolute', top: '15px', left: '15px', width: '90px', height: '90px',
                  background: 'white', borderRadius: '50%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                   <span style={{ fontWeight: '700', fontSize: '1.25rem' }}>100%</span>
                   <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>qualif.</span>
                </div>
             </div>
             
             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'space-between' }}>
                   <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></div> Quentes
                   </span>
                   <span style={{ fontWeight: '600' }}>34%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'space-between' }}>
                   <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }}></div> Mornas
                   </span>
                   <span style={{ fontWeight: '600' }}>42%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'space-between' }}>
                   <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--info)' }}></div> Frios
                   </span>
                   <span style={{ fontWeight: '600' }}>24%</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="main-grid">
        {/* Campanhas recentes */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: '8px' }}>
            <span>Campanhas recentes</span>
            <a href="#" style={{ fontSize: '0.875rem', color: 'var(--primary-hover)', textDecoration: 'underline' }}>Ver todas</a>
          </div>
          
          <div className="table-row">
            <div>
              <div style={{ fontWeight: '600' }}>Promoção de Verão</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Hoje, 09:30</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--whatsapp)', fontWeight: '500' }}>
              <Message size={14} /> WhatsApp
            </div>
            <div><span className="tag tag-green">Concluída</span></div>
            <div style={{ display: 'flex', gap: '16px', textAlign: 'center' }}>
              <div><div style={{ fontWeight: '600' }}>1.240</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>enviadas</div></div>
              <div><div style={{ fontWeight: '600' }}>1.198</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>entregues</div></div>
              <div><div style={{ fontWeight: '600' }}>342</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>resp.</div></div>
            </div>
          </div>

          <div className="table-row">
            <div>
              <div style={{ fontWeight: '600' }}>Reativação de clientes inativos</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Hoje, 11:00</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
              <div style={{ background: '#18181B', color: 'white', borderRadius: '50%', padding: '2px' }}><Sliders size={10} /></div> Ambos
            </div>
            <div><span className="tag tag-yellow">Enviando</span></div>
            <div style={{ display: 'flex', gap: '16px', textAlign: 'center' }}>
              <div><div style={{ fontWeight: '600' }}>890</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>enviadas</div></div>
              <div><div style={{ fontWeight: '600' }}>812</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>entregues</div></div>
              <div><div style={{ fontWeight: '600' }}>95</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>resp.</div></div>
            </div>
          </div>

          <div className="table-row">
            <div>
              <div style={{ fontWeight: '600' }}>Black Friday — Lista VIP</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Amanhã, 08:00</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--whatsapp)', fontWeight: '500' }}>
              <Message size={14} /> WhatsApp
            </div>
            <div><span className="tag tag-gray">Agendada</span></div>
            <div style={{ display: 'flex', gap: '16px', textAlign: 'center' }}>
              <div><div style={{ fontWeight: '600' }}>—</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>enviadas</div></div>
              <div><div style={{ fontWeight: '600' }}>—</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>entregues</div></div>
              <div><div style={{ fontWeight: '600' }}>—</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>resp.</div></div>
            </div>
          </div>

          <div className="table-row">
            <div>
              <div style={{ fontWeight: '600' }}>Onboarding novos usuários</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Editado ontem</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--telegram)', fontWeight: '500' }}>
              <Send size={14} /> Telegram
            </div>
            <div><span className="tag tag-gray">Rascunho</span></div>
            <div style={{ display: 'flex', gap: '16px', textAlign: 'center' }}>
              <div><div style={{ fontWeight: '600' }}>—</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>enviadas</div></div>
              <div><div style={{ fontWeight: '600' }}>—</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>entregues</div></div>
              <div><div style={{ fontWeight: '600' }}>—</div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>resp.</div></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Economia com IA */}
          <div className="card ia-card">
            <div className="card-header" style={{ marginBottom: '12px', fontSize: '0.875rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={16} /> Economia com IA</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '2rem', fontWeight: '700' }}>R$ 2.840</span>
              <span style={{ fontSize: '0.875rem', color: '#A1A1AA' }}>este mês</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', color: '#D4D4D8' }}>
              1.420 respostas automáticas<br/>em vez de atendimento manual
            </div>
          </div>

          {/* Atalhos rápidos */}
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '16px' }}>Atalhos rápidos</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button className="btn btn-primary">
                <Megaphone size={16} /> Nova mensagem em massa
              </button>
              <button className="btn btn-secondary">
                <Download size={16} /> Importar contatos
              </button>
              <button className="btn btn-secondary" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Message size={16} /> Ver conversas não lidas</span>
                <div style={{ background: 'var(--danger)', color: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem' }}>12</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
