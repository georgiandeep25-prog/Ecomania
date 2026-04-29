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
    <div className="brand-mark" aria-hidden="true">
      <span />
    </div>
  );
}

function Section({ eyebrow, title, children, className = "" }) {
  return (
    <section className={`section ${className}`}>
      <div className="section-title">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, note, loading = false }) {
  return (
    <article className="stat-tile">
      <p>{label}</p>
      <strong className={loading ? "skeleton skeleton-value" : ""}>{loading ? "" : value}</strong>
      <span>{loading ? <i className="skeleton skeleton-line" /> : note}</span>
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
          <article className={`feed-item feed-${activity.accent}`} key={activity.id}>
            <div className="feed-top">
              <span>{activity.badge}</span>
              <small>{ownActivity ? "Your wallet" : shortAddress(activity.ecoUser)}</small>
            </div>
            <h3>{activity.title}</h3>
            <p>{activity.detail}</p>
            <div className="feed-meta">
              <time>{formatDate(activity.timestamp)}</time>
              {activity.explorerLink ? (
                <a href={activity.explorerLink} target="_blank" rel="noreferrer">
                  tx
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
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#impact">
          <BrandMark />
          <span>Ecomania</span>
        </a>
        <div className="topbar-meta">
          <span>{getNetworkLabel(configuredNetworkPassphrase)}</span>
          {contractExplorerLink ? (
            <a href={contractExplorerLink} target="_blank" rel="noreferrer">
              {shortAddress(configuredContractId)}
            </a>
          ) : (
            <span>No contract</span>
          )}
        </div>
        <button className="button button-connect" onClick={handleConnectWallet} disabled={wallet.isConnecting}>
          {wallet.isConnecting ? "Connecting" : wallet.account ? "Wallet linked" : "Connect Freighter"}
        </button>
      </nav>

      <section className="hero" id="impact">
        <div className="hero-copy">
          <p className="kicker">Public climate ledger</p>
          <h1>Track small green actions with on-chain proof.</h1>
          <p className="lead">
            Ecomania turns recycling, conservation, transit, and low-waste habits into a weekly
            sustainability record on Stellar.
          </p>
        </div>
        <aside className="impact-meter" aria-label="Weekly progress">
          <div className="meter-ring" style={{ "--progress": `${weeklyProgress * 3.6}deg` }}>
            <strong>{dashboard ? `${weeklyProgress}%` : "0%"}</strong>
            <span>weekly goal</span>
          </div>
          <div>
            <p>{dashboard?.displayName || "No eco profile yet"}</p>
            <h2>{dashboard ? formatDayCount(dashboard.currentStreak) : "0 days"}</h2>
            <span>climate streak</span>
          </div>
        </aside>
      </section>

      <section className={`ledger-strip status-${txState.status}`}>
        <div>
          <span>Live status</span>
          <p>{liveStatusMessage}</p>
        </div>
        {txExplorerLink ? (
          <a href={txExplorerLink} target="_blank" rel="noreferrer">
            Inspect transaction
          </a>
        ) : null}
      </section>

      <section className="stats-grid" aria-label="Ecomania dashboard metrics">
        <StatTile
          label="All actions"
          value={dashboard ? formatActionCount(dashboard.totalActions) : "0 actions"}
          note={dashboard ? `${dashboard.actionCount} ledger entries` : "Connect to create a profile"}
          loading={dashboardQuery.isLoading}
        />
        <StatTile
          label="This week"
          value={dashboard ? formatActionCount(dashboard.actionsThisWeek) : "0 actions"}
          note={
            dashboard
              ? `${formatActionCount(Math.max(dashboard.weeklyGoalActions - dashboard.actionsThisWeek, 0))} remaining`
              : "Weekly target not set"
          }
          loading={dashboardQuery.isLoading}
        />
        <StatTile
          label="Climate streak"
          value={dashboard ? formatDayCount(dashboard.currentStreak) : "0 days"}
          note={dashboard?.goalReachedThisWeek ? "Goal reached this week" : "One action keeps it alive"}
          loading={dashboardQuery.isLoading}
        />
        <StatTile
          label="Public feed"
          value={`${activitySummary.eventCount} events`}
          note={`${activitySummary.ecoUserCount} eco wallets observed`}
          loading={activityQuery.isLoading}
        />
      </section>

      {!hasContractConfig() ? (
        <Section eyebrow="Setup" title="Deploy the sustainability contract" className="setup-section">
          <div className="command-grid">
            <code>stellar keys generate alice --network testnet --fund</code>
            <code>npm run contract:build</code>
            <code>STELLAR_CONTRACT_ALIAS=eco_mania npm run contract:deploy</code>
            <code>npm run export:frontend</code>
          </div>
        </Section>
      ) : null}

      <div className="workspace">
        <div className="action-column">
          <Section eyebrow="Eco profile" title="Name your public climate record">
            <form className="form-grid split-form" onSubmit={handleProfileSubmit}>
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
              <button className="button button-primary" type="submit" disabled={anyMutationPending || !readyForWrites}>
                {saveProfileMutation.isPending ? "Saving" : "Save profile"}
              </button>
            </form>
          </Section>

          <Section eyebrow="Action cockpit" title="Log today’s planet-positive move">
            <form className="form-grid split-form" onSubmit={handleActionSubmit}>
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
                {logActionMutation.isPending ? "Logging" : "Log action"}
              </button>
            </form>
          </Section>

          <Section eyebrow="Target" title="Rebalance the weekly goal">
            <form className="goal-form" onSubmit={handleGoalSubmit}>
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
                {updateGoalMutation.isPending ? "Updating" : "Update goal"}
              </button>
            </form>
          </Section>

          <Section eyebrow="Wallet history" title="Latest confirmed actions">
            {ecoActionsQuery.isLoading ? (
              <ActivitySkeleton />
            ) : ecoActionsQuery.data?.length ? (
              <div className="history-list">
                {ecoActionsQuery.data.map((action) => (
                  <article className="history-item" key={action.id}>
                    <div>
                      <h3>{action.actionType}</h3>
                      <p>{formatDate(action.timestamp)}</p>
                    </div>
                    <strong>{formatActionCount(action.actionQuantity)}</strong>
                    <span>streak {action.streakAfterLog}</span>
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

        <aside className="feed-column">
          <Section eyebrow="Soroban pulse" title="Public activity">
            <div className="feed-summary">
              <span>{activitySummary.actionEventCount} actions</span>
              <span>{activitySummary.goalReachedCount} goals reached</span>
              <span>{activitySummary.ecoUserCount} wallets</span>
            </div>
            <ActivityFeed
              activities={activityQuery.data}
              loading={activityQuery.isLoading}
              walletAccount={wallet.account}
            />
          </Section>

          <Section eyebrow="How it works" title="A compact climate loop">
            <ol className="flow-list">
              <li>Connect Freighter on Stellar Testnet.</li>
              <li>Create an eco profile and weekly target.</li>
              <li>Log daily sustainability actions.</li>
              <li>Watch streaks, weekly progress, and contract events update.</li>
            </ol>
          </Section>
        </aside>
      </div>
    </main>
  );
}
