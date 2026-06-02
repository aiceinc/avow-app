/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as billingConfig from "../billingConfig.js";
import type * as budget from "../budget.js";
import type * as crons from "../crons.js";
import type * as cursors from "../cursors.js";
import type * as guests from "../guests.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as notes from "../notes.js";
import type * as public_ from "../public.js";
import type * as retention from "../retention.js";
import type * as seatAssignments from "../seatAssignments.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as tables from "../tables.js";
import type * as tasks from "../tasks.js";
import type * as timeline from "../timeline.js";
import type * as vendors from "../vendors.js";
import type * as weddingSite from "../weddingSite.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  billingConfig: typeof billingConfig;
  budget: typeof budget;
  crons: typeof crons;
  cursors: typeof cursors;
  guests: typeof guests;
  http: typeof http;
  lib: typeof lib;
  notes: typeof notes;
  public: typeof public_;
  retention: typeof retention;
  seatAssignments: typeof seatAssignments;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  tables: typeof tables;
  tasks: typeof tasks;
  timeline: typeof timeline;
  vendors: typeof vendors;
  weddingSite: typeof weddingSite;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
