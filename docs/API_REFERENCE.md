# IKEAR API Reference

This document provides a comprehensive technical reference for the core interfaces, store actions, data sources, and business utility functions in the **IKEAR** codebase.

---

## 1. DataSource Interface (`src/data/dataSource.ts`)

The `DataSource` interface defines the contract that both `mockDataSource` and `supabaseDataSource` implement.

### Methods

#### `getListings(filter?: ListingFilter): Promise<Listing[]>`
Retrieves a filtered and sorted list of furniture listings.

**Parameters:**
*   `filter.category` *(optional)*: `CategoryId` — Filter by IKEA taxonomy ID.
*   `filter.city` *(optional)*: `string` — Filter by city name (e.g., "多伦多", "万锦").
*   `filter.status` *(optional)*: `ListingStatus | ListingStatus[]` — Filter by status ('active', 'expired', 'sold', 'archived').
*   `filter.type` *(optional)*: `ListingType` — 'secondhand' or 'accessory'.
*   `filter.keyword` *(optional)*: `string` — Search query matched against title and description.
*   `filter.sort` *(optional)*: `'newest' | 'price_asc' | 'price_desc' | 'expiring'` — Sorting mode.

**Returns:**
*   `Promise<Listing[]>`: Array of canonical listing objects.

---

#### `getListing(id: string): Promise<Listing | null>`
Fetches the full details of a specific listing by ID.

**Parameters:**
*   `id`: `string` — Unique listing identifier.

**Returns:**
*   `Promise<Listing | null>`: Returns the listing object if found, or `null` if not found.

---

#### `createListing(input: CreateListingInput): Promise<Listing>`
Creates a new listing in the active data source.

**Parameters:**
*   `input.title`: `string` *(required)* — Furniture title (non-empty).
*   `input.price`: `number` *(required)* — Price value.
*   `input.category`: `CategoryId` *(required)* — Taxonomy category.
*   `input.photos`: `string[]` *(required)* — Array of photo URIs (must contain at least 2 for hard minimum requirement).
*   `input.description`: `string` *(optional)* — Item description.
*   `input.condition`: `Condition` *(optional)* — Default: '良好'.
*   `input.coverIndex`: `number` *(optional)* — Index of cover photo. Default: 0.

**Returns:**
*   `Promise<Listing>`: The created listing with populated `id`, `createdAt`, `expiresAt`, and `status: 'active'`.

---

#### `refreshListing(id: string): Promise<Listing>`
Refreshes a listing, extending its expiration time by 30 days and adding a 24-hour search boost.

**Parameters:**
*   `id`: `string` — The listing identifier.

**Returns:**
*   `Promise<Listing>`: Updated listing with reset `expiresAt` and updated `boostedUntil`.

---

#### `getConversations(): Promise<Conversation[]>`
Returns all active chat conversations for the current authenticated user.

#### `getMessages(conversationId: string): Promise<Message[]>`
Returns the message history for a specific conversation thread.

#### `sendMessage(input: SendMessageInput): Promise<Message>`
Dispatches a new text message to a conversation thread.

---

## 2. Global State Store (`src/store/useStore.ts`)

The application state is managed by Zustand and accessed via the `useStore` hook.

### Core State Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `currentUser` | `User \| null` | Currently authenticated user profile |
| `isAuthenticated` | `boolean` | Authentication status flag |
| `biometricEnabled` | `boolean` | Face ID / Touch ID app lock preference |
| `listings` | `Listing[]` | In-memory cache of loaded listings |
| `favorites` | `string[]` | Array of favorited listing IDs |
| `location` | `AppLocation` | Current location filter `{ city, district }` |
| `sort` | `SortMode` | Active sort mode: `'near' \| 'new' \| 'price'` |
| `drafts` | `DraftListing \| null` | Active unpublished listing draft |

### Key Actions

*   `login(email, password): Promise<void>`: Authenticates user session.
*   `register(nickname, email, password): Promise<void>`: Registers a new user.
*   `logout(): Promise<void>`: Clears session and reverts to unauthenticated state.
*   `toggleFavorite(id: string): Promise<void>`: Adds or removes a listing from favorites.
*   `refreshListing(id: string): Promise<void>`: Triggers 30-day TTL renewal and 24h boost.
*   `discountRelist(id: string, newPrice: number): Promise<void>`: Lowers price and resets TTL.
*   `markSold(id: string): Promise<void>`: Sets listing status to `'sold'`.
*   `archiveListing(id: string): Promise<void>`: Sets listing status to `'archived'`.

---

## 3. Business Logic Utilities

### Listing Lifecycle & Expiration (`src/lib/expiry.ts`)

*   `TTL_DAYS = 30`: Standard time-to-live for a listing.
*   `REFRESH_REMINDER_DAYS = 3`: Threshold in days before expiration when refresh reminders trigger.
*   `isExpired(listing, now?): boolean`: Returns true if the listing has surpassed `expiresAt`.
*   `needsRefreshReminder(listing, now?): boolean`: Returns true if the listing is active and within the 3-day reminder window.
*   `daysUntilExpiry(listing, now?): number`: Returns the integer count of remaining active days.

### Listing Photo Validation Rules (`src/lib/listingRules.ts`)

*   `HARD_PHOTO_MIN = 2`: Minimum mandatory photos (Angle 1: Front view, Angle 2: Detail/Label).
*   `MAX_PHOTOS = 9`: Maximum photos allowed per listing.
*   `photoProgress(draft)`: Returns `{ count, required, suggested, progressPercent }`.
*   `canPublish(draft, options?)`: Validates that required photos, title, price, and category are present. Allows 1 reference photo if in no-photo mode (`options.allowReferencePhoto`).

---

## 4. AI Estimation & Dynamic Ranking Engine (`src/lib/aiEstimate.ts`)

### `estimateFurnitureFromPhoto(photoUris: string[], userPromptHint?: string)`
Analyzes uploaded furniture photos to infer IKEA models, suggests resale prices, and auto-fills listing details.

**Returns:**
*   `meta.detectedModel`: Inferred furniture model (e.g. `'POÄNG'`, `'BILLY'`, `'MALM'`).
*   `meta.confidence`: Number (0.70 - 0.98).
*   `meta.estimatedPriceLow` / `estimatedPriceHigh`: Suggested price range based on MSRP.
*   `meta.photoQualityBonus`: Quality weight multiplier (`0.80` for 1-2 photos, `1.30` for 5 angles).
*   `autoFilled`: Pre-populated `{ title, price, category, condition, description }`.

### `estimateFromChatDialog(userDescription: string)`
Extracts furniture specifications from natural language conversation when no photos are available.

**Returns:**
*   `matchedModel`: Closest matching IKEA taxonomy entity.
*   `autoFilled.referencePhotos`: Array with default reference model silhouette.
*   `meta.photoQualityBonus`: `0.35` (Explicit search ranking penalty).
*   `exposureWarning`: Human-readable prompt warning user that no-photo listings experience reduced exposure.

### `getTrustProfile(rating, soldCount, verifiedPhone): TrustProfile`
Calculates comprehensive seller trust metrics:
*   `score`: 0 - 100 numeric integrity score.
*   `tier`: `'bronze' | 'silver' | 'gold' | 'crown'`.
*   `verifiedID`: True if score >= 80.

### `computeListingRankingScore(listing, userTrust?, nearScore?): number`
Calculates real-time recommendation rank using multi-factor scoring:
$$\text{Score} = (\text{PhotoFactor} \times 40 + \text{TrustFactor} \times 35 + \text{Freshness} \times 15 + \text{GeoScore} \times 10) \times \text{BoostMultiplier}$$

