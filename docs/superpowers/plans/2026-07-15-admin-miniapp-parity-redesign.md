# Admin Mini Program Parity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the selected “静定运营总控台” as a functional multi-page admin and align its learning and commerce data with the mini program.

**Architecture:** Split the React admin into a shared shell, a centralized request/session layer, route metadata, and focused page modules. Extend the existing repository abstraction for admin learning lists and commerce records, keeping current routes compatible while adding explicit public/admin commerce endpoints.

**Tech Stack:** React 18, Vite 5, Node.js HTTP backend, `node:test`, PostgreSQL with memory fallback, WeChat Mini Program JavaScript.

## Global Constraints

- Preserve unrelated dirty-worktree changes.
- Use the selected 1440x1024 Product Design reference as visual truth.
- Keep existing content, reminder, authentication and organization routes compatible.
- Do not mark WeChat payment successful without verified provider state.
- Use server permissions as authority and frontend role maps only as fallback.

---

### Task 1: Lock Navigation And Request Contracts

**Files:**
- Create: `backend/admin-app/src/app/navigation.js`
- Create: `backend/admin-app/src/api/client.js`
- Create: `backend/admin-app/test/navigation.test.js`
- Create: `backend/admin-app/test/client.test.js`

**Interfaces:**
- Produces: `NAV_GROUPS`, `findRoute(routeId)`, `createAdminClient(options)`.
- Consumes: browser `fetch`, `localStorage`, and callbacks for unauthorized responses.

- [ ] Write a failing `node:test` asserting all required route IDs exist and permission-gated routes declare permissions.
- [ ] Run `node --test backend/admin-app/test/navigation.test.js` and verify it fails because the module does not exist.
- [ ] Add route metadata for overview, contents, festivals, assets, users, plans, practice, recitation, products, orders, notifications, organizations, audit and settings.
- [ ] Write a failing request-client test for token injection and 401 session clearing.
- [ ] Implement `createAdminClient` and rerun both tests.

### Task 2: Add Admin Learning Read Models

**Files:**
- Modify: `backend/src/repositories/memoryStore.js`
- Modify: `backend/src/repositories/postgresStore.js`
- Modify: `backend/src/routes.js`
- Create: `backend/test/admin-learning-routes.test.js`

**Interfaces:**
- Produces: `listAdminUsers(filters)`, `listAdminPlans(filters)`, `listAdminPracticeSessions(filters)`, `listAdminRecitationSessions(filters)`.
- Routes: `GET /api/admin/users`, `/plans`, `/practice-sessions`, `/recitation-sessions`.

- [ ] Add route tests that authenticate as admin and expect arrays with stable fields.
- [ ] Run the test and verify 404 failures.
- [ ] Implement memory and PostgreSQL repository queries with common filters.
- [ ] Add authenticated routes and permissions.
- [ ] Run the focused route test and the full backend suite.

### Task 3: Add Commerce Catalog And Order Contracts

**Files:**
- Create: `backend/src/data/commerceSeed.js`
- Modify: `backend/src/repositories/memoryStore.js`
- Modify: `backend/src/repositories/postgresStore.js`
- Modify: `backend/src/routes.js`
- Modify: `backend/schema.sql`
- Create: `backend/test/commerce-routes.test.js`

**Interfaces:**
- Public: `GET /api/products`.
- Admin: `GET/POST /api/admin/products`, `PUT/DELETE /api/admin/products/:id`, `GET /api/admin/orders`, `PUT /api/admin/orders/:id/status`.
- Product fields: `id`, `category`, `tag`, `title`, `subtitle`, `price`, `originalPrice`, `cover`, `description`, `features`, `status`, `stock`, `isFeatured`.
- Order fields: `id`, `orderNo`, `userId`, `userNickname`, `amount`, `status`, `paymentStatus`, `paymentMethod`, `items`, `createdAt`, `updatedAt`.

- [ ] Add public/admin route tests for product filtering, CRUD permissions, order listing and status transitions.
- [ ] Verify tests fail with 404.
- [ ] Add memory state and PostgreSQL tables/seeds.
- [ ] Add repository methods and routes, including audit records.
- [ ] Verify focused tests and full backend tests pass.

### Task 4: Build The Multi-page Admin Shell

**Files:**
- Replace: `backend/admin-app/src/App.jsx`
- Replace: `backend/admin-app/src/styles.css`
- Create: `backend/admin-app/src/components/AdminShell.jsx`
- Create: `backend/admin-app/src/components/PageHeader.jsx`
- Create: `backend/admin-app/src/components/DataTable.jsx`
- Create: `backend/admin-app/src/components/StatusBadge.jsx`
- Create: `backend/admin-app/src/pages/LoginPage.jsx`
- Create: `backend/admin-app/src/pages/OverviewPage.jsx`
- Create: `backend/admin-app/src/pages/OperationsPages.jsx`
- Create: `backend/admin-app/src/pages/CommercePages.jsx`
- Create: `backend/admin-app/src/pages/GovernancePages.jsx`

**Interfaces:**
- `App` owns route state, session, filters and resource loading.
- Page modules receive normalized `data`, `loading`, `permissions`, and mutation callbacks.

- [ ] Add component smoke tests for route-to-title and active-navigation behavior.
- [ ] Implement the shared shell and responsive navigation.
- [ ] Implement overview matching the selected design reference.
- [ ] Implement all navigation pages with real filters, tables and available CRUD actions.
- [ ] Build the admin and fix compile errors.

### Task 5: Make Mini Program Products Server-backed

**Files:**
- Create: `common/commerce-api.js`
- Modify: `pages/shop/index.js`
- Create: `backend/test/client-commerce-api.test.js`

**Interfaces:**
- Produces: `listProductsApi(filters)` and a normalized product result.
- The shop page keeps its current local list only as an explicit fallback.

- [ ] Add a failing client API test for request URL and normalized response.
- [ ] Implement the commerce API module without modifying existing auth internals.
- [ ] Load products in `onShow`, expose source status, and preserve favorites/cart IDs.
- [ ] Run syntax and shop regression tests.

### Task 6: Verify And Run Design QA

**Files:**
- Create: `design-qa.md`

**Interfaces:**
- Source visual: Product Design option 1 generated image.
- Implementation: authenticated `/admin` dashboard at 1440x1024.

- [ ] Run admin unit tests and `npm --prefix backend/admin-app run build`.
- [ ] Run backend focused tests and full `npm --prefix backend test`.
- [ ] Start backend, open the admin in the Codex in-app browser, log in, navigate every module, test filters and one safe mutation.
- [ ] Capture 1440x1024 dashboard and responsive screenshots.
- [ ] Compare source and implementation in one visual input, fix all P0/P1/P2 findings, and repeat.
- [ ] Save `design-qa.md` with `final result: passed` only when evidence supports it.
