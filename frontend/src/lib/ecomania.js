import { ecomaniaConfig } from "./contract-config";

const networkLabels = {
  "Public Global Stellar Network ; September 2015": "Stellar Mainnet",
  "Test SDF Network ; September 2015": "Stellar Testnet",
  standalone: "Stellar Local"
};

let freighterApiPromise;
let stellarSdkPromise;

export const configuredContractId =
  import.meta.env.VITE_CONTRACT_ID || ecomaniaConfig.fallbackContractId || "";
export const configuredNetworkPassphrase =
  import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ||
  "Test SDF Network ; September 2015";
export const configuredRpcUrl =
  import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

function normalizeDashboard(dashboard) {
  return {
    displayName: dashboard.display_name,
    weeklyGoalActions: Number(dashboard.weekly_goal_actions),
    totalActions: Number(dashboard.total_actions),
    actionsThisWeek: Number(dashboard.actions_this_week),
    actionCount: Number(dashboard.action_count),
    currentStreak: Number(dashboard.current_streak),
    createdAt: Number(dashboard.created_at),
    goalReachedThisWeek: Boolean(dashboard.goal_reached_this_week)
  };
}

function normalizeEcoAction(index, action) {
  return {
    id: `${index}-${action.timestamp}`,
    actionType: action.action_type,
    actionQuantity: Number(action.action_quantity),
    timestamp: Number(action.timestamp),
    streakAfterLog: Number(action.streak_after_log)
  };
}

function allowHttpRpc(url) {
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}

async function loadFreighterApi() {
  freighterApiPromise ||= import("@stellar/freighter-api");
  return freighterApiPromise;
}

async function loadStellarSdk() {
  stellarSdkPromise ||= import("@stellar/stellar-sdk");
  return stellarSdkPromise;
}

async function buildClient(account = "") {
  if (!hasContractConfig()) {
    throw new Error(
      "No contract ID is configured yet. Deploy the Ecomania contract, then run `npm run export:frontend`."
    );
  }

  const { contract: StellarContract } = await loadStellarSdk();
  return StellarContract.Client.from({
    contractId: configuredContractId,
    rpcUrl: configuredRpcUrl,
    networkPassphrase: configuredNetworkPassphrase,
    publicKey: account || undefined,
    signTransaction: async (...args) => {
      const { signTransaction } = await loadFreighterApi();
      return signTransaction(...args);
    }
  });
}

async function buildRpcServer() {
  const { rpc } = await loadStellarSdk();
  return new rpc.Server(configuredRpcUrl, {
    allowHttp: allowHttpRpc(configuredRpcUrl)
  });
}

async function getWalletSnapshot() {
  const { getAddress, getNetworkDetails } = await loadFreighterApi();
  const [addressResult, networkResult] = await Promise.all([getAddress(), getNetworkDetails()]);

  if (addressResult.error) {
    throw new Error(addressResult.error.message);
  }

  if (networkResult.error) {
    throw new Error(networkResult.error.message);
  }

  return {
    account: addressResult.address,
    network: networkResult.network,
    networkPassphrase: networkResult.networkPassphrase,
    rpcUrl: networkResult.sorobanRpcUrl || configuredRpcUrl
  };
}

function normalizeActivityEvent(event, scValToNative) {
  const [kindValue, ecoUserValue = ""] = event.topic.map((topic) => scValToNative(topic));
  const payload = scValToNative(event.value) || {};
  const kind = String(kindValue || "activity");
  const ecoUser = typeof ecoUserValue === "string" ? ecoUserValue : String(ecoUserValue || "");
  const timestamp = event.ledgerClosedAt
    ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
    : 0;

  const common = {
    id: event.id,
    kind,
    ecoUser,
    ledger: Number(event.ledger || 0),
    timestamp,
    txHash: event.txHash || "",
    explorerLink: getExplorerLink(configuredNetworkPassphrase, event.txHash || "")
  };

  if (kind === "profile_saved") {
    const weeklyGoalActions = Number(payload.weekly_goal_actions || 0);
    return {
      ...common,
      title: "Eco profile saved",
      accent: "leaf",
      detail: `${payload.display_name} set a weekly eco goal of ${formatActionCount(weeklyGoalActions)}.`,
      badge: `Goal ${formatActionCount(weeklyGoalActions)}`
    };
  }

  if (kind === "weekly_goal_updated") {
    const weeklyGoalActions = Number(payload.weekly_goal_actions || 0);
    return {
      ...common,
      title: "Weekly eco goal updated",
      accent: "sky",
      detail: `${shortAddress(ecoUser)} adjusted the weekly goal to ${formatActionCount(weeklyGoalActions)}.`,
      badge: `Goal ${formatActionCount(weeklyGoalActions)}`
    };
  }

  if (kind === "weekly_eco_goal_reached") {
    const actionsThisWeek = Number(payload.actions_this_week || 0);
    const currentStreak = Number(payload.current_streak || 0);
    return {
      ...common,
      title: "Weekly eco goal reached",
      accent: "gold",
      detail: `${shortAddress(ecoUser)} reached the weekly target with ${formatActionCount(actionsThisWeek)} logged.`,
      badge: `Climate streak ${formatDayCount(currentStreak)}`
    };
  }

  if (kind === "eco_action_logged") {
    const actionQuantity = Number(payload.action_quantity || 0);
    const actionsThisWeek = Number(payload.actions_this_week || 0);
    const currentStreak = Number(payload.current_streak || 0);
    return {
      ...common,
      title: `${payload.action_type} logged`,
      accent: "clay",
      detail: `${shortAddress(ecoUser)} added ${formatActionCount(actionQuantity)}. Weekly total is ${formatActionCount(actionsThisWeek)}.`,
      badge: `Climate streak ${formatDayCount(currentStreak)}`
    };
  }

  return {
    ...common,
    title: "Contract activity",
    accent: "leaf",
    detail: `${shortAddress(ecoUser)} triggered ${kind.replaceAll("_", " ")}.`,
    badge: `Ledger ${event.ledger}`
  };
}

async function submitTransaction(assembledTx) {
  const sentTx = await assembledTx.signAndSend();
  return {
    hash: sentTx.sendTransactionResponse?.hash || sentTx.getTransactionResponse?.txHash || "",
    result: sentTx.result
  };
}

export function hasContractConfig() {
  return Boolean(configuredContractId);
}

export function getNetworkLabel(networkPassphrase) {
  return networkLabels[networkPassphrase] || "Custom Stellar Network";
}

export function getContractExplorerLink(
  networkPassphrase = configuredNetworkPassphrase,
  contractId = configuredContractId
) {
  if (!contractId) {
    return "";
  }

  if (networkPassphrase === "Test SDF Network ; September 2015") {
    return `https://lab.stellar.org/r/testnet/contract/${contractId}`;
  }

  if (networkPassphrase === "Public Global Stellar Network ; September 2015") {
    return `https://lab.stellar.org/r/mainnet/contract/${contractId}`;
  }

  return "";
}

export function shortAddress(value = "") {
  if (!value) {
    return "Not connected";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function formatActionCount(totalActions) {
  const actions = Number(totalActions || 0);
  return `${actions} action${actions === 1 ? "" : "s"}`;
}

export function formatDayCount(totalDays) {
  const days = Number(totalDays || 0);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return "No eco actions logged yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(Number(unixSeconds) * 1000));
}

export function getExplorerLink(networkPassphrase, hash) {
  if (!hash) {
    return "";
  }

  if (networkPassphrase === "Test SDF Network ; September 2015") {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  }

  if (networkPassphrase === "Public Global Stellar Network ; September 2015") {
    return `https://stellar.expert/explorer/public/tx/${hash}`;
  }

  return "";
}

export function parseError(error) {
  const candidates = [
    error?.message,
    error?.error?.message,
    error?.response?.data?.detail,
    error?.toString?.()
  ].filter(Boolean);

  return candidates[0] || "Something unexpected happened.";
}

export async function discoverWalletState() {
  const { isConnected } = await loadFreighterApi();
  const connection = await isConnected();
  if (connection.error || !connection.isConnected) {
    return {
      account: "",
      network: "",
      networkPassphrase: "",
      rpcUrl: configuredRpcUrl
    };
  }

  return getWalletSnapshot();
}

export async function connectWallet() {
  const { setAllowed } = await loadFreighterApi();
  const permission = await setAllowed();
  if (permission.error) {
    throw new Error(permission.error.message);
  }

  if (!permission.isAllowed) {
    throw new Error("Freighter did not grant access to this app.");
  }

  return getWalletSnapshot();
}

export async function readDashboard(account) {
  const client = await buildClient();
  const hasProfileTx = await client.has_profile({ eco_user: account });

  if (!hasProfileTx.result) {
    return null;
  }

  const dashboardTx = await client.get_dashboard({ eco_user: account });
  return normalizeDashboard(dashboardTx.result);
}

export async function readRecentEcoActions(account, limit = 5) {
  const client = await buildClient();
  const countTx = await client.get_action_count({ eco_user: account });
  const count = Number(countTx.result || 0);

  if (!count) {
    return [];
  }

  const indexes = Array.from({ length: Math.min(count, limit) }, (_, idx) => count - idx - 1);
  const actionResults = await Promise.all(
    indexes.map(async (index) => {
      const actionTx = await client.get_action({ eco_user: account, index });
      return normalizeEcoAction(index, actionTx.result);
    })
  );

  return actionResults;
}

export async function readContractActivity(limit = 8) {
  if (!hasContractConfig()) {
    return [];
  }

  const [{ scValToNative }, server] = await Promise.all([loadStellarSdk(), buildRpcServer()]);
  const latestLedger = await server.getLatestLedger();
  const response = await server.getEvents({
    startLedger: Math.max(Number(latestLedger.sequence || 0) - 20_000, 1),
    filters: [
      {
        type: "contract",
        contractIds: [configuredContractId]
      }
    ],
    limit: Math.min(Math.max(limit * 3, 18), 40)
  });

  return response.events
    .filter((event) => event.inSuccessfulContractCall)
    .map((event) => normalizeActivityEvent(event, scValToNative))
    .sort((left, right) => right.ledger - left.ledger)
    .slice(0, limit);
}

export async function saveProfile(account, displayName, weeklyGoalActions) {
  const client = await buildClient(account);
  const tx = await client.save_profile({
    eco_user: account,
    display_name: displayName,
    weekly_goal_actions: Number(weeklyGoalActions)
  });

  return submitTransaction(tx);
}

export async function updateWeeklyGoal(account, weeklyGoalActions) {
  const client = await buildClient(account);
  const tx = await client.update_weekly_goal({
    eco_user: account,
    new_goal_actions: Number(weeklyGoalActions)
  });

  return submitTransaction(tx);
}

export async function logEcoAction(account, actionType, actionQuantity) {
  const client = await buildClient(account);
  const tx = await client.log_eco_action({
    eco_user: account,
    action_type: actionType,
    action_quantity: Number(actionQuantity)
  });

  return submitTransaction(tx);
}
