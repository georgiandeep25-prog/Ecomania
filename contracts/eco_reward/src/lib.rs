#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, contractclient, Address, Env, Symbol, contractevent};

#[derive(Clone)]
#[contracttype]
pub struct EcoDashboard {
    pub display_name: soroban_sdk::String,
    pub weekly_goal_actions: u32,
    pub total_actions: u32,
    pub actions_this_week: u32,
    pub action_count: u32,
    pub current_streak: u32,
    pub created_at: u64,
    pub goal_reached_this_week: bool,
}

#[contractclient(name = "EcomaniaClient")]
pub trait EcomaniaInterface {
    fn get_dashboard(env: Env, eco_user: Address) -> EcoDashboard;
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Points(Address),
    LastClaimedWeek(Address),
}

#[contractevent]
#[derive(Clone)]
pub struct RewardClaimed {
    #[topic]
    pub user: Address,
    pub points_awarded: u32,
    pub new_total_points: u32,
    pub week: u64,
}

#[contract]
pub struct EcoReward;

#[contractimpl]
impl EcoReward {
    pub fn claim_reward(env: Env, user: Address, ecomania_contract: Address) -> u32 {
        user.require_auth();

        // 1. Inter-contract call to Ecomania to fetch user's weekly goal status
        let ecomania_client = EcomaniaClient::new(&env, &ecomania_contract);
        let dashboard = ecomania_client.get_dashboard(&user);

        // 2. Validate user has reached their weekly goal
        assert!(dashboard.goal_reached_this_week, "Weekly eco goal not reached yet");

        // 3. Determine the current week number
        const WEEK_IN_SECONDS: u64 = 604_800;
        let current_week = env.ledger().timestamp() / WEEK_IN_SECONDS;

        // 4. Ensure user hasn't claimed a reward for this week already
        if env.storage().persistent().has(&DataKey::LastClaimedWeek(user.clone())) {
            let last_claimed: u64 = env.storage().persistent()
                .get(&DataKey::LastClaimedWeek(user.clone()))
                .unwrap();
            assert!(current_week > last_claimed, "Reward already claimed for this week");
        }

        // 5. Award points (100 points per weekly milestone)
        let points_to_add = 100;
        let current_points: u32 = env.storage().persistent()
            .get(&DataKey::Points(user.clone()))
            .unwrap_or(0);
        
        let new_points = current_points + points_to_add;

        // 6. Save states
        env.storage().persistent().set(&DataKey::Points(user.clone()), &new_points);
        env.storage().persistent().set(&DataKey::LastClaimedWeek(user.clone()), &current_week);

        // 7. Emit RewardClaimed event
        RewardClaimed {
            user,
            points_awarded: points_to_add,
            new_total_points: new_points,
            week: current_week,
        }
        .publish(&env);

        new_points
    }

    pub fn get_points(env: Env, user: Address) -> u32 {
        env.storage().persistent()
            .get(&DataKey::Points(user))
            .unwrap_or(0)
    }

    pub fn get_last_claimed_week(env: Env, user: Address) -> u64 {
        env.storage().persistent()
            .get(&DataKey::LastClaimedWeek(user))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env,
    };

    // We define a mock Ecomania contract for testing inter-contract communication
    #[contract]
    pub struct MockEcomania;

    #[contractimpl]
    impl MockEcomania {
        pub fn get_dashboard(env: Env, _eco_user: Address) -> EcoDashboard {
            EcoDashboard {
                display_name: soroban_sdk::String::from_str(&env, "Mock User"),
                weekly_goal_actions: 10,
                total_actions: 12,
                actions_this_week: 12,
                action_count: 5,
                current_streak: 3,
                created_at: 0,
                goal_reached_this_week: true,
            }
        }
    }

    #[test]
    fn test_claim_reward_success() {
        let env = Env::default();
        env.mock_all_auths();

        let user = Address::generate(&env);
        let ecomania_id = env.register(MockEcomania, ());
        let reward_id = env.register(EcoReward, ());
        let reward_client = EcoRewardClient::new(&env, &reward_id);

        let points = reward_client.claim_reward(&user, &ecomania_id);
        assert_eq!(points, 100);
        assert_eq!(reward_client.get_points(&user), 100);
        assert_eq!(reward_client.get_last_claimed_week(&user), 0); // since timestamp starts at 0
    }

    #[test]
    #[should_panic(expected = "Reward already claimed for this week")]
    fn test_claim_reward_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let user = Address::generate(&env);
        let ecomania_id = env.register(MockEcomania, ());
        let reward_id = env.register(EcoReward, ());
        let reward_client = EcoRewardClient::new(&env, &reward_id);

        reward_client.claim_reward(&user, &ecomania_id);
        // calling it again in the same week should fail
        reward_client.claim_reward(&user, &ecomania_id);
    }
}
