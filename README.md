# Ecomania 🌱

[![CI/CD](https://github.com/georgiandeep25-prog/Ecomania/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/georgiandeep25-prog/Ecomania/actions/workflows/ci-cd.yml)

Ecomania is an advanced, production-ready Stellar Soroban decentralized application (dApp) for on-chain sustainability action tracking. Built with a sleek, mobile-responsive "Obsidian Echo" design system, it turns planet-positive actions—like recycling, public transit, and energy conservation—into verifiable on-chain data.

🌍 **Live Demo:** [Ecomania on Netlify](https://ecomania-stellar.netlify.app/)
🎥 **Demo Video:** [Watch the 1-2 Minute Pitch](https://drive.google.com/file/d/1dw02W3CYBdwinFnDw_akNsxogWA9Rhpb/view?usp=sharing)

---

## ✅ Submission Checklist

- **Public GitHub repository:** [https://github.com/georgiandeep25-prog/Ecomania](https://github.com/georgiandeep25-prog/Ecomania)
- **README with complete documentation:** You're reading it!
- **Minimum 10+ meaningful commits:** Completed (See git commit history).
- **Live demo link:** [https://ecomania-stellar.netlify.app/](https://ecomania-stellar.netlify.app/)
- **Contract deployment address:** `CC3I3RHEQ6OOHYWYXUPUUGFOU4MRJEGEIFULJ4UJ3EUE5FATDBAHQ3TM`
- **Transaction hash for contract interaction:** `4d47c7f0ecdd2c0f0ce379c2386690acfc2f945b18a0c1f1ccda0b1dce19c754`
- **Screenshots:**
  - Mobile responsive UI: Included below
  - CI/CD pipeline running: Included below
  - Test output with 3+ passing tests: Included below
- **Demo video link (1–2 minutes):** [Google Drive Demo Video](https://drive.google.com/file/d/1dw02W3CYBdwinFnDw_akNsxogWA9Rhpb/view?usp=sharing)

---

## 🏗️ Architecture & Requirements Fulfilled

Ecomania was meticulously architected to satisfy all hackathon/project criteria:

1. **Advanced Smart Contract Development:** Implemented two distinct smart contracts (`eco_mania` and `eco_reward`) handling complex state mapping, profile creation, and automated streak counting.
2. **Inter-contract Communication:** The `eco_reward` contract performs cross-contract calls using the `EcomaniaClient` to fetch a user's dashboard data from the main `eco_mania` contract to securely issue rewards based on goal attainment.
3. **Event Streaming & Real-Time Updates:** Uses Soroban RPC `getEvents` to stream live blockchain events into a "Public Ledger" feed on the UI without requiring wallet connection.
4. **CI/CD Pipeline Setup:** Configured GitHub Actions to automatically run Rust smart contract tests, build WASM, lint the frontend, and verify builds on every push to `main`.
5. **Smart Contract Deployment Workflow:** Included a robust `deploy-stellar.mjs` script that builds, deploys, and dynamically exports the new Contract ID to the frontend environment.
6. **Mobile Responsive Frontend Development:** The React + Vite interface uses a modern 12-column CSS grid that seamlessly collapses into a mobile-friendly view.
7. **Error Handling & Loading States:** Integrated `@tanstack/react-query` to gracefully manage blockchain latency, providing the user with distinct loading spinners and error fallbacks during transactions.
8. **Writing Tests for Contracts and Frontend:** Full test suites written using Rust `#[test]` macros for the contracts, and Vitest + React Testing Library for the frontend components.
9. **Production-Ready Architecture Practices:** Decoupled storage (main ledger vs reward engine), clean code structure, environment variable management, and automated Netlify deployments.
10. **Documentation & Demo Presentation:** Comprehensive README and a complete demo walkthrough video.

---

## 📸 Project Screenshots

### Desktop Impact Console
![Ecomania desktop impact console 1](./sub%20assets/ui1.png)

![Ecomania desktop impact console 2](./sub%20assets/ui2.png)

### Mobile Responsive View
![Ecomania mobile responsive view](./sub%20assets/mobui.png)

### GitHub Actions CI/CD Pipeline
![Ecomania CI/CD workflow screenshot](./sub%20assets/cicd.png)

### Contract & Frontend Test Verification
![Ecomania test verification](./sub%20assets/test.png)

---

## ⚙️ Soroban Smart Contracts

### 1. The Main Ledger (`eco_mania`)
Handles user profiles, tracks eco-actions, counts weekly streaks, and emits real-time events.
- **Methods:** `save_profile`, `update_weekly_goal`, `log_eco_action`, `get_dashboard`, `has_profile`
- **Events Emitted:** `profile_saved`, `weekly_goal_updated`, `eco_action_logged`, `weekly_eco_goal_reached`

### 2. The Incentive Engine (`eco_reward`)
Demonstrates secure **inter-contract communication**. Reads data from the main ledger to verify if a user has hit their weekly climate goals before minting reward points.
- **Methods:** `claim_reward(env, user, ecomania_contract)`

---

## 🚀 Local Setup & Deployment

### 1. Install Dependencies
```powershell
npm install
```

### 2. Configure Environment
Create a `.env` file from `.env.example`:
```env
STELLAR_ACCOUNT=alice
STELLAR_NETWORK=testnet
STELLAR_CONTRACT_ALIAS=eco_mania
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_CONTRACT_ID=CC3I3RHEQ6OOHYWYXUPUUGFOU4MRJEGEIFULJ4UJ3EUE5FATDBAHQ3TM
```

### 3. Run Locally
```powershell
npm run dev
```

### 4. Run Test Suites
```powershell
npm run contract:test    # Run Rust Smart Contract Tests
npm run test             # Run Vitest Frontend Tests
npm run lint             # Verify code quality
```

### 5. Deploy to Netlify
The project is configured with a `netlify.toml` file.
```powershell
npm run build:frontend
npm run deploy:frontend
```
