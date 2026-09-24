import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Command,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  api,
  API_BASE_URL,
  getAuthToken,
  setAuthToken,
  type User,
  type Sender,
  type Campaign,
  type Email,
  type SlackConnection,
  type CreateSenderPayload,
} from './services/api';

/* ---------- View Types & Formats ---------- */

type View = 'overview' | 'campaigns' | 'scheduled' | 'sent' | 'senders' | 'integrations' | 'settings';

const emailStatusLabel: Record<string, string> = {
  SCHEDULE_PENDING: 'Preparing',
  SCHEDULED: 'Scheduled',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
};

const campaignStatusLabel: Record<string, string> = {
  SCHEDULE_PENDING: 'Preparing',
  SCHEDULED: 'Scheduled',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  COMPLETED_WITH_FAILURES: 'Completed with failures',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getInitials(nameOrEmail: string): string {
  if (!nameOrEmail) return 'EM';
  const parts = nameOrEmail.trim().split(/[\s@._-]+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}

function getAvatarColor(str: string): string {
  const colors = ['#e8c6b8', '#c7d8e6', '#ddd4ba', '#c7d6c7', '#dbcbd7', '#e0d4e8', '#c8d2e0'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] || '#c7d8e6';
}

/* ---------- Main App Component ---------- */

const navItems: { label: string; view: View; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', view: 'overview', icon: LayoutDashboard },
  { label: 'Campaigns', view: 'campaigns', icon: Send },
  { label: 'Scheduled', view: 'scheduled', icon: CalendarClock },
  { label: 'Sent emails', view: 'sent', icon: Inbox },
];

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [view, setView] = useState<View>('overview');
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  // Live backend entities
  const [senders, setSenders] = useState<Sender[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [slackStatus, setSlackStatus] = useState<SlackConnection | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial authentication check
  const checkAuth = async () => {
    try {
      setAuthLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      if (token) {
        setAuthToken(token);
        urlParams.delete('token');
        const cleanSearch = urlParams.toString();
        const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
        window.history.replaceState(null, '', cleanUrl);
      }
      const res = await api.auth.getMe();
      setCurrentUser(res.user);
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Fetch all live backend data once authenticated
  const loadAllData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setIsLoadingData(true);
      setErrorMessage(null);

      const [sendersRes, campaignsRes, scheduledRes, sentRes, slackRes] = await Promise.all([
        api.senders.list(false),
        api.campaigns.list(),
        api.emails.list('scheduled', 100),
        api.emails.list('sent', 100),
        api.slack.getStatus().catch(() => ({ connected: false })),
      ]);

      setSenders(sendersRes);
      setCampaigns(campaignsRes);
      setScheduledEmails(scheduledRes.items);
      setSentEmails(sentRes.items);
      setSlackStatus(slackRes);
    } catch (err: unknown) {
      console.error('Failed to load application data:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to sync with backend');
    } finally {
      setIsLoadingData(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadAllData();
    }
  }, [currentUser, loadAllData]);

  // Global search shortcut (Command+K or Ctrl+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const changeView = (next: View) => {
    setView(next);
    setMobileNav(false);
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setCurrentUser(null);
      setView('overview');
    } catch (err: unknown) {
      console.error('Logout error:', err);
    }
  };

  // If session is checking
  if (authLoading) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-brand">
            <div className="brand-mark"><span>R</span></div>
            <div className="brand-wordmark">reach<span>inbox</span></div>
          </div>
          <div className="loading-state" style={{ minHeight: 120 }}>
            <Loader2 size={28} className="spin" />
            <span>Connecting to workspace...</span>
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated: render real login screen matching ReachInbox design
  if (!currentUser) {
    return <LoginView onLoginSuccess={setCurrentUser} />;
  }

  // Calculate capacity and stats
  const activeSenders = senders.filter((s) => s.isActive);
  const totalHourlyCapacity = activeSenders.reduce((sum, s) => sum + s.hourlyLimit, 0) || 100;
  const recentSentCount = sentEmails.length;
  const capacityUsedPercent = Math.min(100, Math.round((recentSentCount / totalHourlyCapacity) * 100));

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-mark"><span>R</span></div>
        <div className="brand-wordmark">reach<span>inbox</span></div>

        <nav className="primary-nav">
          <p className="nav-label">Workspace</p>
          {navItems.map(({ label, view: itemView, icon: Icon }) => (
            <button
              key={itemView}
              className={`nav-item ${view === itemView ? 'active' : ''}`}
              onClick={() => changeView(itemView)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {itemView === 'scheduled' && scheduledEmails.length > 0 && (
                <span className="nav-count">{scheduledEmails.length}</span>
              )}
            </button>
          ))}

          <p className="nav-label nav-gap">Manage</p>
          <button
            className={`nav-item ${view === 'senders' ? 'active' : ''}`}
            onClick={() => changeView('senders')}
          >
            <Users size={17} strokeWidth={1.8} />
            <span>Senders</span>
            <span className="nav-count">{activeSenders.length}</span>
          </button>
          <button
            className={`nav-item ${view === 'integrations' ? 'active' : ''}`}
            onClick={() => changeView('integrations')}
          >
            <Link2 size={17} strokeWidth={1.8} />
            <span>Integrations</span>
            {slackStatus?.connected && <span className="nav-dot" />}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => changeView('settings')}
          >
            <Settings size={17} strokeWidth={1.8} />
            <span>Settings</span>
          </button>

          {/* Real Sending Capacity Widget */}
          <div className="usage-box">
            <div className="usage-title">
              <span>Sending capacity</span>
              <Activity size={14} />
            </div>
            <div className="usage-amount">
              {recentSentCount}<span>/ {totalHourlyCapacity}</span>
            </div>
            <div className="usage-track">
              <span style={{ width: `${capacityUsedPercent}%` }} />
            </div>
            <div className="usage-foot">
              <span>Hourly emails</span>
              <span>{capacityUsedPercent}%</span>
            </div>
          </div>

          {/* User Profile */}
          <div className="profile" onClick={handleLogout} title="Click to Sign Out" style={{ cursor: 'pointer' }}>
            <div className="avatar">
              {getInitials(currentUser.name || currentUser.email)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <strong style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>
                {currentUser.name}
              </strong>
              <small style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>
                {currentUser.email}
              </small>
            </div>
            <LogOut size={14} className="text-gray-400" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {view === 'overview'
                ? 'Overview'
                : view === 'integrations'
                ? 'Integrations'
                : view[0].toUpperCase() + view.slice(1)}
            </strong>
          </div>
          <div className="top-actions">
            <button className="search-trigger" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
              <span>Search anything</span>
              <kbd><Command size={12} />K</kbd>
            </button>
            <a
              href={`${API_BASE_URL || 'http://localhost:4000'}/admin/queues${getAuthToken() ? `?token=${getAuthToken()}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-button"
              title="Open Bull Board Queues"
            >
              <Activity size={17} />
            </a>
            <button className="create-button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} /> New campaign
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="notice-banner error-banner" style={{ margin: '16px 32px 0' }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
            <button className="text-button" onClick={loadAllData} style={{ marginLeft: 'auto' }}>
              Retry
            </button>
          </div>
        )}

        {/* Views */}
        {view === 'overview' && (
          <Overview
            user={currentUser}
            campaigns={campaigns}
            scheduledEmails={scheduledEmails}
            sentEmails={sentEmails}
            onCreate={() => setCreateOpen(true)}
            onSelectEmail={setSelectedEmail}
            onSelectCampaign={setSelectedCampaign}
            onView={changeView}
          />
        )}

        {view === 'campaigns' && (
          <CampaignsView
            campaigns={campaigns}
            isLoading={isLoadingData}
            onSelectCampaign={setSelectedCampaign}
            onCreate={() => setCreateOpen(true)}
          />
        )}

        {view === 'scheduled' && (
          <ScheduledView
            emails={scheduledEmails}
            isLoading={isLoadingData}
            onSelectEmail={setSelectedEmail}
            onRefresh={loadAllData}
          />
        )}

        {view === 'sent' && (
          <SentView
            emails={sentEmails}
            isLoading={isLoadingData}
            onSelectEmail={setSelectedEmail}
            onRefresh={loadAllData}
          />
        )}

        {view === 'senders' && (
          <Senders
            senders={senders}
            onRefresh={loadAllData}
          />
        )}

        {view === 'integrations' && (
          <Integrations
            status={slackStatus}
            onRefresh={loadAllData}
          />
        )}

        {view === 'settings' && (
          <SettingsView user={currentUser} slackStatus={slackStatus} />
        )}
      </main>

      {/* Modals & Drawers */}
      {isCreateOpen && (
        <CampaignModal
          senders={senders}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            loadAllData();
            setView('scheduled');
          }}
        />
      )}

      {selectedEmail && (
        <EmailDrawer
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onRetried={() => {
            loadAllData();
            setSelectedEmail(null);
          }}
        />
      )}

      {selectedCampaign && (
        <CampaignDrawer
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

      {searchOpen && (
        <GlobalSearch
          value={searchQuery}
          setValue={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onSelectEmail={(email) => {
            setSearchOpen(false);
            setSelectedEmail(email);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Login View (Matching ReachInbox Branding) ---------- */

function LoginView({ onLoginSuccess }: { onLoginSuccess: (u: User) => void }) {
  const [devLoading, setDevLoading] = useState(false);

  const handleDevLogin = async () => {
    try {
      setDevLoading(true);
      const res = await api.auth.devLogin('olivia@reachinbox.io', 'Olivia Lee');
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark"><span>R</span></div>
          <div className="brand-wordmark">reach<span>inbox</span></div>
        </div>

        <h2>Sign in to your workspace</h2>
        <p className="login-subtitle">
          Orchestrate high-throughput cold email scheduling with BullMQ and atomic rate limiting.
        </p>

        <div className="login-actions">
          {/* Real Google OAuth link */}
          <a href={`${API_BASE_URL}/api/v1/auth/google`} className="google-login-button">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </a>

          {/* Dev Mode Instant Login */}
          <div className="login-divider"><span>OR DEVELOPER ACCESS</span></div>

          <button className="dev-login-button" onClick={handleDevLogin} disabled={devLoading}>
            {devLoading ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
            <span>Developer 1-Click Login</span>
          </button>
        </div>

        <div className="login-footer">
          <div className="login-badge"><ShieldCheck size={14} /><span>Redis AOF Persistent</span></div>
          <div className="login-badge"><Zap size={14} /><span>Multi-Worker Safe</span></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared UI Elements ---------- */

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow || 'ReachInbox / 2024'}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmailStatusBadge({ status }: { status: string }) {
  const cls = `status-${status.toLowerCase().replace('_', '-')}`;
  return (
    <span className={`status-badge ${cls}`}>
      <i />
      {emailStatusLabel[status] || status}
    </span>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'RUNNING'
      ? 'status-sending'
      : status === 'SCHEDULED' || status === 'SCHEDULE_PENDING'
      ? 'status-scheduled'
      : status === 'COMPLETED'
      ? 'status-sent'
      : status === 'COMPLETED_WITH_FAILURES' || status === 'FAILED'
      ? 'status-failed'
      : 'status-scheduled';
  return (
    <span className={`status-badge ${cls}`}>
      <i />
      {campaignStatusLabel[status] || status}
    </span>
  );
}

function MiniProgress({ percent }: { percent: number }) {
  return (
    <div className="mini-progress">
      <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="loading-state">
      <Loader2 size={24} className="spin" />
      <span>{label}</span>
    </div>
  );
}

/* ---------- Overview View ---------- */

function Overview({
  user,
  campaigns,
  scheduledEmails,
  sentEmails,
  onCreate,
  onSelectEmail,
  onSelectCampaign,
  onView,
}: {
  user: User;
  campaigns: Campaign[];
  scheduledEmails: Email[];
  sentEmails: Email[];
  onCreate: () => void;
  onSelectEmail: (e: Email) => void;
  onSelectCampaign: (c: Campaign) => void;
  onView: (v: View) => void;
}) {
  const scheduledCount = scheduledEmails.length;
  const sentCount = sentEmails.filter((e) => e.status === 'SENT').length;
  const failedCount = sentEmails.filter((e) => e.status === 'FAILED').length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'RUNNING' || c.status === 'SCHEDULED').length;

  const runningCampaign = campaigns.find((c) => c.status === 'RUNNING') || campaigns[0];
  const runningPercent = runningCampaign
    ? Math.round((runningCampaign.sentCount / (runningCampaign.totalRecipients || 1)) * 100)
    : 0;

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        title={`Good morning, ${user.name.split(' ')[0]}`}
        description="Here's what's happening across your outreach today."
        action={
          <button className="outline-button" onClick={onCreate}>
            <Sparkles size={15} /> Create campaign <ChevronRight size={15} />
          </button>
        }
      />

      {/* Metrics Row */}
      <section className="metric-grid">
        <MetricCard
          label="Emails sent"
          value={String(sentCount)}
          detail="Total delivered via SMTP"
          icon={<Send size={16} />}
          positive
        />
        <MetricCard
          label="Scheduled"
          value={String(scheduledCount)}
          detail={`Across ${campaigns.length} campaigns`}
          icon={<CalendarClock size={16} />}
        />
        <MetricCard
          label="Active campaigns"
          value={String(activeCampaigns)}
          detail="Queued or running"
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="Failed deliveries"
          value={String(failedCount).padStart(2, '0')}
          detail={failedCount > 0 ? 'Review failure logs' : 'All sends healthy'}
          icon={<ShieldCheck size={16} />}
          warning={failedCount > 0}
        />
      </section>

      {/* Dashboard Pulse & Charts */}
      <section className="dashboard-grid">
        <div className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Sending activity</p>
              <h2>Volume overview</h2>
            </div>
            <span className="select-button">Live Queue</span>
          </div>
          <div className="chart-key">
            <span><i className="key-dot maroon-dot" /> Sent emails</span>
            <span className="chart-total">{sentCount} <small>total sent</small></span>
          </div>
          <div className="bar-chart">
            {[20, 35, 45, 60, 50, 75, 65, 80, 70, 85, 90, 60, 95, 80].map((h, i) => (
              <div className="bar-col" key={i}>
                <div className="bar-value" style={{ height: `${h}%` }}><span /></div>
                <small>{['M', '', 'T', '', 'W', '', 'T', '', 'F', '', 'S', '', 'S', ''][i]}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel running-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Live now</p>
              <h2>Campaign pulse</h2>
            </div>
            {runningCampaign && <span className="live-badge"><i /> Active</span>}
          </div>

          {runningCampaign ? (
            <>
              <div className="pulse-visual">
                <div
                  className="pulse-ring"
                  style={{
                    background: `conic-gradient(#c2767d 0 ${runningPercent}%, #45383a ${runningPercent}% 100%)`,
                  }}
                >
                  <div className="pulse-center">
                    <strong>{runningPercent}%</strong>
                    <small>complete</small>
                  </div>
                </div>
                <div className="pulse-stats">
                  <span><b>{runningCampaign.sentCount}</b> sent</span>
                  <span><b>{Math.max(0, runningCampaign.totalRecipients - runningCampaign.sentCount)}</b> remaining</span>
                </div>
              </div>

              <div className="running-name">
                <div className="campaign-avatar campaign-maroon">
                  {getInitials(runningCampaign.subject)}
                </div>
                <div>
                  <strong>{runningCampaign.subject}</strong>
                  <span>{runningCampaign.sender?.fromEmail || 'Active sender'}</span>
                </div>
                <button className="round-arrow" onClick={() => onSelectCampaign(runningCampaign)}>
                  <ArrowUpRight size={15} />
                </button>
              </div>

              <div className="progress-line">
                <span style={{ width: `${runningPercent}%` }} />
              </div>

              <div className="running-foot">
                <span>Start: <b>{formatDisplayDate(runningCampaign.requestedStartAt)}</b></span>
                <span>{runningCampaign.hourlyLimit} / hr</span>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <Send size={24} />
              <strong>No active campaigns</strong>
              <span>Schedule a campaign to see real-time queue pacing.</span>
            </div>
          )}
        </div>
      </section>

      {/* Lower Row: Upcoming Campaigns & Latest Activity */}
      <section className="lower-grid">
        <div className="panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Up next</p>
              <h2>Upcoming campaigns</h2>
            </div>
            <button className="text-button" onClick={() => onView('campaigns')}>
              View all <ChevronRight size={14} />
            </button>
          </div>
          {campaigns.slice(0, 4).map((c) => (
            <CampaignRow key={c.id} campaign={c} onClick={() => onSelectCampaign(c)} />
          ))}
          {campaigns.length === 0 && (
            <div className="empty-state">
              <CalendarClock size={24} />
              <strong>No campaigns scheduled</strong>
            </div>
          )}
        </div>

        <div className="panel activity-list">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Latest events</p>
              <h2>Recent activity</h2>
            </div>
          </div>
          {[...scheduledEmails, ...sentEmails].slice(0, 5).map((email, idx) => (
            <button className="activity-row" key={email.id} onClick={() => onSelectEmail(email)}>
              <div className={`activity-icon activity-${idx % 4}`}>
                <Mail size={14} />
              </div>
              <div>
                <strong>
                  {email.status === 'SENT'
                    ? 'Email delivered'
                    : email.status === 'FAILED'
                    ? 'Delivery failed'
                    : email.status === 'SENDING'
                    ? 'Email is sending'
                    : 'Email scheduled'}
                </strong>
                <span>{email.recipientEmail} · {formatDisplayDate(email.scheduledAt || email.requestedAt)}</span>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
          {scheduledEmails.length === 0 && sentEmails.length === 0 && (
            <div className="empty-state">
              <Inbox size={24} />
              <strong>No email activity yet</strong>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  trend,
  icon,
  positive,
  warning,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  icon: ReactNode;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`metric-card ${warning ? 'metric-warning' : ''}`}>
      <div className="metric-top">
        <span className="metric-icon">{icon}</span>
        {trend && <span className={`trend ${positive ? 'trend-positive' : ''}`}><ArrowUpRight size={13} /> {trend}</span>}
        {warning && <span className="attention-pill">Review</span>}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

function CampaignRow({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const percent = Math.round((campaign.sentCount / (campaign.totalRecipients || 1)) * 100);
  return (
    <button className="campaign-row" onClick={onClick}>
      <div className="campaign-avatar campaign-maroon">{getInitials(campaign.subject)}</div>
      <div className="campaign-info">
        <strong>{campaign.subject}</strong>
        <span>{formatDisplayDate(campaign.requestedStartAt)}</span>
      </div>
      <div className="campaign-progress">
        <div>
          <span>{campaign.sentCount} <em>/ {campaign.totalRecipients}</em></span>
          <b>{percent}%</b>
        </div>
        <MiniProgress percent={percent} />
      </div>
      <CampaignStatusBadge status={campaign.status} />
    </button>
  );
}

/* ---------- Campaigns View ---------- */

function CampaignsView({
  campaigns,
  isLoading,
  onSelectCampaign,
  onCreate,
}: {
  campaigns: Campaign[];
  isLoading: boolean;
  onSelectCampaign: (c: Campaign) => void;
  onCreate: () => void;
}) {
  const runningCount = campaigns.filter((c) => c.status === 'RUNNING').length;
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.totalRecipients, 0);

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow="Workspace / Campaigns"
        title="Campaigns"
        description="Build, launch, and learn from your outbound campaigns."
        action={
          <button className="create-button" onClick={onCreate}>
            <Plus size={16} /> New campaign
          </button>
        }
      />

      <div className="campaign-summary">
        <div>
          <span>All campaigns</span>
          <strong>{String(campaigns.length).padStart(2, '0')}</strong>
        </div>
        <div>
          <span>Currently running</span>
          <strong className="maroon-text">{String(runningCount).padStart(2, '0')}</strong>
        </div>
        <div>
          <span>Total recipients</span>
          <strong>{totalRecipients.toLocaleString()}</strong>
        </div>
        <div className="summary-cta">
          <Zap size={16} />
          <span>BullMQ Engine Active</span>
        </div>
      </div>

      <div className="table-panel panel">
        {isLoading && campaigns.length === 0 ? (
          <LoadingState label="Loading campaigns..." />
        ) : (
          <div className="campaign-table">
            <div className="campaign-table-header">
              <span>Campaign</span>
              <span>Progress</span>
              <span>Rate</span>
              <span>Status</span>
              <span />
            </div>

            {campaigns.map((campaign) => {
              const percent = Math.round((campaign.sentCount / (campaign.totalRecipients || 1)) * 100);
              return (
                <button
                  className="campaign-table-row"
                  key={campaign.id}
                  onClick={() => onSelectCampaign(campaign)}
                >
                  <div className="campaign-avatar campaign-maroon">
                    {getInitials(campaign.subject)}
                  </div>
                  <div className="campaign-table-info">
                    <strong>{campaign.subject}</strong>
                    <span>{campaign.totalRecipients} recipients · {formatDisplayDate(campaign.requestedStartAt)}</span>
                  </div>
                  <div className="table-campaign-progress">
                    <span>{campaign.sentCount} / {campaign.totalRecipients}</span>
                    <MiniProgress percent={percent} />
                  </div>
                  <span className="muted-cell">{campaign.hourlyLimit} / hr</span>
                  <CampaignStatusBadge status={campaign.status} />
                  <ChevronRight size={16} />
                </button>
              );
            })}

            {campaigns.length === 0 && (
              <div className="empty-state">
                <Send size={26} />
                <strong>No campaigns found</strong>
                <span>Click "New campaign" to upload a CSV and schedule leads.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Scheduled Emails View ---------- */

function ScheduledView({
  emails,
  isLoading,
  onSelectEmail,
  onRefresh,
}: {
  emails: Email[];
  isLoading: boolean;
  onSelectEmail: (e: Email) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return emails
      .filter((e) => statusFilter === 'ALL' || e.status === statusFilter)
      .filter(
        (e) =>
          e.recipientEmail.toLowerCase().includes(q) ||
          (e.subject && e.subject.toLowerCase().includes(q))
      );
  }, [emails, search, statusFilter]);

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow="Workspace / Scheduled"
        title="Scheduled emails"
        description="Real-time BullMQ delayed job queue with per-sender rate-limit pacing."
      />

      <div className="table-panel panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter scheduled leads or subjects..."
            />
          </div>
          <div className="toolbar-actions">
            <div className="filter-group">
              <button
                className={`filter-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All
              </button>
              <button
                className={`filter-chip ${statusFilter === 'SCHEDULED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('SCHEDULED')}
              >
                Scheduled
              </button>
              <button
                className={`filter-chip ${statusFilter === 'SENDING' ? 'active' : ''}`}
                onClick={() => setStatusFilter('SENDING')}
              >
                Sending
              </button>
            </div>
            <button className="icon-button" onClick={onRefresh} title="Sync queue from backend">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {isLoading && emails.length === 0 ? (
          <LoadingState label="Syncing scheduled jobs..." />
        ) : (
          <div className="email-table">
            <div className="table-head">
              <span>Recipient</span>
              <span>Subject</span>
              <span>Scheduled time</span>
              <span>Status</span>
              <span />
            </div>

            {filtered.map((email) => (
              <button className="email-row" key={email.id} onClick={() => onSelectEmail(email)}>
                <div className="recipient-cell">
                  <span className="recipient-avatar" style={{ background: getAvatarColor(email.recipientEmail) }}>
                    {getInitials(email.recipientEmail)}
                  </span>
                  <span>
                    <strong>{email.recipientEmail}</strong>
                    <small>Sequence #{email.sequenceNo}</small>
                  </span>
                </div>
                <span className="subject-cell">
                  <strong>{email.subject || '—'}</strong>
                </span>
                <span className="muted-cell">{formatDisplayDate(email.scheduledAt || email.requestedAt)}</span>
                <EmailStatusBadge status={email.status} />
                <MoreHorizontal size={17} className="row-more" />
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="empty-state">
                <CalendarClock size={26} />
                <strong>No scheduled emails</strong>
                <span>All queued emails have been dispatched or none match your filters.</span>
              </div>
            )}
          </div>
        )}

        <div className="table-footer">
          <span>Showing <b>{filtered.length}</b> of {emails.length} queued leads</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Sent Emails View ---------- */

function SentView({
  emails,
  isLoading,
  onSelectEmail,
  onRefresh,
}: {
  emails: Email[];
  isLoading: boolean;
  onSelectEmail: (e: Email) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return emails
      .filter((e) => statusFilter === 'ALL' || e.status === statusFilter)
      .filter(
        (e) =>
          e.recipientEmail.toLowerCase().includes(q) ||
          (e.subject && e.subject.toLowerCase().includes(q))
      );
  }, [emails, search, statusFilter]);

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow="Workspace / Sent emails"
        title="Sent emails"
        description="A clear history of every email delivered via Ethereal fake SMTP."
      />

      <div className="table-panel panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipients or subjects..."
            />
          </div>
          <div className="toolbar-actions">
            <div className="filter-group">
              <button
                className={`filter-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All
              </button>
              <button
                className={`filter-chip ${statusFilter === 'SENT' ? 'active' : ''}`}
                onClick={() => setStatusFilter('SENT')}
              >
                Sent
              </button>
              <button
                className={`filter-chip ${statusFilter === 'FAILED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('FAILED')}
              >
                Failed
              </button>
            </div>
            <button className="icon-button" onClick={onRefresh} title="Sync delivered emails">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {isLoading && emails.length === 0 ? (
          <LoadingState label="Loading sent emails..." />
        ) : (
          <div className="email-table">
            <div className="table-head">
              <span>Recipient</span>
              <span>Subject</span>
              <span>Sent / Failed time</span>
              <span>Status</span>
              <span />
            </div>

            {filtered.map((email) => (
              <button className="email-row" key={email.id} onClick={() => onSelectEmail(email)}>
                <div className="recipient-cell">
                  <span className="recipient-avatar" style={{ background: getAvatarColor(email.recipientEmail) }}>
                    {getInitials(email.recipientEmail)}
                  </span>
                  <span>
                    <strong>{email.recipientEmail}</strong>
                    <small>{email.providerMessageId ? `ID: ${email.providerMessageId.slice(0, 14)}...` : 'Delivered'}</small>
                  </span>
                </div>
                <span className="subject-cell">
                  <strong>{email.subject || '—'}</strong>
                </span>
                <span className="muted-cell">{formatDisplayDate(email.sentAt || email.failedAt)}</span>
                <EmailStatusBadge status={email.status} />
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  {email.previewUrl && (
                    <a
                      href={email.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-button"
                      title="Open HTML preview in Ethereal"
                      style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>Preview</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="empty-state">
                <Inbox size={26} />
                <strong>No delivered emails found</strong>
                <span>Completed sends will appear here with live Ethereal inbox links.</span>
              </div>
            )}
          </div>
        )}

        <div className="table-footer">
          <span>Showing <b>{filtered.length}</b> of {emails.length} results</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Senders View ---------- */

function Senders({
  senders,
  onRefresh,
}: {
  senders: Sender[];
  onRefresh: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSender, setEditingSender] = useState<Sender | null>(null);

  const activeCount = senders.filter((s) => s.isActive).length;

  const toggleActive = async (senderId: string) => {
    try {
      await api.senders.toggleActive(senderId);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to toggle sender');
    }
  };

  const handleSave = async (payload: CreateSenderPayload) => {
    try {
      if (editingSender) {
        await api.senders.update(editingSender.id, payload);
      } else {
        await api.senders.create(payload);
      }
      setModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save sender');
    }
  };

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow="Workspace / Senders"
        title="Sender accounts"
        description="Your sending identities and their current capacity."
        action={
          <button
            className="create-button"
            onClick={() => {
              setEditingSender(null);
              setModalOpen(true);
            }}
          >
            <Plus size={16} /> Add sender
          </button>
        }
      />

      <div className="sender-health">
        <div>
          <ShieldCheck size={18} />
          <span>
            <strong>{activeCount} of {senders.length} senders active</strong>
            <small>All SMTP credentials stored with AES-256-GCM encryption</small>
          </span>
        </div>
        <div className="health-bars">
          {senders.map((s) => (
            <i key={s.id} className={s.isActive ? '' : 'bar-off'} />
          ))}
        </div>
      </div>

      <div className="panel sender-panel">
        <div className="sender-table-head">
          <span>Sender</span>
          <span>Status</span>
          <span>Hourly limit</span>
          <span>Min. delay</span>
          <span />
        </div>

        {senders.map((sender) => (
          <div className="sender-row" key={sender.id}>
            <div className="sender-identity">
              <div className="sender-avatar">{getInitials(sender.displayName)}</div>
              <div>
                <strong>{sender.fromEmail}</strong>
                <span>{sender.displayName} ({sender.smtpHost})</span>
              </div>
            </div>

            <span className={`connection ${sender.isActive ? '' : 'connection-warning'}`}>
              <i />
              {sender.isActive ? 'Active' : 'Inactive'}
            </span>

            <span className="sender-data">{sender.hourlyLimit} / hr</span>
            <span className="sender-data">{sender.minimumDelayMs / 1000} sec</span>

            <div className="sender-actions">
              <button className="toggle-mini" onClick={() => toggleActive(sender.id)}>
                <span className={sender.isActive ? 'on' : ''} />
              </button>
              <button
                className="more-button"
                onClick={() => {
                  setEditingSender(sender);
                  setModalOpen(true);
                }}
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
          </div>
        ))}

        {senders.length === 0 && (
          <div className="empty-state">
            <Users size={24} />
            <strong>No senders configured</strong>
            <span>Add an Ethereal SMTP sender to begin scheduling campaigns.</span>
          </div>
        )}
      </div>

      <div className="sender-note">
        <Sparkles size={17} />
        <span>
          <strong>Smart sending pacing enabled</strong> ReachInbox enforces atomic delay intervals between sends.
        </span>
      </div>

      {modalOpen && (
        <SenderModal
          sender={editingSender}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function SenderModal({
  sender,
  onClose,
  onSave,
}: {
  sender: Sender | null;
  onClose: () => void;
  onSave: (payload: CreateSenderPayload) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(sender?.displayName || '');
  const [fromEmail, setFromEmail] = useState(sender?.fromEmail || '');
  const [fromName, setFromName] = useState(sender?.fromName || '');
  const [smtpHost, setSmtpHost] = useState(sender?.smtpHost || 'smtp.ethereal.email');
  const [smtpPort, setSmtpPort] = useState(sender?.smtpPort || 587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState(sender?.hourlyLimit || 100);
  const [minDelaySec, setMinDelaySec] = useState((sender?.minimumDelayMs || 2000) / 1000);
  const [isActive, setIsActive] = useState(sender?.isActive ?? true);
  const [showSmtp, setShowSmtp] = useState(!sender);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !fromEmail || !smtpHost) {
      alert('Please fill out required fields');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        displayName,
        fromEmail,
        fromName: fromName || displayName,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUsername: smtpUsername || fromEmail,
        smtpPassword: smtpPassword || (sender ? undefined : 'password'),
        hourlyLimit: Number(hourlyLimit),
        minimumDelayMs: Number(minDelaySec) * 1000,
        isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="campaign-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{sender ? 'Edit sender' : 'Add sender'}</span>
            <h2>{sender ? 'Update sender details' : 'Connect a new sender'}</h2>
          </div>
          <button className="close-button" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="modal-form">
              <div className="field-group">
                <label>Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Olivia Lee"
                  required
                />
              </div>

              <div className="field-group">
                <label>From email</label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="olivia@ethereal.email"
                  required
                />
              </div>

              <div className="field-group">
                <label>From name</label>
                <input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Olivia Lee"
                />
              </div>

              <button
                type="button"
                className="smtp-toggle"
                onClick={() => setShowSmtp(!showSmtp)}
              >
                <span>SMTP configuration</span>
                {showSmtp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>

              {showSmtp && (
                <div className="smtp-section">
                  <div className="field-group">
                    <label>SMTP host</label>
                    <input
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.ethereal.email"
                      required
                    />
                  </div>

                  <div className="smtp-row">
                    <div className="field-group">
                      <label>SMTP port</label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        placeholder="587"
                        required
                      />
                    </div>
                    <div className="field-group">
                      <label>Username</label>
                      <input
                        value={smtpUsername}
                        onChange={(e) => setSmtpUsername(e.target.value)}
                        placeholder={fromEmail || 'ethereal.user'}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label>{sender ? 'Password (Leave blank to keep existing)' : 'SMTP password'}</label>
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder="••••••••"
                      required={!sender}
                    />
                  </div>

                  <div className="smtp-note">
                    <ShieldCheck size={14} />
                    <span>Credentials are stored with AES-256-GCM authenticated encryption.</span>
                  </div>
                </div>
              )}

              <div className="slider-field">
                <div>
                  <label>Hourly sending limit</label>
                  <strong>{hourlyLimit} emails / hour</strong>
                </div>
                <div className="slider-row">
                  <input
                    type="range"
                    min="1"
                    max="500"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="numeric-input"
                    min="1"
                    max="5000"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="slider-field">
                <div>
                  <label>Minimum delay between emails</label>
                  <strong>{minDelaySec} seconds</strong>
                </div>
                <div className="slider-row">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={minDelaySec}
                    onChange={(e) => setMinDelaySec(Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="numeric-input"
                    min="1"
                    max="120"
                    value={minDelaySec}
                    onChange={(e) => setMinDelaySec(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-toggle">
                <div>
                  <strong>Active status</strong>
                  <span>Allow this sender to be used in outgoing campaigns.</span>
                </div>
                <button
                  type="button"
                  className={`toggle ${isActive ? 'on' : ''}`}
                  onClick={() => setIsActive(!isActive)}
                >
                  <i />
                </button>
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="cancel-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="create-button" disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : null}
              {sender ? 'Save changes' : 'Add sender'} <ChevronRight size={15} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Integrations View (Slack OAuth) ---------- */

function Integrations({
  status,
  onRefresh,
}: {
  status: SlackConnection | null;
  onRefresh: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const isConnected = !!status?.connected;

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await api.slack.disconnect();
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to disconnect Slack');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow="Workspace / Integrations"
        title="Connect your workspace"
        description="Receive instant alerts when a sender reaches their hourly limit."
      />

      <div className="integration-grid">
        <div className="integration-card panel">
          <div className="integration-logo slack-logo">
            <span /><span /><span /><span />
          </div>
          <div className="integration-copy">
            <h2>Slack notifications</h2>
            <p>Get an immediate alert the moment a sender reaches their configured hourly threshold.</p>
          </div>

          <div className="slack-detail">
            <div>
              <span>Workspace</span>
              <strong>{isConnected ? status?.teamName : 'Not connected'}</strong>
            </div>
            <div>
              <span>Channel</span>
              <strong>{isConnected ? `#${status?.channelName}` : '—'}</strong>
            </div>
          </div>

          {isConnected ? (
            <button
              className="disconnect-button"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
              <span>{disconnecting ? 'Disconnecting...' : 'Connected (Click to Disconnect)'}</span>
            </button>
          ) : (
            <a href={`${API_BASE_URL}/api/v1/integrations/slack/connect`} className="slack-button" style={{ textDecoration: 'none' }}>
              <Link2 size={15} /> Connect Slack
            </a>
          )}
        </div>

        <div className="integration-card panel coming-card">
          <div className="integration-logo app-logo"><Mail size={22} /></div>
          <div className="integration-copy">
            <h2>Ethereal Email Transport</h2>
            <p>Fake SMTP testing transport active and verified on BullMQ workers.</p>
          </div>
          <span className="coming-soon" style={{ color: '#57ab5a', borderColor: '#238636' }}>Active</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Settings View ---------- */

function SettingsView({ user, slackStatus }: { user: User; slackStatus: SlackConnection | null }) {
  const [tab, setTab] = useState<'account' | 'sending' | 'integrations'>('account');

  return (
    <div className="content-wrap">
      <PageHeading
        eyebrow="Workspace / Settings"
        title="Settings"
        description="A few focused controls for your ReachInbox workspace."
      />

      <div className="settings-layout">
        <div className="settings-nav panel">
          <button
            className={`settings-tab ${tab === 'account' ? 'active' : ''}`}
            onClick={() => setTab('account')}
          >
            Account <ChevronRight size={15} />
          </button>
          <button
            className={`settings-tab ${tab === 'sending' ? 'active' : ''}`}
            onClick={() => setTab('sending')}
          >
            Sending <ChevronRight size={15} />
          </button>
          <button
            className={`settings-tab ${tab === 'integrations' ? 'active' : ''}`}
            onClick={() => setTab('integrations')}
          >
            Integrations <ChevronRight size={15} />
          </button>
        </div>

        <div className="panel settings-form">
          {tab === 'account' && (
            <>
              <div className="form-section">
                <div>
                  <p className="section-kicker">Account</p>
                  <h2>Your profile</h2>
                </div>
              </div>
              <label>
                Display name
                <input value={user.name} readOnly />
              </label>
              <label>
                Email
                <input value={user.email} readOnly />
              </label>
              <label>
                Member Since
                <input value={new Date(user.createdAt).toLocaleDateString()} readOnly />
              </label>
            </>
          )}

          {tab === 'sending' && (
            <>
              <div className="form-section">
                <div>
                  <p className="section-kicker">Sending</p>
                  <h2>Sending preferences</h2>
                </div>
              </div>
              <div className="form-toggle">
                <div>
                  <strong>BullMQ Delayed Scheduling</strong>
                  <span>Redis-backed jobs without cron or in-memory timers.</span>
                </div>
                <div className="toggle on"><i /></div>
              </div>
              <div className="form-toggle">
                <div>
                  <strong>Exponential Backoff Retries</strong>
                  <span>Transient SMTP rejections automatically retry via Lua reservation.</span>
                </div>
                <div className="toggle on"><i /></div>
              </div>
            </>
          )}

          {tab === 'integrations' && (
            <>
              <div className="form-section">
                <div>
                  <p className="section-kicker">Integrations</p>
                  <h2>Connected services</h2>
                </div>
              </div>
              <div className="integration-row">
                <div className="integration-logo slack-logo small-logo">
                  <span /><span /><span /><span />
                </div>
                <div>
                  <strong>Slack notifications</strong>
                  <small>{slackStatus?.connected ? `Connected to #${slackStatus.channelName}` : 'Not connected'}</small>
                </div>
                {slackStatus?.connected ? (
                  <span className="status-badge status-sent"><i /> Active</span>
                ) : (
                  <a href={`${API_BASE_URL}/api/v1/integrations/slack/connect`} className="slack-button" style={{ textDecoration: 'none' }}>
                    <Link2 size={15} /> Connect
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Campaign Creation Modal (Real CSV & Schedule Wizard) ---------- */

function CampaignModal({
  senders,
  onClose,
  onSuccess,
}: {
  senders: Sender[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(1);
  const steps = ['Basics', 'Recipients', 'Schedule', 'Review'];

  const activeSenders = senders.filter((s) => s.isActive);
  const [selectedSenderId, setSelectedSenderId] = useState(activeSenders[0]?.id || '');
  const [subject, setSubject] = useState('A thoughtful way to scale your outbound');
  const [body, setBody] = useState(
    'Hi there,\n\nI came across your work and had a thought worth sharing regarding outbound outreach.\n\nBest,\nOlivia',
  );

  // File & Client-side pre-parsed stats
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<'empty' | 'uploading' | 'ready'>('empty');
  const [detectedCount, setDetectedCount] = useState(0);
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicatesCount, setDuplicatesCount] = useState(0);

  // Schedule Parameters
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = new Date(Date.now() + 60000); // 1 minute from now
    return d.toISOString().slice(0, 16);
  });
  const [delaySec, setDelaySec] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(100);

  // When sender changes, update default limit & delay
  useEffect(() => {
    if (selectedSenderId) {
      const chosen = senders.find((s) => s.id === selectedSenderId);
      if (chosen) {
        setHourlyLimit(chosen.hourlyLimit);
        setDelaySec(chosen.minimumDelayMs / 1000);
      }
    }
  }, [selectedSenderId, senders]);

  // Client-side CSV file reader
  const handleFileDrop = (selectedFile: File) => {
    setFile(selectedFile);
    setUploadState('uploading');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      const seen = new Set<string>();
      const valid: string[] = [];
      let total = 0;
      let invalid = 0;
      let dups = 0;

      for (const line of lines) {
        const parts = line.split(/[,;\t]/).map((p) => p.trim().toLowerCase());
        let found = false;
        for (const part of parts) {
          if (emailRegex.test(part)) {
            total++;
            found = true;
            if (seen.has(part)) {
              dups++;
            } else {
              seen.add(part);
              valid.push(part);
            }
            break;
          }
        }
        if (!found && line !== 'email' && line !== 'email_address') {
          invalid++;
        }
      }

      setDetectedCount(total);
      setValidEmails(valid);
      setInvalidCount(invalid);
      setDuplicatesCount(dups);
      setUploadState('ready');
    };
    reader.readAsText(selectedFile);
  };

  // Schedule calculations
  const totalCount = validEmails.length || 0;
  const currentHourCapacity = hourlyLimit;
  const firstBatchSize = Math.min(currentHourCapacity, totalCount);
  const overflowCount = Math.max(0, totalCount - currentHourCapacity);

  const totalHoursRequired = Math.ceil(totalCount / hourlyLimit) || 1;
  const remainingInLastHour = totalCount % hourlyLimit || hourlyLimit;
  const startMs = new Date(startDateStr).getTime() || Date.now();
  const estimatedCompletionMs =
    startMs + (totalHoursRequired - 1) * 3600000 + (remainingInLastHour - 1) * (delaySec * 1000);
  const estimatedCompletionDate = new Date(estimatedCompletionMs);

  // Scheduling submission
  const [schedulingPhase, setSchedulingPhase] = useState<'idle' | 'preparing' | 'calculating' | 'creating' | 'done'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const downloadSampleCsv = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const csvContent =
      'email,first_name,last_name,company\n' +
      'alex.morgan@techcorp.io,Alex,Morgan,TechCorp\n' +
      'sarah.connor@cyberdyne.ai,Sarah,Connor,Cyberdyne AI\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_recipients.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleScheduleSubmit = async () => {
    if (!selectedSenderId) {
      alert('Please choose an active sender');
      return;
    }
    if (!file) {
      alert('Please upload a CSV file');
      return;
    }

    try {
      setSubmitError(null);
      setSchedulingPhase('preparing');

      const formData = new FormData();
      formData.append('senderId', selectedSenderId);
      formData.append('subject', subject);
      formData.append('body', body);
      formData.append('startAt', new Date(startDateStr).toISOString());
      formData.append('minimumDelayMs', (delaySec * 1000).toString());
      formData.append('hourlyLimit', hourlyLimit.toString());
      formData.append('file', file);

      setSchedulingPhase('calculating');
      const idempotencyKey = crypto.randomUUID();

      setSchedulingPhase('creating');
      await api.campaigns.createMultipart(formData, idempotencyKey);

      setSchedulingPhase('done');
    } catch (err: unknown) {
      console.error('Campaign creation failed:', err);
      setSchedulingPhase('idle');
      setSubmitError(err instanceof Error ? err.message : 'Failed to schedule campaign');
    }
  };

  const selectedSender = senders.find((s) => s.id === selectedSenderId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="campaign-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">New campaign</span>
            <h2>
              {schedulingPhase === 'done'
                ? 'Campaign scheduled'
                : schedulingPhase !== 'idle'
                ? 'Scheduling campaign'
                : 'Set up your outreach'}
            </h2>
          </div>
          {schedulingPhase === 'idle' && (
            <button className="close-button" onClick={onClose}><X size={18} /></button>
          )}
        </div>

        {submitError && (
          <div className="notice-banner error-banner" style={{ margin: '0 24px 16px' }}>
            <AlertCircle size={16} />
            <span>{submitError}</span>
          </div>
        )}

        {/* Phase Done Success View */}
        {schedulingPhase === 'done' ? (
          <div className="success-state">
            <div className="success-icon"><Check size={28} /></div>
            <h3>You're all set.</h3>
            <p>Your campaign has been committed to MySQL and dispatched to BullMQ for delayed execution.</p>
            <div className="success-summary">
              <span><Users size={15} /> {validEmails.length} recipients queued</span>
              <span><Clock3 size={15} /> First send: {formatDisplayDate(startDateStr)}</span>
              <span><CalendarClock size={15} /> Est. completion: {formatDisplayDate(estimatedCompletionDate.toISOString())}</span>
            </div>
            <button className="create-button" onClick={onSuccess}>
              Back to workspace
            </button>
          </div>
        ) : schedulingPhase !== 'idle' ? (
          /* Loading Steps View */
          <div className="scheduling-state">
            <div className="scheduling-icon">
              <Loader2 size={32} className="spin" />
            </div>
            <h3>Scheduling campaign</h3>
            <p>Please wait while your campaign is validated and scheduled.</p>
            <div className="scheduling-steps">
              <div className={`scheduling-step ${schedulingPhase === 'preparing' ? 'active' : 'done'}`}>
                <div className="scheduling-step-icon">
                  {schedulingPhase !== 'preparing' ? <Check size={14} /> : <Loader2 size={14} className="spin" />}
                </div>
                <div><strong>Validating CSV recipients</strong></div>
              </div>
              <div className={`scheduling-step ${schedulingPhase === 'calculating' ? 'active' : schedulingPhase === 'creating' ? 'done' : ''}`}>
                <div className="scheduling-step-icon">
                  {schedulingPhase === 'creating' ? <Check size={14} /> : schedulingPhase === 'calculating' ? <Loader2 size={14} className="spin" /> : <span>2</span>}
                </div>
                <div><strong>Reserving Redis Lua rate-limit slots</strong></div>
              </div>
              <div className={`scheduling-step ${schedulingPhase === 'creating' ? 'active' : ''}`}>
                <div className="scheduling-step-icon">
                  {schedulingPhase === 'creating' ? <Loader2 size={14} className="spin" /> : <span>3</span>}
                </div>
                <div><strong>Dispatching BullMQ delayed jobs</strong></div>
              </div>
            </div>
          </div>
        ) : (
          /* Stepper Wizard */
          <>
            <div className="stepper">
              {steps.map((label, index) => (
                <div
                  className={`step ${step > index + 1 ? 'done' : ''} ${step === index + 1 ? 'current' : ''}`}
                  key={label}
                >
                  <span>{step > index + 1 ? <Check size={13} /> : index + 1}</span>
                  <small>{label}</small>
                </div>
              ))}
            </div>

            <div className="modal-body">
              {/* Step 1: Basics */}
              {step === 1 && (
                <div className="modal-form">
                  <div className="field-group">
                    <label>Email subject</label>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="A thoughtful way to scale your outbound"
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label>From Sender</label>
                    <select
                      value={selectedSenderId}
                      onChange={(e) => setSelectedSenderId(e.target.value)}
                      className="input-select"
                      required
                    >
                      {activeSenders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName} ({s.fromEmail}) — {s.hourlyLimit}/hr
                        </option>
                      ))}
                      {activeSenders.length === 0 && (
                        <option value="">No active senders configured</option>
                      )}
                    </select>
                  </div>

                  <div className="field-group">
                    <label>Message</label>
                    <div className="editor">
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={6}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          outline: 'none',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                        placeholder="Write your email body here..."
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Recipients */}
              {step === 2 && (
                <div className="upload-step">
                  {uploadState === 'empty' && (
                    <>
                      <div className="upload-drop" style={{ position: 'relative' }}>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileDrop(e.target.files[0]);
                            }
                          }}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            opacity: 0,
                            cursor: 'pointer',
                            width: '100%',
                            height: '100%',
                          }}
                        />
                        <div className="upload-icon"><Upload size={20} /></div>
                        <h3>Drop your recipient CSV list here</h3>
                        <p>or click to browse a CSV file</p>
                        <small>Max 5,000 rows · CSV only</small>
                      </div>

                      {/* Required CSV Format Example Table */}
                      <div className="csv-format-card">
                        <div className="csv-format-header">
                          <div className="csv-format-title">
                            <FileText size={14} />
                            <span>Expected CSV format (headers & 2 sample rows)</span>
                          </div>
                          <button
                            type="button"
                            className="download-sample-btn"
                            onClick={downloadSampleCsv}
                          >
                            <Upload size={12} style={{ transform: 'rotate(180deg)' }} />
                            <span>Download sample CSV</span>
                          </button>
                        </div>
                        <div className="csv-table-wrapper">
                          <table className="csv-preview-table">
                            <thead>
                              <tr>
                                <th>email <span className="req-tag">required</span></th>
                                <th>first_name</th>
                                <th>last_name</th>
                                <th>company</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>alex.morgan@techcorp.io</td>
                                <td>Alex</td>
                                <td>Morgan</td>
                                <td>TechCorp</td>
                              </tr>
                              <tr>
                                <td>sarah.connor@cyberdyne.ai</td>
                                <td>Sarah</td>
                                <td>Connor</td>
                                <td>Cyberdyne AI</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="upload-tip">
                        <Sparkles size={15} />
                        <span><strong>Automatic Parsing:</strong> We normalize email addresses and remove duplicates.</span>
                      </div>
                    </>
                  )}

                  {uploadState === 'uploading' && (
                    <div className="processing-card">
                      <div className="file-icon"><FileText size={22} /></div>
                      <div>
                        <strong>{file?.name}</strong>
                        <span>Parsing recipient list...</span>
                      </div>
                      <Loader2 size={18} className="spin processing-check" />
                    </div>
                  )}

                  {uploadState === 'ready' && (
                    <>
                      <div className="processing-card">
                        <div className="file-icon"><FileText size={22} /></div>
                        <div>
                          <strong>{file?.name}</strong>
                          <span>File parsed successfully</span>
                          <Check className="processing-check" size={18} />
                        </div>
                      </div>

                      <div className="validation-grid">
                        <div>
                          <strong>{detectedCount}</strong>
                          <span>Total detected</span>
                        </div>
                        <div>
                          <strong>{validEmails.length}</strong>
                          <span>Valid recipients</span>
                        </div>
                        <div>
                          <strong className="error-text">{invalidCount}</strong>
                          <span>Invalid emails</span>
                        </div>
                        <div>
                          <strong>{duplicatesCount}</strong>
                          <span>Duplicates removed</span>
                        </div>
                      </div>

                      <div className="clean-list">
                        <div className="clean-list-head">
                          <span><Check size={14} /> Ready to send ({validEmails.length} leads)</span>
                        </div>
                        {validEmails.slice(0, 3).map((email, idx) => (
                          <div className="sample-recipient" key={idx}>
                            <span className="recipient-avatar" style={{ background: getAvatarColor(email) }}>
                              {getInitials(email)}
                            </span>
                            <span><strong>{email}</strong></span>
                            <Check size={15} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Schedule */}
              {step === 3 && (
                <div className="schedule-step">
                  <div className="schedule-grid">
                    <div className="field-group" style={{ gridColumn: 'span 2' }}>
                      <label>Start date & time</label>
                      <input
                        type="datetime-local"
                        value={startDateStr}
                        onChange={(e) => setStartDateStr(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="slider-field">
                    <div>
                      <label>Minimum delay between emails</label>
                      <strong>{delaySec} seconds</strong>
                    </div>
                    <div className="slider-row">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={delaySec}
                        onChange={(e) => setDelaySec(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        className="numeric-input"
                        min="0"
                        max="60"
                        value={delaySec}
                        onChange={(e) => setDelaySec(Number(e.target.value))}
                      />
                      <small>sec</small>
                    </div>
                  </div>

                  <div className="slider-field">
                    <div>
                      <label>Hourly sending limit</label>
                      <strong>{hourlyLimit} emails / hour</strong>
                    </div>
                    <div className="slider-row">
                      <input
                        type="range"
                        min="5"
                        max="200"
                        value={hourlyLimit}
                        onChange={(e) => setHourlyLimit(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        className="numeric-input"
                        min="1"
                        max="5000"
                        value={hourlyLimit}
                        onChange={(e) => setHourlyLimit(Number(e.target.value))}
                      />
                      <small>/ hr</small>
                    </div>
                  </div>

                  {/* Real Scheduling Preview */}
                  <div className="schedule-preview">
                    <div className="preview-heading">
                      <span><Sparkles size={14} /> Real-Time Rate-Limiting Projection</span>
                      <span className="estimate-note">Redis Lua Model</span>
                    </div>
                    <div className="preview-stats">
                      <div><span>First send</span><strong>{formatDisplayDate(startDateStr)}</strong></div>
                      <div><span>Slot 1 capacity</span><strong>{firstBatchSize} emails ({firstBatchSize}/{hourlyLimit})</strong></div>
                      <div><span>Overflow into future hours</span><strong>{overflowCount} leads shifted</strong></div>
                      <div><span>Total leads queued</span><strong>{totalCount} leads</strong></div>
                      <div><span>Estimated completion</span><strong>{formatDisplayDate(estimatedCompletionDate.toISOString())}</strong></div>
                    </div>

                    <div className="preview-batches">
                      <div className="preview-line">
                        <div className="preview-dot active" />
                        <div><strong>Hour 1</strong><span>{firstBatchSize} emails dispatched</span></div>
                        <b>{firstBatchSize}</b>
                      </div>
                      {overflowCount > 0 && (
                        <div className="preview-line">
                          <div className="preview-dot" />
                          <div><strong>Hour 2+</strong><span>Remaining {overflowCount} emails automatically paced</span></div>
                          <b>{overflowCount}</b>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && (
                <div className="review-step">
                  <div className="review-hero">
                    <div className="campaign-avatar campaign-gold">{getInitials(subject)}</div>
                    <div>
                      <h3>{subject}</h3>
                      <span>From {selectedSender?.fromEmail || 'selected sender'}</span>
                    </div>
                    <CampaignStatusBadge status="SCHEDULED" />
                  </div>

                  <div className="review-details">
                    <div><span>Sender</span><strong>{selectedSender?.displayName} ({selectedSender?.fromEmail})</strong></div>
                    <div><span>Subject</span><strong>{subject}</strong></div>
                    <div><span>Recipients</span><strong>{validEmails.length} valid contacts</strong></div>
                    <div><span>Start time</span><strong>{formatDisplayDate(startDateStr)}</strong></div>
                    <div><span>Minimum delay</span><strong>{delaySec} seconds</strong></div>
                    <div><span>Hourly limit</span><strong>{hourlyLimit} emails / hour</strong></div>
                    <div><span>Estimated completion</span><strong>{formatDisplayDate(estimatedCompletionDate.toISOString())}</strong></div>
                  </div>

                  <div className="review-callout">
                    <ShieldCheck size={17} />
                    <span>Your campaign will be queued in BullMQ and executed by concurrent Ethereal SMTP workers.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button
                className="cancel-button"
                onClick={step === 1 ? onClose : () => setStep(step - 1)}
              >
                {step === 1 ? 'Cancel' : 'Back'}
              </button>

              <button
                className="create-button"
                onClick={() => {
                  if (step < 4) {
                    if (step === 2 && validEmails.length === 0) {
                      alert('Please upload a valid CSV with at least one recipient');
                      return;
                    }
                    setStep(step + 1);
                  } else {
                    handleScheduleSubmit();
                  }
                }}
              >
                {step === 4 ? 'Schedule campaign' : 'Continue'} <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Email Detail Drawer (With Real Retries & Attempts) ---------- */

function EmailDrawer({
  email,
  onClose,
  onRetried,
}: {
  email: Email;
  onClose: () => void;
  onRetried: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);
  const [detailEmail, setDetailEmail] = useState<Email>(email);

  // Load complete details including attempt audit history
  useEffect(() => {
    let isMounted = true;
    api.emails.getById(email.id)
      .then((full) => {
        if (isMounted) setDetailEmail(full);
      })
      .catch((err) => console.warn('Could not load email attempts:', err));

    return () => {
      isMounted = false;
    };
  }, [email.id]);

  const handleRetry = async () => {
    try {
      setRetrying(true);
      await api.emails.retry(email.id);
      setRetrySuccess(true);
      setTimeout(() => {
        onRetried();
      }, 800);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retry email');
    } finally {
      setRetrying(false);
    }
  };

  const attempts = detailEmail.attempts || [];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="email-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Email detail</span>
            <h2>{detailEmail.status === 'SENT' ? 'Delivered email' : detailEmail.status === 'FAILED' ? 'Failed delivery' : 'Scheduled email'}</h2>
          </div>
          <button className="close-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="drawer-status">
          <EmailStatusBadge status={detailEmail.status} />
          <span>{formatDisplayDate(detailEmail.scheduledAt || detailEmail.requestedAt)}</span>
        </div>

        <div className="drawer-subject">
          <span>Subject</span>
          <h3>{detailEmail.subject || '—'}</h3>
        </div>

        <div className="drawer-meta">
          <div><span>Recipient</span><strong>{detailEmail.recipientEmail}</strong></div>
          <div><span>Sequence</span><strong>#{detailEmail.sequenceNo}</strong></div>
          <div><span>Requested time</span><strong>{formatDisplayDate(detailEmail.requestedAt)}</strong></div>
          <div><span>Scheduled time</span><strong>{formatDisplayDate(detailEmail.scheduledAt)}</strong></div>
          <div><span>Sent time</span><strong>{formatDisplayDate(detailEmail.sentAt)}</strong></div>
          {detailEmail.providerMessageId && (
            <div><span>Message ID</span><strong style={{ fontSize: 11 }}>{detailEmail.providerMessageId}</strong></div>
          )}
        </div>

        {detailEmail.previewUrl && (
          <div style={{ padding: '0 24px 16px' }}>
            <a
              href={detailEmail.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="create-button"
              style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
            >
              <span>View Ethereal HTML Inbox Preview</span>
              <ExternalLink size={15} />
            </a>
          </div>
        )}

        <div className="drawer-divider" />

        {/* Attempt History */}
        <div className="attempt-heading">
          <span>Delivery attempt audit</span>
          <span>{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="timeline">
          {attempts.map((attempt) => (
            <div
              className={`timeline-item ${attempt.status === 'FAILED' ? 'failed' : 'complete'}`}
              key={attempt.id || attempt.attemptNumber}
            >
              <div>{attempt.status === 'FAILED' ? <X size={12} /> : <Check size={12} />}</div>
              <section>
                <strong>
                  Attempt {attempt.attemptNumber} — {attempt.status === 'SENT' ? 'Delivered' : attempt.status}
                </strong>
                <span>Scheduled: {formatDisplayDate(attempt.scheduledAt)}</span>
                {attempt.smtpMessageId && (
                  <span className="provider-id">Provider ID: {attempt.smtpMessageId}</span>
                )}
                {attempt.errorMessage && (
                  <span className="failure-info">
                    <AlertCircle size={11} /> {attempt.errorCode ? `[${attempt.errorCode}] ` : ''}{attempt.errorMessage}
                  </span>
                )}
              </section>
            </div>
          ))}

          {attempts.length === 0 && (
            <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--muted-text)' }}>
              No previous attempts recorded yet.
            </div>
          )}
        </div>

        <div className="drawer-footer">
          {detailEmail.status === 'FAILED' && (
            <button
              className="create-button"
              onClick={handleRetry}
              disabled={retrying || retrySuccess}
            >
              {retrying ? (
                <><Loader2 size={15} className="spin" /> Retrying...</>
              ) : retrySuccess ? (
                <><Check size={15} /> Retry scheduled</>
              ) : (
                <><RefreshCw size={15} /> Retry email</>
              )}
            </button>
          )}
          <button className="cancel-button" onClick={onClose}>Close</button>
        </div>
      </aside>
    </div>
  );
}

/* ---------- Campaign Detail Drawer ---------- */

function CampaignDrawer({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const percent = Math.round((campaign.sentCount / (campaign.totalRecipients || 1)) * 100);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="email-drawer campaign-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Campaign detail</span>
            <h2>{campaign.subject}</h2>
          </div>
          <button className="close-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="drawer-status">
          <CampaignStatusBadge status={campaign.status} />
          <span>Started: {formatDisplayDate(campaign.requestedStartAt)}</span>
        </div>

        <div className="campaign-drawer-progress">
          <div
            className="cdp-ring"
            style={{
              background: `conic-gradient(var(--maroon) 0 ${percent}%, #eee5e3 ${percent}% 100%)`,
            }}
          >
            <div className="cdp-center">
              <strong>{percent}%</strong>
              <small>complete</small>
            </div>
          </div>
          <div className="cdp-stats">
            <span><b>{campaign.sentCount}</b> sent</span>
            <span><b>{campaign.scheduledCount}</b> scheduled</span>
            <span className={campaign.failedCount > 0 ? 'failed-stat' : ''}>
              <b>{campaign.failedCount}</b> failed
            </span>
          </div>
        </div>

        <div className="drawer-divider" />

        <div className="drawer-meta">
          <div><span>Sender</span><strong>{campaign.sender?.fromEmail || 'Active Sender'}</strong></div>
          <div><span>Total recipients</span><strong>{campaign.totalRecipients}</strong></div>
          <div><span>Hourly limit</span><strong>{campaign.hourlyLimit} / hr</strong></div>
          <div><span>Minimum delay</span><strong>{campaign.minimumDelayMs / 1000} sec</strong></div>
          <div><span>Created</span><strong>{formatDisplayDate(campaign.createdAt)}</strong></div>
        </div>

        <div className="drawer-divider" />

        <div className="attempt-heading"><span>Queue Execution Timeline</span></div>
        <div className="timeline">
          <div className="timeline-item complete">
            <div><Check size={12} /></div>
            <section>
              <strong>Campaign created in MySQL & Outbox</strong>
              <span>{formatDisplayDate(campaign.createdAt)}</span>
            </section>
          </div>
          {campaign.status === 'RUNNING' && (
            <div className="timeline-item complete">
              <div><Send size={12} /></div>
              <section>
                <strong>Sending in progress via BullMQ</strong>
                <span>{campaign.sentCount} of {campaign.totalRecipients} delivered</span>
              </section>
            </div>
          )}
          {campaign.status === 'COMPLETED' && (
            <div className="timeline-item complete">
              <div><Check size={12} /></div>
              <section>
                <strong>Campaign completed</strong>
                <span>All {campaign.sentCount} emails delivered</span>
              </section>
            </div>
          )}
          {campaign.status === 'COMPLETED_WITH_FAILURES' && (
            <div className="timeline-item failed">
              <div><AlertCircle size={12} /></div>
              <section>
                <strong>Finished with failures</strong>
                <span>{campaign.failedCount} emails failed permanent checks</span>
              </section>
            </div>
          )}
          {campaign.status === 'SCHEDULED' && (
            <div className="timeline-item">
              <div><Clock3 size={12} /></div>
              <section>
                <strong>Delayed in BullMQ queue</strong>
                <span>First slot: {formatDisplayDate(campaign.requestedStartAt)}</span>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ---------- Global Search (Command+K with Elasticsearch) ---------- */

function GlobalSearch({
  value,
  setValue,
  onClose,
  onSelectEmail,
}: {
  value: string;
  setValue: (v: string) => void;
  onClose: () => void;
  onSelectEmail: (email: Email) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [esEmails, setEsEmails] = useState<Email[]>([]);

  // Debounced search on Elasticsearch
  useEffect(() => {
    if (!value.trim()) {
      setEsEmails([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await api.search.emails(value.trim());
        setEsEmails(res.items);
      } catch (err) {
        console.warn('Elasticsearch search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="search-backdrop" onClick={onClose}>
      <div className="global-search" onClick={(e) => e.stopPropagation()}>
        <div className="global-search-input">
          <Search size={18} />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search leads, subjects, content via Elasticsearch..."
          />
          {loading ? <Loader2 size={16} className="spin" /> : <kbd>ESC</kbd>}
        </div>

        <div className="search-results">
          {!loading && value && esEmails.length === 0 && (
            <div className="search-empty">
              <Search size={22} />
              <span>No Elasticsearch results for "{value}"</span>
            </div>
          )}

          {esEmails.length > 0 && (
            <>
              <span className="results-label">Elasticsearch Matches ({esEmails.length})</span>
              {esEmails.map((email) => (
                <button
                  key={email.id}
                  className="search-result"
                  onClick={() => onSelectEmail(email)}
                >
                  <span
                    className="recipient-avatar"
                    style={{ background: getAvatarColor(email.recipientEmail) }}
                  >
                    {getInitials(email.recipientEmail)}
                  </span>
                  <span>
                    <strong>{email.recipientEmail}</strong>
                    <small>{email.subject || '—'}</small>
                  </span>
                  <EmailStatusBadge status={email.status} />
                  <ChevronRight size={15} />
                </button>
              ))}
            </>
          )}

          {!value && (
            <div className="search-empty" style={{ padding: '24px 0' }}>
              <span style={{ fontSize: 12 }}>Type a recipient address or subject line to query Elasticsearch.</span>
            </div>
          )}
        </div>

        <div className="search-foot">
          <span><kbd>ESC</kbd> Close</span>
          <span>Powered by Elasticsearch 8</span>
        </div>
      </div>
    </div>
  );
}

export default App;
