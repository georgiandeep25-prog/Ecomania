#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env, String};

const DAY_IN_SECONDS: u64 = 86_400;
const WEEK_IN_SECONDS: u64 = 604_800;

pub const MIN_ACTION_QUANTITY: u32 = 1;
pub const MAX_ACTION_QUANTITY: u32 = 100;
pub const MIN_GOAL_ACTIONS: u32 = 1;
pub const MAX_GOAL_ACTIONS: u32 = 500;

#[derive(Clone)]
#[contracttype]
pub struct EcoProfile {
    pub display_name: String,
    pub created_at: u64,
    pub last_action_day: u64,
    pub active_week: u64,
    pub weekly_goal_actions: u32,
    pub total_actions: u32,
    pub actions_this_week: u32,
    pub action_count: u32,
    pub current_streak: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct EcoAction {
    pub action_type: String,
    pub action_quantity: u32,
    pub timestamp: u64,
    pub streak_after_log: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct EcoDashboard {
    pub display_name: String,
    pub weekly_goal_actions: u32,
    pub total_actions: u32,
    pub actions_this_week: u32,
    pub action_count: u32,
    pub current_streak: u32,
    pub created_at: u64,
    pub goal_reached_this_week: bool,
}

#[contractevent]
#[derive(Clone)]
pub struct ProfileSaved {
    #[topic]
    pub eco_user: Address,
    pub display_name: String,
    pub weekly_goal_actions: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct WeeklyGoalUpdated {
    #[topic]
    pub eco_user: Address,
    pub weekly_goal_actions: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct EcoActionLogged {
    #[topic]
    pub eco_user: Address,
    pub action_type: String,
    pub action_quantity: u32,
    pub actions_this_week: u32,
    pub current_streak: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct WeeklyEcoGoalReached {
    #[topic]
    pub eco_user: Address,
    pub weekly_goal_actions: u32,
    pub actions_this_week: u32,
    pub current_streak: u32,
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Profile(Address),
    Action(Address, u32),
}

#[contract]
pub struct Ecomania;

#[contractimpl]
impl Ecomania {
    pub fn save_profile(
        env: Env,
        eco_user: Address,
        display_name: String,
        weekly_goal_actions: u32,
    ) {
        eco_user.require_auth();
        validate_display_name(&display_name);
        validate_weekly_goal(weekly_goal_actions);

        let now = env.ledger().timestamp();
        let current_week = current_week(&env);

        let mut profile = read_profile_optional(&env, &eco_user).unwrap_or(EcoProfile {
            display_name: display_name.clone(),
            created_at: now,
            last_action_day: 0,
            active_week: current_week,
            weekly_goal_actions,
            total_actions: 0,
            actions_this_week: 0,
            action_count: 0,
            current_streak: 0,
        });

        sync_week(&mut profile, current_week);
        profile.display_name = display_name.clone();
        profile.weekly_goal_actions = weekly_goal_actions;

        write_profile(&env, &eco_user, &profile);
        ProfileSaved {
            eco_user,
            display_name,
            weekly_goal_actions,
        }
        .publish(&env);
    }

    pub fn update_weekly_goal(env: Env, eco_user: Address, new_goal_actions: u32) {
        eco_user.require_auth();
        validate_weekly_goal(new_goal_actions);

        let mut profile = read_profile_required(&env, &eco_user);
        sync_week(&mut profile, current_week(&env));
        profile.weekly_goal_actions = new_goal_actions;

        write_profile(&env, &eco_user, &profile);
        WeeklyGoalUpdated {
            eco_user,
            weekly_goal_actions: new_goal_actions,
        }
        .publish(&env);
    }

    pub fn log_eco_action(
        env: Env,
        eco_user: Address,
        action_type: String,
        action_quantity: u32,
    ) {
        eco_user.require_auth();
        validate_action_type(&action_type);
        validate_action_quantity(action_quantity);

        let mut profile = read_profile_required(&env, &eco_user);
        sync_week(&mut profile, current_week(&env));
        let had_reached_goal = profile.actions_this_week >= profile.weekly_goal_actions;

        let current_day = current_day(&env);
        if profile.action_count == 0 {
            profile.current_streak = 1;
        } else if current_day == profile.last_action_day {
        } else if current_day == profile.last_action_day + 1 {
            profile.current_streak += 1;
        } else {
            profile.current_streak = 1;
        }

        profile.last_action_day = current_day;
        profile.total_actions += action_quantity;
        profile.actions_this_week += action_quantity;

        let action = EcoAction {
            action_type: action_type.clone(),
            action_quantity,
            timestamp: env.ledger().timestamp(),
            streak_after_log: profile.current_streak,
        };

        write_action(&env, &eco_user, profile.action_count, &action);
        profile.action_count += 1;
        write_profile(&env, &eco_user, &profile);

        EcoActionLogged {
            eco_user: eco_user.clone(),
            action_type,
            action_quantity,
            actions_this_week: profile.actions_this_week,
            current_streak: profile.current_streak,
        }
        .publish(&env);

        if !had_reached_goal && profile.actions_this_week >= profile.weekly_goal_actions {
            WeeklyEcoGoalReached {
                eco_user: eco_user.clone(),
                weekly_goal_actions: profile.weekly_goal_actions,
                actions_this_week: profile.actions_this_week,
                current_streak: profile.current_streak,
            }
            .publish(&env);
        }
    }

    pub fn has_profile(env: Env, eco_user: Address) -> bool {
        env.storage().persistent().has(&DataKey::Profile(eco_user))
    }

    pub fn get_dashboard(env: Env, eco_user: Address) -> EcoDashboard {
        let mut profile = read_profile_required(&env, &eco_user);
        if current_week(&env) > profile.active_week {
            profile.actions_this_week = 0;
        }

        EcoDashboard {
            display_name: profile.display_name,
            weekly_goal_actions: profile.weekly_goal_actions,
            total_actions: profile.total_actions,
            actions_this_week: profile.actions_this_week,
            action_count: profile.action_count,
            current_streak: profile.current_streak,
            created_at: profile.created_at,
            goal_reached_this_week: profile.actions_this_week >= profile.weekly_goal_actions,
        }
    }

    pub fn get_action_count(env: Env, eco_user: Address) -> u32 {
        read_profile_optional(&env, &eco_user)
            .map(|profile| profile.action_count)
            .unwrap_or(0)
    }

    pub fn get_action(env: Env, eco_user: Address, index: u32) -> EcoAction {
        let count = Self::get_action_count(env.clone(), eco_user.clone());
        assert!(index < count, "Eco action index out of bounds");

        env.storage()
            .persistent()
            .get(&DataKey::Action(eco_user, index))
            .unwrap_or_else(|| panic!("Eco action not found"))
    }
}

fn read_profile_optional(env: &Env, eco_user: &Address) -> Option<EcoProfile> {
    env.storage()
        .persistent()
        .get(&DataKey::Profile(eco_user.clone()))
}

fn read_profile_required(env: &Env, eco_user: &Address) -> EcoProfile {
    read_profile_optional(env, eco_user).unwrap_or_else(|| panic!("Eco profile not found"))
}

fn write_profile(env: &Env, eco_user: &Address, profile: &EcoProfile) {
    env.storage()
        .persistent()
        .set(&DataKey::Profile(eco_user.clone()), profile);
}

fn write_action(env: &Env, eco_user: &Address, index: u32, action: &EcoAction) {
    env.storage()
        .persistent()
        .set(&DataKey::Action(eco_user.clone(), index), action);
}

fn sync_week(profile: &mut EcoProfile, current_week: u64) {
    if current_week > profile.active_week {
        profile.active_week = current_week;
        profile.actions_this_week = 0;
    }
}

fn current_week(env: &Env) -> u64 {
    env.ledger().timestamp() / WEEK_IN_SECONDS
}

fn current_day(env: &Env) -> u64 {
    env.ledger().timestamp() / DAY_IN_SECONDS
}

fn validate_display_name(display_name: &String) {
    let length = display_name.len();
    assert!(length >= 3 && length <= 32, "Display name must be 3-32 chars");
}

fn validate_action_type(action_type: &String) {
    let length = action_type.len();
    assert!(length >= 3 && length <= 48, "Eco action type must be 3-48 chars");
}

fn validate_action_quantity(action_quantity: u32) {
    assert!(
        (MIN_ACTION_QUANTITY..=MAX_ACTION_QUANTITY).contains(&action_quantity),
        "Eco action quantity out of range"
    );
}

fn validate_weekly_goal(weekly_goal_actions: u32) {
    assert!(
        (MIN_GOAL_ACTIONS..=MAX_GOAL_ACTIONS).contains(&weekly_goal_actions),
        "Weekly eco goal out of range"
    );
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Event,
    };

    fn setup() -> (Env, Address, EcomaniaClient<'static>, Address) {
        let env = Env::default();
        let contract_id = env.register(Ecomania, ());
        let client = EcomaniaClient::new(&env, &contract_id);
        let eco_user = Address::generate(&env);
        env.mock_all_auths();
        (env, contract_id, client, eco_user)
    }

    fn text(env: &Env, value: &str) -> String {
        String::from_str(env, value)
    }

    #[test]
    fn creates_profile_and_reads_dashboard() {
        let (env, _, client, eco_user) = setup();

        client.save_profile(&eco_user, &text(&env, "Green Harbor"), &12);
        let dashboard = client.get_dashboard(&eco_user);

        assert_eq!(dashboard.display_name, text(&env, "Green Harbor"));
        assert_eq!(dashboard.weekly_goal_actions, 12);
        assert_eq!(dashboard.total_actions, 0);
        assert!(!dashboard.goal_reached_this_week);
    }

    #[test]
    fn logs_eco_actions_and_grows_climate_streak_across_days() {
        let (env, _, client, eco_user) = setup();

        client.save_profile(&eco_user, &text(&env, "Solar Grove"), &10);
        client.log_eco_action(&eco_user, &text(&env, "Recycling"), &2);

        env.ledger().set_timestamp(DAY_IN_SECONDS + 90);
        client.log_eco_action(&eco_user, &text(&env, "Public Transport"), &3);

        let dashboard = client.get_dashboard(&eco_user);
        let action = client.get_action(&eco_user, &1);

        assert_eq!(dashboard.total_actions, 5);
        assert_eq!(dashboard.actions_this_week, 5);
        assert_eq!(dashboard.action_count, 2);
        assert_eq!(dashboard.current_streak, 2);
        assert_eq!(action.action_type, text(&env, "Public Transport"));
        assert_eq!(action.action_quantity, 3);
    }

    #[test]
    fn resets_weekly_progress_after_boundary() {
        let (env, _, client, eco_user) = setup();

        client.save_profile(&eco_user, &text(&env, "Compost Circle"), &8);
        client.log_eco_action(&eco_user, &text(&env, "Energy Saving"), &4);

        env.ledger().set_timestamp(WEEK_IN_SECONDS + DAY_IN_SECONDS);
        let dashboard = client.get_dashboard(&eco_user);

        assert_eq!(dashboard.actions_this_week, 0);
        assert_eq!(dashboard.total_actions, 4);
    }

    #[test]
    #[should_panic(expected = "Eco profile not found")]
    fn rejects_missing_profile_action_logs() {
        let (env, _, client, eco_user) = setup();
        client.log_eco_action(&eco_user, &text(&env, "Recycling"), &1);
    }

    #[test]
    #[should_panic(expected = "Display name must be 3-32 chars")]
    fn rejects_short_display_names() {
        let (env, _, client, eco_user) = setup();
        client.save_profile(&eco_user, &text(&env, "AB"), &10);
    }

    #[test]
    #[should_panic(expected = "Eco action quantity out of range")]
    fn rejects_invalid_action_values() {
        let (env, _, client, eco_user) = setup();
        client.save_profile(&eco_user, &text(&env, "Water Wise"), &10);
        client.log_eco_action(&eco_user, &text(&env, "Water Saving"), &0);
    }

    #[test]
    #[should_panic(expected = "Weekly eco goal out of range")]
    fn rejects_bad_goal_updates() {
        let (env, _, client, eco_user) = setup();
        client.save_profile(&eco_user, &text(&env, "Tree Keepers"), &10);
        client.update_weekly_goal(&eco_user, &0);
    }

    #[test]
    fn emits_weekly_eco_goal_event_once_when_threshold_is_crossed() {
        let (env, contract_id, client, eco_user) = setup();

        client.save_profile(&eco_user, &text(&env, "Planet Makers"), &5);
        client.log_eco_action(&eco_user, &text(&env, "Recycling"), &2);
        client.log_eco_action(&eco_user, &text(&env, "Bike Ride"), &3);

        let goal_reached_event = WeeklyEcoGoalReached {
            eco_user: eco_user.clone(),
            weekly_goal_actions: 5,
            actions_this_week: 5,
            current_streak: 1,
        }
        .to_xdr(&env, &contract_id);

        let threshold_events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(threshold_events.events().len(), 2);
        assert_eq!(threshold_events.events()[1], goal_reached_event);

        client.log_eco_action(&eco_user, &text(&env, "Composting"), &1);
        let post_goal_events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(post_goal_events.events().len(), 1);

        let dashboard = client.get_dashboard(&eco_user);
        assert!(dashboard.goal_reached_this_week);
        assert_eq!(dashboard.actions_this_week, 6);
    }
}
