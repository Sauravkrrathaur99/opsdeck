const GRADIENTS = {
  grid: ['#818cf8', '#6366f1', '#a78bfa', '#c084fc'],
  list: ['#38bdf8', '#0ea5e9', '#22d3ee', '#06b6d4'],
  eye: ['#fbbf24', '#f59e0b', '#fcd34d'],
  eyeOff: ['#94a3b8', '#64748b', '#475569'],
  filter: ['#34d399', '#10b981', '#6ee7b7'],
  star: ['#fde047', '#facc15', '#fbbf24'],
  starOff: ['#94a3b8', '#64748b'],
  panel: ['#60a5fa', '#3b82f6', '#818cf8'],
  terminal: ['#4ade80', '#22c55e', '#86efac'],
  git: ['#fb923c', '#f97316', '#fdba74'],
  refresh: ['#38bdf8', '#3b82f6', '#818cf8'],
};

function IconWrap({ children, className = '', active = false }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110 ${
        active ? 'scale-105' : ''
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function AnimatedGridIcon({ active }) {
  const colors = GRADIENTS.grid;
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        {colors.map((c, i) => (
          <rect
            key={i}
            x={3 + (i % 2) * 9}
            y={3 + Math.floor(i / 2) * 9}
            width="7"
            height="7"
            rx="2"
            fill={c}
            className={`origin-center ${active ? `animate-icon-pop` : ''}`}
            style={active ? { animationDelay: `${i * 0.1}s` } : undefined}
          />
        ))}
      </svg>
    </IconWrap>
  );
}

export function AnimatedListIcon({ active }) {
  const colors = GRADIENTS.list;
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx="5" cy={6 + i * 6} r="2" fill={colors[i]} />
            <rect
              x="10"
              y={4.5 + i * 6}
              width="11"
              height="3"
              rx="1.5"
              fill={colors[i]}
              opacity="0.85"
              className={active ? 'animate-icon-slide' : ''}
              style={active ? { animationDelay: `${i * 0.15}s` } : undefined}
            />
          </g>
        ))}
      </svg>
    </IconWrap>
  );
}

export function AnimatedEyeIcon({ active }) {
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <defs>
          <linearGradient id="eye-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GRADIENTS.eye[0]} />
            <stop offset="100%" stopColor={GRADIENTS.eye[1]} />
          </linearGradient>
        </defs>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
          stroke="url(#eye-grad)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="3.5" fill="url(#eye-grad)" className={active ? 'animate-icon-blink' : ''} />
        <circle cx="13" cy="11" r="1" fill="#fff" opacity="0.9" />
      </svg>
    </IconWrap>
  );
}

export function AnimatedEyeOffIcon({ active }) {
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <defs>
          <linearGradient id="eye-off-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GRADIENTS.eyeOff[0]} />
            <stop offset="100%" stopColor={GRADIENTS.eyeOff[1]} />
          </linearGradient>
        </defs>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
          stroke="url(#eye-off-grad)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle cx="12" cy="12" r="3" fill={GRADIENTS.eyeOff[1]} opacity="0.4" />
        <line x1="4" y1="4" x2="20" y2="20" stroke={GRADIENTS.eyeOff[0]} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </IconWrap>
  );
}

export function AnimatedFilterIcon({ active }) {
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line
              x1="4"
              y1={6 + i * 6}
              x2="20"
              y2={6 + i * 6}
              stroke={GRADIENTS.filter[i % 3]}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle
              cx={[8, 16, 10][i]}
              cy={6 + i * 6}
              r="2.5"
              fill={GRADIENTS.filter[(i + 1) % 3]}
              className={active ? 'animate-icon-knob' : ''}
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          </g>
        ))}
      </svg>
    </IconWrap>
  );
}

export function AnimatedStarIcon({ active }) {
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <defs>
          <linearGradient id="star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GRADIENTS.star[0]} />
            <stop offset="50%" stopColor={GRADIENTS.star[1]} />
            <stop offset="100%" stopColor={GRADIENTS.star[2]} />
          </linearGradient>
        </defs>
        <path
          d="M12 2l2.9 6.5L22 9.5l-5 4.5 1.5 7L12 17.5 5.5 21 7 14 2 9.5l7.1-1L12 2z"
          fill="url(#star-grad)"
          className={active ? 'animate-icon-sparkle' : ''}
        />
      </svg>
    </IconWrap>
  );
}

export function AnimatedStarOffIcon() {
  return (
    <IconWrap>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <path
          d="M12 2l2.9 6.5L22 9.5l-5 4.5 1.5 7L12 17.5 5.5 21 7 14 2 9.5l7.1-1L12 2z"
          stroke={GRADIENTS.starOff[0]}
          strokeWidth="1.5"
          fill="none"
          opacity="0.6"
        />
        <line x1="4" y1="4" x2="20" y2="20" stroke={GRADIENTS.starOff[1]} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </IconWrap>
  );
}

export function AnimatedPanelIcon({ active }) {
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke={GRADIENTS.panel[1]} strokeWidth="1.5" fill="none" />
        <rect x="3" y="4" width="7" height="16" rx="2" fill={GRADIENTS.panel[0]} opacity="0.85" />
        <path
          d="M14 12l3-2.5v5L14 12z"
          fill={GRADIENTS.panel[2]}
          className={active ? 'animate-icon-chevron' : ''}
        />
      </svg>
    </IconWrap>
  );
}

export function AnimatedTerminalIcon({ active }) {
  return (
    <IconWrap active={active}>
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#0f172a" stroke={GRADIENTS.terminal[1]} strokeWidth="1.5" />
        <path
          d="M7 9l3 3-3 3"
          stroke={GRADIENTS.terminal[0]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="12" y1="15" x2="16" y2="15" stroke={GRADIENTS.terminal[2]} strokeWidth="2" strokeLinecap="round" />
        <rect
          x="12"
          y="8"
          width="1.5"
          height="4"
          fill={GRADIENTS.terminal[0]}
          className={active ? 'animate-icon-cursor' : ''}
          opacity={active ? 1 : 0}
        />
      </svg>
    </IconWrap>
  );
}

export function AnimatedGitIcon({ active, loading }) {
  return (
    <IconWrap active={active || loading}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`w-full h-full ${loading ? 'animate-icon-spin-slow' : ''}`}
      >
        <circle cx="7" cy="6" r="2.5" fill={GRADIENTS.git[0]} />
        <circle cx="7" cy="18" r="2.5" fill={GRADIENTS.git[1]} />
        <circle cx="17" cy="12" r="2.5" fill={GRADIENTS.git[2]} />
        <path
          d="M7 8.5v7M9.5 6h5a4.5 4.5 0 010 9h-2"
          stroke={GRADIENTS.git[1]}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {(active || loading) && (
          <circle cx="17" cy="12" r="4" stroke={GRADIENTS.git[0]} strokeWidth="1" opacity="0.4" className="animate-icon-ping" />
        )}
      </svg>
    </IconWrap>
  );
}

export function AnimatedRefreshIcon({ loading }) {
  return (
    <IconWrap active={loading}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`w-full h-full ${loading ? 'animate-spin' : 'group-hover:animate-icon-wiggle'}`}
      >
        <defs>
          <linearGradient id="refresh-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GRADIENTS.refresh[0]} />
            <stop offset="50%" stopColor={GRADIENTS.refresh[1]} />
            <stop offset="100%" stopColor={GRADIENTS.refresh[2]} />
          </linearGradient>
        </defs>
        <path
          d="M21 12a9 9 0 11-2.5-6.2M21 3v5h-5"
          stroke="url(#refresh-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 12a9 9 0 012.5 6.2M3 21v-5h5"
          stroke="url(#refresh-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
      </svg>
    </IconWrap>
  );
}
