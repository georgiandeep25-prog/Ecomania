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
      <span />
      <span />
    </div>
  );
}

function Panel({ eyebrow, title, body, children, tone = "leaf" }) {
  return (
    <section className={`panel panel-${tone}`}>
      <div className="panel-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {body ? <p className="panel-body">{body}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, note, loading = false }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <div className={loading ? "skeleton skeleton-metric" : "metric-value"}>
        {loading ? "" : value}
      </div>
      <p className="metric-note">{loading ? <span className="skeleton skeleton-note" /> : note}</p>
    </article>
  );
}

function ActivitySkeleton() {
  return (
    <div className="action-list">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="action-card action-skeleton" key={index}>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-note" />
          <span className="skeleton skeleton-badge" />
        </div>
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
        Waiting for recent Soroban events. The public eco feed comes alive as soon as
        planet-positive writes land on-chain.
      </p>
    );
  }

  return (
    <div className="activity-feed">
      {activities.map((activity) => {
        const ownActivity = walletAccount && activity.ecoUser === walletAccount;

        return (
          <article
            className={`activity-card activity-${activity.accent}${ownActivity ? " activity-own" : ""}`}
            key={activity.id}
          >
            <div className="activity-topline">
              <span className="activity-badge">{activity.badge}</span>
              <span className="activity-user">
                {ownActivity ? "Your wallet" : shortAddress(activity.ecoUser)}
              </span>
            </div>
            <h3>{activity.title}</h3>
            <p>{activity.detail}</p>
            <div className="activity-meta">
              <span>{formatDate(activity.timestamp)}</span>
              {activity.explorerLink ? (
                <a href={activity.explorerLink} target="_blank" rel="noreferrer">
                  View tx
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
        "Composing your eco profile on Stellar...",
        "Eco profile saved on Soroban."
      )
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ weeklyGoalActions }) =>
      runLedgerAction(
        () => updateWeeklyGoal(wallet.account, weeklyGoalActions),
        "Updating your weekly eco goal...",
        "Weekly eco goal updated."
      )
  });

  const logActionMutation = useMutation({
    mutationFn: ({ actionType, actionQuantity }) =>
      runLedgerAction(
        () => logEcoAction(wallet.account, actionType, actionQuantity),
        "Writing your eco action to Stellar...",
        "Eco action logged."
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
            ? "Ready to read and write sustainability actions on Stellar."
            : "Deploy the Ecomania contract and export the frontend config before using the app."));

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-main">
          <div className="brand-row">
            <BrandMark />
            <div>
              <p className="kicker">On-chain sustainability action tracker</p>
              <h1>Ecomania</h1>
            </div>
          </div>

          <p className="lead">
            Log recycling, transport, conservation, and planet-positive habits on Stellar with a
            wallet-backed eco profile, a climate-positive streak, and a live public Soroban feed.
          </p>

          <div className="hero-actions">
            <button
              className="button button-primary"
              onClick={handleConnectWallet}
              disabled={wallet.isConnecting}
            >
              {wallet.isConnecting
                ? "Connecting..."
                : wallet.account
                  ? "Wallet Connected"
                  : "Connect Freighter"}
            </button>
            <div className="hero-badges">
              <span className="pill">Soroban powered</span>
              <span className="pill">Climate streaks</span>
              <span className="pill">Public eco feed</span>
            </div>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-side-top">
            <div>
              <p className="side-label">Eco profile</p>
              <strong>{wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}</strong>
            </div>
            <div>
              <p className="side-label">Network</p>
              <strong>
                {wallet.networkPassphrase
                  ? getNetworkLabel(wallet.networkPassphrase)
                  : "Awaiting Freighter"}
              </strong>
            </div>
          </div>

          <div className="hero-side-stat">
            <span>Contract</span>
            {contractExplorerLink ? (
              <a className="contract-link" href={contractExplorerLink} target="_blank" rel="noreferrer">
                {shortAddress(configuredContractId)}
              </a>
            ) : (
              <strong>Not deployed</strong>
            )}
          </div>

          <div className="progress-shell">
            <div className="progress-labels">
              <span>Weekly eco goal</span>
              <span>{dashboard ? `${weeklyProgress}%` : "0%"}</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${weeklyProgress}%` }} />
            </div>
          </div>

          <div className="hero-pulse">
            <div>
              <p className="side-label">Contract pulse</p>
              <strong>{activitySummary.eventCount} recent events</strong>
            </div>
            <div>
              <p className="side-label">Eco wallets</p>
              <strong>{activitySummary.ecoUserCount || 0}</strong>
            </div>
          </div>

          <p className="hero-note">
            Auto-refresh keeps the public feed alive while wallet-backed writes update your eco
            profile, weekly goal progress, and climate streak after each confirmed transaction.
          </p>
        </div>
      </header>

      <section className="status-banner">
        <div>
          <p className="status-label">Live status</p>
          <p className="status-copy">{liveStatusMessage}</p>
        </div>
        {txExplorerLink ? (
          <a className="status-link" href={txExplorerLink} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : null}
      </section>

      <section className="panel-grid panel-grid-activity">
        <Panel
          eyebrow="Public contract feed"
          title="Live Soroban activity"
          body="Recent contract events stream from Stellar Testnet and refresh automatically every 15 seconds."
          tone="sky"
        >
          <div className="activity-summary">
            <span className="pill pill-soft">{activitySummary.actionEventCount} eco actions logged</span>
            <span className="pill pill-soft">{activitySummary.goalReachedCount} eco goals reached</span>
            <span className="pill pill-soft">{activitySummary.ecoUserCount} eco wallets</span>
            {contractExplorerLink ? (
              <a className="status-link" href={contractExplorerLink} target="_blank" rel="noreferrer">
                View contract
              </a>
            ) : null}
          </div>
          <ActivityFeed
            activities={activityQuery.data}
            loading={activityQuery.isLoading}
            walletAccount={wallet.account}
          />
        </Panel>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Eco actions logged"
          value={dashboard ? formatActionCount(dashboard.totalActions) : "0 actions"}
          note={dashboard ? `${dashboard.actionCount} chain entries` : "Starts after your first eco action"}
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="This week"
          value={dashboard ? formatActionCount(dashboard.actionsThisWeek) : "0 actions"}
          note={
            dashboard
              ? `${formatActionCount(Math.max(dashboard.weeklyGoalActions - dashboard.actionsThisWeek, 0))} left`
              : "Set your weekly eco goal"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="Climate streak"
          value={dashboard ? formatDayCount(dashboard.currentStreak) : "0 days"}
          note={
            dashboard
              ? dashboard.goalReachedThisWeek
                ? "Weekly eco goal already reached"
                : "Log today to keep the streak alive"
              : "Consecutive climate-positive days"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="Profile name"
          value={dashboard?.displayName || "No profile"}
          note={wallet.account ? shortAddress(wallet.account) : "Connect to personalize"}
          loading={dashboardQuery.isLoading}
        />
      </section>

      {!hasContractConfig() ? (
        <Panel
          eyebrow="Deployment flow"
          title="Deploy Ecomania and wire the live app"
          body="Build the Rust contract, deploy it with Stellar CLI, and export the contract ID so the frontend can read and write against its own sustainability ledger."
          tone="gold"
        >
          <div className="code-stack">
            <code>stellar keys generate alice --network testnet --fund</code>
            <code>npm run contract:build</code>
            <code>STELLAR_CONTRACT_ALIAS=eco_mania npm run contract:deploy</code>
            <code>npm run export:frontend</code>
          </div>
        </Panel>
      ) : null}

      <section className="panel-grid">
        <Panel
          eyebrow="Eco profile"
          title="Create or refresh your public identity"
          body="Save a display name and the number of planet-positive actions you want to reach each week."
          tone="leaf"
        >
          <form className="form-grid" onSubmit={handleProfileSubmit}>
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
              {saveProfileMutation.isPending ? "Saving..." : "Save eco profile"}
            </button>
          </form>
        </Panel>

        <Panel
          eyebrow="Goal tuning"
          title="Adjust your weekly eco target"
          body="Retune your action target whenever your habits shift. Weekly progress resets at the next on-chain week boundary."
          tone="sky"
        >
          <form className="form-grid" onSubmit={handleGoalSubmit}>
            <label>
              <span>New weekly goal</span>
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={goalForm}
                onChange={(event) => setGoalForm(event.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              type="submit"
              disabled={anyMutationPending || !readyForWrites || !dashboard}
            >
              {updateGoalMutation.isPending ? "Updating..." : "Update goal"}
            </button>
          </form>
        </Panel>

        <Panel
          eyebrow="Eco action log"
          title="Record a planet-positive action"
          body="Choose the action type and quantity. Your dashboard and the public feed refresh after each confirmed Soroban write."
          tone="clay"
        >
          <form className="form-grid" onSubmit={handleActionSubmit}>
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
            <button
              className="button button-primary"
              type="submit"
              disabled={anyMutationPending || !readyForWrites || !dashboard}
            >
              {logActionMutation.isPending ? "Logging..." : "Log eco action"}
            </button>
          </form>
        </Panel>
      </section>

      <section className="panel-grid panel-grid-bottom">
        <Panel
          eyebrow="Wallet activity"
          title="Recent chain-confirmed eco actions"
          body="The latest five actions are read directly from the deployed contract for the connected wallet."
          tone="clay"
        >
          {ecoActionsQuery.isLoading ? (
            <ActivitySkeleton />
          ) : ecoActionsQuery.data?.length ? (
            <div className="action-list">
              {ecoActionsQuery.data.map((action) => (
                <article className="action-card" key={action.id}>
                  <div>
                    <h3>{action.actionType}</h3>
                    <p>{formatDate(action.timestamp)}</p>
                  </div>
                  <div className="action-meta">
                    <span>{formatActionCount(action.actionQuantity)}</span>
                    <span>Climate streak {action.streakAfterLog}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {dashboard
                ? "Your eco action history will appear after the first on-chain log."
                : "Connect Freighter and create an eco profile to load your private dashboard."}
            </p>
          )}
        </Panel>

        <Panel
          eyebrow="Platform overview"
          title="How Ecomania works"
          body="Ecomania combines Freighter wallet access, Soroban contract writes, and a public event stream so the product stays useful before and after connection."
          tone="sky"
        >
          <ul className="check-list">
            <li>Connect a Freighter wallet on Stellar Testnet</li>
            <li>Create an eco profile and set a weekly sustainability goal</li>
            <li>Log recycling, transport, conservation, and reusable habit actions on-chain</li>
            <li>Track action totals, climate streaks, and weekly goal milestones in a live public feed</li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}
