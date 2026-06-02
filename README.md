# Gym Management App — FlexPro

A full-featured React + Firebase gym management web application.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + Vite |
| Routing | React Router v6 |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Styling | Vanilla CSS (dark design system) |

## Getting Started

### Prerequisites
- **Node.js 18+** — [Download here](https://nodejs.org)
- A Firebase project (already configured ✅)

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start dev server (opens at http://localhost:3000)
npm run dev
```

### Build for Production
```bash
npm run build
```

## Project Structure

```
src/
├── firebase/
│   ├── config.js        ← Firebase init (app, db, auth)
│   ├── auth.js          ← Auth helpers (login, register, logout)
│   └── firestore.js     ← Firestore CRUD helpers
├── contexts/
│   └── AuthContext.jsx  ← React auth context + useAuth() hook
├── components/
│   └── ProtectedRoute.jsx ← Route guard
├── pages/
│   ├── LoginPage.jsx
│   ├── RegisterPage.jsx
│   └── DashboardPage.jsx
├── App.jsx              ← Router + routes
├── main.jsx             ← Entry point
└── index.css            ← Global design system
```

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `members` | Gym member profiles & plan info |
| `payments` | Payment transactions per member |
| `classes` | Fitness class schedules |
| `attendance` | Per-member attendance records |
| `staff` | Staff/trainer accounts |

## Firebase Setup Checklist

1. **Enable Email/Password Auth** in Firebase Console → Authentication → Sign-in method
2. **Create Firestore Database** in Firebase Console → Firestore Database → Create database
3. **Set Security Rules** — start with test mode, then lock down before production:

```js
// Firestore Rules (start)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
