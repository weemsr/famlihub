"use client";

export default function CalendarPage() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  
  const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div style={{ paddingBottom: 60 }}>
      <h1 className="mb-4">Calendar 📆</h1>
      <div className="card">
        <h2 style={{ textAlign: 'center', marginBottom: 16 }}>{monthName}</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontWeight: 'bold', marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {blanks.map(b => <div key={`blank-${b}`} style={{ padding: '12px 0' }} />)}
          
          {days.map(d => {
            const isToday = d === today.getDate();
            return (
              <div key={d} style={{
                padding: '12px 0',
                textAlign: 'center',
                backgroundColor: isToday ? 'var(--accent-color)' : 'var(--surface-hover)',
                color: isToday ? 'white' : 'var(--text-primary)',
                borderRadius: '8px',
                fontWeight: isToday ? 'bold' : '500',
                fontSize: '0.95rem',
                boxShadow: isToday ? '0 4px 12px rgba(239, 68, 68, 0.2)' : 'none'
              }}>
                {d}
              </div>
            );
          })}
        </div>
      </div>
      
      <p style={{ textAlign: 'center', marginTop: 32, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
        (Future routing integration and event tracking will be built here)
      </p>
    </div>
  );
}
