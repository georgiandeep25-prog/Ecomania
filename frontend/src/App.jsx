import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  configuredContractId,
  configuredNetworkPassphrase,
  connectWallet,
  discoverWalletState,
  formatActionCount,
  formatDate,
  formatDayCount,
  getContractExplorerLink,
  getExplorerLink,
  getNetworkLabel,
  hasContractConfig,
  logEcoAction,
  parseError,
  readContractActivity,
  readDashboard,
  readRecentEcoActions,
  saveProfile,
  shortAddress,
  updateWeeklyGoal
} from "./lib/ecomania";

const actionTypeOptions = [
  "Recycling",
  "Public Transport",
  "Tree Planting",
  "Energy Saving",
  "Water Saving",
  "Composting",
  "Reusable Bag",
  "Bike Ride"
];

const emptyWallet = {
  account: "",
  network: "",
  networkPassphrase: "",
  rpcUrl: "",
  isConnecting: false,
  error: ""
};

const emptyTx = {
  status: "idle",
  message: "",
  hash: ""
};

function BrandMark() {
  return (
    <svg className="logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="leafGradient" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <path d="M50 10C50 10 20 40 20 65C20 81.5685 33.4315 95 50 95C66.5685 95 80 81.5685 80 65C80 40 50 10 50 10Z" stroke="url(#leafGradient)" strokeWidth="2" strokeLinecap="round"/>
      <path d="M50 20C50 20 30 45 30 65C30 76.0457 38.9543 85 50 85C61.0457 85 70 76.0457 70 65C70 45 50 20 50 20Z" stroke="url(#leafGradient)" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round"/>
      <line x1="50" y1="95" x2="50" y2="40" stroke="url(#leafGradient)" strokeWidth="1" strokeOpacity="0.4"/>
    </svg>
  );
}

function Section({ eyebrow, title, children, className = "" }) {
  return (
    <section className={`glass-card ${className}`}>
      <div className="section-content">
        <div className="section-title">
          <span className="kicker">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

function StatTile({ label, value, note, loading = false }) {
  return (
    <article className="glass-card section-content">
      <span className="kicker">{label}</span>
      <h2 className={loading ? "skeleton skeleton-value" : ""}>{loading ? "" : value}</h2>
      <span style={{color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '8px', display: 'block'}}>{loading ? <i className="skeleton skeleton-line" /> : note}</span>
    </article>
  );
}

function ActivitySkeleton() {
  return (
    <div className="activity-stack">
      {Array.from({ length: 4 }, (_, index) => (
        <article className="feed-item" key={index}>
          <i className="skeleton skeleton-chip" />
          <i className="skeleton skeleton-line" />
          <i className="skeleton skeleton-line short" />
        </article>
      ))}
    </div>
  );
}

function ActivityFeed({ activities, loading, walletAccount }) {
  if (loading) {
    return <ActivitySkeleton />;
  }

  if (!activities?.length) {
    return (
      <p className="empty-state">
        No recent contract events yet. The public ledger stream will fill as Ecomania users log
        planet-positive actions.
      </p>
    );
  }

  return (
    <div className="activity-stack">
      {activities.map((activity) => {
        const ownActivity = walletAccount && activity.ecoUser === walletAccount;

        return (
          <article className="feed-item" key={activity.id}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span className={`chip ${activity.accent === 'success' ? 'chip-success' : 'chip-info'}`}>{activity.badge}</span>
              <small className="data-mono" style={{color: 'var(--on-surface-variant)'}}>{ownActivity ? "Your wallet" : shortAddress(activity.ecoUser)}</small>
            </div>
            <h3 style={{fontSize: '16px', margin: '8px 0 4px'}}>{activity.title}</h3>
            <p style={{margin: '0', color: 'var(--on-surface-variant)', fontSize: '14px'}}>{activity.detail}</p>
            <div style={{display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px', color: 'var(--slate)'}}>
              <time>{formatDate(activity.timestamp)}</time>
              {activity.explorerLink ? (
                <a href={activity.explorerLink} target="_blank" rel="noreferrer" style={{color: 'var(--emerald)'}}>
                  tx ↗
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("analytics");
  const [wallet, setWallet] = useState(emptyWallet);
  const [txState, setTxState] = useState(emptyTx);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    weeklyGoalActions: "12"
  });
  const [goalForm, setGoalForm] = useState("16");
  const [actionForm, setActionForm] = useState({
    actionType: "Recycling",
    actionQuantity: "1"
  });

  useEffect(() => {
    let isMounted = true;
    let watcher = null;

    async function syncWallet() {
      try {
        const nextState = await discoverWalletState();
        if (!isMounted) {
          return;
        }

        setWallet((current) => ({
          ...current,
          ...nextState,
          isConnecting: false,
          error: ""
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setWallet((current) => ({
          ...current,
          isConnecting: false,
          error: parseError(error)
        }));
      }
    }

    async function startWatcher() {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const { WatchWalletChanges } = await import("@stellar/freighter-api");
        if (!isMounted) {
          return;
        }

        watcher = new WatchWalletChanges(3000);
        watcher.watch(() => {
          setTxState(emptyTx);
          syncWallet();
        });
      } catch {
        watcher = null;
      }
    }

    syncWallet();
    startWatcher();

    return () => {
      isMounted = false;
      watcher?.stop?.();
    };
  }, []);

  const wrongNetwork =
    Boolean(wallet.networkPassphrase) && wallet.networkPassphrase !== configuredNetworkPassphrase;
  const readyForReads = Boolean(wallet.account) && hasContractConfig() && !wrongNetwork;
  const readyForWrites = Boolean(wallet.account) && hasContractConfig() && !wrongNetwork;
  const contractExplorerLink = getContractExplorerLink();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", wallet.account, wallet.networkPassphrase],
    queryFn: () => readDashboard(wallet.account),
    enabled: readyForReads
  });

  const ecoActionsQuery = useQuery({
    queryKey: [
      "eco-actions",
      wallet.account,
      wallet.networkPassphrase,
      dashboardQuery.data?.actionCount || 0
    ],
    queryFn: () => readRecentEcoActions(wallet.account, 5),
    enabled: readyForReads && Boolean(dashboardQuery.data)
  });

  const activityQuery = useQuery({
    queryKey: ["activity", configuredContractId],
    queryFn: () => readContractActivity(8),
    enabled: hasContractConfig(),
    staleTime: 10_000,
    refetchInterval: 15_000
  });

  useEffect(() => {
    if (!dashboardQuery.data) {
      return;
    }

    setGoalForm(String(dashboardQuery.data.weeklyGoalActions));
    setProfileForm((current) => ({
      displayName: current.displayName || dashboardQuery.data.displayName,
      weeklyGoalActions: current.weeklyGoalActions || String(dashboardQuery.data.weeklyGoalActions)
    }));
  }, [dashboardQuery.data]);

  const dashboard = dashboardQuery.data;
  const weeklyProgress = useMemo(() => {
    if (!dashboard?.weeklyGoalActions) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((dashboard.actionsThisWeek / dashboard.weeklyGoalActions) * 100)
    );
  }, [dashboard]);

  const activitySummary = useMemo(() => {
    const activities = activityQuery.data || [];
    const ecoUsers = new Set(activities.map((activity) => activity.ecoUser).filter(Boolean));

    return {
      eventCount: activities.length,
      ecoUserCount: ecoUsers.size,
      goalReachedCount: activities.filter((activity) => activity.kind === "weekly_eco_goal_reached")
        .length,
      actionEventCount: activities.filter((activity) => activity.kind === "eco_action_logged")
        .length
    };
  }, [activityQuery.data]);

  const queryError = activityQuery.error || dashboardQuery.error || ecoActionsQuery.error;
  const txExplorerLink = getExplorerLink(wallet.networkPassphrase, txState.hash);

  async function runLedgerAction(action, pendingMessage, successMessage) {
    if (!wallet.account) {
      throw new Error("Connect Freighter before sending a transaction.");
    }

    if (wrongNetwork) {
      throw new Error(`Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`);
    }

    setTxState({
      status: "pending",
      message: pendingMessage,
      hash: ""
    });

    try {
      const result = await action();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["eco-actions", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] })
      ]);

      setTxState({
        status: "success",
        message: successMessage,
        hash: result.hash
      });
    } catch (error) {
      const message = parseError(error);
      setTxState({
        status: "error",
        message,
        hash: ""
      });
      throw error;
    }
  }

  const saveProfileMutation = useMutation({
    mutationFn: ({ displayName, weeklyGoalActions }) =>
      runLedgerAction(
        () => saveProfile(wallet.account, displayName, weeklyGoalActions),
        "Saving your public eco profile...",
        "Eco profile confirmed on Soroban."
      )
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ weeklyGoalActions }) =>
      runLedgerAction(
        () => updateWeeklyGoal(wallet.account, weeklyGoalActions),
        "Updating your weekly climate target...",
        "Weekly eco goal confirmed."
      )
  });

  const logActionMutation = useMutation({
    mutationFn: ({ actionType, actionQuantity }) =>
      runLedgerAction(
        () => logEcoAction(wallet.account, actionType, actionQuantity),
        "Submitting your eco action...",
        "Eco action confirmed on-chain."
      )
  });

  const anyMutationPending =
    saveProfileMutation.isPending || updateGoalMutation.isPending || logActionMutation.isPending;

  async function handleConnectWallet() {
    setWallet((current) => ({
      ...current,
      isConnecting: true,
      error: ""
    }));

    try {
      const nextState = await connectWallet();
      setWallet({
        ...emptyWallet,
        ...nextState,
        isConnecting: false
      });
    } catch (error) {
      setWallet((current) => ({
        ...current,
        isConnecting: false,
        error: parseError(error)
      }));
    }
  }

  function handleProfileSubmit(event) {
    event.preventDefault();

    const displayName = profileForm.displayName.trim();
    const weeklyGoalActions = Number(profileForm.weeklyGoalActions);

    if (!displayName) {
      setTxState({
        status: "error",
        message: "Add a display name before saving your eco profile.",
        hash: ""
      });
      return;
    }

    if (Number.isNaN(weeklyGoalActions) || weeklyGoalActions < 1 || weeklyGoalActions > 500) {
      setTxState({
        status: "error",
        message: "Weekly eco goals must stay between 1 and 500 actions.",
        hash: ""
      });
      return;
    }

    saveProfileMutation.mutate({
      displayName,
      weeklyGoalActions
    });
  }

  function handleGoalSubmit(event) {
    event.preventDefault();

    const weeklyGoalActions = Number(goalForm);
    if (Number.isNaN(weeklyGoalActions) || weeklyGoalActions < 1 || weeklyGoalActions > 500) {
      setTxState({
        status: "error",
        message: "Choose a weekly eco goal between 1 and 500 actions.",
        hash: ""
      });
      return;
    }

    updateGoalMutation.mutate({
      weeklyGoalActions
    });
  }

  function handleActionSubmit(event) {
    event.preventDefault();

    const actionType = actionForm.actionType.trim();
    const actionQuantity = Number(actionForm.actionQuantity);

    if (!actionType) {
      setTxState({
        status: "error",
        message: "Choose an eco action type before writing to Stellar.",
        hash: ""
      });
      return;
    }

    if (Number.isNaN(actionQuantity) || actionQuantity < 1 || actionQuantity > 100) {
      setTxState({
        status: "error",
        message: "Eco action quantities must stay between 1 and 100.",
        hash: ""
      });
      return;
    }

    logActionMutation.mutate({
      actionType,
      actionQuantity
    });
  }

  const liveStatusMessage =
    wallet.error ||
    (wrongNetwork
      ? `Connected to ${getNetworkLabel(wallet.networkPassphrase)}. Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`
      : txState.message ||
        (queryError
          ? parseError(queryError)
          : hasContractConfig()
            ? "Ledger reads are active. Connect Freighter to write your own climate-positive actions."
            : "Deploy the Ecomania contract and export the frontend config before using the app."));

  return (
    <main className="app-shell animate-fade-in">
      <nav className="topbar glass-card" style={{marginBottom: '32px', borderBottom: 'none'}}>
        <a className="brand" href="#impact">
          <BrandMark />
          <span>Ecomania</span>
        </a>
        <div style={{display: 'flex', gap: '16px', alignItems: 'center', color: 'var(--on-surface-variant)', fontSize: '14px'}}>
          <span className="data-mono">{getNetworkLabel(configuredNetworkPassphrase)}</span>
          {contractExplorerLink ? (
            <a href={contractExplorerLink} target="_blank" rel="noreferrer" style={{color: 'var(--emerald)'}}>
              {shortAddress(configuredContractId)} ↗
            </a>
          ) : (
            <span>No contract</span>
          )}
          <button className="button button-connect" onClick={handleConnectWallet} disabled={wallet.isConnecting}>
            {wallet.isConnecting ? "Connecting" : wallet.account ? "Wallet linked" : "Connect Freighter"}
          </button>
        </div>
      </nav>

      {liveStatusMessage && (
        <div className="glass-card section-content" style={{marginBottom: '24px', borderLeft: '3px solid var(--emerald)'}}>
          <span className="kicker">Live status</span>
          <p style={{margin: 0}}>{liveStatusMessage}</p>
          {txExplorerLink ? (
            <a href={txExplorerLink} target="_blank" rel="noreferrer" style={{color: 'var(--emerald)', display: 'block', marginTop: '8px', fontSize: '14px'}}>
              Inspect transaction ↗
            </a>
          ) : null}
        </div>
      )}

      <div className="dashboard-grid">
        <aside className="col-span-3 sidebar">
          <div className="glass-card section-content">
            <span className="kicker" style={{display: 'block', marginBottom: '16px'}}>Navigation</span>
            <nav className="sidebar">
              <button className={`nav-link ${activeTab === 'analytics' ? 'nav-link-active' : ''}`} onClick={() => setActiveTab('analytics')}>
                Analytics
              </button>
              <button className={`nav-link ${activeTab === 'ledger' ? 'nav-link-active' : ''}`} onClick={() => setActiveTab('ledger')}>
                Action Ledger
              </button>
              <button className={`nav-link ${activeTab === 'registry' ? 'nav-link-active' : ''}`} onClick={() => setActiveTab('registry')}>
                Entity Registry
              </button>
              <button className={`nav-link ${activeTab === 'governance' ? 'nav-link-active' : ''}`} onClick={() => setActiveTab('governance')}>
                Governance
              </button>
            </nav>
          </div>
          
          <div className="glass-card section-content" style={{marginTop: '24px'}}>
            <span className="kicker">Soroban pulse</span>
            <div style={{display: 'flex', justifyContent: 'space-between', margin: '16px 0', paddingBottom: '16px', borderBottom: '1px solid var(--glass-border)'}}>
              <div style={{textAlign: 'center'}}>
                <strong style={{color: 'var(--emerald)', display: 'block', fontSize: '20px'}}>{activitySummary.actionEventCount}</strong>
                <span className="kicker" style={{fontSize: '10px'}}>actions</span>
              </div>
              <div style={{textAlign: 'center', borderLeft: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', padding: '0 16px'}}>
                <strong style={{color: 'var(--emerald)', display: 'block', fontSize: '20px'}}>{activitySummary.goalReachedCount}</strong>
                <span className="kicker" style={{fontSize: '10px'}}>goals</span>
              </div>
              <div style={{textAlign: 'center'}}>
                <strong style={{color: 'var(--emerald)', display: 'block', fontSize: '20px'}}>{activitySummary.ecoUserCount}</strong>
                <span className="kicker" style={{fontSize: '10px'}}>wallets</span>
              </div>
            </div>
            <p style={{fontSize: '12px', color: 'var(--on-surface-variant)', margin: 0}}>Total public contract interactions observed on testnet.</p>
          </div>
        </aside>

        <div className="col-span-9" style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
          
          {activeTab === 'analytics' && (
            <>
              <div className="glass-card section-content" style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(9, 13, 10, 0.9) 100%)',
                display: 'flex', flexDirection: 'column', gap: '16px'
              }}>
                <span className="kicker">Public climate ledger</span>
                <h1>Track small green actions with on-chain proof.</h1>
                <p style={{color: 'var(--on-surface-variant)', fontSize: '18px', maxWidth: '800px', margin: 0}}>
                  Ecomania turns recycling, conservation, transit, and low-waste habits into a weekly
                  sustainability record on Stellar.
                </p>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px'}}>
                  <div style={{flex: 1}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                      <span className="kicker">Weekly Progress</span>
                      <span className="data-mono">{dashboard ? `${weeklyProgress}%` : "0%"}</span>
                    </div>
                    <div className="progress-bg">
                      <div className="progress-fill" style={{width: `${weeklyProgress}%`}}></div>
                    </div>
                  </div>
                  <div style={{background: 'var(--glass-bg)', padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--glass-border)', textAlign: 'center'}}>
                    <h2 style={{color: 'var(--emerald)', margin: '0 0 4px'}}>{dashboard ? formatDayCount(dashboard.currentStreak) : "0 days"}</h2>
                    <span className="kicker" style={{margin: 0}}>Climate Streak</span>
                  </div>
                </div>
              </div>

              <div className="dashboard-grid" style={{marginTop: 0}}>
                <div className="col-span-4"><StatTile
                  label="All actions"
                  value={dashboard ? formatActionCount(dashboard.totalActions) : "0 actions"}
                  note={dashboard ? `${dashboard.actionCount} ledger entries` : "Connect to create a profile"}
                  loading={dashboardQuery.isLoading}
                /></div>
                <div className="col-span-4"><StatTile
                  label="This week"
                  value={dashboard ? formatActionCount(dashboard.actionsThisWeek) : "0 actions"}
                  note={
                    dashboard
                      ? `${formatActionCount(Math.max(dashboard.weeklyGoalActions - dashboard.actionsThisWeek, 0))} remaining`
                      : "Weekly target not set"
                  }
                  loading={dashboardQuery.isLoading}
                /></div>
                <div className="col-span-4"><StatTile
                  label="Public feed"
                  value={`${activitySummary.eventCount} events`}
                  note={`${activitySummary.ecoUserCount} eco wallets`}
                  loading={activityQuery.isLoading}
                /></div>
              </div>
            </>
          )}

          {activeTab === 'ledger' && (
            <div className="dashboard-grid" style={{marginTop: 0}}>
              <div className="col-span-6">
                <Section eyebrow="Action cockpit" title="Log today’s planet-positive move">
                  <form className="form-grid" onSubmit={handleActionSubmit} style={{gridTemplateColumns: '1fr', gap: '16px'}}>
                    <label>
                      <span>Eco action type</span>
                      <select
                        value={actionForm.actionType}
                        onChange={(event) =>
                          setActionForm((current) => ({ ...current, actionType: event.target.value }))
                        }
                      >
                        {actionTypeOptions.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Action quantity</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={actionForm.actionQuantity}
                        onChange={(event) =>
                          setActionForm((current) => ({
                            ...current,
                            actionQuantity: event.target.value
                          }))
                        }
                      />
                    </label>
                    <button className="button button-primary" type="submit" disabled={anyMutationPending || !readyForWrites || !dashboard}>
                      {logActionMutation.isPending ? "Logging..." : "Log action"}
                    </button>
                  </form>
                </Section>
                <Section eyebrow="Wallet history" title="Latest confirmed actions" className="margin-top-24" style={{marginTop: '24px'}}>
                  {ecoActionsQuery.isLoading ? (
                    <ActivitySkeleton />
                  ) : ecoActionsQuery.data?.length ? (
                    <div className="activity-stack">
                      {ecoActionsQuery.data.map((action) => (
                        <article className="feed-item" key={action.id} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div>
                            <h3 style={{fontSize: '16px', margin: '0 0 4px'}}>{action.actionType}</h3>
                            <p style={{margin: '0', color: 'var(--on-surface-variant)', fontSize: '14px'}}>{formatDate(action.timestamp)}</p>
                          </div>
                          <div style={{textAlign: 'right'}}>
                            <strong style={{color: 'var(--emerald)', fontSize: '18px', display: 'block'}}>{formatActionCount(action.actionQuantity)}</strong>
                            <span className="kicker" style={{margin: 0, fontSize: '10px'}}>streak {action.streakAfterLog}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">
                      {dashboard
                        ? "Your wallet history will appear after your first confirmed eco action."
                        : "Connect Freighter and create an eco profile to load wallet history."}
                    </p>
                  )}
                </Section>
              </div>

              <div className="col-span-6">
                <Section eyebrow="Live stream" title="Public ledger events">
                  <ActivityFeed
                    activities={activityQuery.data}
                    loading={activityQuery.isLoading}
                    walletAccount={wallet.account}
                  />
                </Section>
              </div>
            </div>
          )}

          {activeTab === 'registry' && (
            <Section eyebrow="Eco profile" title="Name your public climate record">
              <form className="form-grid" onSubmit={handleProfileSubmit} style={{gridTemplateColumns: '1fr 1fr', alignItems: 'end'}}>
                <label>
                  <span>Display name</span>
                  <input
                    type="text"
                    placeholder="Green Harbor"
                    value={profileForm.displayName}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, displayName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Weekly eco goal</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    step="1"
                    value={profileForm.weeklyGoalActions}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        weeklyGoalActions: event.target.value
                      }))
                    }
                  />
                </label>
                <button className="button button-primary" type="submit" disabled={anyMutationPending || !readyForWrites} style={{gridColumn: 'span 2'}}>
                  {saveProfileMutation.isPending ? "Saving..." : "Save profile"}
                </button>
              </form>
            </Section>
          )}

          {activeTab === 'governance' && (
            <>
              {!hasContractConfig() ? (
                <Section eyebrow="Setup" title="Deploy the sustainability contract" style={{marginBottom: '24px'}}>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--slate)'}}>
                    <code>stellar keys generate alice --network testnet --fund</code>
                    <code>npm run contract:build</code>
                    <code>STELLAR_CONTRACT_ALIAS=eco_mania npm run contract:deploy</code>
                    <code>npm run export:frontend</code>
                  </div>
                </Section>
              ) : null}

              <div className="dashboard-grid" style={{marginTop: 0}}>
                <div className="col-span-6">
                  <Section eyebrow="Target" title="Rebalance the weekly goal">
                    <form className="form-grid" onSubmit={handleGoalSubmit} style={{gridTemplateColumns: '1fr', gap: '16px'}}>
                      <label>
                        <span>New weekly target</span>
                        <input
                          type="number"
                          min="1"
                          max="500"
                          step="1"
                          value={goalForm}
                          onChange={(event) => setGoalForm(event.target.value)}
                        />
                      </label>
                      <button className="button button-secondary" type="submit" disabled={anyMutationPending || !readyForWrites || !dashboard}>
                        {updateGoalMutation.isPending ? "Updating..." : "Update goal"}
                      </button>
                    </form>
                  </Section>
                </div>
                <div className="col-span-6">
                  <Section eyebrow="How it works" title="A compact climate loop">
                    <ol style={{color: 'var(--on-surface-variant)', fontSize: '14px', paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '12px'}}>
                      <li>Connect Freighter on Stellar Testnet.</li>
                      <li>Create an eco profile and weekly target.</li>
                      <li>Log daily sustainability actions.</li>
                      <li>Watch streaks, weekly progress, and contract events update.</li>
                    </ol>
                  </Section>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </main>
  );
}
